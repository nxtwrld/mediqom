<script lang="ts">
    import { t } from '$lib/i18n';
    import { passwordStrength } from 'check-password-strength';
    import { createHash } from '$lib/encryption/hash';
    import { verifyHash } from '$lib/encryption/hash';
    import { encryptString, decryptString, generatePassphrase } from '$lib/encryption/passphrase';
    import { generateRecoveryData, type RecoveryKeyData } from '$lib/encryption/recovery';
    import { downloadRecoveryPDF, printRecoveryPDF } from '$lib/encryption/recovery-document';
    import {
        checkPasskeyPRFSupport,
        createPasskeyWithPRF,
        encryptWithPRFKey,
        authenticateWithPasskeyPRF,
        type PasskeyPRFSupport
    } from '$lib/encryption/passkey-prf';
    import { keyToPEM } from '$lib/encryption/rsa';
    import user, { getPrivateKeyPEM } from '$lib/user';
    import type { User } from '$lib/user';
    import { apiFetch } from '$lib/api/client';
    import { onMount } from 'svelte';
    import { logger } from '$lib/logging/logger';

    type Step = 'verify' | 'choose-method' | 'setup-passkey' | 'setup-passphrase' | 'recovery' | 'success';
    type TargetMethod = 'passkey' | 'passphrase';

    interface Props {
        onClose: () => void;
        onSuccess?: () => void;
    }

    let { onClose, onSuccess }: Props = $props();

    // Current user data
    const currentUser = user.get() as User | null;
    const currentMethod = currentUser?.key_derivation_method === 'passkey_prf' ? 'passkey' : 'passphrase';
    const userEmail = currentUser?.email || '';

    // Detect convenience mode - keyPair is already ready (auto-unlocked on login)
    // Convenience mode users have key_pass set (server-stored passphrase)
    let isConvenienceMode = $derived(user.keyPair.isReady());

    // Step state
    let currentStep: Step = $state('verify');

    // Verification state
    let verifyPassphrase = $state('');
    let verifyError = $state<string | null>(null);
    let isVerifying = $state(false);

    // Method selection
    let targetMethod: TargetMethod = $state(currentMethod === 'passkey' ? 'passphrase' : 'passkey');

    // Passkey state
    let passkeySupport: PasskeyPRFSupport | null = $state(null);
    let passkeyError = $state<string | null>(null);

    // Passphrase state
    let newPassphrase = $state(generatePassphrase());
    let isCustomPassphrase = $state(false);
    let viewPassphrase = $state(false);
    let strength = $derived(passwordStrength(newPassphrase).value);

    // Recovery state
    let recoveryData: RecoveryKeyData | null = $state(null);
    let recoveryDownloaded = $state(false);
    let recoveryUnderstand = $state(false);
    let isGeneratingRecovery = $state(false);

    // Loading states
    let isSettingUp = $state(false);
    let setupError = $state<string | null>(null);

    // Decrypted private key PEM (held in memory during switch)
    let privateKeyPEM: string | null = null;

    onMount(async () => {
        // Check passkey PRF support
        passkeySupport = await checkPasskeyPRFSupport();
        logger.api.debug('Passkey PRF support:', passkeySupport);
    });

    /**
     * Verify current credentials (passphrase or passkey)
     */
    async function verifyCurrentCredentials() {
        isVerifying = true;
        verifyError = null;

        try {
            // First, try to get the already-decrypted private key
            // This works for convenience mode (auto-unlocked on login) and already-unlocked passkeys
            privateKeyPEM = await getPrivateKeyPEM();

            if (privateKeyPEM) {
                // Already have the key - skip verification!
                currentStep = 'choose-method';
                return;
            }

            // If not available, we need to verify credentials based on current method
            if (currentMethod === 'passphrase') {
                // Zero-knowledge passphrase mode - user must enter passphrase
                if (!verifyPassphrase) {
                    verifyError = $t('app.settings.privacy.encryption.error-verify');
                    return;
                }

                if (!currentUser?.key_hash || !currentUser?.privateKey) {
                    verifyError = $t('app.settings.privacy.encryption.error-verify');
                    return;
                }

                const isValid = await verifyHash(verifyPassphrase, currentUser.key_hash);
                if (!isValid) {
                    verifyError = $t('app.settings.privacy.encryption.error-verify');
                    return;
                }

                // Decrypt private key
                privateKeyPEM = await decryptString(currentUser.privateKey, verifyPassphrase);
                if (!privateKeyPEM || !privateKeyPEM.startsWith('-----BEGIN PRIVATE KEY-----')) {
                    verifyError = $t('app.settings.privacy.encryption.error-verify');
                    privateKeyPEM = null;
                    return;
                }
            } else {
                // Passkey mode - authenticate with biometrics
                if (!currentUser?.passkey_credential_id || !currentUser?.passkey_prf_salt || !currentUser?.privateKey) {
                    verifyError = $t('app.settings.privacy.encryption.error-verify');
                    return;
                }

                const prfDerivedKey = await authenticateWithPasskeyPRF(
                    currentUser.passkey_credential_id,
                    currentUser.passkey_prf_salt
                );

                // Import decryptWithPRFKey
                const { decryptWithPRFKey } = await import('$lib/encryption/passkey-prf');
                privateKeyPEM = await decryptWithPRFKey(currentUser.privateKey, prfDerivedKey);

                if (!privateKeyPEM || !privateKeyPEM.startsWith('-----BEGIN PRIVATE KEY-----')) {
                    verifyError = $t('app.settings.privacy.encryption.error-verify');
                    privateKeyPEM = null;
                    return;
                }
            }

            // Success - move to method selection
            currentStep = 'choose-method';
        } catch (error) {
            logger.api.error('Verification error:', error);
            verifyError = $t('app.settings.privacy.encryption.error-verify');
            privateKeyPEM = null;
        } finally {
            isVerifying = false;
        }
    }

    /**
     * Set up new passkey
     */
    async function setupNewPasskey() {
        if (!privateKeyPEM) {
            setupError = 'Private key not available';
            return;
        }

        isSettingUp = true;
        setupError = null;
        passkeyError = null;

        try {
            // Create passkey and get PRF-derived key
            const result = await createPasskeyWithPRF(
                userEmail,
                userEmail,
                userEmail.split('@')[0]
            );

            // Encrypt private key with PRF-derived key
            const encryptedPrivateKey = await encryptWithPRFKey(privateKeyPEM, result.derivedKey);
            const keyHash = await createHash(result.credential.credentialId);

            // Call API to update credentials
            const response = await apiFetch('/v1/settings/encryption', {
                method: 'POST',
                body: JSON.stringify({
                    newCredentials: {
                        privateKey: encryptedPrivateKey,
                        key_hash: keyHash,
                        key_derivation_method: 'passkey_prf',
                        passkey_credential_id: result.credential.credentialId,
                        passkey_prf_salt: result.credential.prfSalt
                    }
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to update credentials');
            }

            // Move to recovery step
            currentStep = 'recovery';
        } catch (error) {
            logger.api.error('Passkey setup error:', error);
            passkeyError = error instanceof Error ? error.message : $t('app.settings.privacy.encryption.error-passkey-create');
        } finally {
            isSettingUp = false;
        }
    }

    /**
     * Set up new passphrase
     */
    async function setupNewPassphrase() {
        if (!privateKeyPEM) {
            setupError = 'Private key not available';
            return;
        }

        isSettingUp = true;
        setupError = null;

        try {
            // Encrypt private key with new passphrase
            const encryptedPrivateKey = await encryptString(privateKeyPEM, newPassphrase);
            const keyHash = await createHash(newPassphrase);

            // Call API to update credentials
            const response = await apiFetch('/v1/settings/encryption', {
                method: 'POST',
                body: JSON.stringify({
                    newCredentials: {
                        privateKey: encryptedPrivateKey,
                        key_hash: keyHash,
                        key_derivation_method: 'passphrase'
                    }
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to update credentials');
            }

            // Move to recovery step
            currentStep = 'recovery';
        } catch (error) {
            logger.api.error('Passphrase setup error:', error);
            setupError = error instanceof Error ? error.message : $t('app.settings.privacy.encryption.error');
        } finally {
            isSettingUp = false;
        }
    }

    /**
     * Generate recovery document
     */
    async function generateRecoveryDocument() {
        if (!privateKeyPEM) {
            logger.api.error('No private key available for recovery document');
            return;
        }

        isGeneratingRecovery = true;

        try {
            recoveryData = await generateRecoveryData(privateKeyPEM);

            // Update recovery key in database
            const response = await apiFetch('/v1/settings/encryption', {
                method: 'POST',
                body: JSON.stringify({
                    newCredentials: {
                        privateKey: currentUser?.privateKey, // Keep existing encrypted key
                        key_hash: currentUser?.key_hash,
                        key_derivation_method: targetMethod === 'passkey' ? 'passkey_prf' : 'passphrase',
                        passkey_credential_id: targetMethod === 'passkey' ? currentUser?.passkey_credential_id : undefined,
                        passkey_prf_salt: targetMethod === 'passkey' ? currentUser?.passkey_prf_salt : undefined,
                        recovery_encrypted_key: recoveryData.recoveryEncryptedKey,
                        recovery_key_hash: recoveryData.recoveryKeyHash
                    }
                })
            });

            if (!response.ok) {
                logger.api.warn('Failed to update recovery key in database');
            }

            logger.api.debug('Recovery document generated');
        } catch (error) {
            logger.api.error('Error generating recovery document:', error);
        } finally {
            isGeneratingRecovery = false;
        }
    }

    /**
     * Download recovery PDF
     */
    async function downloadRecovery() {
        if (!recoveryData) return;

        await downloadRecoveryPDF({
            email: userEmail,
            recoveryKey: recoveryData.recoveryKey
        });

        recoveryDownloaded = true;
    }

    /**
     * Print recovery PDF
     */
    async function printRecovery() {
        if (!recoveryData) return;

        await printRecoveryPDF({
            email: userEmail,
            recoveryKey: recoveryData.recoveryKey
        });

        recoveryDownloaded = true;
    }

    /**
     * Complete the switch
     */
    function completeSwitch() {
        // Clear sensitive data from memory
        privateKeyPEM = null;
        recoveryData = null;
        verifyPassphrase = '';

        currentStep = 'success';
    }

    /**
     * Skip recovery (if user already has one)
     */
    function skipRecovery() {
        // Clear sensitive data from memory
        privateKeyPEM = null;
        verifyPassphrase = '';

        currentStep = 'success';
    }

    /**
     * Handle close/success
     */
    function handleClose() {
        // Clear sensitive data
        privateKeyPEM = null;
        recoveryData = null;
        verifyPassphrase = '';

        onClose();
    }

    function handleSuccess() {
        // Clear sensitive data
        privateKeyPEM = null;
        recoveryData = null;
        verifyPassphrase = '';

        if (onSuccess) {
            onSuccess();
        }
        onClose();
    }

    // Auto-generate recovery document when entering recovery step
    $effect(() => {
        if (currentStep === 'recovery' && !recoveryData && !isGeneratingRecovery) {
            generateRecoveryDocument();
        }
    });
</script>

<div class="encryption-switch-modal">
    <div class="modal-header">
        <h3 class="h3">{$t('app.settings.privacy.encryption.change')}</h3>
        <button class="close-button" onclick={handleClose} aria-label="Close">
            <svg><use href="/icons.svg#x" /></svg>
        </button>
    </div>

    <div class="modal-content">
        {#if currentStep === 'verify'}
            <!-- Step 1: Verify current credentials -->
            <div class="step-content">
                <p class="step-description">{$t('app.settings.privacy.encryption.verify-current')}</p>

                <div class="current-method">
                    <span class="label">{$t('app.settings.privacy.encryption.current-method')}:</span>
                    <span class="value">
                        {currentMethod === 'passkey'
                            ? $t('app.settings.privacy.encryption.passkey')
                            : $t('app.settings.privacy.encryption.passphrase')}
                    </span>
                </div>

                {#if currentMethod === 'passphrase' && !isConvenienceMode}
                    <!-- Zero-knowledge passphrase mode - user must enter passphrase -->
                    <div class="input">
                        <label for="verify-passphrase">{$t('app.settings.privacy.encryption.enter-passphrase')}</label>
                        <input
                            type="password"
                            id="verify-passphrase"
                            bind:value={verifyPassphrase}
                            autocomplete="current-password"
                        />
                    </div>
                {:else if currentMethod === 'passphrase' && isConvenienceMode}
                    <!-- Convenience mode - key already available -->
                    <p class="passkey-instruction">{$t('app.settings.privacy.encryption.key-available')}</p>
                {:else}
                    <p class="passkey-instruction">{$t('app.settings.privacy.encryption.verify-passkey')}</p>
                {/if}

                {#if verifyError}
                    <p class="error-message">{verifyError}</p>
                {/if}

                <div class="button-row">
                    <button class="button" onclick={handleClose}>
                        {$t('app.settings.privacy.encryption.cancel')}
                    </button>
                    <button
                        class="button -primary"
                        onclick={verifyCurrentCredentials}
                        disabled={isVerifying || (currentMethod === 'passphrase' && !isConvenienceMode && !verifyPassphrase)}
                    >
                        {isVerifying ? '...' : $t('app.settings.privacy.encryption.verify')}
                    </button>
                </div>
            </div>

        {:else if currentStep === 'choose-method'}
            <!-- Step 2: Choose new method -->
            <div class="step-content">
                <p class="step-description">{$t('app.settings.privacy.encryption.choose-new-method')}</p>

                <div class="method-options">
                    {#if currentMethod === 'passphrase' && passkeySupport?.prfSupported}
                        <button
                            class="method-option"
                            class:selected={targetMethod === 'passkey'}
                            onclick={() => targetMethod = 'passkey'}
                        >
                            <svg class="icon"><use href="/icons.svg#fingerprint" /></svg>
                            <div class="method-info">
                                <strong>{$t('app.settings.privacy.encryption.passkey')}</strong>
                                <span class="badge -recommended">{$t('app.onboarding.privacy.recommended')}</span>
                                <p>{$t('app.onboarding.privacy.passkey-description')}</p>
                            </div>
                        </button>
                    {:else if currentMethod === 'passphrase' && !passkeySupport?.prfSupported}
                        <div class="method-option -disabled">
                            <svg class="icon"><use href="/icons.svg#fingerprint" /></svg>
                            <div class="method-info">
                                <strong>{$t('app.settings.privacy.encryption.passkey')}</strong>
                                <p class="warning-text">{$t('app.settings.privacy.encryption.error-browser-support')}</p>
                            </div>
                        </div>
                    {/if}

                    {#if currentMethod === 'passkey'}
                        <button
                            class="method-option"
                            class:selected={targetMethod === 'passphrase'}
                            onclick={() => targetMethod = 'passphrase'}
                        >
                            <svg class="icon"><use href="/icons.svg#key" /></svg>
                            <div class="method-info">
                                <strong>{$t('app.settings.privacy.encryption.passphrase')}</strong>
                                <p>{$t('app.onboarding.privacy.passphrase-description')}</p>
                            </div>
                        </button>
                    {/if}
                </div>

                <div class="button-row">
                    <button class="button" onclick={() => currentStep = 'verify'}>
                        {$t('app.onboarding.privacy.back')}
                    </button>
                    <button
                        class="button -primary"
                        onclick={() => currentStep = targetMethod === 'passkey' ? 'setup-passkey' : 'setup-passphrase'}
                        disabled={!targetMethod || (targetMethod === 'passkey' && !passkeySupport?.prfSupported)}
                    >
                        {$t('app.onboarding.privacy.continue')}
                    </button>
                </div>
            </div>

        {:else if currentStep === 'setup-passkey'}
            <!-- Step 3a: Setup passkey -->
            <div class="step-content">
                <p class="step-description">{$t('app.onboarding.privacy.passkey-setup-instructions')}</p>

                <div class="setup-illustration">
                    <svg class="icon -large"><use href="/icons.svg#fingerprint" /></svg>
                </div>

                {#if passkeyError}
                    <p class="error-message">{passkeyError}</p>
                {/if}

                <div class="button-row">
                    <button class="button" onclick={() => currentStep = 'choose-method'}>
                        {$t('app.onboarding.privacy.back')}
                    </button>
                    <button
                        class="button -primary"
                        onclick={setupNewPasskey}
                        disabled={isSettingUp}
                    >
                        {isSettingUp ? $t('app.onboarding.privacy.setting-up-passkey') : $t('app.onboarding.privacy.create-passkey')}
                    </button>
                </div>
            </div>

        {:else if currentStep === 'setup-passphrase'}
            <!-- Step 3b: Setup passphrase -->
            <div class="step-content">
                <p class="step-description">{$t('app.onboarding.privacy.passphrase-setup-instructions')}</p>

                <div class="input">
                    <label for="new-passphrase">{$t('app.onboarding.privacy.your-passphrase')}</label>
                    {#if isCustomPassphrase}
                        <input
                            type="password"
                            id="new-passphrase"
                            bind:value={newPassphrase}
                            autocomplete="new-password"
                        />
                    {:else}
                        <input
                            type={viewPassphrase ? 'text' : 'password'}
                            id="new-passphrase"
                            bind:value={newPassphrase}
                            readonly
                        />
                    {/if}
                </div>

                <p class="strength-indicator">
                    {$t('app.onboarding.privacy.strength')}: <strong>{strength}</strong>
                </p>

                <div class="passphrase-actions">
                    {#if !isCustomPassphrase}
                        <button type="button" class="a" onclick={() => viewPassphrase = !viewPassphrase}>
                            {viewPassphrase ? $t('app.onboarding.privacy.hide-passphrase') : $t('app.onboarding.privacy.view-passphrase')}
                        </button>
                        <button type="button" class="a" onclick={() => navigator.clipboard.writeText(newPassphrase)}>
                            {$t('app.onboarding.copy-to-clipboard')}
                        </button>
                        <button type="button" class="a" onclick={() => { newPassphrase = ''; isCustomPassphrase = true; }}>
                            {$t('app.onboarding.privacy.use-custom')}
                        </button>
                    {:else}
                        <button type="button" class="a" onclick={() => { newPassphrase = generatePassphrase(); isCustomPassphrase = false; }}>
                            {$t('app.onboarding.privacy.generate-random')}
                        </button>
                    {/if}
                </div>

                {#if setupError}
                    <p class="error-message">{setupError}</p>
                {/if}

                <div class="button-row">
                    <button class="button" onclick={() => currentStep = 'choose-method'}>
                        {$t('app.onboarding.privacy.back')}
                    </button>
                    <button
                        class="button -primary"
                        onclick={setupNewPassphrase}
                        disabled={isSettingUp || newPassphrase.length < 8}
                    >
                        {isSettingUp ? $t('app.settings.privacy.encryption.switching') : $t('app.settings.privacy.encryption.switch-to-passphrase')}
                    </button>
                </div>
            </div>

        {:else if currentStep === 'recovery'}
            <!-- Step 4: Recovery document -->
            <div class="step-content">
                <p class="step-description">{$t('app.onboarding.privacy.recovery-document-intro')}</p>

                {#if isGeneratingRecovery}
                    <div class="loading">
                        <p>{$t('app.onboarding.privacy.generating-recovery')}</p>
                    </div>
                {:else if recoveryData}
                    <div class="recovery-key-display">
                        <p class="label">{$t('app.onboarding.privacy.recovery-key-label')}</p>
                        <div class="recovery-key-box">
                            <code>{recoveryData.recoveryKey}</code>
                        </div>
                    </div>

                    <div class="recovery-actions">
                        <button class="button -primary" onclick={downloadRecovery}>
                            <svg><use href="/icons.svg#download" /></svg>
                            {$t('app.onboarding.privacy.download-pdf')}
                        </button>
                        <button class="button" onclick={printRecovery}>
                            <svg><use href="/icons.svg#print" /></svg>
                            {$t('app.onboarding.privacy.print')}
                        </button>
                    </div>

                    <div class="recovery-confirmations">
                        <label class="checkbox">
                            <input type="checkbox" bind:checked={recoveryDownloaded} />
                            {$t('app.onboarding.privacy.confirm-saved')}
                        </label>
                        <label class="checkbox">
                            <input type="checkbox" bind:checked={recoveryUnderstand} />
                            {$t('app.onboarding.privacy.confirm-understand')}
                        </label>
                    </div>

                    <p class="warning-text">{$t('app.onboarding.privacy.recovery-warning')}</p>

                    <div class="button-row">
                        {#if currentUser?.recovery_encrypted_key}
                            <button class="button" onclick={skipRecovery}>
                                Skip (keep existing)
                            </button>
                        {/if}
                        <button
                            class="button -primary"
                            onclick={completeSwitch}
                            disabled={!recoveryDownloaded || !recoveryUnderstand}
                        >
                            {$t('app.onboarding.privacy.complete-setup')}
                        </button>
                    </div>
                {/if}
            </div>

        {:else if currentStep === 'success'}
            <!-- Success -->
            <div class="step-content success-state">
                <div class="success-icon">
                    <svg><use href="/icons.svg#check-circle" /></svg>
                </div>

                <p class="success-message">{$t('app.settings.privacy.encryption.success')}</p>
                <p class="success-detail">
                    {targetMethod === 'passkey'
                        ? $t('app.settings.privacy.encryption.success-passkey')
                        : $t('app.settings.privacy.encryption.success-passphrase')}
                </p>

                <div class="button-row">
                    <button class="button -primary" onclick={handleSuccess}>
                        {$t('app.settings.privacy.encryption.close')}
                    </button>
                </div>
            </div>
        {/if}
    </div>
</div>

<style>
    .encryption-switch-modal {
        background: var(--color-surface);
        border-radius: var(--ui-radius-large);
        max-width: 500px;
        width: 100%;
        max-height: 90vh;
        overflow-y: auto;
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--ui-pad-large);
        border-bottom: 1px solid var(--color-border);
    }

    .modal-header h3 {
        margin: 0;
    }

    .close-button {
        background: none;
        border: none;
        cursor: pointer;
        padding: var(--ui-pad-small);
        border-radius: var(--ui-radius-small);
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .close-button:hover {
        background: var(--color-background);
    }

    .close-button svg {
        width: 1.5rem;
        height: 1.5rem;
    }

    .modal-content {
        padding: var(--ui-pad-large);
    }

    .step-content {
        display: flex;
        flex-direction: column;
        gap: var(--ui-pad-medium);
    }

    .step-description {
        color: var(--color-text-secondary);
        margin: 0;
    }

    .current-method {
        display: flex;
        gap: var(--ui-pad-small);
        padding: var(--ui-pad-medium);
        background: var(--color-background);
        border-radius: var(--ui-radius-small);
    }

    .current-method .label {
        color: var(--color-text-secondary);
    }

    .current-method .value {
        font-weight: 600;
    }

    .passkey-instruction {
        padding: var(--ui-pad-medium);
        background: var(--color-background);
        border-radius: var(--ui-radius-small);
        text-align: center;
    }

    .method-options {
        display: flex;
        flex-direction: column;
        gap: var(--ui-pad-medium);
    }

    .method-option {
        display: flex;
        gap: var(--ui-pad-medium);
        padding: var(--ui-pad-medium);
        border: 2px solid var(--color-border);
        border-radius: var(--ui-radius-medium);
        background: var(--color-surface);
        cursor: pointer;
        text-align: left;
        transition: border-color 0.2s, background-color 0.2s;
    }

    .method-option:hover {
        border-color: var(--color-primary);
    }

    .method-option.selected {
        border-color: var(--color-primary);
        background-color: var(--color-primary-light, rgba(0, 122, 255, 0.05));
    }

    .method-option.-disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .method-option .icon {
        width: 2rem;
        height: 2rem;
        flex-shrink: 0;
    }

    .method-info {
        flex: 1;
    }

    .method-info strong {
        display: block;
        margin-bottom: var(--ui-pad-small);
    }

    .method-info p {
        margin: 0;
        font-size: 0.875rem;
        color: var(--color-text-secondary);
    }

    .badge {
        display: inline-block;
        padding: 0.125rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.75rem;
        font-weight: 600;
        margin-left: 0.5rem;
        vertical-align: middle;
    }

    .badge.-recommended {
        background-color: var(--color-success-light, #e6f4ea);
        color: var(--color-success, #1e7e34);
    }

    .setup-illustration {
        display: flex;
        justify-content: center;
        padding: var(--ui-pad-xlarge);
    }

    .setup-illustration .icon.-large {
        width: 5rem;
        height: 5rem;
        color: var(--color-primary);
    }

    .strength-indicator {
        text-align: center;
        margin: 0;
    }

    .passphrase-actions {
        display: flex;
        gap: var(--ui-pad-medium);
        justify-content: center;
        flex-wrap: wrap;
    }

    .recovery-key-display {
        margin: var(--ui-pad-medium) 0;
    }

    .recovery-key-display .label {
        margin-bottom: var(--ui-pad-small);
        font-weight: 500;
    }

    .recovery-key-box {
        background-color: var(--color-background);
        border: 1px solid var(--color-border);
        border-radius: var(--ui-radius-small);
        padding: var(--ui-pad-medium);
        text-align: center;
        font-family: monospace;
        font-size: 0.9rem;
        letter-spacing: 0.05em;
        word-break: break-all;
    }

    .recovery-actions {
        display: flex;
        gap: var(--ui-pad-medium);
        justify-content: center;
    }

    .recovery-actions button svg {
        width: 1.25rem;
        height: 1.25rem;
        margin-right: 0.5rem;
    }

    .recovery-confirmations {
        display: flex;
        flex-direction: column;
        gap: var(--ui-pad-small);
    }

    .checkbox {
        display: flex;
        gap: var(--ui-pad-small);
        align-items: flex-start;
        cursor: pointer;
    }

    .checkbox input[type="checkbox"] {
        margin-top: 0.25rem;
    }

    .warning-text {
        color: var(--color-warning, #e65100);
        font-size: 0.875rem;
        margin: 0;
    }

    .error-message {
        color: var(--color-negative);
        font-size: 0.875rem;
        margin: 0;
        padding: var(--ui-pad-small) var(--ui-pad-medium);
        background: var(--color-negative-light, rgba(255, 0, 0, 0.05));
        border-radius: var(--ui-radius-small);
    }

    .button-row {
        display: flex;
        gap: var(--ui-pad-medium);
        justify-content: flex-end;
        margin-top: var(--ui-pad-medium);
    }

    .loading {
        text-align: center;
        padding: var(--ui-pad-xlarge);
    }

    .success-state {
        text-align: center;
    }

    .success-icon svg {
        width: 4rem;
        height: 4rem;
        color: var(--color-positive);
    }

    .success-message {
        font-size: 1.25rem;
        font-weight: 600;
        margin: 0;
    }

    .success-detail {
        color: var(--color-text-secondary);
        margin: 0;
    }

    @media (max-width: 480px) {
        .encryption-switch-modal {
            max-width: 100%;
            border-radius: 0;
            max-height: 100vh;
        }

        .button-row {
            flex-direction: column;
        }

        .button-row .button {
            width: 100%;
        }

        .recovery-actions {
            flex-direction: column;
        }

        .recovery-actions button {
            width: 100%;
        }
    }
</style>

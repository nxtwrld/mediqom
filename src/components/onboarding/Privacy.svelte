<script lang="ts">
    import { createBubbler, preventDefault } from 'svelte/legacy';
    import { passwordStrength } from 'check-password-strength';
    import { prepareKeys, keyToPEM } from '$lib/encryption/rsa';
    import { createHash } from '$lib/encryption/hash';
    import { generatePassphrase, encryptString } from '$lib/encryption/passphrase';
    import { generateRecoveryData, type RecoveryKeyData } from '$lib/encryption/recovery';
    import { downloadRecoveryPDF, printRecoveryPDF } from '$lib/encryption/recovery-document';
    import {
        checkPasskeyPRFSupport,
        createPasskeyWithPRF,
        encryptWithPRFKey,
        type PasskeyPRFSupport,
        type PasskeyCredential
    } from '$lib/encryption/passkey-prf';
    import { onMount } from 'svelte';
    import { t } from '$lib/i18n';
    import { logger } from '$lib/logging/logger';

    const bubble = createBubbler();

    export const ready: boolean = true;

    interface Props {
        data: {
            bio: {
                email: string;
            };
            privacy: {
                enabled: boolean;
                key_hash?: string;
                privateKey?: string;
                publicKey?: string;
                passphrase?: string;
                key_derivation_method?: 'passphrase' | 'passkey_prf';
                passkey_credential_id?: string;
                passkey_prf_salt?: string;
                recovery_encrypted_key?: string;
            };
        };
        profileForm: HTMLFormElement;
    }

    let { data = $bindable(), profileForm }: Props = $props();

    // Security mode: 'convenience' stores passphrase on server, 'zero-knowledge' requires recovery
    type SecurityMode = 'convenience' | 'zero-knowledge';

    // Key derivation method for zero-knowledge mode
    type KeyMethod = 'passkey' | 'passphrase';

    // Current step in the setup flow
    type SetupStep = 'mode-select' | 'key-method' | 'passkey-setup' | 'passphrase-setup' | 'recovery-document' | 'success';

    let securityMode: SecurityMode = $state('convenience');
    let keyMethod: KeyMethod = $state('passkey');
    let currentStep: SetupStep = $state(
        data.privacy.enabled && data.privacy.privateKey && data.privacy.publicKey
            ? 'success'
            : 'mode-select'
    );

    // Passphrase state
    let passphrase = $state(generatePassphrase());
    let testPassphrase = $state('');
    let isCustomPassphrase = $state(false);
    let viewPassphrase = $state(false);
    let strength = $derived(passwordStrength(passphrase).value);

    // Passkey state
    let passkeySupport: PasskeyPRFSupport | null = $state(null);
    let passkeyCredential: PasskeyCredential | null = $state(null);
    let passkeyError: string | null = $state(null);

    // Recovery state
    let recoveryData: RecoveryKeyData | null = $state(null);
    let recoveryDownloaded = $state(false);
    let recoveryUnderstand = $state(false);
    let isGeneratingRecovery = $state(false);

    // Loading states
    let isSettingUp = $state(false);

    // Generated keys (stored temporarily during setup)
    let generatedPrivateKeyPEM: string | null = null;
    let generatedPublicKeyPEM: string | null = null;

    onMount(async () => {
        // Check passkey PRF support
        passkeySupport = await checkPasskeyPRFSupport();
        logger.api.debug('Passkey PRF support:', passkeySupport);

        // If zero-knowledge is already enabled, we're in success state
        if (data.privacy.enabled && data.privacy.privateKey && data.privacy.publicKey) {
            currentStep = 'success';
        }
    });

    /**
     * Generate new RSA keypair and store PEM strings
     */
    async function generateKeys(): Promise<{ publicKeyPEM: string; privateKeyPEM: string }> {
        const keyPair = await crypto.subtle.generateKey(
            {
                name: 'RSA-OAEP',
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: 'SHA-256'
            },
            true,
            ['encrypt', 'decrypt']
        );

        const publicKeyPEM = await keyToPEM(keyPair.publicKey, false);
        const privateKeyPEM = await keyToPEM(keyPair.privateKey, true);

        return { publicKeyPEM, privateKeyPEM };
    }

    /**
     * Set up convenience mode (server stores passphrase backup)
     */
    async function setupConvenienceMode() {
        isSettingUp = true;
        try {
            passphrase = generatePassphrase();
            const keys = await prepareKeys(passphrase);
            const keyHash = await createHash(passphrase);

            data.privacy.enabled = false; // Not zero-knowledge
            data.privacy.key_hash = keyHash;
            data.privacy.privateKey = keys.encryptedPrivateKey;
            data.privacy.publicKey = keys.publicKeyPEM;
            data.privacy.passphrase = passphrase; // Server stores this
            data.privacy.key_derivation_method = 'passphrase';

            currentStep = 'success';
        } catch (error) {
            logger.api.error('Error setting up convenience mode:', error);
        } finally {
            isSettingUp = false;
        }
    }

    /**
     * Set up passkey with PRF extension
     */
    async function setupPasskey() {
        isSettingUp = true;
        passkeyError = null;

        try {
            // Create passkey and get PRF-derived key
            const result = await createPasskeyWithPRF(
                data.bio.email, // Using email as user ID for simplicity
                data.bio.email,
                data.bio.email.split('@')[0] // Display name
            );

            passkeyCredential = result.credential;

            // Generate RSA keypair
            const { publicKeyPEM, privateKeyPEM } = await generateKeys();
            generatedPrivateKeyPEM = privateKeyPEM;
            generatedPublicKeyPEM = publicKeyPEM;

            // Encrypt private key with PRF-derived key
            const encryptedPrivateKey = await encryptWithPRFKey(privateKeyPEM, result.derivedKey);
            const keyHash = await createHash(result.credential.credentialId); // Use credential ID as identifier

            // Store in data
            data.privacy.enabled = true;
            data.privacy.key_hash = keyHash;
            data.privacy.privateKey = encryptedPrivateKey;
            data.privacy.publicKey = publicKeyPEM;
            data.privacy.passphrase = undefined; // Zero-knowledge
            data.privacy.key_derivation_method = 'passkey_prf';
            data.privacy.passkey_credential_id = result.credential.credentialId;
            data.privacy.passkey_prf_salt = result.credential.prfSalt;

            currentStep = 'recovery-document';
        } catch (error) {
            logger.api.error('Error setting up passkey:', error);
            passkeyError = error instanceof Error ? error.message : 'Failed to set up passkey';
        } finally {
            isSettingUp = false;
        }
    }

    /**
     * Set up with passphrase (zero-knowledge mode)
     */
    async function setupPassphrase() {
        isSettingUp = true;

        try {
            const keys = await prepareKeys(passphrase);
            const keyHash = await createHash(passphrase);

            // Store the unencrypted PEM temporarily for recovery document
            generatedPrivateKeyPEM = null; // We don't have access to the raw PEM in this flow
            generatedPublicKeyPEM = keys.publicKeyPEM;

            // For recovery document, we need to decrypt and re-encrypt
            // Since prepareKeys already encrypts, we need to use the passphrase to get the raw key
            const { decryptString } = await import('$lib/encryption/passphrase');
            const rawPrivateKeyPEM = await decryptString(keys.encryptedPrivateKey, passphrase);
            generatedPrivateKeyPEM = rawPrivateKeyPEM;

            data.privacy.enabled = true;
            data.privacy.key_hash = keyHash;
            data.privacy.privateKey = keys.encryptedPrivateKey;
            data.privacy.publicKey = keys.publicKeyPEM;
            data.privacy.passphrase = undefined; // Zero-knowledge - no server storage
            data.privacy.key_derivation_method = 'passphrase';

            currentStep = 'recovery-document';
        } catch (error) {
            logger.api.error('Error setting up passphrase:', error);
        } finally {
            isSettingUp = false;
        }
    }

    /**
     * Generate recovery document
     */
    async function generateRecoveryDocument() {
        if (!generatedPrivateKeyPEM) {
            logger.api.error('No private key available for recovery document');
            return;
        }

        isGeneratingRecovery = true;

        try {
            recoveryData = await generateRecoveryData(generatedPrivateKeyPEM);

            // Store the recovery encrypted key
            data.privacy.recovery_encrypted_key = recoveryData.recoveryEncryptedKey;

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
            email: data.bio.email,
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
            email: data.bio.email,
            recoveryKey: recoveryData.recoveryKey
        });

        recoveryDownloaded = true;
    }

    /**
     * Complete setup after recovery document
     */
    function completeSetup() {
        // Clear sensitive data from memory
        generatedPrivateKeyPEM = null;
        generatedPublicKeyPEM = null;
        recoveryData = null;

        currentStep = 'success';
    }

    /**
     * Reset and start over
     */
    function resetSetup() {
        currentStep = 'mode-select';
        securityMode = 'convenience';
        keyMethod = 'passkey';
        passphrase = generatePassphrase();
        passkeyCredential = null;
        recoveryData = null;
        recoveryDownloaded = false;
        recoveryUnderstand = false;
        generatedPrivateKeyPEM = null;
        generatedPublicKeyPEM = null;

        // Reset privacy data
        data.privacy = {
            enabled: false,
            key_hash: undefined,
            privateKey: undefined,
            publicKey: undefined,
            passphrase: undefined,
            key_derivation_method: undefined,
            passkey_credential_id: undefined,
            passkey_prf_salt: undefined,
            recovery_encrypted_key: undefined
        };
    }

    function clickedToCopy(e: FocusEvent | MouseEvent) {
        const target = e?.target as HTMLInputElement;
        target.select();
        navigator.clipboard.writeText(passphrase);
    }

    // $effect to auto-generate recovery document when entering that step
    $effect(() => {
        if (currentStep === 'recovery-document' && !recoveryData && !isGeneratingRecovery) {
            generateRecoveryDocument();
        }
    });
</script>

<h2 class="h2">{$t('app.onboarding.privacy-and-amp-encryption')}</h2>

{#if currentStep === 'mode-select'}
    <!-- Step 1: Security Mode Selection -->
    <div class="security-mode-selection">
        <p class="p form-message">{$t('app.onboarding.privacy.choose-security-level')}</p>

        <div class="mode-option" class:selected={securityMode === 'convenience'}>
            <label>
                <input type="radio" bind:group={securityMode} value="convenience" />
                <div class="mode-content">
                    <strong>{$t('app.onboarding.privacy.convenience-mode')}</strong>
                    <span class="badge -recommended">{$t('app.onboarding.privacy.recommended')}</span>
                    <ul>
                        <li>{$t('app.onboarding.privacy.convenience-backup')}</li>
                        <li>{$t('app.onboarding.privacy.convenience-recovery')}</li>
                        <li>{$t('app.onboarding.privacy.convenience-encrypted')}</li>
                    </ul>
                </div>
            </label>
        </div>

        <div class="mode-option" class:selected={securityMode === 'zero-knowledge'}>
            <label>
                <input type="radio" bind:group={securityMode} value="zero-knowledge" />
                <div class="mode-content">
                    <strong>{$t('app.onboarding.privacy.zero-knowledge-mode')}</strong>
                    <span class="badge -security">{$t('app.onboarding.privacy.maximum-security')}</span>
                    <ul>
                        <li>{$t('app.onboarding.privacy.zero-knowledge-only-you')}</li>
                        <li>{$t('app.onboarding.privacy.zero-knowledge-no-access')}</li>
                        <li>{$t('app.onboarding.privacy.zero-knowledge-recovery-required')}</li>
                    </ul>
                    <p class="warning-text">{$t('app.onboarding.privacy.zero-knowledge-warning')}</p>
                </div>
            </label>
        </div>

        <div class="flex -center -column">
            {#if securityMode === 'convenience'}
                <button class="button -large -primary" onclick={setupConvenienceMode} disabled={isSettingUp}>
                    {isSettingUp ? $t('app.onboarding.privacy.setting-up') : $t('app.onboarding.privacy.continue-with-convenience')}
                </button>
            {:else}
                <button class="button -large -primary" onclick={() => currentStep = 'key-method'}>
                    {$t('app.onboarding.privacy.continue-with-zero-knowledge')}
                </button>
            {/if}
        </div>
    </div>

{:else if currentStep === 'key-method'}
    <!-- Step 2: Key Method Selection (Zero-Knowledge only) -->
    <div class="key-method-selection">
        <p class="p form-message">{$t('app.onboarding.privacy.choose-unlock-method')}</p>

        {#if passkeySupport?.prfSupported}
            <div class="method-option" class:selected={keyMethod === 'passkey'}>
                <label>
                    <input type="radio" bind:group={keyMethod} value="passkey" />
                    <div class="method-content">
                        <svg class="icon"><use href="/icons.svg#fingerprint" /></svg>
                        <div>
                            <strong>{$t('app.onboarding.privacy.passkey')}</strong>
                            <span class="badge -recommended">{$t('app.onboarding.privacy.recommended')}</span>
                            <p>{$t('app.onboarding.privacy.passkey-description')}</p>
                        </div>
                    </div>
                </label>
            </div>
        {:else}
            <div class="method-option -disabled">
                <div class="method-content">
                    <svg class="icon"><use href="/icons.svg#fingerprint" /></svg>
                    <div>
                        <strong>{$t('app.onboarding.privacy.passkey')}</strong>
                        <p class="warning-text">{$t('app.onboarding.privacy.passkey-not-supported')}</p>
                    </div>
                </div>
            </div>
        {/if}

        <div class="method-option" class:selected={keyMethod === 'passphrase'}>
            <label>
                <input type="radio" bind:group={keyMethod} value="passphrase" />
                <div class="method-content">
                    <svg class="icon"><use href="/icons.svg#key" /></svg>
                    <div>
                        <strong>{$t('app.onboarding.privacy.passphrase')}</strong>
                        <p>{$t('app.onboarding.privacy.passphrase-description')}</p>
                    </div>
                </div>
            </label>
        </div>

        <div class="flex -center -gap">
            <button class="button" onclick={() => currentStep = 'mode-select'}>
                {$t('app.onboarding.privacy.back')}
            </button>
            <button
                class="button -primary"
                onclick={() => currentStep = keyMethod === 'passkey' ? 'passkey-setup' : 'passphrase-setup'}
                disabled={keyMethod === 'passkey' && !passkeySupport?.prfSupported}
            >
                {$t('app.onboarding.privacy.continue')}
            </button>
        </div>
    </div>

{:else if currentStep === 'passkey-setup'}
    <!-- Step 3a: Passkey Setup -->
    <div class="passkey-setup">
        <p class="p form-message">{$t('app.onboarding.privacy.passkey-setup-instructions')}</p>

        <div class="setup-illustration">
            <svg class="icon -large"><use href="/icons.svg#fingerprint" /></svg>
        </div>

        {#if passkeyError}
            <p class="p form-message -error">{passkeyError}</p>
        {/if}

        <div class="flex -center -column">
            <button class="button -large -primary" onclick={setupPasskey} disabled={isSettingUp}>
                {isSettingUp ? $t('app.onboarding.privacy.setting-up-passkey') : $t('app.onboarding.privacy.create-passkey')}
            </button>

            <button class="a" onclick={() => currentStep = 'key-method'}>
                {$t('app.onboarding.privacy.back')}
            </button>
        </div>
    </div>

{:else if currentStep === 'passphrase-setup'}
    <!-- Step 3b: Passphrase Setup -->
    <div class="passphrase-setup">
        <p class="p form-message">{$t('app.onboarding.privacy.passphrase-setup-instructions')}</p>

        <form method="POST" name="passphrase" onsubmit={preventDefault(bubble('submit'))}>
            <div class="automatic-passphrase">
                <input type="text" name="username" autocomplete="username" value={data.bio.email} />
            </div>

            <div class="input">
                <label for="passphrase">{$t('app.onboarding.privacy.your-passphrase')}</label>
                {#if isCustomPassphrase}
                    <input
                        type="password"
                        id="passphrase"
                        name="password"
                        autocomplete="new-password"
                        bind:value={passphrase}
                    />
                {:else}
                    <input
                        type={viewPassphrase ? 'text' : 'password'}
                        id="passphrase"
                        name="password"
                        bind:value={passphrase}
                        onclick={clickedToCopy}
                        readonly
                    />
                {/if}
            </div>

            <p class="p strength-indicator">
                {$t('app.onboarding.privacy.strength')}: <strong>{strength}</strong>
            </p>

            <div class="passphrase-actions">
                {#if !isCustomPassphrase}
                    <button type="button" class="a" onclick={() => viewPassphrase = !viewPassphrase}>
                        {viewPassphrase ? $t('app.onboarding.privacy.hide-passphrase') : $t('app.onboarding.privacy.view-passphrase')}
                    </button>
                    <button type="button" class="a" onclick={() => navigator.clipboard.writeText(passphrase)}>
                        {$t('app.onboarding.copy-to-clipboard')}
                    </button>
                    <button type="button" class="a" onclick={() => { passphrase = ''; isCustomPassphrase = true; }}>
                        {$t('app.onboarding.privacy.use-custom')}
                    </button>
                {:else}
                    <button type="button" class="a" onclick={() => { passphrase = generatePassphrase(); isCustomPassphrase = false; }}>
                        {$t('app.onboarding.privacy.generate-random')}
                    </button>
                {/if}
            </div>
        </form>

        <div class="flex -center -gap">
            <button class="button" onclick={() => currentStep = 'key-method'}>
                {$t('app.onboarding.privacy.back')}
            </button>
            <button
                class="button -primary"
                onclick={setupPassphrase}
                disabled={isSettingUp || passphrase.length < 8}
            >
                {isSettingUp ? $t('app.onboarding.privacy.setting-up') : $t('app.onboarding.privacy.set-passphrase')}
            </button>
        </div>
    </div>

{:else if currentStep === 'recovery-document'}
    <!-- Step 4: Recovery Document -->
    <div class="recovery-document">
        <p class="p form-message">{$t('app.onboarding.privacy.recovery-document-intro')}</p>

        {#if isGeneratingRecovery}
            <div class="loading">
                <p>{$t('app.onboarding.privacy.generating-recovery')}</p>
            </div>
        {:else if recoveryData}
            <div class="recovery-key-display">
                <p class="p form-message">{$t('app.onboarding.privacy.recovery-key-label')}</p>
                <div class="recovery-key-box">
                    <code>{recoveryData.recoveryKey}</code>
                </div>
            </div>

            <div class="flex -center -gap recovery-actions">
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

            <p class="p form-message -warning">{$t('app.onboarding.privacy.recovery-warning')}</p>

            <div class="flex -center">
                <button
                    class="button -large -primary"
                    onclick={completeSetup}
                    disabled={!recoveryDownloaded || !recoveryUnderstand}
                >
                    {$t('app.onboarding.privacy.complete-setup')}
                </button>
            </div>
        {/if}
    </div>

{:else if currentStep === 'success'}
    <!-- Success State -->
    <div class="success-state">
        <div class="success-icon">
            <svg><use href="/icons.svg#check-circle" /></svg>
        </div>

        {#if data.privacy.enabled}
            <p class="p form-message -success">{$t('app.onboarding.privacy.zero-knowledge-configured')}</p>
            <p class="p">
                {#if data.privacy.key_derivation_method === 'passkey_prf'}
                    {$t('app.onboarding.privacy.using-passkey')}
                {:else}
                    {$t('app.onboarding.privacy.using-passphrase')}
                {/if}
            </p>
        {:else}
            <p class="p form-message -success">{$t('app.onboarding.privacy.convenience-configured')}</p>
            <p class="p">{$t('app.onboarding.privacy.convenience-explanation')}</p>
        {/if}

        <p class="p">
            <button class="a" onclick={resetSetup}>{$t('app.onboarding.privacy.configure-again')}</button>
        </p>
    </div>
{/if}

<style>
    .automatic-passphrase {
        position: fixed;
        top: -100000000px;
        left: -100000000px;
    }

    .security-mode-selection,
    .key-method-selection,
    .passkey-setup,
    .passphrase-setup,
    .recovery-document,
    .success-state {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .mode-option,
    .method-option {
        border: 2px solid var(--color-border);
        border-radius: 0.5rem;
        padding: 1rem;
        cursor: pointer;
        transition: border-color 0.2s, background-color 0.2s;
    }

    .mode-option:hover,
    .method-option:hover {
        border-color: var(--color-primary);
    }

    .mode-option.selected,
    .method-option.selected {
        border-color: var(--color-primary);
        background-color: var(--color-primary-light, rgba(0, 122, 255, 0.05));
    }

    .method-option.-disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .mode-option label,
    .method-option label {
        display: flex;
        gap: 1rem;
        cursor: pointer;
    }

    .mode-content,
    .method-content {
        flex: 1;
    }

    .mode-content ul {
        margin: 0.5rem 0;
        padding-left: 1.5rem;
    }

    .mode-content li {
        margin: 0.25rem 0;
        color: var(--color-text-secondary);
    }

    .method-content {
        display: flex;
        gap: 1rem;
        align-items: flex-start;
    }

    .method-content .icon {
        width: 2rem;
        height: 2rem;
        flex-shrink: 0;
    }

    .badge {
        display: inline-block;
        padding: 0.125rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.75rem;
        font-weight: 600;
        margin-left: 0.5rem;
    }

    .badge.-recommended {
        background-color: var(--color-success-light, #e6f4ea);
        color: var(--color-success, #1e7e34);
    }

    .badge.-security {
        background-color: var(--color-warning-light, #fff3e0);
        color: var(--color-warning, #e65100);
    }

    .warning-text {
        color: var(--color-warning, #e65100);
        font-size: 0.875rem;
        margin-top: 0.5rem;
    }

    .setup-illustration {
        display: flex;
        justify-content: center;
        padding: 2rem;
    }

    .setup-illustration .icon.-large {
        width: 6rem;
        height: 6rem;
        color: var(--color-primary);
    }

    .strength-indicator {
        text-align: center;
    }

    .passphrase-actions {
        display: flex;
        gap: 1rem;
        justify-content: center;
        flex-wrap: wrap;
    }

    .recovery-key-box {
        background-color: var(--color-bg-secondary, #f5f5f5);
        border: 1px solid var(--color-border);
        border-radius: 0.5rem;
        padding: 1rem;
        text-align: center;
        font-family: monospace;
        font-size: 1.125rem;
        letter-spacing: 0.05em;
        word-break: break-all;
    }

    .recovery-actions {
        margin: 1rem 0;
    }

    .recovery-actions button svg {
        width: 1.25rem;
        height: 1.25rem;
        margin-right: 0.5rem;
    }

    .recovery-confirmations {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .checkbox {
        display: flex;
        gap: 0.5rem;
        align-items: flex-start;
        cursor: pointer;
    }

    .checkbox input[type="checkbox"] {
        margin-top: 0.25rem;
    }

    .success-state {
        text-align: center;
    }

    .success-icon svg {
        width: 4rem;
        height: 4rem;
        color: var(--color-success, #1e7e34);
    }

    .flex.-gap {
        gap: 1rem;
    }

    .button.-large {
        width: 100%;
        max-width: 300px;
    }

    .loading {
        text-align: center;
        padding: 2rem;
    }
</style>

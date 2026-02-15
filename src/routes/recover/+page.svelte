<script lang="ts">
    import { goto } from '$app/navigation';
    import { t } from '$lib/i18n';
    import { validateRecoveryKeyFormat, recoverPrivateKey } from '$lib/encryption/recovery';
    import { generateRecoveryQR } from '$lib/encryption/recovery-document';
    import { prepareKeys } from '$lib/encryption/rsa';
    import { createHash } from '$lib/encryption/hash';
    import { encryptString, generatePassphrase } from '$lib/encryption/passphrase';
    import {
        checkPasskeyPRFSupport,
        createPasskeyWithPRF,
        encryptWithPRFKey,
        type PasskeyPRFSupport
    } from '$lib/encryption/passkey-prf';
    import { generateRecoveryData } from '$lib/encryption/recovery';
    import { downloadRecoveryPDF } from '$lib/encryption/recovery-document';
    import { onMount } from 'svelte';

    type RecoveryStep =
        | 'enter-key'
        | 'verifying'
        | 'choose-new-method'
        | 'new-passkey'
        | 'new-passphrase'
        | 'new-recovery'
        | 'success'
        | 'error';

    let currentStep: RecoveryStep = $state('enter-key');
    let recoveryKeyInput = $state('');
    let recoveryKeyError: string | null = $state(null);
    let isVerifying = $state(false);

    // Recovered data
    let recoveredPrivateKeyPEM: string | null = null;
    let userEmail = $state('');
    let userPublicKey: string | null = null;

    // New credentials
    let newPassphrase = $state(generatePassphrase());
    let isCustomPassphrase = $state(false);
    let viewPassphrase = $state(false);
    let passkeySupport: PasskeyPRFSupport | null = $state(null);
    let newKeyMethod: 'passkey' | 'passphrase' = $state('passphrase');

    // New recovery
    let newRecoveryKey: string | null = $state(null);
    let recoveryDownloaded = $state(false);

    // Loading states
    let isSettingUp = $state(false);
    let setupError: string | null = $state(null);

    onMount(async () => {
        // Check passkey support
        passkeySupport = await checkPasskeyPRFSupport();

        // Get email from URL or session
        const params = new URLSearchParams(window.location.search);
        userEmail = params.get('email') || '';
    });

    /**
     * Format recovery key as user types
     */
    function formatRecoveryKey(value: string): string {
        // Remove all non-alphanumeric characters and uppercase
        const clean = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

        // Format as XXXX-XXXX-XXXX-...
        const groups = clean.match(/.{1,4}/g) || [];
        return groups.join('-');
    }

    function handleKeyInput(event: Event) {
        const input = event.target as HTMLInputElement;
        const cursorPos = input.selectionStart || 0;
        const oldLength = recoveryKeyInput.length;

        recoveryKeyInput = formatRecoveryKey(input.value);

        // Adjust cursor position after formatting
        const newLength = recoveryKeyInput.length;
        const diff = newLength - oldLength;
        input.setSelectionRange(cursorPos + diff, cursorPos + diff);

        // Clear error on input
        recoveryKeyError = null;
    }

    /**
     * Verify recovery key and fetch encrypted data
     */
    async function verifyRecoveryKey() {
        if (!validateRecoveryKeyFormat(recoveryKeyInput)) {
            recoveryKeyError = $t('app.recover.invalid-key-format');
            return;
        }

        isVerifying = true;
        recoveryKeyError = null;
        currentStep = 'verifying';

        try {
            // Fetch the user's recovery_encrypted_key from the server
            const response = await fetch('/v1/recover/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: userEmail,
                    recoveryKey: recoveryKeyInput
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Recovery failed');
            }

            const data = await response.json();

            // Decrypt the private key with the recovery key
            recoveredPrivateKeyPEM = await recoverPrivateKey(
                data.recovery_encrypted_key,
                recoveryKeyInput
            );

            userPublicKey = data.public_key;

            // Success - move to choose new method
            currentStep = 'choose-new-method';
        } catch (error) {
            console.error('Recovery verification failed:', error);
            recoveryKeyError = error instanceof Error
                ? error.message
                : $t('app.recover.verification-failed');
            currentStep = 'enter-key';
        } finally {
            isVerifying = false;
        }
    }

    /**
     * Set up new passkey
     */
    async function setupNewPasskey() {
        if (!recoveredPrivateKeyPEM || !userEmail) return;

        isSettingUp = true;
        setupError = null;

        try {
            const result = await createPasskeyWithPRF(
                userEmail,
                userEmail,
                userEmail.split('@')[0]
            );

            // Encrypt private key with new PRF-derived key
            const encryptedPrivateKey = await encryptWithPRFKey(
                recoveredPrivateKeyPEM,
                result.derivedKey
            );

            // Save to server
            const response = await fetch('/v1/recover/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: userEmail,
                    recoveryKey: recoveryKeyInput,
                    newCredentials: {
                        key_derivation_method: 'passkey_prf',
                        privateKey: encryptedPrivateKey,
                        key_hash: await createHash(result.credential.credentialId),
                        passkey_credential_id: result.credential.credentialId,
                        passkey_prf_salt: result.credential.prfSalt
                    }
                })
            });

            if (!response.ok) {
                throw new Error('Failed to update credentials');
            }

            currentStep = 'new-recovery';
        } catch (error) {
            console.error('Passkey setup failed:', error);
            setupError = error instanceof Error ? error.message : 'Passkey setup failed';
        } finally {
            isSettingUp = false;
        }
    }

    /**
     * Set up new passphrase
     */
    async function setupNewPassphrase() {
        if (!recoveredPrivateKeyPEM || !userEmail) return;

        isSettingUp = true;
        setupError = null;

        try {
            // Encrypt private key with new passphrase
            const encryptedPrivateKey = await encryptString(
                recoveredPrivateKeyPEM,
                newPassphrase
            );

            const keyHash = await createHash(newPassphrase);

            // Save to server
            const response = await fetch('/v1/recover/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: userEmail,
                    recoveryKey: recoveryKeyInput,
                    newCredentials: {
                        key_derivation_method: 'passphrase',
                        privateKey: encryptedPrivateKey,
                        key_hash: keyHash,
                        passkey_credential_id: null,
                        passkey_prf_salt: null
                    }
                })
            });

            if (!response.ok) {
                throw new Error('Failed to update credentials');
            }

            currentStep = 'new-recovery';
        } catch (error) {
            console.error('Passphrase setup failed:', error);
            setupError = error instanceof Error ? error.message : 'Passphrase setup failed';
        } finally {
            isSettingUp = false;
        }
    }

    /**
     * Generate new recovery document
     */
    async function generateNewRecovery() {
        if (!recoveredPrivateKeyPEM) return;

        isSettingUp = true;

        try {
            const recoveryData = await generateRecoveryData(recoveredPrivateKeyPEM);
            newRecoveryKey = recoveryData.recoveryKey;

            // Update server with new recovery key
            const response = await fetch('/v1/recover/update-recovery', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: userEmail,
                    recoveryKey: recoveryKeyInput,
                    newRecoveryEncryptedKey: recoveryData.recoveryEncryptedKey
                })
            });

            if (!response.ok) {
                throw new Error('Failed to update recovery key');
            }
        } catch (error) {
            console.error('Recovery generation failed:', error);
            setupError = error instanceof Error ? error.message : 'Failed to generate recovery';
        } finally {
            isSettingUp = false;
        }
    }

    async function downloadNewRecovery() {
        if (!newRecoveryKey) return;

        await downloadRecoveryPDF({
            email: userEmail,
            recoveryKey: newRecoveryKey
        });

        recoveryDownloaded = true;
    }

    function completeRecovery() {
        // Clear sensitive data
        recoveredPrivateKeyPEM = null;
        newRecoveryKey = null;

        currentStep = 'success';
    }

    function goToLogin() {
        goto('/login');
    }

    // Auto-generate new recovery when entering that step
    $effect(() => {
        if (currentStep === 'new-recovery' && !newRecoveryKey && !isSettingUp) {
            generateNewRecovery();
        }
    });
</script>

<svelte:head>
    <title>{$t('app.recover.title')} | Mediqom</title>
</svelte:head>

<div class="recover-page">
    <div class="recover-container">
        <h1 class="h1">{$t('app.recover.title')}</h1>

        {#if currentStep === 'enter-key'}
            <div class="step-content">
                <p class="p">{$t('app.recover.enter-key-description')}</p>

                <div class="input">
                    <label for="email">{$t('app.recover.email')}</label>
                    <input
                        type="email"
                        id="email"
                        bind:value={userEmail}
                        placeholder="your@email.com"
                    />
                </div>

                <div class="input">
                    <label for="recovery-key">{$t('app.recover.recovery-key')}</label>
                    <input
                        type="text"
                        id="recovery-key"
                        value={recoveryKeyInput}
                        oninput={handleKeyInput}
                        placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                        class="recovery-key-input"
                        autocomplete="off"
                        spellcheck="false"
                    />
                </div>

                {#if recoveryKeyError}
                    <p class="p form-message -error">{recoveryKeyError}</p>
                {/if}

                <div class="flex -center">
                    <button
                        class="button -primary -large"
                        onclick={verifyRecoveryKey}
                        disabled={!userEmail || recoveryKeyInput.length < 47}
                    >
                        {$t('app.recover.verify-key')}
                    </button>
                </div>

                <p class="p help-text">
                    {$t('app.recover.help-text')}
                </p>
            </div>

        {:else if currentStep === 'verifying'}
            <div class="step-content -center">
                <div class="loading-spinner"></div>
                <p class="p">{$t('app.recover.verifying')}</p>
            </div>

        {:else if currentStep === 'choose-new-method'}
            <div class="step-content">
                <p class="p form-message -success">{$t('app.recover.key-verified')}</p>
                <p class="p">{$t('app.recover.choose-new-method')}</p>

                <div class="method-options">
                    {#if passkeySupport?.prfSupported}
                        <div class="method-option" class:selected={newKeyMethod === 'passkey'}>
                            <label>
                                <input type="radio" bind:group={newKeyMethod} value="passkey" />
                                <div class="method-content">
                                    <svg class="icon"><use href="/icons.svg#fingerprint" /></svg>
                                    <div>
                                        <strong>{$t('app.recover.passkey')}</strong>
                                        <p>{$t('app.recover.passkey-description')}</p>
                                    </div>
                                </div>
                            </label>
                        </div>
                    {/if}

                    <div class="method-option" class:selected={newKeyMethod === 'passphrase'}>
                        <label>
                            <input type="radio" bind:group={newKeyMethod} value="passphrase" />
                            <div class="method-content">
                                <svg class="icon"><use href="/icons.svg#key" /></svg>
                                <div>
                                    <strong>{$t('app.recover.passphrase')}</strong>
                                    <p>{$t('app.recover.passphrase-description')}</p>
                                </div>
                            </div>
                        </label>
                    </div>
                </div>

                <div class="flex -center">
                    <button
                        class="button -primary -large"
                        onclick={() => currentStep = newKeyMethod === 'passkey' ? 'new-passkey' : 'new-passphrase'}
                    >
                        {$t('app.recover.continue')}
                    </button>
                </div>
            </div>

        {:else if currentStep === 'new-passkey'}
            <div class="step-content -center">
                <p class="p">{$t('app.recover.setup-new-passkey')}</p>

                <div class="setup-illustration">
                    <svg class="icon -large"><use href="/icons.svg#fingerprint" /></svg>
                </div>

                {#if setupError}
                    <p class="p form-message -error">{setupError}</p>
                {/if}

                <button
                    class="button -primary -large"
                    onclick={setupNewPasskey}
                    disabled={isSettingUp}
                >
                    {isSettingUp ? $t('app.recover.setting-up') : $t('app.recover.create-passkey')}
                </button>

                <button class="a" onclick={() => currentStep = 'choose-new-method'}>
                    {$t('app.recover.back')}
                </button>
            </div>

        {:else if currentStep === 'new-passphrase'}
            <div class="step-content">
                <p class="p">{$t('app.recover.setup-new-passphrase')}</p>

                <div class="input">
                    <label for="new-passphrase">{$t('app.recover.new-passphrase')}</label>
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

                <div class="passphrase-actions">
                    {#if !isCustomPassphrase}
                        <button type="button" class="a" onclick={() => viewPassphrase = !viewPassphrase}>
                            {viewPassphrase ? $t('app.recover.hide') : $t('app.recover.show')}
                        </button>
                        <button type="button" class="a" onclick={() => navigator.clipboard.writeText(newPassphrase)}>
                            {$t('app.recover.copy')}
                        </button>
                        <button type="button" class="a" onclick={() => { newPassphrase = ''; isCustomPassphrase = true; }}>
                            {$t('app.recover.use-custom')}
                        </button>
                    {:else}
                        <button type="button" class="a" onclick={() => { newPassphrase = generatePassphrase(); isCustomPassphrase = false; }}>
                            {$t('app.recover.generate-random')}
                        </button>
                    {/if}
                </div>

                {#if setupError}
                    <p class="p form-message -error">{setupError}</p>
                {/if}

                <div class="flex -center -gap">
                    <button class="button" onclick={() => currentStep = 'choose-new-method'}>
                        {$t('app.recover.back')}
                    </button>
                    <button
                        class="button -primary"
                        onclick={setupNewPassphrase}
                        disabled={isSettingUp || newPassphrase.length < 8}
                    >
                        {isSettingUp ? $t('app.recover.setting-up') : $t('app.recover.set-passphrase')}
                    </button>
                </div>
            </div>

        {:else if currentStep === 'new-recovery'}
            <div class="step-content">
                <p class="p form-message -success">{$t('app.recover.credentials-updated')}</p>
                <p class="p">{$t('app.recover.generate-new-recovery')}</p>

                {#if isSettingUp}
                    <div class="loading">
                        <p>{$t('app.recover.generating')}</p>
                    </div>
                {:else if newRecoveryKey}
                    <div class="recovery-key-display">
                        <div class="recovery-key-box">
                            <code>{newRecoveryKey}</code>
                        </div>
                    </div>

                    <div class="flex -center">
                        <button class="button -primary" onclick={downloadNewRecovery}>
                            <svg><use href="/icons.svg#download" /></svg>
                            {$t('app.recover.download-pdf')}
                        </button>
                    </div>

                    <label class="checkbox">
                        <input type="checkbox" bind:checked={recoveryDownloaded} />
                        {$t('app.recover.confirm-saved')}
                    </label>

                    <div class="flex -center">
                        <button
                            class="button -primary -large"
                            onclick={completeRecovery}
                            disabled={!recoveryDownloaded}
                        >
                            {$t('app.recover.complete')}
                        </button>
                    </div>
                {/if}
            </div>

        {:else if currentStep === 'success'}
            <div class="step-content -center">
                <div class="success-icon">
                    <svg><use href="/icons.svg#check-circle" /></svg>
                </div>

                <h2 class="h2">{$t('app.recover.success-title')}</h2>
                <p class="p">{$t('app.recover.success-description')}</p>

                <button class="button -primary -large" onclick={goToLogin}>
                    {$t('app.recover.go-to-login')}
                </button>
            </div>

        {:else if currentStep === 'error'}
            <div class="step-content -center">
                <div class="error-icon">
                    <svg><use href="/icons.svg#alert-circle" /></svg>
                </div>

                <h2 class="h2">{$t('app.recover.error-title')}</h2>
                <p class="p">{recoveryKeyError}</p>

                <button class="button -primary" onclick={() => currentStep = 'enter-key'}>
                    {$t('app.recover.try-again')}
                </button>
            </div>
        {/if}
    </div>
</div>

<style>
    .recover-page {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem;
        background-color: var(--color-bg-secondary, #f5f5f5);
    }

    .recover-container {
        background: white;
        border-radius: 1rem;
        padding: 2rem;
        max-width: 500px;
        width: 100%;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .h1 {
        text-align: center;
        margin-bottom: 2rem;
    }

    .step-content {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .step-content.-center {
        align-items: center;
        text-align: center;
    }

    .recovery-key-input {
        font-family: monospace;
        font-size: 1rem;
        letter-spacing: 0.05em;
    }

    .method-options {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .method-option {
        border: 2px solid var(--color-border);
        border-radius: 0.5rem;
        padding: 1rem;
        cursor: pointer;
        transition: border-color 0.2s;
    }

    .method-option:hover {
        border-color: var(--color-primary);
    }

    .method-option.selected {
        border-color: var(--color-primary);
        background-color: rgba(0, 122, 255, 0.05);
    }

    .method-option label {
        display: flex;
        gap: 1rem;
        cursor: pointer;
    }

    .method-content {
        display: flex;
        gap: 1rem;
        align-items: flex-start;
        flex: 1;
    }

    .method-content .icon {
        width: 2rem;
        height: 2rem;
        flex-shrink: 0;
    }

    .setup-illustration {
        padding: 2rem;
    }

    .setup-illustration .icon.-large {
        width: 6rem;
        height: 6rem;
        color: var(--color-primary);
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
        font-size: 1rem;
        word-break: break-all;
    }

    .checkbox {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        cursor: pointer;
    }

    .success-icon svg,
    .error-icon svg {
        width: 4rem;
        height: 4rem;
    }

    .success-icon svg {
        color: var(--color-success, #1e7e34);
    }

    .error-icon svg {
        color: var(--color-error, #dc3545);
    }

    .help-text {
        text-align: center;
        font-size: 0.875rem;
        color: var(--color-text-secondary);
    }

    .loading-spinner {
        width: 3rem;
        height: 3rem;
        border: 3px solid var(--color-border);
        border-top-color: var(--color-primary);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
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

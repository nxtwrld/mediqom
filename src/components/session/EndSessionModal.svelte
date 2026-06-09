<script lang="ts">
    import Modal from '$components/ui/Modal.svelte';
    import { t } from '$lib/i18n';
    import { unifiedSessionActions } from '$lib/session/stores/unified-session-store';
    import { saveSessionAsDocument } from '$lib/session/document-storage';
    import { logger } from '$lib/logging/logger';
    
    interface Props {
        onclose?: () => void;
        patientId?: string;
        performerId?: string;
        performerName?: string;
    }

    let { onclose, patientId, performerId, performerName }: Props = $props();
    let isSaving = $state(false);
    let saveError = $state<string | null>(null);

    async function handleSave() {
        if (!patientId || !performerId || !performerName) {
            logger.session.error('Missing required data for saving session', {
                patientId: !!patientId,
                performerId: !!performerId,
                performerName: !!performerName
            });
            saveError = $t('session.save.error.missing_data');
            return;
        }

        isSaving = true;
        saveError = null;

        try {
            // Get session data from store
            const sessionData = unifiedSessionActions.getCurrentSessionData();
            const transcriptData = unifiedSessionActions.getCurrentTranscriptData();
            const metadata = unifiedSessionActions.getSessionMetadata();

            logger.session.debug('Retrieved session data for saving', {
                hasSessionData: !!sessionData,
                sessionNodes: sessionData?.nodes ? Object.keys(sessionData.nodes) : [],
                transcriptLength: transcriptData?.length || 0,
                metadata
            });

            if (!sessionData) {
                throw new Error('No session data available');
            }

            // Save session as document
            const documentId = await saveSessionAsDocument(
                sessionData,
                transcriptData,
                patientId,
                performerId,
                performerName,
                metadata.duration
            );

            logger.session.info('Session saved successfully', { documentId });

            // Stop recording and reset session to Ready state
            await unifiedSessionActions.stopSessionAndReset();

            // Close modal
            onclose?.();

        } catch (error) {
            logger.session.error('Failed to save session', { error });
            saveError = error instanceof Error ? error.message : String(error);
        } finally {
            isSaving = false;
        }
    }

    async function handleDiscard() {
        // Stop recording and reset session to Ready state without saving
        await unifiedSessionActions.stopSessionAndReset();
        onclose?.();
    }

    function handleCancel() {
        // Simply close the modal without any action
        onclose?.();
    }
</script>

<Modal {onclose}>
    <h2 class="h2">{$t('session.end.title')}</h2>
    <p class="description">{$t('session.end.description')}</p>

    {#if saveError}
        <div class="error-message">
            <svg class="error-icon">
                <use href="/icons.svg#alert-circle"></use>
            </svg>
            <span>{saveError}</span>
        </div>
    {/if}

    <div class="modal-action">
        <button 
            type="button" 
            class="button" 
            onclick={handleCancel}
            disabled={isSaving}
        >
            {$t('session.actions.cancel')}
        </button>
        
        <div class="spacer"></div>
        
        <button 
            type="button" 
            class="button -suppress" 
            onclick={handleDiscard}
            disabled={isSaving}
        >
            {$t('session.actions.discard')}
        </button>
        
        <button 
            type="button" 
            class="button -primary" 
            onclick={handleSave}
            disabled={isSaving}
        >
            {#if isSaving}
                <span class="spinner"></span>
                {$t('session.actions.saving')}
            {:else}
                {$t('session.actions.save')}
            {/if}
        </button>
    </div>
</Modal>

<style>
    .description {
        color: var(--color-text-secondary, #6b7280);
        margin-bottom: 1.5rem;
        line-height: 1.5;
    }

    .error-message {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem;
        background: var(--color-negative-light, #fef2f2);
        border: 1px solid var(--color-negative, #fecaca);
        border-radius: var(--radius-8, 8px);
        color: var(--color-negative, #dc2626);
        font-size: 0.875rem;
        margin-bottom: 1.5rem;
    }

    .error-icon {
        width: 1rem;
        height: 1rem;
        fill: currentColor;
        flex-shrink: 0;
    }

    .spinner {
        width: 1rem;
        height: 1rem;
        border: 2px solid transparent;
        border-top: 2px solid currentColor;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
</style>
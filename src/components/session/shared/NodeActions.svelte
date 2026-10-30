<script lang="ts">
    import { t } from '$lib/i18n';
    
    interface Props {
        nodeId: string;
        onnodeAction?: (action: string, targetId: string, reason?: string) => void;
    }

    let { nodeId, onnodeAction }: Props = $props();

    function handleNodeAction(action: string) {
        onnodeAction?.(action, nodeId, `${action} from node details`);
    }
</script>

<footer class="session-details-actions">
    <button class="button -accept" onclick={() => handleNodeAction('accept')}>
        {$t('session.actions.accept')}
    </button>
    <button class="button -highlight" onclick={() => handleNodeAction('highlight')}>
        {$t('session.actions.highlight')}
    </button>
    <button class="button -suppress" onclick={() => handleNodeAction('suppress')}>
        {$t('session.actions.suppress')}
    </button>
</footer>

<style>
    .session-details-actions {
        display: flex;
        gap: 0.8rem;
        padding: 1.6rem;
        border-top: 1px solid var(--color-border, #e2e8f0);
        margin-top: auto;
    }
    
    .session-details-actions .button {
        flex: 1;
    }
</style>
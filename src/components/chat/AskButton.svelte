<script lang="ts">
    import { t } from '$lib/i18n';
    import ui from '$lib/ui';
    import type { AskAboutEvent } from '$lib/chat/types.d';

    interface Props {
        type: string;
        label: string;
        data: any;
        documentId?: string;
        documentTitle?: string;
    }

    let { type, label, data, documentId, documentTitle }: Props = $props();

    function handleAsk() {
        const event: AskAboutEvent = { type, label, data, documentId, documentTitle };
        ui.emit('chat:ask_about', event);
    }
</script>

<button
    class="button -small -highlight ask-btn"
    onclick={handleAsk}
    title={$t('app.chat.ask-about.aria', { values: { label } })}
    aria-label={$t('app.chat.ask-about.aria', { values: { label } })}
>
    <svg width="14" height="14" aria-hidden="true">
        <use href="/icons.svg#bubble-chat" />
    </svg>
    {$t('app.chat.ask-about.button')}
</button>

<style>
    .ask-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.75rem;
        padding: 0.25rem 0.5rem;
        line-height: 1;
    }
</style>

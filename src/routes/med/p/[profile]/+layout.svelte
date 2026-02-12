<script lang="ts">
    interface Props {
        children?: import('svelte').Snippet;
    }

    let { children }: Props = $props();
</script>

{@render children?.()}

<!-- AI Chat Sidebar moved to UI.svelte for global access -->

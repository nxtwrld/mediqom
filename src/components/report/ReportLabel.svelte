<script lang="ts">
    interface Props {
        type: string;
    }

    let { type }: Props = $props();
</script>

<span class="report-label" class:type={type}>
    {type}
</span>

<style>
    .report-label {
        display: inline-block;
        padding: 0.25rem 0.5rem;
        font-size: 0.75rem;
        background-color: var(--color-gray-200);
        color: var(--color-gray-800);
        border-radius: var(--border-radius);
        text-transform: capitalize;
    }
    
</style> 
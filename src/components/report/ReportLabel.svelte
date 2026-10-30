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
        padding: 0.4rem 0.8rem;
        font-size: 1.2rem;
        background-color: var(--color-gray-200);
        color: var(--color-gray-800);
        border-radius: var(--radius-16);
        text-transform: capitalize;
    }
    
</style> 
<script lang="ts">
    import { monthNamesShort } from '$lib/datetime';
    interface Props {
        date: string;
    }

    let { date }: Props = $props();

    let year = $derived(date.split('-')[0]);
    let month = $derived(date.split('-')[1]);
</script>


<div class="date-vertical">
    <div class="date-vertical__month">{monthNamesShort[parseInt(month) - 1]}</div>
    <div class="date-vertical__year">{year}</div>
</div>


<style>
    .date-vertical {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-size: 1.2rem;
        color: var(--color-text-secondary);
        border: .3rem solid var(--color);
    }

    .date-vertical__month {
        padding: .3rem;
        text-align: center;
        font-weight: 700;
        color: var(--color);
    }

    .date-vertical__year {
        width: 100%;
        padding: .2rem;
        text-align: center;
        font-size: 1rem;
        font-weight: 700;
        background-color: var(--color);
        color: var(--color-text-primary);
    }
</style>
<script lang="ts">
    import { t } from '$lib/i18n';
    import Input from '$components/forms/Input.svelte';
    import Select from '$components/forms/Select.svelte';
    import { MEDICATION_FREQUENCIES } from '$lib/medications/types';

    interface Props {
        frequency: string;
        times: string[];
        byDay: string[];
        byMonthDay: number[];
        startDate: string;
        endDate: string;
        pillCount: number;
    }

    let {
        frequency = $bindable('daily'),
        times = $bindable(['08:00']),
        byDay = $bindable([]),
        byMonthDay = $bindable([]),
        startDate = $bindable(''),
        endDate = $bindable(''),
        pillCount = $bindable(0),
    }: Props = $props();

    const DAY_KEYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
    const DAYS = $derived(DAY_KEYS.map(key => ({ key, value: $t(`medications.day-${key.toLowerCase()}`) })));

    function addTime() {
        times = [...times, '08:00'];
    }

    function removeTime(index: number) {
        times = times.filter((_, i) => i !== index);
    }

    function updateTime(index: number, value: string) {
        times = times.map((t, i) => i === index ? value : t);
    }

    function toggleDay(day: string) {
        if (byDay.includes(day)) {
            byDay = byDay.filter(d => d !== day);
        } else {
            byDay = [...byDay, day];
        }
    }

    function toggleMonthDay(day: number) {
        if (byMonthDay.includes(day)) {
            byMonthDay = byMonthDay.filter(d => d !== day);
        } else {
            byMonthDay = [...byMonthDay, day].sort((a, b) => a - b);
        }
    }
</script>

<div class="schedule-editor">
    <div class="select-with-icon">
        <svg class="select-icon" aria-hidden="true"><use href="/icons.svg#frequency-{frequency}"></use></svg>
        <Select
            bind:value={frequency}
            label={$t('medications.frequency')}
            options={MEDICATION_FREQUENCIES.map(f => ({ key: f, value: $t(`medications.frequency-${f}`) }))}
        />
    </div>

    <Input type="date" bind:value={startDate} label={$t('medications.start-date')} required />
    <Input type="date" bind:value={endDate} label={$t('medications.end-date')} placeholder="" />

    {#if frequency !== 'as_needed' && frequency !== 'once'}
        <div class="times-section">
            <label class="label">{$t('medications.times-of-day')}</label>
            {#each times as time, i}
                <div class="time-row">
                    <input type="time" value={time} onchange={(e) => updateTime(i, e.currentTarget.value)} />
                    {#if times.length > 1}
                        <button type="button" class="button -small -icon" onclick={() => removeTime(i)} aria-label={$t('app.remove')}>
                            <svg aria-hidden="true"><use href="/icons.svg#close"></use></svg>
                        </button>
                    {/if}
                </div>
            {/each}
            <button type="button" class="button -small" onclick={addTime}>
                + {$t('medications.add-time')}
            </button>
        </div>
    {/if}

    {#if frequency === 'weekly'}
        <div class="days-section">
            <label class="label">{$t('medications.days-of-week')}</label>
            <div class="day-buttons">
                {#each DAYS as day}
                    <button
                        type="button"
                        class="day-btn"
                        class:-active={byDay.includes(day.key)}
                        onclick={() => toggleDay(day.key)}
                    >
                        {day.value}
                    </button>
                {/each}
            </div>
        </div>
    {/if}

    {#if frequency === 'monthly'}
        <div class="days-section">
            <label class="label">{$t('medications.days-of-month')}</label>
            <div class="monthday-grid">
                {#each Array.from({length: 31}, (_, i) => i + 1) as day}
                    <button
                        type="button"
                        class="monthday-btn"
                        class:-active={byMonthDay.includes(day)}
                        onclick={() => toggleMonthDay(day)}
                    >
                        {day}
                    </button>
                {/each}
            </div>
        </div>
    {/if}

    {#if frequency !== 'as_needed'}
        <Input type="number" bind:value={pillCount} label={$t('medications.pill-count')} min="0" placeholder="0" />
    {/if}
</div>

<style>
    .select-with-icon {
        display: flex;
        align-items: flex-end;
        gap: var(--ui-pad-small);
    }
    .select-with-icon .select-icon {
        width: 1.5rem;
        height: 1.5rem;
        fill: var(--color-text-secondary);
        flex-shrink: 0;
        margin-bottom: 0.5rem;
    }
    .schedule-editor {
        display: flex;
        flex-direction: column;
        gap: var(--ui-pad-medium);
    }
    .times-section {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .time-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .time-row input[type="time"] {
        padding: 0.375rem 0.5rem;
        border: 1px solid var(--color-border);
        border-radius: var(--ui-radius-small);
        font-size: 0.875rem;
    }
    .days-section {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .day-buttons {
        display: flex;
        gap: 0.25rem;
        flex-wrap: wrap;
    }
    .day-btn {
        padding: 0.375rem 0.625rem;
        border: 1px solid var(--color-border);
        border-radius: var(--ui-radius-small);
        background: var(--color-white);
        cursor: pointer;
        font-size: 0.8125rem;
        transition: all 0.15s ease;
    }
    .day-btn.-active {
        background: var(--color-interactivity, #0066cc);
        color: white;
        border-color: var(--color-interactivity, #0066cc);
    }
    .monthday-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 0.25rem;
    }
    .monthday-btn {
        padding: 0.25rem;
        border: 1px solid var(--color-border);
        border-radius: var(--ui-radius-small);
        background: var(--color-white);
        cursor: pointer;
        font-size: 0.75rem;
        text-align: center;
        transition: all 0.15s ease;
    }
    .monthday-btn.-active {
        background: var(--color-interactivity, #0066cc);
        color: white;
        border-color: var(--color-interactivity, #0066cc);
    }
    .button.-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0.25rem;
    }
    .button.-icon svg {
        width: 1rem;
        height: 1rem;
        fill: currentColor;
    }
</style>

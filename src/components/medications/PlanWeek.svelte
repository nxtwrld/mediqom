<script lang="ts">
    import { t } from '$lib/i18n';
    import { weekSchedule, loadMedicationContent } from '$lib/medications/store';
    import type { MedicationOccurrence } from '$lib/medications/types';

    // Map JS day index (0=Sun..6=Sat) to translation key suffix
    const dayKeyMap: Record<number, string> = { 0: 'su', 1: 'mo', 2: 'tu', 3: 'we', 4: 'th', 5: 'fr', 6: 'sa' };

    interface Props {
        profileId: string;
    }

    let { profileId }: Props = $props();

    const occurrences = weekSchedule(profileId);

    $effect(() => {
        loadMedicationContent(profileId);
    });

    // Monday-first day indices
    const daysOfWeek = [1, 2, 3, 4, 5, 6, 0];

    let openDay = $state(new Date().getDay());

    type TimeSegment = 'morning' | 'afternoon' | 'night';

    const segmentIcons: Record<TimeSegment, string> = {
        morning: 'time-morning',
        afternoon: 'time-afternoon',
        night: 'time-night'
    };

    function getSegment(time: string): TimeSegment {
        const hour = parseInt(time.split(':')[0], 10);
        if (hour >= 5 && hour < 12) return 'morning';
        if (hour >= 12 && hour < 17) return 'afternoon';
        return 'night';
    }

    function getStartOfWeek(): Date {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        const day = d.getDay();
        const diff = (day === 0 ? -6 : 1) - day;
        d.setDate(d.getDate() + diff);
        return d;
    }

    function getDateForDayIndex(dayIndex: number): string {
        const start = getStartOfWeek();
        // Convert JS day (0=Sun) to offset from Monday
        const offset = dayIndex === 0 ? 6 : dayIndex - 1;
        const d = new Date(start);
        d.setDate(d.getDate() + offset);
        return d.toISOString().split('T')[0];
    }

    function isToday(dayIndex: number): boolean {
        return new Date().getDay() === dayIndex;
    }

    function eventsForDay(dayIndex: number): MedicationOccurrence[] {
        const dateStr = getDateForDayIndex(dayIndex);
        return $occurrences.filter((o) => o.scheduledDate === dateStr);
    }

    function eventsForSegment(dayEvents: MedicationOccurrence[], segment: TimeSegment): MedicationOccurrence[] {
        return dayEvents.filter((o) => getSegment(o.scheduledTime) === segment);
    }

    function handleDayClick(dayIndex: number) {
        openDay = dayIndex;
    }

    // Count unique medications per day for condensed view
    function medCountForDay(dayEvents: MedicationOccurrence[]): { form: string; count: number }[] {
        const counts = new Map<string, number>();
        for (const o of dayEvents) {
            counts.set(o.form, (counts.get(o.form) || 0) + 1);
        }
        return Array.from(counts.entries()).map(([form, count]) => ({ form, count }));
    }

    const segments: TimeSegment[] = ['morning', 'afternoon', 'night'];
</script>

<section class="medication-week">
    <h3 class="h3 heading">{$t('medications.week-ahead')}</h3>
    <div class="weekdays">
        {#each daysOfWeek as dayIndex}
            {@const dayEvents = eventsForDay(dayIndex)}
            <button
                class="weekday"
                class:today={isToday(dayIndex)}
                class:open={dayIndex === openDay}
                onclick={() => handleDayClick(dayIndex)}
            >
                <div class="weekday-name">{$t(`medications.day-${dayKeyMap[dayIndex]}`)}</div>

                {#if dayIndex === openDay}
                    {#each segments as segment}
                        {@const segEvents = eventsForSegment(dayEvents, segment)}
                        {#if segEvents.length > 0}
                            <div class="time-segment">
                                <div class="segment-header">
                                    <svg class="time-of-day" aria-hidden="true">
                                        <use href="/icons.svg#{segmentIcons[segment]}"></use>
                                    </svg>
                                    <span class="segment-label">{$t(`medications.${segment}`)}</span>
                                </div>
                                <div class="details">
                                    {#each segEvents as occ}
                                        <div class="occurrence">
                                            <svg class="form-icon" aria-hidden="true">
                                                <use href="/icons.svg#form-{occ.form}"></use>
                                            </svg>
                                            <span class="occ-time">{occ.scheduledTime}</span>
                                            <span class="occ-name">{occ.medicationName}</span>
                                            <span class="occ-dosage">{occ.dosage}</span>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/if}
                    {/each}
                    {#if dayEvents.length === 0}
                        <div class="empty-day"></div>
                    {/if}
                {:else}
                    <div class="short">
                        {#each medCountForDay(dayEvents) as { form, count }}
                            <div class="condensed">
                                <svg class="form-icon" aria-hidden="true">
                                    <use href="/icons.svg#form-{form}"></use>
                                </svg>
                                <span class="badge">{count}</span>
                            </div>
                        {/each}
                    </div>
                {/if}
            </button>
        {/each}
    </div>
</section>

<style>
    .medication-week {
        margin-bottom: var(--ui-pad-large);
    }
    .heading {
        margin-bottom: var(--ui-pad-medium);
    }
    .weekdays {
        display: flex;
        gap: var(--ui-pad-small);
        min-height: 10rem;
    }
    .weekday {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        border: none;
        background: none;
        padding: 0;
        cursor: pointer;
        text-align: left;
        font: inherit;
        color: inherit;
        min-width: 0;
    }
    .weekday.open {
        flex-grow: 5;
    }
    .weekday-name {
        padding: var(--ui-pad-small);
        text-align: center;
        font-weight: 600;
        font-size: 0.85rem;
        background-color: var(--color-surface, var(--color-white));
        border-radius: var(--ui-radius-medium);
        margin-bottom: var(--ui-pad-small);
    }
    .weekday.today .weekday-name {
        background-color: var(--color-primary);
        color: var(--color-white);
    }

    /* Expanded view */
    .time-segment {
        margin-bottom: var(--ui-pad-small);
    }
    .segment-header {
        display: flex;
        align-items: center;
        gap: var(--ui-pad-small);
        padding: var(--ui-pad-small);
        background-color: var(--color-surface, var(--color-white));
        border-radius: var(--ui-radius-medium);
        margin-bottom: 2px;
    }
    svg.time-of-day {
        width: 1.5rem;
        height: 1.5rem;
        fill: var(--color-primary);
        flex-shrink: 0;
    }
    .segment-label {
        font-size: 0.8rem;
        font-weight: 500;
        color: var(--color-text-secondary);
    }
    .details {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    .occurrence {
        display: flex;
        align-items: center;
        gap: var(--ui-pad-small);
        padding: var(--ui-pad-small);
        background-color: var(--color-surface, var(--color-white));
        border-radius: var(--ui-radius-medium);
        font-size: 0.85rem;
    }
    .form-icon {
        width: 1.2rem;
        height: 1.2rem;
        fill: currentColor;
        flex-shrink: 0;
        opacity: 0.6;
    }
    .occ-time {
        color: var(--color-text-secondary);
        font-size: 0.8rem;
        flex-shrink: 0;
    }
    .occ-name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .occ-dosage {
        color: var(--color-text-secondary);
        font-size: 0.8rem;
        flex-shrink: 0;
    }
    .empty-day {
        flex: 1;
        background-color: var(--color-surface, var(--color-white));
        border-radius: var(--ui-radius-medium);
        min-height: 3rem;
    }

    /* Condensed view */
    .short {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--ui-pad-small);
        padding: var(--ui-pad-small) 0;
        flex: 1;
        background-color: var(--color-surface, var(--color-white));
        border-radius: var(--ui-radius-medium);
    }
    .condensed {
        position: relative;
        display: inline-block;
    }
    .condensed .form-icon {
        width: 1.5rem;
        height: 1.5rem;
        opacity: 0.5;
    }
    .badge {
        position: absolute;
        top: -0.4rem;
        right: -0.6rem;
        display: block;
        min-width: 1.2rem;
        padding: 0.1rem 0.3rem;
        font-size: 0.7rem;
        font-weight: 600;
        text-align: center;
        border-radius: 1rem;
        background-color: var(--color-primary);
        color: var(--color-white);
    }

    /* Mobile */
    @media screen and (max-width: 800px) {
        .weekdays {
            flex-direction: column;
            min-height: auto;
        }
        .weekday {
            flex-direction: row;
            min-height: 3rem;
            gap: var(--ui-pad-small);
        }
        .weekday-name {
            margin-bottom: 0;
            min-width: 3rem;
            max-width: 3rem;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .weekday.open {
            flex-grow: unset;
            flex-wrap: wrap;
        }
        .time-segment {
            margin-bottom: 0;
            margin-right: var(--ui-pad-small);
        }
        .short {
            flex-direction: row;
            padding: 0 var(--ui-pad-small);
            justify-content: flex-start;
        }
        .short > * {
            margin: 0 var(--ui-pad-small);
        }
    }
</style>

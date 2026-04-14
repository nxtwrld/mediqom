<script lang="ts">
    import { profile } from '$lib/profiles';
    import { t } from '$lib/i18n';
    import {
        appointmentsByProfile,
        confirmAppointment,
        dismissAppointment,
    } from '$lib/calendar/store';
    import { downloadICS, downloadAllICS } from '$lib/calendar/ics-export';
    import type { Appointment } from '$lib/calendar/types.d';

    const appointments = $derived($profile?.id ? appointmentsByProfile($profile.id) : undefined);

    // Group appointments by status
    let suggested = $derived(
        ($appointments || []).filter((a: Appointment) => a.status === 'suggested'),
    );
    let upcoming = $derived(
        ($appointments || [])
            .filter((a: Appointment) => a.status === 'confirmed' && a.dateTime)
            .sort((a: Appointment, b: Appointment) => (a.dateTime || '').localeCompare(b.dateTime || '')),
    );
    let past = $derived(
        ($appointments || []).filter((a: Appointment) => a.status === 'completed'),
    );
    let exportable = $derived(
        ($appointments || []).filter((a: Appointment) => a.status !== 'dismissed' && a.dateTime),
    );

    let confirmingId: string | null = $state(null);
    let confirmDate = $state('');

    function startConfirm(id: string) {
        confirmingId = id;
        confirmDate = '';
    }

    async function handleConfirm(appointmentId: string) {
        if (!confirmDate || !$profile?.id) return;
        await confirmAppointment($profile.id, appointmentId, confirmDate);
        confirmingId = null;
    }

    async function handleDismiss(appointmentId: string) {
        if (!$profile?.id) return;
        await dismissAppointment($profile.id, appointmentId);
    }

    function handleExportSingle(appointment: Appointment) {
        downloadICS(appointment);
    }

    function handleExportAll() {
        downloadAllICS(exportable);
    }

    function formatPriority(priority: string): string {
        return priority.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
    }

    function formatDate(iso?: string): string {
        if (!iso) return '';
        try {
            return new Date(iso).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });
        } catch {
            return iso;
        }
    }
</script>

<div class="page-section">
    <div class="page-header">
        <h2 class="h2">{$t('appointments.title')}</h2>
        {#if exportable.length > 0}
            <button class="button -small" onclick={handleExportAll}>
                <svg><use href="/icons.svg#download" /></svg>
                {$t('appointments.export-all')}
            </button>
        {/if}
    </div>

    {#if suggested.length === 0 && upcoming.length === 0 && past.length === 0}
        <p class="p empty-state">{$t('appointments.empty')}</p>
    {/if}

    {#if suggested.length > 0}
        <section class="appointment-section">
            <h3 class="h3">{$t('appointments.needs-action')}</h3>
            {#each suggested as appointment (appointment.id)}
                <div class="appointment-card -suggested">
                    <div class="appointment-info">
                        <p class="appointment-title">{appointment.title}</p>
                        {#if appointment.timeframe}
                            <p class="timeframe">{appointment.timeframe}</p>
                        {/if}
                        {#if appointment.provider?.name}
                            <p class="provider">{appointment.provider.name}</p>
                        {/if}
                        <span class="priority -priority-{appointment.priority}">{formatPriority(appointment.priority)}</span>
                    </div>
                    <div class="appointment-actions">
                        {#if confirmingId === appointment.id}
                            <div class="confirm-form">
                                <input type="date" class="input -small" bind:value={confirmDate} />
                                <button class="button -small -primary" onclick={() => handleConfirm(appointment.id)}>
                                    {$t('appointments.save')}
                                </button>
                                <button class="button -small" onclick={() => (confirmingId = null)}>
                                    {$t('appointments.cancel')}
                                </button>
                            </div>
                        {:else}
                            <button class="button -small -primary" onclick={() => startConfirm(appointment.id)}>
                                {$t('appointments.set-date')}
                            </button>
                            <button class="button -small -negative" onclick={() => handleDismiss(appointment.id)}>
                                {$t('appointments.dismiss')}
                            </button>
                        {/if}
                    </div>
                </div>
            {/each}
        </section>
    {/if}

    {#if upcoming.length > 0}
        <section class="appointment-section">
            <h3 class="h3">{$t('appointments.upcoming')}</h3>
            {#each upcoming as appointment (appointment.id)}
                <div class="appointment-card -confirmed">
                    <div class="appointment-info">
                        <p class="appointment-title">{appointment.title}</p>
                        <p class="date">{formatDate(appointment.dateTime)}</p>
                        {#if appointment.provider?.name}
                            <p class="provider">{appointment.provider.name}</p>
                        {/if}
                        {#if appointment.synced}
                            <span class="sync-indicator" title={$t('appointments.synced')}>
                                <svg><use href="/icons-o.svg#checked" /></svg>
                                {$t('appointments.synced')}
                            </span>
                        {/if}
                    </div>
                    <div class="appointment-actions">
                        <button class="button -small" onclick={() => handleExportSingle(appointment)}>
                            <svg><use href="/icons.svg#download" /></svg>
                            {$t('appointments.export')}
                        </button>
                    </div>
                </div>
            {/each}
        </section>
    {/if}

    {#if past.length > 0}
        <section class="appointment-section">
            <h3 class="h3">{$t('appointments.past')}</h3>
            {#each past as appointment (appointment.id)}
                <div class="appointment-card -past">
                    <div class="appointment-info">
                        <p class="appointment-title">{appointment.title}</p>
                        <p class="date">{formatDate(appointment.dateTime)}</p>
                        {#if appointment.provider?.name}
                            <p class="provider">{appointment.provider.name}</p>
                        {/if}
                    </div>
                </div>
            {/each}
        </section>
    {/if}
</div>

<style>
    .page-section {
        padding: var(--ui-pad-medium);
        max-width: 48rem;
        margin: 0 auto;
    }

    .page-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: var(--ui-pad-medium);
    }

    .page-header .h2 {
        margin: 0;
    }

    .page-header .button svg {
        width: 1rem;
        height: 1rem;
        fill: currentColor;
    }

    .empty-state {
        text-align: center;
        color: var(--color-text-secondary);
        padding: var(--ui-pad-xlarge) 0;
    }

    .appointment-section {
        margin-bottom: var(--ui-pad-large);
    }

    .appointment-section .h3 {
        margin-bottom: 0.75rem;
        color: var(--color-text-secondary);
        font-size: 0.9rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .appointment-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 1rem;
        border: 1px solid var(--color-border);
        border-radius: var(--ui-radius-small);
        margin-bottom: 0.5rem;
        background: var(--color-background);
    }

    .appointment-card.-suggested {
        border-left: 3px solid var(--color-warning);
    }

    .appointment-card.-confirmed {
        border-left: 3px solid var(--color-positive);
    }

    .appointment-card.-past {
        opacity: 0.7;
    }

    .appointment-info {
        flex: 1;
        min-width: 0;
    }

    .appointment-title {
        font-weight: 600;
        margin: 0;
    }

    .date {
        color: var(--color-text-primary);
        font-size: 0.9rem;
        margin: 0.25rem 0 0;
    }

    .timeframe {
        color: var(--color-warning);
        font-size: 0.9rem;
        font-style: italic;
        margin: 0.25rem 0 0;
    }

    .provider {
        color: var(--color-text-secondary);
        font-size: 0.85rem;
        margin: 0.25rem 0 0;
    }

    .priority {
        display: inline-block;
        font-size: 0.7rem;
        padding: 0.125rem 0.4rem;
        border-radius: var(--ui-radius-small);
        margin-top: 0.25rem;
    }

    .-priority-immediate {
        background: var(--color-negative);
        color: white;
    }

    .-priority-urgent {
        background: var(--color-warning);
        color: white;
    }

    .-priority-routine {
        background: var(--color-border);
        color: var(--color-text-primary);
    }

    .sync-indicator {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.75rem;
        color: var(--color-positive);
        margin-top: 0.25rem;
    }

    .sync-indicator svg {
        width: 0.9rem;
        height: 0.9rem;
        fill: currentColor;
    }

    .appointment-actions {
        flex-shrink: 0;
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }

    .appointment-actions .button svg {
        width: 1rem;
        height: 1rem;
        fill: currentColor;
    }

    .confirm-form {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }

    .confirm-form .input {
        width: auto;
    }

    @media (max-width: 768px) {
        .appointment-card {
            flex-direction: column;
            align-items: flex-start;
        }

        .appointment-actions {
            width: 100%;
        }

        .confirm-form {
            flex-wrap: wrap;
        }
    }
</style>

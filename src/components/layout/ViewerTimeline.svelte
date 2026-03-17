<script lang="ts">
    import { profile } from '$lib/profiles';

    interface Props {
        signalHighlight?: { signalName: string; value: number; documentId?: string } | null;
    }
    let { signalHighlight = null }: Props = $props();
    import { documents, loadDocuments } from '$lib/documents/index';
    import { DocumentType } from '$lib/documents/types.d';
    import VerticalReferenceRangeChart from '$components/charts/VerticalReferenceRangeChart.svelte';
    import type { SignalSeries, MedicationLane } from '$components/charts/VerticalReferenceRangeChart.svelte';
    import DocLabel from '$components/documents/DocLabel.svelte';
    import { t } from '$lib/i18n';
    import { medicationsByProfile, loadMedicationContent, extractedMedicationsByProfile, loadExtractedMedicationContent } from '$lib/medications/store';
    import type { MedicationDocument, Medication } from '$lib/medications/types';

    const SIGNAL_COLORS = [
        '#4a90d9',
        '#e67e22',
        '#9b59b6',
        '#1abc9c',
        '#e91e63',
        '#f1c40f',
        '#c0392b',
        '#16a085',
    ];

    function parseReference(ref: string): [number, number] | null {
        if (!ref) return null;
        const parts = ref.split('-').map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            const [a, b] = parts;
            if (a === b) return null;
            return [Math.min(a, b), Math.max(a, b)];
        }
        return null;
    }

    function normalize(value: number, ref: [number, number]): number {
        const [min, max] = ref;
        return (value - min) / (max - min);
    }

    // All signals that have usable data
    const signalData = $derived(
        (($profile as any)?.health?.signals ?? {}) as Record<string, { values: any[] }>
    );

    const availableSignals = $derived(
        Object.keys(signalData).filter(k => {
            const data = signalData[k];
            return data?.values?.some(
                (v: any) => v.value != null && v.date && v.reference && parseReference(v.reference)
            );
        })
    );

    let selectedSignals = $state<string[]>([]);

    // Auto-select first 3 on initial load
    $effect(() => {
        if (availableSignals.length > 0 && selectedSignals.length === 0) {
            selectedSignals = availableSignals.slice(0, 3);
        }
    });

    // Pre-select highlighted signal when set
    $effect(() => {
        if (signalHighlight && availableSignals.includes(signalHighlight.signalName)) {
            if (!selectedSignals.includes(signalHighlight.signalName)) {
                selectedSignals = [signalHighlight.signalName, ...selectedSignals];
            }
        }
    });

    // Documents — sorted newest-first
    const userDocs = $derived(
        $documents
            .filter(d => d.user_id === $profile?.id && d.type === DocumentType.document && d.metadata?.category !== 'medication')
            .sort((a, b) => {
                const da = new Date((a.metadata as any)?.date ?? (a as any).created_at ?? 0).getTime();
                const db = new Date((b.metadata as any)?.date ?? (b as any).created_at ?? 0).getTime();
                return db - da;
            })
    );

    function toggleSignal(name: string) {
        if (selectedSignals.includes(name)) {
            selectedSignals = selectedSignals.filter(s => s !== name);
        } else {
            selectedSignals = [...selectedSignals, name];
        }
    }

    // Document lookup by ID
    const docById = $derived(
        Object.fromEntries(userDocs.map(d => [d.id, d]))
    );

    // Build chart series from selected signals
    const chartSeries = $derived(
        selectedSignals
            .map(name => {
                const data = signalData[name];
                if (!data?.values) return null;

                const values = data.values
                    .filter((v: any) => v.value != null && v.date && v.reference)
                    .map((v: any) => {
                        const ref = parseReference(v.reference);
                        if (!ref) return null;
                        const doc = v.refId ? docById[v.refId] : undefined;
                        return {
                            date: new Date(v.date),
                            value: Number(v.value),
                            normalized: normalize(Number(v.value), ref),
                            documentId: v.refId ?? undefined,
                            documentTitle: doc ? ((doc.content as any)?.title ?? (doc.metadata as any)?.title ?? undefined) : undefined,
                            unit: v.unit ?? undefined,
                            rawData: v,
                        };
                    })
                    .filter(Boolean) as SignalSeries['values'];

                if (values.length === 0) return null;

                const colorIdx = availableSignals.indexOf(name);
                return {
                    name,
                    label: $t('profile.health.props.' + name) || name,
                    values: values.sort((a, b) => a.date.getTime() - b.date.getTime()),
                    color: SIGNAL_COLORS[colorIdx % SIGNAL_COLORS.length],
                } satisfies SignalSeries;
            })
            .filter(Boolean) as SignalSeries[]
    );

    // Load documents when profile is available, then load medication content
    $effect(() => {
        const id = $profile?.id;
        if (!id) return;
        loadDocuments(id).then(() => {
            loadMedicationContent(id);
            loadExtractedMedicationContent(id);
        });
    });

    // Load medication documents
    let medications = $state<MedicationDocument[]>([]);
    $effect(() => {
        const id = $profile?.id;
        if (!id) { medications = []; return; }
        return medicationsByProfile(id).subscribe(v => { medications = v; });
    });

    // Load and subscribe to extracted medications from imported documents
    let extractedMeds = $state<Partial<Medication>[]>([]);
    $effect(() => {
        const id = $profile?.id;
        if (!id) { extractedMeds = []; return; }
        return extractedMedicationsByProfile(id).subscribe(v => { extractedMeds = v; });
    });

    // Transform medications to MedicationLane[]
    function getMedStartDate(m: MedicationDocument): Date | null {
        const med = m.content?.medication;
        if (!med) return null;
        const raw = med.schedule?.startDate
            || med.prescriptionDate
            || med.sourceDocumentDate
            || (m.metadata as any)?.date
            || (m as any).created_at;
        return raw ? new Date(raw) : null;
    }

    const standaloneMedLanes: MedicationLane[] = $derived(
        medications
            .map(m => {
                const startDate = getMedStartDate(m);
                if (!startDate) return null;
                const med = m.content.medication;
                return {
                    id: m.id,
                    name: med.medicationName,
                    startDate,
                    endDate: med.schedule?.endDate
                        ? new Date(med.schedule.endDate) : null,
                    isOnce: med.schedule?.frequency === 'once' || !med.schedule,
                    status: m.content.status as string,
                };
            })
            .filter((x): x is NonNullable<typeof x> => x !== null)
    );

    const extractedMedLanes: MedicationLane[] = $derived(
        extractedMeds
            .map(m => {
                const raw = m.schedule?.startDate
                    || m.prescriptionDate
                    || m.sourceDocumentDate;
                if (!raw || !m.medicationName) return null;
                return {
                    id: (m.sourceDocumentId ?? '') + ':' + m.medicationName,
                    name: m.medicationName,
                    startDate: new Date(raw),
                    endDate: null,
                    isOnce: true,
                    status: (m.status as string) ?? 'unknown',
                };
            })
            .filter((x): x is NonNullable<typeof x> => x !== null)
    );

    const medLanes: MedicationLane[] = $derived(
        [...standaloneMedLanes, ...extractedMedLanes]
    );

    // Map keyed by MedicationLane ID for popover lookup
    const medicationData = $derived(
        new Map<string, { medication?: MedicationDocument; extracted?: Partial<Medication> }>([
            ...medications.map(m => [m.id, { medication: m }] as const),
            ...extractedMeds
                .filter(m => m.medicationName)
                .map(m => [(m.sourceDocumentId ?? '') + ':' + m.medicationName, { extracted: m }] as const),
        ])
    );

    // Signal picker open/close
    let showSignalPicker = $state(false);

    function togglePicker() {
        showSignalPicker = !showSignalPicker;
    }

    // Scale callback from chart
    let getYPos: ((date: Date) => number) | null = $state(null);
    let chartHeightPx = $state(0);

    function handleScaleReady(getY: (date: Date) => number, chartHeight: number) {
        getYPos = getY;
        chartHeightPx = chartHeight;
    }

    function getDocDate(doc: (typeof userDocs)[number]): Date {
        return new Date((doc.metadata as any)?.date ?? (doc as any).created_at ?? 0);
    }

    // Unified time range covering both signal data and document dates
    const unifiedTimeRange = $derived.by((): [Date, Date] | undefined => {
        const dates: number[] = [
            ...chartSeries.flatMap(s => s.values.map(v => v.date.getTime())),
            ...userDocs.map(d => getDocDate(d).getTime()),
            ...medLanes.map(m => m.startDate.getTime()),
            ...medLanes.filter(m => m.endDate).map(m => m.endDate!.getTime()),
        ];
        if (dates.length === 0) return undefined;
        const min = Math.min(...dates);
        const max = Math.max(...dates);
        const twoMonthsFromNow = new Date();
        twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);
        return [new Date(min), new Date(Math.max(max, twoMonthsFromNow.getTime()))];
    });

    // Document grouping by Y position
    const ICON_SIZE = 28;

    interface DocGroup {
        docs: (typeof userDocs)[number][];
        y: number;
    }

    const groupedDocs = $derived.by((): DocGroup[] => {
        if (!getYPos || userDocs.length === 0) return [];
        const THRESHOLD = ICON_SIZE + 4;
        const groups: DocGroup[] = [];

        const sorted = [...userDocs].sort(
            (a, b) => getDocDate(b).getTime() - getDocDate(a).getTime()
        );

        for (const doc of sorted) {
            const y = getYPos!(getDocDate(doc));
            const existing = groups.find(g => Math.abs(g.y - y) < THRESHOLD);
            if (existing) {
                existing.docs.push(doc);
            } else {
                groups.push({ docs: [doc], y });
            }
        }
        return groups;
    });
</script>

<div class="timeline-panel">
    <!-- Compact signal bar -->
    {#if availableSignals.length > 0}
        <div class="signal-bar">
            <div class="signal-bar-chips" role="button" tabindex="0" onclick={togglePicker} onkeydown={(e) => e.key === 'Enter' && togglePicker()}>
                {#if selectedSignals.length > 0}
                    {#each selectedSignals as name}
                        <span
                            class="signal-chip"
                            style="--signal-color: {SIGNAL_COLORS[availableSignals.indexOf(name) % SIGNAL_COLORS.length]}"
                        >{$t('profile.health.props.' + name) || name}</span>
                    {/each}
                {:else}
                    <span class="signal-bar-hint">{$t('viewer.timeline.select-signals') || 'Select signals…'}</span>
                {/if}
            </div>
            <button class="signal-bar-btn" onclick={togglePicker} aria-label="Toggle signal picker">
                <svg width="12" height="12" viewBox="0 0 12 12"><path d={showSignalPicker ? 'M2 8 L6 4 L10 8' : 'M2 4 L6 8 L10 4'} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
        </div>
    {/if}
    {#if showSignalPicker}
        <!-- Backdrop -->
        <div class="signal-picker-backdrop" onclick={() => showSignalPicker = false}></div>
        <!-- Floating picker overlay -->
        <div class="signal-picker-overlay">
            {#each availableSignals as name, i}
                <button
                    class="signal-btn"
                    class:-active={selectedSignals.includes(name)}
                    style="--signal-color: {SIGNAL_COLORS[i % SIGNAL_COLORS.length]}"
                    onclick={() => toggleSignal(name)}
                >
                    {$t('profile.health.props.' + name) || name}
                </button>
            {/each}
        </div>
    {/if}

    <div class="timeline-body">
        <div class="chart-area">
            {#if chartSeries.length > 0 || userDocs.length > 0 || medLanes.length > 0}
                <VerticalReferenceRangeChart
                    series={chartSeries}
                    medications={medLanes}
                    {medicationData}
                    timeRange={unifiedTimeRange}
                    profileId={$profile?.id}
                    onScaleReady={handleScaleReady}
                    highlightedPoint={signalHighlight}
                />
                <div class="doc-overlay">
                    {#each groupedDocs as group}
                        <div class="doc-group" style="top: {group.y}px">
                            <DocLabel docs={group.docs} />
                        </div>
                    {/each}
                </div>
            {:else}
                <div class="empty-state">
                    {$t('viewer.timeline.no-signals')}
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .timeline-panel {
        position: relative;
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
    }

    /* Compact signal bar */
    .signal-bar {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.25rem 0.4rem;
        border-bottom: 0.1rem solid var(--color-border);
        flex-shrink: 0;
        min-height: 1.8rem;
        background: var(--color-surface, #fff);
    }

    .signal-bar-chips {
        display: flex;
        flex-wrap: nowrap;
        gap: 0.25rem;
        flex: 1;
        overflow: hidden;
        cursor: pointer;
        align-items: center;
        min-height: 1.3rem;
    }

    .signal-chip {
        font-size: 0.65rem;
        padding: 0.1rem 0.4rem;
        border-radius: 2rem;
        background: var(--signal-color);
        color: #fff;
        white-space: nowrap;
        font-weight: 600;
    }

    .signal-bar-hint {
        font-size: 0.65rem;
        color: var(--color-text-secondary);
    }

    .signal-bar-btn {
        flex-shrink: 0;
        background: none;
        border: none;
        cursor: pointer;
        color: var(--color-text-secondary);
        padding: 0.15rem;
        display: flex;
        align-items: center;
        border-radius: var(--ui-radius-small, 0.25rem);
        transition: background 0.1s;
    }

    .signal-bar-btn:hover {
        background: var(--color-border);
    }

    /* Floating picker overlay */
    .signal-picker-backdrop {
        position: absolute;
        inset: 0;
        z-index: 9;
    }

    .signal-picker-overlay {
        position: absolute;
        top: 1.8rem;
        left: 0;
        right: 0;
        z-index: 10;
        display: flex;
        flex-wrap: wrap;
        gap: 0.3rem;
        padding: 0.4rem;
        background: var(--color-surface, #fff);
        border-bottom: 0.1rem solid var(--color-border);
        box-shadow: 0 0.3rem 0.6rem rgba(0,0,0,0.08);
    }

    .signal-btn {
        font-size: 0.65rem;
        padding: 0.15rem 0.45rem;
        border-radius: var(--ui-radius-small, 0.25rem);
        border: 0.1rem solid var(--signal-color, var(--color-border));
        background: transparent;
        color: var(--color-text-primary);
        cursor: pointer;
        transition: background 0.15s, color 0.15s;
        white-space: nowrap;
    }

    .signal-btn.-active {
        background: var(--signal-color, var(--color-highlight));
        color: #fff;
    }

    .timeline-body {
        position: relative;
        flex: 1;
        overflow: hidden;
    }

    .chart-area {
        position: relative;
        width: 100%;
        height: 100%;
        padding: 0.5rem;
        box-sizing: border-box;
    }

    .empty-state {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--color-text-secondary);
        font-size: 0.8rem;
        text-align: center;
    }

    /* Doc overlay — sits on the right edge of the chart */
    .doc-overlay {
        position: absolute;
        top: 0.5rem;
        right: 1rem;
        width: 2.4rem;
        pointer-events: none;
        z-index: 5;
    }

    .doc-group {
        position: absolute;
        right: 0;
        transform: translateY(-50%);
        pointer-events: all;
    }

</style>

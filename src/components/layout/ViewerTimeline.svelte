<script lang="ts">
    import { profile } from '$lib/profiles';
    import { documents, loadDocuments } from '$lib/documents/index';
    import { DocumentType } from '$lib/documents/types.d';
    import VerticalReferenceRangeChart from '$components/charts/VerticalReferenceRangeChart.svelte';
    import type { SignalSeries } from '$components/charts/VerticalReferenceRangeChart.svelte';
    import DocLabel from '$components/documents/DocLabel.svelte';
    import { t } from '$lib/i18n';

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

    // Documents — sorted newest-first
    const userDocs = $derived(
        $documents
            .filter(d => d.user_id === $profile?.id && d.type === DocumentType.document)
            .sort((a, b) => {
                const da = new Date((a.metadata as any)?.date ?? (a as any).created_at ?? 0).getTime();
                const db = new Date((b.metadata as any)?.date ?? (b as any).created_at ?? 0).getTime();
                return db - da;
            })
    );

    // Load documents when profile is available
    $effect(() => {
        const id = $profile?.id;
        if (id) loadDocuments(id);
    });

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
        ];
        if (dates.length === 0) return undefined;
        return [new Date(Math.min(...dates)), new Date(Math.max(...dates))];
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
            {#if chartSeries.length > 0 || userDocs.length > 0}
                <VerticalReferenceRangeChart
                    series={chartSeries}
                    timeRange={unifiedTimeRange}
                    profileId={$profile?.id}
                    onScaleReady={handleScaleReady}
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
        background: var(--background, #fff);
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
        right: 0.3rem;
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

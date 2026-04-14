<script lang="ts">
    import UnitToggle from '$components/ui/UnitToggle.svelte';
    import { t } from '$lib/i18n';
    import { untrack } from 'svelte';

    interface Props {
        /** Metric value (kg for weight, cm for height). Always stored in metric. */
        value: number | undefined;
        /** Selected display unit */
        unit: string;
        type: 'weight' | 'height';
        label: string;
    }

    let { value = $bindable(), unit = $bindable(), type, label }: Props = $props();

    const weightOptions = [
        { value: 'kg', label: 'kg' },
        { value: 'lb', label: 'lb' },
    ];

    const heightOptions = [
        { value: 'cm', label: 'cm' },
        { value: 'ft-in', label: 'ft/in' },
    ];

    const options = type === 'weight' ? weightOptions : heightOptions;

    // Display values (what the user sees/edits)
    let displayValue: number | undefined = $state(undefined);
    let feet: number | undefined = $state(undefined);
    let inches: number | undefined = $state(undefined);

    // Prevent circular updates
    let updatingFromMetric = false;

    // Initialize display values from metric
    function metricToDisplay() {
        updatingFromMetric = true;
        if (type === 'weight') {
            if (value != null) {
                displayValue = unit === 'lb'
                    ? Math.round(value / 0.453592 * 10) / 10
                    : Math.round(value * 10) / 10;
            } else {
                displayValue = undefined;
            }
        } else {
            if (value != null) {
                if (unit === 'ft-in') {
                    const totalInches = value / 2.54;
                    feet = Math.floor(totalInches / 12);
                    inches = Math.round(totalInches % 12);
                    if (inches === 12) { feet += 1; inches = 0; }
                } else {
                    displayValue = Math.round(value);
                }
            } else {
                displayValue = undefined;
                feet = undefined;
                inches = undefined;
            }
        }
        updatingFromMetric = false;
    }

    // Convert display input back to metric
    function displayToMetric() {
        if (updatingFromMetric) return;
        if (type === 'weight') {
            if (displayValue != null && displayValue > 0) {
                value = unit === 'lb'
                    ? displayValue * 0.453592
                    : displayValue;
            } else {
                value = undefined;
            }
        } else {
            if (unit === 'ft-in') {
                if (feet != null && feet >= 0) {
                    value = ((feet * 12) + (inches ?? 0)) * 2.54;
                } else {
                    value = undefined;
                }
            } else {
                if (displayValue != null && displayValue > 0) {
                    value = displayValue;
                } else {
                    value = undefined;
                }
            }
        }
    }

    // When unit changes, re-derive display from metric
    let prevUnit = unit;
    $effect(() => {
        if (unit !== prevUnit) {
            untrack(() => metricToDisplay());
            prevUnit = unit;
        }
    });

    // Initialize on mount
    metricToDisplay();

    function handleDisplayInput() {
        displayToMetric();
    }

    function handleFeetInput() {
        displayToMetric();
    }

    function handleInchesInput() {
        displayToMetric();
    }
</script>

<div class="measurement">
    <div class="measurement-header">
        <span class="measurement-label">{label}</span>
        <UnitToggle {options} bind:value={unit} />
    </div>

    {#if type === 'height' && unit === 'ft-in'}
        <div class="measurement-inputs -dual">
            <div class="input">
                <input
                    type="number"
                    bind:value={feet}
                    oninput={handleFeetInput}
                    placeholder={$t('app.onboarding.feet')}
                    min="0"
                    max="8"
                    step="1"
                />
                <span class="input-unit">ft</span>
            </div>
            <div class="input">
                <input
                    type="number"
                    bind:value={inches}
                    oninput={handleInchesInput}
                    placeholder={$t('app.onboarding.inches')}
                    min="0"
                    max="11"
                    step="1"
                />
                <span class="input-unit">in</span>
            </div>
        </div>
    {:else}
        <div class="input -with-unit">
            <input
                type="number"
                bind:value={displayValue}
                oninput={handleDisplayInput}
                placeholder={type === 'weight' ? '0' : '0'}
                min="0"
                step={type === 'weight' ? '0.1' : '1'}
            />
            <span class="input-unit">{unit}</span>
        </div>
    {/if}
</div>

<style>
    .measurement {
        display: flex;
        flex-direction: column;
        gap: var(--ui-pad-small);
    }

    .measurement-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--ui-pad-small);
    }

    .measurement-label {
        font-size: 0.85rem;
        color: var(--color-text-secondary);
    }

    .measurement-inputs.-dual {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--ui-pad-small);
    }

    .input {
        position: relative;
    }

    .input input {
        width: 100%;
        padding-right: 3rem;
    }

    .input-unit {
        position: absolute;
        right: var(--ui-pad-medium);
        top: 50%;
        transform: translateY(-50%);
        font-size: 0.8rem;
        color: var(--color-text-secondary);
        pointer-events: none;
    }
</style>

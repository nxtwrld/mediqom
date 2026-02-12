<script lang="ts">
    import { definitions as FORM_DEFINITION } from '$lib/health/dataTypes';
    import HealthFormField from './HealthFormField.svelte';
    import { t } from '$lib/i18n';
    import Tabs from '$components/ui/Tabs.svelte';
    import TabHeads from '$components/ui/TabHeads.svelte';
    import TabHead from '$components/ui/TabHead.svelte';
    import TabPanel from '$components/ui/TabPanel.svelte';
    import { untrack } from 'svelte';

    interface Props {
        config?: {
            keys: string[];
            values: any[];
            property: any;
        } | true;
        data?: any;
    }

    let { config = true, data = $bindable({}) }: Props = $props();

    const FORM = FORM_DEFINITION.reduce((acc, prop) => {
        acc[prop.key] = prop;
        return acc;
    }, {} as { [key: string]: any });

    // Compute TABS based on config
    let TABS = $derived([
        {
            title: 'profile',
            properties: ["birthDate", "biologicalSex", "bloodType", "height", "weight"]
        },
        {
            title: 'lifeStyle',
            properties: ["smokingStatus", "alcoholConsumption", "physicalActivity", "diet"]
        },
        {
            title: 'vitals',
            properties: ['bloodPressure', 'heartRate', 'temperature', 'oxygenSaturation']
        },
        {
            title: 'vaccinations',
            properties: ['vaccinations']
        },
        {
            title: 'allergies',
            properties: ['allergies']
        },
        {
            title: 'chronicConditions',
            properties: ['chronicConditions']
        }
    ].reduce((acc, tab) => {
        // if config has a value of true, show all properties
        if (config === true) {
            acc.push(tab);
            return acc;
        }
        // if config has a data property (from modal), show all properties
        if (config && typeof config === 'object' && 'data' in config) {
            acc.push(tab);
            return acc;
        }
        // otherwise, filter the properties based on config.keys
        if (config && typeof config === 'object' && config.keys) {
            const filteredTab = {
                ...tab,
                properties: tab.properties.filter(prop => config.keys.includes(prop))
            };
            if (filteredTab.properties.length > 0) {
                acc.push(filteredTab);
            }
        }
        return acc;
    }, [] as { title: string, properties: string[] }[]));

    
    function mapFromToInputs() {
        // Always initialize ALL fields from FORM_DEFINITION
        const result = FORM_DEFINITION.reduce((acc, prop) => {
            // Check for existing data from various sources
            let value = null;

            // Check if config has specific values (for filtered forms)
            const configObj = (config && typeof config === 'object') ? config : null;
            if (configObj?.keys) {
                const index = configObj.keys.indexOf(prop.key);
                if (index >= 0) {
                    value = configObj.values[index];
                }
            }

            // Check if config has data property (our current modal structure)
            if (configObj && 'data' in configObj && configObj.data && (configObj.data as any)[prop.key]) {
                value = (configObj.data as any)[prop.key];
            }

            // NOTE: We intentionally do NOT read from `data` prop here to avoid circular dependency.
            // The second $effect already syncs inputs -> data, so reading data here would create a loop.

            // Initialize based on field type - ALWAYS create the field structure
            if (prop.type === 'time-series' && prop.items) {
                // For time-series, create object with all sub-fields
                acc[prop.key] = prop.items.reduce((itemAcc, item) => {
                    if (value && typeof value === 'object' && value[item.key] !== undefined) {
                        itemAcc[item.key] = value[item.key];
                    } else if (item.key === 'date') {
                        itemAcc[item.key] = ''; // Don't auto-fill date
                    } else {
                        itemAcc[item.key] = ''; // Empty string for other fields
                    }
                    return itemAcc;
                }, {} as { [key: string]: any });
                return acc;
            }

            // Initialize arrays
            if (prop.type === 'array' && prop.items) {
                // If we have existing values, use them; otherwise start with empty array
                if (value && Array.isArray(value) && value.length > 0) {
                    acc[prop.key] = value;
                } else {
                    acc[prop.key] = []; // Start with empty array, user can add items
                }
                return acc;
            }

            // Initialize regular fields
            acc[prop.key] = value || '';
            return acc;
        }, {} as { [key: string]: any });

        return result;
    }

    function mapFormArrayToInputs(prop: { key: string, items: { key: string, type: string, default?: any }[] }, currentValues: any[] = []) {
        // passed inputs from dialog config
        const configObj = (config && typeof config === 'object') ? config : null;
        const index = configObj?.keys ? configObj.keys.indexOf(prop.key) : -1;
        let values = (configObj && index >= 0) ? configObj.values[index] : currentValues;

        // NOTE: We intentionally do NOT read from `data` prop here to avoid circular dependency.

        return [...values];
    }

    function mapInputsToData(inputs: { [key: string]: any }) {
        return Object.keys(inputs).reduce((acc, key) => {
            const prop = FORM[key];
            if (!prop) return acc;
            
            const inputValue = inputs[key];
            
            // Handle time-series fields
            if (prop.type === 'time-series' && prop.items) {
                // Only include if at least one field has a value
                const hasValues = Object.values(inputValue).some(val => val !== '' && val !== null && val !== undefined);
                if (hasValues) {
                    // Only include non-empty fields in the time-series object
                    const filteredTimeSeries = Object.keys(inputValue).reduce((tsAcc, itemKey) => {
                        const val = inputValue[itemKey];
                        if (val !== '' && val !== null && val !== undefined) {
                            tsAcc[itemKey] = val;
                        }
                        return tsAcc;
                    }, {} as { [key: string]: any });
                    
                    if (Object.keys(filteredTimeSeries).length > 0) {
                        acc[key] = filteredTimeSeries;
                    }
                }
                return acc;
            }

            // Handle array fields
            if (prop.type === 'array' && prop.items) {
                // Only include non-empty arrays with actual content
                if (Array.isArray(inputValue) && inputValue.length > 0) {
                    // Filter out empty array items
                    const filteredArray = inputValue.filter(item => {
                        if (typeof item === 'object' && item !== null) {
                            return Object.values(item).some(val => val !== '' && val !== null && val !== undefined);
                        }
                        return item !== '' && item !== null && item !== undefined;
                    });
                    
                    if (filteredArray.length > 0) {
                        acc[key] = filteredArray;
                    }
                }
                return acc;
            }
            
            // Handle regular fields - only include if not empty
            if (inputValue !== '' && inputValue !== null && inputValue !== undefined) {
                acc[key] = inputValue;
            }
            
            return acc;
        }, {} as { [key: string]: any });
    }

    function addArrayItem(prop: { key: string, items: { key: string, type: string, default?: any }[] }) {
        inputs[prop.key] = [...inputs[prop.key], ...mapFormArrayToInputs(prop, [
            prop.items.reduce((acc, item) => {
                acc[item.key] = item.default || '';
                return acc;
            }, {} as { [key: string]: any })
        ])];
    }

    // Initialize inputs state
    let inputs = $state({} as { [key: string]: any });
    
    // Initialize inputs only once when component mounts or config changes
    let lastConfigSnapshot = $state(null as any);
    let hasInitialized = $state(false);
    
    $effect(() => {
        const currentConfigSnapshot = $state.snapshot(config);

        // Only reinitialize if config changed or this is the first initialization
        if (!hasInitialized || JSON.stringify(currentConfigSnapshot) !== JSON.stringify(lastConfigSnapshot)) {
            // Use untrack to read data without creating a reactive dependency
            // This prevents the circular loop: inputs -> data -> inputs
            inputs = untrack(() => mapFromToInputs());
            lastConfigSnapshot = currentConfigSnapshot;
            hasInitialized = true;
        }
    });

    // Update data when inputs change
    // Track the last mapped data to avoid unnecessary updates
    let lastMappedData = $state(null as any);

    $effect(() => {
        if (Object.keys(inputs).length > 0) {
            const newData = mapInputsToData(inputs);
            const newDataStr = JSON.stringify(newData);
            const lastDataStr = lastMappedData ? JSON.stringify(lastMappedData) : '';

            // Only update if data actually changed to prevent unnecessary re-renders
            if (newDataStr !== lastDataStr) {
                lastMappedData = newData;
                // Use untrack to prevent this write from triggering other effects
                untrack(() => {
                    Object.assign(data, newData);
                });
            }
        }
    });

    // Tab management is now handled by the Tabs component
</script>

<h3 class="h3 heading -sticky">{ $t('profile.health.health-form') }</h3>

<form class="form">
    <Tabs fixedHeight={true}>
        {#snippet tabHeads()}
            {#if TABS.length > 1}
                <TabHeads>
                    {#each TABS as tab}
                        <TabHead>
                            { $t('profile.health.tabs.' + tab.title)}
                        </TabHead>
                    {/each}
                </TabHeads>
            {/if}
        {/snippet}

        {#each TABS as tab}
            <TabPanel>
                {#each tab.properties as propKey}
                    {@const prop = FORM[propKey]}
                    {#if prop}
                        <div>
                            {#if prop.type === 'time-series' && prop.items && inputs[prop.key]}
                                {#each prop.items as item}
                                    {#if item.type == 'date'}
                                        <!-- Date fields are handled elsewhere -->
                                    {:else}
                                        <HealthFormField prop={item} bind:data={inputs[prop.key][item.key]} />
                                    {/if}
                                {/each}
                            {:else if prop.type === 'array' && prop.items}
                                {#if inputs[prop.key] && inputs[prop.key].length > 0}
                                    {#each inputs[prop.key] as _, index}
                                        {#each prop.items as item}
                                            <HealthFormField prop={item} bind:data={inputs[prop.key][index][item.key]} />
                                        {/each}
                                    {/each}
                                {/if}
                                <button type="button" class="button" onclick={() => addArrayItem(prop)}>
                                    {inputs[prop.key] && inputs[prop.key].length > 0 ? $t('profile.health.add-another') : $t('profile.health.add')} {$t('profile.health.props.' + prop.key)}
                                </button>
                            {:else}
                                <HealthFormField {prop} bind:data={inputs[prop.key]} />
                            {/if}
                        </div>
                    {:else}
                        ----- Unknown property: {propKey} -----
                    {/if}
                {/each}
            </TabPanel>
        {/each}
    </Tabs>
</form>

<style>
    .form {
        min-width: 35rem;
        max-width: 100%;
    }
</style>
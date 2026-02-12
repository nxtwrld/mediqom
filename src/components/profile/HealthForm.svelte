<script lang="ts">
    import { definitions as FORM_DEFINITION } from '$lib/health/dataTypes';
    import HealthFormField from './HealthFormField.svelte';
    import { t } from '$lib/i18n';
    import Tabs from '$components/ui/Tabs.svelte';
    import TabHeads from '$components/ui/TabHeads.svelte';
    import TabHead from '$components/ui/TabHead.svelte';
    import TabPanel from '$components/ui/TabPanel.svelte';

    interface Props {
        config?: {
            keys: string[];
            values: any[];
            property: any;
        } | true;
        data?: any;
    }

    let { config = true, data = $bindable({}) }: Props = $props();

    // DEBUG: Log initial props
    console.log('🔍 HealthForm - Initial props:', { 
        config: $state.snapshot(config), 
        data: $state.snapshot(data) 
    });
    console.log('🔍 HealthForm - FORM_DEFINITION keys:', FORM_DEFINITION.map(def => def.key));

    const FORM = FORM_DEFINITION.reduce((acc, prop) => {
        acc[prop.key] = prop;
        return acc;
    }, {} as { [key: string]: any });

    console.log('🔍 HealthForm - FORM object keys:', Object.keys(FORM));

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
        console.log(`🔍 TABS - Processing tab: ${tab.title}, config:`, $state.snapshot(config));
        
        // if config has a value of true, show all properties
        if (config === true) {
            console.log(`🔍 TABS - Config is true, adding tab: ${tab.title}`);
            acc.push(tab);
            return acc;
        }
        // if config has a data property (from modal), show all properties
        if (config && typeof config === 'object' && 'data' in config) {
            console.log(`🔍 TABS - Config has data property, showing all properties for tab: ${tab.title}`);
            acc.push(tab);
            return acc;
        }
        // otherwise, filter the properties based on config.keys
        if (config && typeof config === 'object' && config.keys) {
            console.log(`🔍 TABS - Config has keys:`, config.keys);
            const filteredTab = {
                ...tab,
                properties: tab.properties.filter(prop => config.keys.includes(prop))
            };
            console.log(`🔍 TABS - Filtered tab ${tab.title}:`, filteredTab);
            if (filteredTab.properties.length > 0) {
                acc.push(filteredTab);
            }
        } else {
            console.log(`🔍 TABS - Config doesn't match expected structure, skipping tab: ${tab.title}`);
        }
        return acc;
    }, [] as { title: string, properties: string[] }[]));

    // DEBUG: Log computed TABS
    $effect(() => {
        console.log('🔍 HealthForm - Computed TABS:', $state.snapshot(TABS));
        console.log('🔍 HealthForm - TABS length:', TABS.length);
    });

    function mapFromToInputs() {
        console.log('🔍 mapFromToInputs - Called with config:', $state.snapshot(config), 'data:', $state.snapshot(data));
        
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
            if (configObj && 'data' in configObj && configObj.data && configObj.data[prop.key]) {
                value = configObj.data[prop.key];
                console.log(`🔍 mapFromToInputs - Found value in config.data for ${prop.key}:`, value);
            }

            // Check direct data prop
            if (data && data[prop.key]) {
                value = data[prop.key];
                console.log(`🔍 mapFromToInputs - Found value in data for ${prop.key}:`, value);
            }

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
                console.log(`🔍 mapFromToInputs - Initialized time-series ${prop.key}:`, acc[prop.key]);
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
                console.log(`🔍 mapFromToInputs - Initialized array ${prop.key}:`, acc[prop.key]);
                return acc;
            }
            
            // Initialize regular fields
            acc[prop.key] = value || '';
            console.log(`🔍 mapFromToInputs - Set ${prop.key}:`, acc[prop.key]);
            return acc;
        }, {} as { [key: string]: any });

        console.log('🔍 mapFromToInputs - Final result:', result);
        return result;
    }

    function mapFormArrayToInputs(prop: { key: string, items: { key: string, type: string, default?: any }[] }, currentValues: any[] = []) {
        // passed inputs from dialog config
        const configObj = (config && typeof config === 'object') ? config : null;
        const index = configObj?.keys ? configObj.keys.indexOf(prop.key) : -1;
        let values = (configObj && index >= 0) ? configObj.values[index] : currentValues;

        if (data && data[prop.key]) {
            values = data[prop.key];
        }

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
        console.log('🔍 $effect[init] - Checking if inputs need update');
        const currentConfigSnapshot = $state.snapshot(config);
        console.log('🔍 $effect[init] - config changed:', JSON.stringify(currentConfigSnapshot) !== JSON.stringify(lastConfigSnapshot));
        console.log('🔍 $effect[init] - hasInitialized:', hasInitialized);
        
        // Only reinitialize if config changed or this is the first initialization
        if (!hasInitialized || JSON.stringify(currentConfigSnapshot) !== JSON.stringify(lastConfigSnapshot)) {
            console.log('🔍 $effect[init] - Updating inputs');
            inputs = mapFromToInputs();
            lastConfigSnapshot = currentConfigSnapshot;
            hasInitialized = true;
            console.log('🔍 $effect[init] - New inputs:', $state.snapshot(inputs));
        }
    });

    // Update data when inputs change
    $effect(() => {
        console.log('🔍 $effect[data] - inputs changed, keys:', Object.keys(inputs));
        if (Object.keys(inputs).length > 0) {
            const newData = mapInputsToData(inputs);
            console.log('🔍 $effect[data] - Mapped new data:', newData);
            Object.assign(data, newData);
            console.log('🔍 $effect[data] - Updated data:', $state.snapshot(data));
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
                                    {inputs[prop.key] && inputs[prop.key].length > 0 ? 'Add Another' : 'Add'} {prop.key}
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
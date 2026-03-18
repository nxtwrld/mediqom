<script lang="ts">
    import { t } from '$lib/i18n';
    import { apiFetch } from '$lib/api/client';

    interface DrugResult {
        title: string;
        dosage?: string;
        route?: string;
        form?: string;
        more?: string;
    }

    interface Props {
        value: string;
        onSelect?: (drug: DrugResult) => void;
    }

    let { value = $bindable(''), onSelect }: Props = $props();

    let results = $state<DrugResult[]>([]);
    let showResults = $state(false);
    let searching = $state(false);
    let selectedIndex = $state(-1);
    let debounceTimer: ReturnType<typeof setTimeout>;

    function handleInput() {
        clearTimeout(debounceTimer);
        selectedIndex = -1;
        if (value.length < 3) {
            results = [];
            showResults = false;
            return;
        }
        debounceTimer = setTimeout(searchDrugs, 400);
    }

    async function searchDrugs() {
        searching = true;
        try {
            const res = await apiFetch(`/v1/medication?drug=${encodeURIComponent(value)}`);
            results = await res.json();
            showResults = results.length > 0;
        } catch {
            results = [];
        } finally {
            searching = false;
        }
    }

    function selectDrug(drug: DrugResult) {
        value = drug.title;
        showResults = false;
        results = [];
        onSelect?.(drug);
    }

    function handleKeydown(e: KeyboardEvent) {
        if (!showResults) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
            e.preventDefault();
            selectDrug(results[selectedIndex]);
        } else if (e.key === 'Escape') {
            showResults = false;
        }
    }

    function handleBlur() {
        // Delay to allow click on result
        setTimeout(() => { showResults = false; }, 200);
    }
</script>

<div class="drug-search input">
    <label class="label" for="drug-search">{$t('medications.medication-name')}</label>
    <div class="search-wrapper">
        <input
            id="drug-search"
            type="text"
            bind:value
            oninput={handleInput}
            onkeydown={handleKeydown}
            onblur={handleBlur}
            onfocus={() => { if (results.length > 0) showResults = true; }}
            placeholder={$t('medications.search-placeholder')}
            autocomplete="off"
            required
        />
        {#if searching}
            <span class="search-spinner"></span>
        {/if}
    </div>
    {#if showResults}
        <ul class="search-results" role="listbox">
            {#each results as drug, i}
                <li
                    role="option"
                    class:selected={i === selectedIndex}
                    aria-selected={i === selectedIndex}
                    onmousedown={() => selectDrug(drug)}
                >
                    <span class="result-name">{drug.title}</span>
                    {#if drug.dosage}
                        <span class="result-dosage">{drug.dosage}</span>
                    {/if}
                    {#if drug.more}
                        <span class="result-more">{drug.more}</span>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
</div>

<style>
    .drug-search {
        position: relative;
    }
    .search-wrapper {
        position: relative;
    }
    .search-wrapper input {
        width: 100%;
    }
    .search-spinner {
        position: absolute;
        right: 0.5rem;
        top: 50%;
        transform: translateY(-50%);
        width: 1rem;
        height: 1rem;
        border: 2px solid var(--color-border);
        border-top-color: var(--color-text-primary);
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
    }
    @keyframes spin {
        to { transform: translateY(-50%) rotate(360deg); }
    }
    .search-results {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: var(--color-white);
        border: 1px solid var(--color-border);
        border-radius: var(--ui-radius-small);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        max-height: 16rem;
        overflow-y: auto;
        z-index: 100;
        list-style: none;
        margin: 0.25rem 0 0;
        padding: 0;
    }
    .search-results li {
        padding: 0.5rem 0.75rem;
        cursor: pointer;
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem 0.5rem;
        align-items: baseline;
    }
    .search-results li:hover,
    .search-results li.selected {
        background: var(--color-gray-200, #f5f5f5);
    }
    .result-name {
        font-weight: 500;
    }
    .result-dosage {
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
    }
    .result-more {
        font-size: 0.75rem;
        color: var(--color-text-secondary);
        flex-basis: 100%;
    }
</style>

<script lang="ts">
    import ProfileImage from "$components/profile/ProfileImage.svelte";
    import { t } from "$lib/i18n";
    import { logger } from '$lib/logging/logger';

    interface Performer {
        role?: string;
        name?: string;
        title?: string;
        specialty?: string;
        licenseNumber?: string;
        institution?: {
            name?: string;
            department?: string;
            address?: string;
            phone?: string;
            email?: string;
        };
        signature?: string;
        datePerformed?: string;
        isPrimary?: boolean;
        // Legacy vCard properties
        fn?: string;
        org?: any[];
        tel?: any[];
        email?: any[];
        adr?: any[];
        url?: any[];
    }

    interface Props {
        data: Performer[] | Performer;
    }

    let { data }: Props = $props();
    $effect(() => { logger.api.debug('Performer data:', $state.snapshot(data)); });

    // Generic function to check if a value is valid (not undefined, null, empty string, or "undefined" string)
    function isValidValue(value: any): boolean {
        return value !== 'undefined' && value !== undefined && value !== null && value !== '';
    }

    // Generic function to filter array properties
    function filterArrayProperty(arr: any[] | undefined): any[] | undefined {
        if (!arr || !Array.isArray(arr)) return arr;
        
        const filtered = arr.filter(item => {
            if (typeof item === 'object' && item !== null) {
                // For objects like { value: "email@example.com" }, check the value property
                return isValidValue(item.value);
            }
            return isValidValue(item);
        });
        
        return filtered.length > 0 ? filtered : undefined;
    }

    // Generic function to filter object properties
    function filterObjectProperty(obj: any): any {
        if (!obj || typeof obj !== 'object') return obj;
        
        const filtered = { ...obj };
        let hasValidData = false;
        
        for (const [key, value] of Object.entries(filtered)) {
            if (isValidValue(value)) {
                hasValidData = true;
            } else {
                filtered[key] = undefined;
            }
        }
        
        return hasValidData ? filtered : undefined;
    }

    // Clean performer data using generic functions
    function cleanPerformerData(performer: Performer): Performer {
        const cleaned = { ...performer };
        
        // Filter array properties
        cleaned.email = filterArrayProperty(cleaned.email);
        cleaned.tel = filterArrayProperty(cleaned.tel);
        cleaned.url = filterArrayProperty(cleaned.url);
        cleaned.adr = filterArrayProperty(cleaned.adr);
        
        // Filter institution object
        if (cleaned.institution) {
            cleaned.institution = filterObjectProperty(cleaned.institution);
        }
        
        return cleaned;
    }

    // Normalize data to always be an array and sort by isPrimary
    const performers = $derived(
        (() => {
            const normalized = Array.isArray(data) ? data : (data ? [data] : []);
            // Clean the data and sort so primary performers come first (create a copy to avoid mutation)
            return [...normalized]
                .map(cleanPerformerData)
                .sort((a, b) => {
                    if (a.isPrimary && !b.isPrimary) return -1;
                    if (!a.isPrimary && b.isPrimary) return 1;
                    return 0;
                });
        })()
    );

    // Track which cards are expanded
    let expandedCards = $state<Set<number>>(new Set());

    // Initialize with primary performer expanded
    $effect(() => {
        const primaryIndex = performers.findIndex(p => p.isPrimary);
        if (primaryIndex !== -1) {
            expandedCards = new Set([primaryIndex]);
        } else if (performers.length > 0) {
            // If no primary, expand first one
            expandedCards = new Set([0]);
        }
    });

    function toggleCard(index: number) {
        const newExpanded = new Set(expandedCards);
        if (newExpanded.has(index)) {
            newExpanded.delete(index);
        } else {
            newExpanded.add(index);
        }
        expandedCards = newExpanded;
    }
</script>

{#if performers.length > 0}
    <h3 class="h3 heading -sticky">{ $t('report.performer') }</h3>

    {#each performers as performer, index}
        <div class="contact-card card" class:expanded={expandedCards.has(index)} class:primary={performer.isPrimary}>
            <button class="card-header" onclick={() => toggleCard(index)} type="button" aria-expanded={expandedCards.has(index)} aria-controls="performer-content-{index}">
                <p class="name">{performer.name || performer.fn || 'Unknown Performer'}</p>
                {#if performer.role && typeof performer.role === 'string'}
                    <p class="role">{performer.role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
                {/if}
                {#if performer.isPrimary}
                    <span class="badge primary">Primary</span>
                {/if}
                <span class="expand-toggle" aria-hidden="true">
                    <svg class="chevron">
                        <use href="/icons.svg#chevron-down" />
                    </svg>
                </span>
            </button>
            {#if expandedCards.has(index)}
            <div class="card-body" id="performer-content-{index}">
                <div class="image">
                    <ProfileImage size={8} />
                </div>
                <div class="actions -vertical">
                    {#if performer.institution?.phone || (performer.tel && performer.tel[0])}
                    {@const phone = performer.institution?.phone || performer.tel?.[0]?.value}
                    <a href="tel:{phone}" aria-label="Call phone number">
                    <svg>
                        <use href="/icons.svg#phone" />
                        </svg>
                    </a>
                    {/if}
                    {#if performer.institution?.email || (performer.email && performer.email[0] && performer.email[0].value)}
                    {@const email = performer.institution?.email || performer.email?.[0]?.value}
                    <a href="mailto:{email}" aria-label="Send email">
                    <svg>
                        <use href="/icons.svg#email" />
                        </svg>
                    </a>
                    {/if}
                    {#if performer.institution?.address || (performer.adr && performer.adr[0])}
                        {@const address = performer.institution?.address || 
                            `${performer.adr?.[0]?.['street-address']} ${performer.adr?.[0]?.locality} ${performer.adr?.[0]?.['postal-code']}`}
                        <a href="https://www.google.com/maps/search/?q={encodeURIComponent(address)}" target="_blank" aria-label="View location on maps">
                        <svg>
                            <use href="/icons.svg#location-medical" />
                            </svg>
                        </a>
                    {/if}
                    <div class="-filler"></div>
                </div>
                <div class="details">
                    <div class="contacts">
                        {#if performer.title || performer.specialty}
                            <div class="professional-info">
                                {#if performer.title}
                                    <p class="p">{performer.title}</p>
                                {/if}
                                {#if performer.specialty}
                                    <p class="p">{performer.specialty}</p>
                                {/if}
                            </div>
                        {/if}

                        {#if performer.licenseNumber}
                            <p class="p">License: {performer.licenseNumber}</p>
                        {/if}

                        {#if performer.institution?.name || performer.org}
                            <div class="institution">
                                {#if performer.institution?.name}
                                    <p class="p">{performer.institution.name}</p>
                                    {#if performer.institution.department}
                                        <p class="p">{performer.institution.department}</p>
                                    {/if}
                                {:else if performer.org}
                                    {#each performer.org as org}
                                        <p class="p">{org['organization-name']}</p>
                                        {#if org['organization-unit']}
                                            {#each org['organization-unit'] as unit}
                                                <p class="p">{unit}</p>
                                            {/each}
                                        {/if}
                                    {/each}
                                {/if}
                            </div>
                        {/if}

                        {#if performer.institution?.phone || performer.tel}
                            {#if performer.institution?.phone}
                                <p class="p"><a class="a" href="tel:{performer.institution.phone}">{performer.institution.phone}</a></p>
                            {:else if performer.tel}
                                {#each performer.tel as {value}}
                                    {#if value}
                                        <p class="p"><a class="a" href="tel:{value}">{value}</a></p>
                                    {/if}
                                {/each}
                            {/if}
                        {/if}

                        {#if performer.institution?.email || performer.email}
                            {#if performer.institution?.email}
                                <p class="p"><a class="a" href="mailto:{performer.institution.email}">{performer.institution.email}</a></p>
                            {:else if performer.email}
                                {#each performer.email as {value}}
                                    {#if value}
                                        <p class="p"><a class="a" href="mailto:{value}">{value}</a></p>
                                    {/if}
                                {/each}
                            {/if}
                        {/if}

                        {#if performer.url}
                            {#each performer.url as {value}}
                                <p class="p"><a class="a" href="{value}" target="_blank">{value}</a></p>
                            {/each}
                        {/if}

                        {#if performer.datePerformed}
                            <p class="p">Date: {new Date(performer.datePerformed).toLocaleDateString()}</p>
                        {/if}
                    </div>
                    <div class="location">
                        {#if performer.institution?.address}
                            <p class="p">{performer.institution.address}</p>
                        {:else if performer.adr}
                            {#each performer.adr as adr}
                                <p class="p">{adr['street-address']}</p>
                                <p class="p">{adr.locality}</p>
                                <p class="p">{adr['postal-code']}</p>
                                <p class="p">{adr['country-name']}</p>
                            {/each}
                        {/if}
                    </div>
                </div>
            </div>
            {/if}
        </div>
    {/each}
{/if}



<style>
    .card {
        display: flex;
        flex-direction: column;
        margin-bottom: var(--gap);
        overflow: hidden;
    }


    .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--gap);
        padding: 1rem;
        background-color: var(--color-background);
        cursor: pointer;
        user-select: none;
        width: 100%;
        border: 1px solid var(--color-border, #e0e0e0);
        text-align: left;
        font: inherit;
        transition: background-color 0.2s ease;
    }

    .card-header:hover {
        background-color: var(--color-background-hover, #f5f5f5);
    }

    .card-header .name {
        font-weight: bold;
        font-size: 1.25rem;
        margin: 0;
    }

    .card-header .role {
        color: var(--color-text-secondary, #666);
        font-size: 0.9rem;
        margin: 0.25rem 0 0 0;
    }

    .card-body {
        display: flex;
        align-items: stretch;
        gap: var(--gap);
        border: 1px solid var(--color-border, #e0e0e0);
        border-top: none;
    }

    .card .image {
        background-color: var(--color-background);
        padding: 1rem;
        flex-shrink: 0;
        font-size: 1rem;
        max-width: min(7rem, 25vw);
    }

    .badge {
        display: inline-block;
        padding: 0.125rem 0.5rem;
        font-size: 0.75rem;
        font-weight: 600;
        border-radius: 0.25rem;
        margin-top: 0.25rem;
    }

    .badge.primary {
        background-color: var(--color-primary, #007bff);
        color: white;
    }

    .expand-toggle {
        flex-shrink: 0;
        width: 2rem;
        height: 2rem;
        padding: 0.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-text-secondary, #666);
    }

    .expand-toggle .chevron {
        width: 100%;
        height: 100%;
        fill: currentColor;
        transition: transform 0.2s ease;
    }

    .card.expanded .expand-toggle .chevron {
        transform: rotate(180deg);
    }


    .card .details {
        background-color: var(--color-background);
        flex-grow: 1;
        padding: 1rem;
        gap: 1rem;
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
    }

    .card .details > * {
        width: calc(50% - 0.5rem);
        min-width: 15rem;
    }

    .professional-info {
        margin-bottom: 1rem;
    }

    .institution {
        margin: 1rem 0;
        padding: 0.5rem;
        background-color: var(--color-background-secondary, #f9f9f9);
        border-radius: 0.25rem;
    }

    .card .actions {
        width: var(--toolbar-height);
        display: flex;
        gap: var(--gap);
        justify-content: stretch;
        align-items: stretch;
    }

    .card .actions.-vertical {
        flex-direction: column;
    }

    .card .actions .-filler {
        flex-grow: 1;
        background-color: var(--color-background);
    }

    .card .actions a {
        width: var(--toolbar-height);
        height: var(--toolbar-height);
        border: none;
        background-color: var(--color-background);
        color: var(--color-interactivity);
        display: flex;
        justify-content: center;
        align-items: center;
        padding: .5rem;
    }

    .card .actions a svg {
        fill: currentColor;
        height: 100%;
        width: 100%;
    }
    
    .card:hover .actions a {
        background-color: var(--color-white);
    }

    .card:hover .actions a:hover {
        background-color: var(--color-interactivity);
        color: var(--color-interactivity-text);
    }

    @media (max-width: 768px) {
        .card .details > * {
            width: 100%;
            min-width: unset;
        }
    }
</style>
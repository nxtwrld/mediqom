<script lang="ts">
    import ProfileImage from "$components/profile/ProfileImage.svelte";
    import ContactCard from "$components/contacts/ContactCard.svelte";
    import ContactActions from "$components/contacts/ContactActions.svelte";
    import ContactDetails from "$components/contacts/ContactDetails.svelte";
    import { t } from "$lib/i18n";
    import { profile } from '$lib/profiles';
    import { extractProviderContacts } from '$lib/contacts/extractor';
    import { getContacts, addContact } from '$lib/contacts/store';
    import { findMatch } from '$lib/contacts/dedup';

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
        documentId?: string;
    }

    let { data, documentId }: Props = $props();

    let savedIndexes = $state<Set<number>>(new Set());

    async function handleSaveToContacts(performer: Performer, index: number) {
        if (!$profile?.id) return;
        const extracted = extractProviderContacts({ performers: [performer] }, documentId || '', undefined);
        if (extracted.length === 0) return;
        const existing = getContacts($profile.id);
        const match = findMatch(extracted[0], existing);
        if (match.matchIndex >= 0) {
            savedIndexes = new Set([...savedIndexes, index]);
            return;
        }
        await addContact($profile.id, extracted[0]);
        savedIndexes = new Set([...savedIndexes, index]);
    }

    function isValidValue(value: any): boolean {
        return value !== 'undefined' && value !== undefined && value !== null && value !== '';
    }

    function filterArrayProperty(arr: any[] | undefined): any[] | undefined {
        if (!arr || !Array.isArray(arr)) return arr;
        const filtered = arr.filter(item => {
            if (typeof item === 'object' && item !== null) {
                return isValidValue(item.value);
            }
            return isValidValue(item);
        });
        return filtered.length > 0 ? filtered : undefined;
    }

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

    function cleanPerformerData(performer: Performer): Performer {
        const cleaned = { ...performer };
        // jCard stores role as string[]; normalise to string
        if (Array.isArray((cleaned as any).role)) {
            cleaned.role = ((cleaned as any).role as string[]).filter(Boolean).join(', ') || undefined;
        }
        cleaned.email = filterArrayProperty(cleaned.email);
        cleaned.tel = filterArrayProperty(cleaned.tel);
        cleaned.url = filterArrayProperty(cleaned.url);
        cleaned.adr = filterArrayProperty(cleaned.adr);
        if (cleaned.institution) {
            cleaned.institution = filterObjectProperty(cleaned.institution);
        }
        return cleaned;
    }

    const performers = $derived(
        (() => {
            const normalized = Array.isArray(data) ? data : (data ? [data] : []);
            return [...normalized]
                .map(cleanPerformerData)
                .sort((a, b) => {
                    if (a.isPrimary && !b.isPrimary) return -1;
                    if (!a.isPrimary && b.isPrimary) return 1;
                    return 0;
                });
        })()
    );

    let expandedCards = $state<Set<number>>(new Set());

    $effect(() => {
        const primaryIndex = performers.findIndex(p => p.isPrimary);
        if (primaryIndex !== -1) {
            expandedCards = new Set([primaryIndex]);
        } else if (performers.length > 0) {
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

    function getPhone(performer: Performer): string | undefined {
        return performer.institution?.phone || performer.tel?.[0]?.value;
    }

    function getEmail(performer: Performer): string | undefined {
        return performer.institution?.email || performer.email?.[0]?.value;
    }

    function getAddress(performer: Performer): string | undefined {
        if (performer.institution?.address) return performer.institution.address;
        if (performer.adr?.[0]) {
            const a = performer.adr[0];
            return `${a['street-address'] || ''} ${a.locality || ''} ${a['postal-code'] || ''}`.trim();
        }
        return undefined;
    }

    function getPhones(performer: Performer): string[] {
        if (performer.institution?.phone) return [performer.institution.phone];
        return performer.tel?.map((t: any) => t.value).filter(Boolean) || [];
    }

    function getEmails(performer: Performer): string[] {
        if (performer.institution?.email) return [performer.institution.email];
        return performer.email?.map((e: any) => e.value).filter(Boolean) || [];
    }
</script>

{#if performers.length > 0}
    <h3 class="h3 heading -sticky">{ $t('report.performer') }</h3>

    {#each performers as performer, index}
        <ContactCard
            name={performer.name || performer.fn || 'Unknown Performer'}
            role={performer.role}
            specialty={performer.specialty}
            expanded={expandedCards.has(index)}
            ontoggle={() => toggleCard(index)}
        >
            {#snippet headerExtras()}
                {#if performer.isPrimary}
                    <span class="badge -primary">Primary</span>
                {/if}
            {/snippet}
            {#snippet image()}
                <ProfileImage size={8} />
            {/snippet}
            <ContactActions
                phone={getPhone(performer)}
                email={getEmail(performer)}
                address={getAddress(performer)}
            />
            <ContactDetails
                title={performer.title}
                specialty={performer.specialty}
                licenseNumber={performer.licenseNumber}
                institution={performer.institution}
                phones={getPhones(performer)}
                emails={getEmails(performer)}
                urls={performer.url?.map((u: any) => u.value).filter(Boolean)}
                datePerformed={performer.datePerformed}
            >
                {#snippet footerActions()}
                    <button
                        class="button -small"
                        class:-saved={savedIndexes.has(index)}
                        onclick={() => handleSaveToContacts(performer, index)}
                        disabled={savedIndexes.has(index)}
                    >
                        {#if savedIndexes.has(index)}
                            <svg class="btn-icon"><use href="/icons-o.svg#checked" /></svg>
                            {$t('contacts.saved')}
                        {:else}
                            <svg class="btn-icon"><use href="/icons.svg#user" /></svg>
                            {$t('contacts.save-to-directory')}
                        {/if}
                    </button>
                {/snippet}
            </ContactDetails>
        </ContactCard>
    {/each}
{/if}

<style>
    .badge {
        display: inline-block;
        padding: 0.125rem 0.5rem;
        font-size: 0.75rem;
        font-weight: 600;
        border-radius: 0.25rem;
    }

    .badge.-primary {
        background-color: var(--color-interactivity);
        color: white;
    }

    .button {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
    }

    .btn-icon {
        width: 1rem;
        height: 1rem;
        fill: currentColor;
    }

    .button.-saved {
        color: var(--color-positive);
    }
</style>

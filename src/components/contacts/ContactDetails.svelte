<script lang="ts">
    import type { Snippet } from 'svelte';
    import { t } from '$lib/i18n';

    interface Props {
        title?: string;
        specialty?: string;
        licenseNumber?: string;
        institution?: {
            name?: string;
            department?: string;
            address?: string;
        };
        phones?: string[];
        emails?: string[];
        urls?: string[];
        datePerformed?: string;
        address?: string;
        footerActions?: Snippet;
    }

    let { title, specialty, licenseNumber, institution, phones, emails, urls, datePerformed, address, footerActions }: Props = $props();
</script>

<div class="details">
    <div class="contacts-info">
        {#if title || specialty}
            <div class="professional-info">
                {#if title}
                    <p class="p">{title}</p>
                {/if}
                {#if specialty}
                    <p class="p">{specialty}</p>
                {/if}
            </div>
        {/if}

        {#if institution?.name}
            <div class="institution">
                <p class="p">{institution.name}</p>
                {#if institution.department}
                    <p class="p">{institution.department}</p>
                {/if}
            </div>
        {/if}

        {#if licenseNumber}
            <p class="p">{$t('contacts.license')}: {licenseNumber}</p>
        {/if}

        {#if phones?.length}
            {#each phones as phone}
                <p class="p"><a class="a" href="tel:{phone}">{phone}</a></p>
            {/each}
        {/if}

        {#if emails?.length}
            {#each emails as email}
                <p class="p"><a class="a" href="mailto:{email}">{email}</a></p>
            {/each}
        {/if}

        {#if urls?.length}
            {#each urls as url}
                <p class="p"><a class="a" href={url} target="_blank">{url}</a></p>
            {/each}
        {/if}

        {#if datePerformed}
            <p class="p">{new Date(datePerformed).toLocaleDateString()}</p>
        {/if}

        {#if address || institution?.address}
            <p class="p">{address || institution?.address}</p>
        {/if}
    </div>

    {#if footerActions}
        <div class="card-actions">
            {@render footerActions()}
        </div>
    {/if}
</div>

<style>
    .details {
        background-color: var(--color-background);
        flex-grow: 1;
        padding: var(--ui-pad-medium);
        display: flex;
        flex-direction: column;
        gap: var(--gap);
    }

    .professional-info {
        margin-bottom: var(--ui-pad-small);
    }

    .institution {
        margin-bottom: var(--ui-pad-small);
        padding: var(--ui-pad-small);
        background-color: var(--color-background-secondary);
        border-radius: var(--ui-radius-small);
    }

    .card-actions {
        display: flex;
        gap: var(--ui-pad-small);
        flex-wrap: wrap;
        padding-top: var(--ui-pad-small);
        border-top: 1px solid var(--color-border);
    }
</style>

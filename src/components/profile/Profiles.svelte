<script lang="ts">
    import { createBubbler, stopPropagation } from 'svelte/legacy';

    const bubble = createBubbler();
    import { type Profile } from '$lib/types.d';
    import { getAge } from '$lib/datetime';
    import { goto } from '$app/navigation';
    import { profiles, removeLinkedProfile } from '$lib/profiles/';
    import ProfileImage from './ProfileImage.svelte';
    import user from '$lib/user';
    import { t } from '$lib/i18n';
    import Health from '$components/onboarding/Health.svelte';
    
    const ROOT_PATH = '/med/p/';

    enum Views {
        LIST = 'list',
        GRID = 'grid'
    }
    let view: Views = ($profiles.length < 10 ) ? Views.GRID : Views.LIST;


    function openProfile(profile: Profile) {
        
        if(profile.status == 'approved') goto(ROOT_PATH + profile.id);
        else alert('Request access sent');
    }

    async function deleteUser(id: string) {
        try {
            if (confirm('Are you sure you want to remove this user?')) await removeLinkedProfile(id);
            //await profiles.update();
        } catch (e) {
            console.error(e);
        }
    }

    function requestAccess(id: string) {
        console.log('requesting access', id);
        alert('Request access sent');
    }

</script>

<h3 class="h3 heading -sticky">{ $t('app.headings.profiles') }</h3>


<div class="list-items list-items-{view}">
{#each $profiles as profile}
    <div class="list-item -click -{profile.status}">
        <button  class="content" onclick={() => openProfile(profile)}>
            <div class="image">
                <ProfileImage {profile} size={view === Views.GRID ? 8 : 4} />
            </div>
            <div class="title">{profile.fullName}</div>
            <div class="age">{#if profile.health?.birthDate}{$t({id: 'app.profile.value-age', values: { value: getAge(profile.health?.birthDate)}})}{/if}</div>
            <div class="dob">{#if profile.health?.birthDate}{profile.health?.birthDate}{/if}</div>
            <div class="tel">
                {#if profile.vcard?.tel?.[0]?.value}
                <a href="tel:{profile.vcard?.tel?.[0]?.value}" onclick={stopPropagation(bubble('click'))}>{profile.vcard?.tel?.[0]?.value}</a>
                {/if}
            </div>
        </button>
        <div class="actions">
            {#if profile.status == 'approved'}
            <a href={ROOT_PATH + profile.id} class="button">{ $t('app.profiles.open') }</a>
            {:else}
            <button class="button -request" onclick={stopPropagation(() => requestAccess(profile.id))}>{ $t('app.profiles.request-access') }</button>
            {/if}
            {#if profile.id != $user?.id}
            <button onclick={stopPropagation(() => deleteUser(profile.id))} class="button -danger">
                {#if (profile as any).auth_id}
                { $t('app.profiles.unlink') }
                {:else}
                { $t('app.profiles.delete') }
                {/if}
            </button>
            {/if}
        </div>
    </div>
{/each}
</div>




<!--button on:click={addProfileData}>Add Profile</button-->

<style> 

    /* Grid */

    .list-items-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
        gap: var(--gap);
        margin-top: var(--gap);
    }

    .list-items-grid .list-item {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        justify-content: space-between;
        gap: var(--gap);
        height: 20rem;
    }

    .list-items-grid .list-item .content {
        background-color: var(--color-gray-300);
        cursor: pointer;
        flex-grow: 1;
    }

    .list-items-grid .list-item button.content:hover {
        background-color: var(--color-white);
        box-shadow: var(--shadow-interactivity);
        z-index: 10;
        cursor: pointer;
    }

    .list-items-grid .list-item .image {
        padding: 1rem;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .list-items-grid .list-item .actions {
        display: flex;
        gap: var(--gap);
        justify-content: stretch;
        align-items: stretch;

    }
    .list-items-grid .list-item .actions .button {
        flex-grow: 1;
        border-radius: 0;
        transform: none;
        border: none;
    }
    



    /* List */


    .list-items-list {
        display: flex;
        flex-direction: column;
        gap: var(--gap);
        margin-top: var(--gap);
    }

    .list-items-list .list-item {
        display: flex;
        flex-direction: row;
        align-items: stretch;
        background-color: var(--color-gray-300);
        justify-content: space-between;
        gap: var(--gap);
        width: 100%;
    }

    .list-items-list .list-item .content {
        display: flex;
        flex-direction: row;
        align-items: center;

        cursor: pointer;
        flex-grow: 1;
        padding: .5rem;
    }
    .list-items-list .list-item .image {
        margin-right: 1rem;
    }

    .list-items-list .list-item .content > * {
        white-space: nowrap;
        padding: .5rem;
    }

    .list-items-list .list-item .content .title {
        flex-grow: 1;
        text-align: left;
        font-weight: 500;
        font-size: 1.2rem;
    }
    .list-items-list .list-item .actions {
        display: flex;
        flex-direction: column;
        gap: var(--gap);
        padding: 0 1rem;
        justify-content: center;
        align-items: stretch;
    }
/*
    .table-list {
        width: 100%;
        border-collapse: collapse;
        --color-border: var(--color-gray-500);  
    }
    .table-list tr.-click > * {
        cursor: pointer;
    }

    .table-list th,
    .table-list td {
        text-align: left;
        padding: 1rem;
        border-bottom: .1rem solid var(--color-border);
    }

    .table-list th {
        background-color: var(--color-highlight);
        color: var(--color-highlight-text);
        white-space: nowrap;
        font-weight: 800;
    }
    .table-list tr:nth-child(even),
    .table-list tr:nth-child(even) td {
        background-color: var(--color-gray-400);
    }
    .table-list tr:hover {
        position: relative;
        box-shadow: 0 .1rem .2rem var(--color-border);
        z-index: 10;
    }
    .table-list tr:hover td {
        background-color: var(--color-white);
    }

    .table-list .title {
        font-weight: 800;
        width: 50%;
    }
    .table-list .dob {
        white-space: nowrap;
    }
    .-request td {
        background-color: var(--color-gray-500) !important;
        cursor: not-allowed !important;
    }
    .-denied {
        color: var(--color-negative);
    }

    .table-list tr .table-actions {
        display: flex;
        gap: 1rem;
        justify-content: flex-end;
    }

    @media (max-width: 768px) {
        .table-list {
            display: block;
        }

        .table-list thead {
            display: none;
        }
        .table-list tr {
            display: flex;
            flex-direction: row;
            flex-wrap: wrap;
            justify-content: stretch;
            border-bottom: 1px solid var(--color-border);
        }
        .table-list tr td::before {
            content: attr(data-label);
            float: left;
            font-size: .7rem;
            width: 20%;
            text-transform: uppercase;
            margin-right: 1rem;
        }

        .table-list tr td {
            display: block;
            padding: 1rem;
            border: none;
            padding: .5rem .5rem;
            width: 100%;
        }
        .table-list .age {
         display: none;
        }
        .table-list .title {
            width: 100%;
            font-weight: 800;
        }
        .table-list .actions {
            width: 100%;
        }
    }
        */
</style>
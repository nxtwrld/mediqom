<script lang="ts">
    import { profile} from '$lib/profiles';
    import { getAge } from '$lib/datetime';
    import PropertyTile from './PropertyTile.svelte';
    import { properties } from '$lib/health/dataTypes';
    import user from '$lib/user';
    import ui from '$lib/ui';
    import Avatar from '$components/onboarding/Avatar.svelte';
    import ProfileImage from './ProfileImage.svelte';
    import Documents from '$components/documents/Index.svelte';
    import { t } from '$lib/i18n';
    import { ConstitutionalPrinciple } from 'langchain/chains';
    import { onMount } from 'svelte';
    import Modal from '$components/ui/Modal.svelte';
    import ProfileEdit from './ProfileEdit.svelte';
    
    // Local state for ProfileEdit modal
    let showProfileEdit = $state(false);
    
    interface Property {
        signal: string;
        value: string;
        editable?: string;
        label: string;
        unit: string;
        icon: string;
    }

    interface PropertyBlock {
        signal: string;
        log: 'full' | 'sampled';
        history: string[];
        values: Property[];
    }
    let alwaysOn = ['cholesterol', 'glucose', 'magnesium', 'triglycerides']
    //console.log($profile?.health?.signals )
    let props = $derived((($profile) ? [

        {
            property: 'age',
            source: $profile.health.birthDate,
            fn: getAge,
            editable: 'birthDate'
        },
        {
            property: 'bloodType',
            source: $profile?.health?.bloodType
        },
        {
            property: 'biologicalSex',
            source: $profile?.health?.biologicalSex
        },
        {
            signal: 'height',
            source: $profile?.health?.signals?.height,

        },
        {
            signal: 'weight',
            source: $profile?.health?.signals?.weight,

        },
        {
            signal: 'bloodPressure',
            source: [$profile?.health?.signals?.systolic, $profile?.health?.signals?.diastolic],
            fn: (v: any) => v.join('/'),
        },
        // add high priority signals to the set
        
        ...(Object.keys($profile?.health?.signals || {}).reduce((acc, key) => {
            
            const o = $profile.health.signals[key].values[0];
            if (!o || ((!o.urgency || o?.urgency == 1) && !alwaysOn.includes(key.toLowerCase().replace(/ /ig, '_')))) return acc;
            acc.push({
                signal: key,
                source: $profile.health.signals[key],
                unit: o.unit,
                urgency: o.urgency
            });

            return acc;

        }, [] as Property[]))
    ] : []).map((p) => {
        if (p.signal) {
            let source = (Array.isArray(p.source)) ? p.source.map(s => s && s.values ) : p.source?.values;
            return {
                ...p,
                source
            };
        }
        if (p.property) {
            return {
                ...p,
                signal: p.property
            };
        }
        return p
    }))
    



    let isHealthSet = $derived(Object.keys($profile?.health || {}).length > 0);
    let isVcardSet = $derived(
        $profile?.vcard?.fn || 
        $profile?.vcard?.email?.some((e: any) => e?.value) ||
        $profile?.vcard?.tel?.some((t: any) => t?.value) ||
        $profile?.vcard?.n?.givenName ||
        $profile?.vcard?.n?.familyName
    );
    let isInsuranceSet = $derived(
        $profile?.insurance?.provider || $profile?.insurance?.number
    );



    function openTile(prop: Property) {
        console.log('openTile', prop.signal || prop.editable, prop);

        let property: Property = {
            signal: prop.signal || prop.editable,
            value: prop.source ? prop.source[0].value : prop.value,
            reference: prop.source ? prop.source[0].reference : undefined,
            unit: prop.unit
        }
        
        ui.emit('modal.healthProperty', property);
    }

    // Track previous profile to only emit when actually changing
    let previousProfileId: string | null = null;

    // Emit profile context when profile changes (not just on mount)
    $effect(() => {
        if ($profile && $profile.id !== previousProfileId) {
            console.log('Profile changed in dashboard, emitting profile context event:', {
                profileId: $profile.id,
                previousProfileId
            });
            
            // Emit profile context event for AI chat
            ui.emit('aicontext:profile', {
                profileId: $profile.id,
                profileName: $profile.fullName || 'Unknown Profile',
                profileData: {
                    basicInfo: {
                        fullName: $profile.fullName,
                        dateOfBirth: $profile.health?.birthDate,
                        bloodType: $profile.health?.bloodType,
                        biologicalSex: $profile.health?.biologicalSex,
                    },
                    health: {
                        signals: $profile.health?.signals || {},
                        conditions: $profile.health?.conditions || [],
                        medications: $profile.health?.medications || [],
                        allergies: $profile.health?.allergies || [],
                    },
                    insurance: $profile.insurance,
                    contact: $profile.vcard,
                },
                timestamp: new Date()
            });
            
            // Update previous profile ID
            previousProfileId = $profile.id;
        } else if ($profile) {
            console.log('Profile unchanged in dashboard, skipping profile context event');
        }
    });

</script>

<div class="page -empty">
{#if $profile}
    <div class="profile-header">
        <div class="avatar">

            <ProfileImage profile={$profile} size={8} />
            <!--Avatar id={$profile.id} bind:url={$profile.avatarUrl} editable={$user.id == $profile.id} /-->

        </div>
        

        <div class="profile-details">
            <h1 class="h1">{$profile.fullName}</h1>
            <div class="rest">
                
                <div class="profile">
                    {#if $profile.health}
                    {#if isHealthSet && $profile.health.birthDate}
                    <div>{ $t('app.profile.date-of-birth') }: {$profile.health.birthDate}</div>
                    {/if}
                    {#if isInsuranceSet}
                    <div>{ $t('app.profile.insurance') }: {$profile.insurance.provider} - {$profile.insurance.number}</div>
                    {:else}
                    <button class="button" onclick={() => showProfileEdit = true}>{ $t('app.profile.setup-profile') }</button>
                    {/if}
                    
                    
                    {/if}                
                </div>

                <div class="contacts">
                    {#if isVcardSet}

                    <div>{$profile.vcard?.email?.[0].value}</div>
                        {#if $profile.vcard}
                            {#if $profile.vcard.tel}
                                {#each $profile.vcard.tel as tel}
                                <div>{$t('app.profile.phone')}: <a href="tel:{tel.value}" class="a">{tel.value} ({tel.type || 'default'})</a></div>
                                {/each}
                            {/if}

                        {/if}
                    {/if}
                </div>
            </div>
        </div>
    </div>

    <div class="tiles -vitals">

        {#each props as prop}
            {#if prop.source}

                <PropertyTile property={prop} on:open={() => openTile(prop)} />

            {/if}
        {/each}
        <div class="tile">
            <button class="button --large" onclick={() => ui.emit('modal.healthForm', { data: $profile?.health })}>
                {$t('app.profile.edit-health-profile')}
            </button>
        </div>
    </div>

    <h3 class="h3 heading">{ $t('app.headings.documents') }</h3>
    <Documents user={$profile.id} />

    <!--ul>
        <li>Latest Lab results document + charts</li>
        <li>Medical History
            <ul>
                <li>Latest prescriptions</li>
                <li>Latest appointments</li>
                <li>Latest messages</li>
                <li>Latest reports</li>  
            </ul>
        </li>
    </ul-->

{/if}

</div>

<!-- ProfileEdit Modal -->
{#if showProfileEdit}
    <Modal onclose={() => showProfileEdit = false}>
        <ProfileEdit bind:profile={$profile} />
    </Modal>
{/if}

<style>
    .profile-header {
        display: grid;
        grid-template-columns: 10rem 1fr;
        margin-bottom: var(--gap);
        background-color: var(--color-gray-300);
        padding: 1rem;
        grid-gap: 1rem;
    }

    .profile-header > * {
        display: flex;
        flex-direction: column;
        justify-content: center;
    }
    
    .profile-header .rest {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
        gap: 1rem;
    }
    .profile-header .rest > * {
        display: flex;
        flex-direction: column;
        justify-content: center;

    }
    .profile-header .h1 {
        width: 100%;
    }



    

    .avatar {
        width: 10rem;
        height: 10rem;

        display: flex;
        justify-content: center;
        align-items: center;
    }

  
    @media screen and (max-width: 800px) {
        .profile-header {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }
        .profile-header > * {
            width: 100%;
        }
    }   

    
    .tiles {
        grid-template-rows: auto;
    }
    .tile:last-child {
        grid-column: auto / -1; 
        --background-color: var(--color-highlight);
        padding: 1rem;
    }
    .tile:last-child:first-child {
        grid-column: 1 / -1;
    }
    @media screen and (max-width: 800px) {
        .tiles {
            grid-template-rows: auto;
            grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
        }
        .tiles :global(.value) {
            font-size: 1.4rem;
        
        }
    }
</style>
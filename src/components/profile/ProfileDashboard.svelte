<script lang="ts">
    import { profile} from '$lib/profiles';
    import { getAge } from '$lib/datetime';
    import PropertyTile from './PropertyTile.svelte';
    import { properties } from '$lib/health/dataTypes';
    import user from '$lib/user';
    import ui from '$lib/ui';
    import Avatar from '$components/onboarding/Avatar.svelte';
    import Documents from '$components/documents/Index.svelte';
    import { t } from '$lib/i18n';
    import { ConstitutionalPrinciple } from 'langchain/chains';
    import { onMount } from 'svelte';
    import Modal from '$components/ui/Modal.svelte';
    import ProfileEdit from './ProfileEdit.svelte';
    import { saveHealthProfile } from '$lib/health/save';
    import { getPropertyCategory } from '$lib/health/property-categories';
    
    // Local state for ProfileEdit modal
    let showProfileEdit = $state(false);
    let editingProfile: any = $state(null);

    function openProfileEdit() {
        // Create a deep copy to avoid direct store mutations
        editingProfile = JSON.parse(JSON.stringify($profile));
        showProfileEdit = true;
    }
    
    interface Property {
        key?: string;
        signal?: string;
        test?: string;
        property?: string;
        value?: any;
        editable?: string;
        label?: string;
        unit?: string;
        icon?: string;
        source?: any;
        fn?: (v: any) => any;
        urgency?: number;
        reference?: any;
        category?: string;
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
    ] : []).map((p: Property) => {
        if (p.signal) {
            let source = (Array.isArray(p.source)) ? p.source.map((s: any) => s && s.values ) : p.source?.values;
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

        const signalName = prop.signal || prop.editable || '';
        const values = Array.isArray(prop.source) ? prop.source.flat() : (prop.source || []);
        const category = getPropertyCategory(signalName, values);

        // Static properties open HealthForm modal with filtered keys
        if (category === 'static') {
            ui.emit('modal.healthForm', {
                keys: ['birthDate', 'biologicalSex', 'bloodType'],
                values: [
                    $profile?.health?.birthDate,
                    $profile?.health?.biologicalSex,
                    $profile?.health?.bloodType
                ]
            });
            return;
        }

        // All other categories use the tabbed modal
        let property: Property = {
            signal: signalName,
            value: prop.source ? (Array.isArray(prop.source) ? prop.source[0]?.value : prop.source?.value) : prop.value,
            reference: prop.source ? (Array.isArray(prop.source) ? prop.source[0]?.reference : prop.source?.reference) : undefined,
            unit: prop.unit,
            category
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
            <Avatar id={$profile.id} bind:url={$profile.avatarUrl} editable={false} size={8} />
        </div>
        

        <div class="profile-details">
            <h1 class="h1">
                {$profile.fullName}
                {#if $user?.id === $profile.owner_id}
                    <button class="edit-profile-btn" onclick={openProfileEdit} title={$t('app.profile.edit-profile')} aria-label={$t('app.profile.edit-profile')}>
                        <svg><use href="/icons.svg#edit"></use></svg>
                    </button>
                {/if}
            </h1>
            <div class="rest">
                
                <div class="profile">
                    {#if $profile.health}
                    {#if isHealthSet && $profile.health.birthDate}
                    <div>{ $t('app.profile.date-of-birth') }: {$profile.health.birthDate}</div>
                    {/if}
                    {#if isInsuranceSet}
                    <div>{ $t('app.profile.insurance') }: {$profile.insurance.provider} - {$profile.insurance.number}</div>
                    {:else}
                    <button class="button" onclick={openProfileEdit}>{ $t('app.profile.setup-profile') }</button>
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
{#if showProfileEdit && editingProfile}
    <Modal onclose={async () => {
        // Save edited profile data before closing
        if (editingProfile?.id && editingProfile?.health) {
            await saveHealthProfile({
                profileId: editingProfile.id,
                formData: editingProfile.health
            });
        }
        // Update the store with edited data
        profile.set(editingProfile);
        editingProfile = null;
        showProfileEdit = false;
    }}>
        <ProfileEdit bind:profile={editingProfile} />
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
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .edit-profile-btn {
        background: none;
        border: none;
        cursor: pointer;
        padding: 0.25rem;
        color: var(--color-text-muted, #666);
        border-radius: var(--radius-small, 4px);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.2s ease, background 0.2s ease;
    }

    .edit-profile-btn:hover {
        background: var(--color-gray-200, #e5e5e5);
        color: var(--color-text, #333);
    }

    .edit-profile-btn svg {
        width: 1.25rem;
        height: 1.25rem;
        fill: currentColor;
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
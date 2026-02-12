<script lang="ts">
    import { t } from '$lib/i18n';
    
    interface Props {
        data: any;
    }

    let { data = $bindable() }: Props = $props();

    // Default data structure factory
    function getDefaultData() {
        return {
            fn: '',
            n: {
                honorificPrefix: '',
                givenName: '',
                additionalName: '',
                familyName: '',
                honorificSufix: ''
            },
            adr: [
                {
                    streetAddress: '',
                    locality: '',
                    region: '',
                    postalCode: '',
                    countryName: 'CZ'
                }
            ],
            tel: [
                {
                    type: '',
                    value: ''
                }
            ],
            email: [
                {
                    type: '',
                    value: ''
                }
            ]
        };
    }

    // Create a deep reactive copy of the data
    let formData = $state(JSON.parse(JSON.stringify({ ...getDefaultData(), ...(data || {}) })));

    // Debounced sync back to parent prop
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    $effect(() => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            data = JSON.parse(JSON.stringify(formData));
        }, 100);

        return () => { if (timeoutId) clearTimeout(timeoutId); };
    });
</script>


<h3 class="h3 heading -sticky">{ $t('profile.vcard.contact-information') }</h3>

<div class="page">

    <div class="input">
        <label for="vcard-name">{ $t('profile.vcard.fn') }</label>
        <input type="text" id="vcard-name" bind:value={formData.fn} />
    </div>

    <!-- n object of VCard with prefixes and suffixes-->

    <div class="inputs-row">
        <div class="input">
            <label for="vcard-prefix">{ $t('profile.vcard.prefix') }</label>
            <input type="text" id="vcard-prefix" bind:value={formData.n.honorificPrefix} />
        </div>
        <div class="input -grow">
            <label for="vcard-given">{ $t('profile.vcard.given') }</label>
            <input type="text" id="vcard-given" bind:value={formData.n.givenName} />
        </div>
        <div class="input -grow">
            <label for="vcard-middle">{ $t('profile.vcard.middle') }</label>
            <input type="text" id="vcard-middle" bind:value={formData.n.additionalName} />
        </div>
        <div class="input -grow">
            <label for="vcard-family">{ $t('profile.vcard.family') }</label>
            <input type="text" id="vcard-family" bind:value={formData.n.familyName} />
        </div>
        <div class="input">
            <label for="vcard-sufix">{ $t('profile.vcard.sufix') }</label>
            <input type="text" id="vcard-sufix" bind:value={formData.n.honorificSufix} />
        </div>
    </div>

    {#each formData.adr as adr}
        <div class="address">
            <div class="input">
                <label for="vcard-street">{ $t('profile.vcard.street') }</label>
                <input type="text" id="vcard-street" bind:value={adr.streetAddress} />
            </div>
            <div class="input">
                <label for="vcard-locality">{ $t('profile.vcard.locality') }</label>
                <input type="text" id="vcard-locality" bind:value={adr.locality} />
            </div>
            
            <div class="input">
                <label for="vcard-region">{ $t('profile.vcard.region') }</label>
                <input type="text" id="vcard-region" bind:value={adr.region} />
            </div>
            <div class="inputs-row">
                <div class="input">
                    <label for="vcard-postal">{ $t('profile.vcard.postal') }</label>
                    <input type="text" id="vcard-postal" bind:value={adr.postalCode} />
                </div>

                <div class="input -grow">
                    <label for="vcard-country">{ $t('profile.vcard.country') }</label>
                    <select id="vcard-country" bind:value={adr.countryName}>
                        <option value="">{ $t('profile.vcard.selectCountry') }</option>
                        <option value="CZ">Czech Republic</option>
                        <option value="DE">Germany</option>
                    </select>
                </div>
            </div>
        </div>
    {/each}

    {#each formData.tel as tel}
        <div class="input">
            <label for="vcard-tel">{ $t('profile.vcard.tel') }</label>
            <input type="text" id="vcard-tel" bind:value={tel.value} />
        </div>
    {/each}

    {#each formData.email as email}
        <div class="input">
            <label for="vcard-email">{ $t('profile.vcard.email') }</label>
            <input type="text" id="vcard-email" bind:value={email.value} />
        </div>
    {/each}


</div>



<style>

    .inputs-row {
        display: flex;
        justify-content: stretch;
        gap: 1rem;
    }
    .inputs-row .input {
        flex-shrink: 1  ;
    }
    .inputs-row .input.-grow {
        flex-grow: 2;
    }

</style>
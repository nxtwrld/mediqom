<script lang="ts">
    import { t } from '$lib/i18n';
    import { reconstructFullName, hasNameComponents } from '$lib/contact/name-utils';

    interface Props {
        data: any;
    }

    let { data = $bindable() }: Props = $props();

    // Ensure default structure exists on the data object directly
    // This runs only once when component mounts
    if (!data.n) {
        data.n = {
            honorificPrefix: '',
            givenName: '',
            additionalName: '',
            familyName: '',
            honorificSufix: ''
        };
    }
    if (!data.adr || data.adr.length === 0) {
        data.adr = [{
            streetAddress: '',
            locality: '',
            region: '',
            postalCode: '',
            countryName: 'CZ'
        }];
    }
    if (!data.tel || data.tel.length === 0) {
        data.tel = [{ type: '', value: '' }];
    }
    if (!data.email || data.email.length === 0) {
        data.email = [{ type: '', value: '' }];
    }

    console.log('[VCardFrom] Initialized with data:', data);

    // Handle name component changes - reconstruct full name when user leaves a field
    function handleComponentBlur() {
        // Always reconstruct fn from components when they change
        if (hasNameComponents(data.n)) {
            data.fn = reconstructFullName(data.n);
        }
    }

    // Preview of reconstructed name (for UX feedback)
    let reconstructedName = $derived(reconstructFullName(data.n));
</script>


<h3 class="h3 heading -sticky">{ $t('profile.vcard.contact-information') }</h3>

<div class="page">

    <div class="input">
        <label for="vcard-name">{ $t('profile.vcard.fn') }</label>
        <input type="text" id="vcard-name" bind:value={data.fn} autocomplete="name" />
    </div>

    {#if reconstructedName && data.fn !== reconstructedName}
        <div class="hint" style="margin-top: -0.5rem; margin-bottom: 1rem; color: var(--color-text-secondary); font-size: 0.875rem;">
            {$t('profile.vcard.willUpdateTo')}: <strong>{reconstructedName}</strong>
        </div>
    {/if}

    <!-- n object of VCard with prefixes and suffixes-->

    <div class="inputs-row">
        <div class="input">
            <label for="vcard-prefix">{ $t('profile.vcard.prefix') }</label>
            <input type="text" id="vcard-prefix" bind:value={data.n.honorificPrefix} onblur={handleComponentBlur} autocomplete="honorific-prefix" />
        </div>
        <div class="input -grow">
            <label for="vcard-given">{ $t('profile.vcard.given') }</label>
            <input type="text" id="vcard-given" bind:value={data.n.givenName} onblur={handleComponentBlur} autocomplete="given-name" />
        </div>
        <div class="input -grow">
            <label for="vcard-middle">{ $t('profile.vcard.middle') }</label>
            <input type="text" id="vcard-middle" bind:value={data.n.additionalName} onblur={handleComponentBlur} autocomplete="additional-name" />
        </div>
        <div class="input -grow">
            <label for="vcard-family">{ $t('profile.vcard.family') }</label>
            <input type="text" id="vcard-family" bind:value={data.n.familyName} onblur={handleComponentBlur} autocomplete="family-name" />
        </div>
        <div class="input">
            <label for="vcard-sufix">{ $t('profile.vcard.sufix') }</label>
            <input type="text" id="vcard-sufix" bind:value={data.n.honorificSufix} onblur={handleComponentBlur} autocomplete="honorific-suffix" />
        </div>
    </div>

    {#each data.adr as adr}
        <div class="address">
            <div class="input">
                <label for="vcard-street">{ $t('profile.vcard.street') }</label>
                <input type="text" id="vcard-street" bind:value={adr.streetAddress} autocomplete="street-address" />
            </div>
            <div class="input">
                <label for="vcard-locality">{ $t('profile.vcard.locality') }</label>
                <input type="text" id="vcard-locality" bind:value={adr.locality} autocomplete="address-level2" />
            </div>

            <div class="input">
                <label for="vcard-region">{ $t('profile.vcard.region') }</label>
                <input type="text" id="vcard-region" bind:value={adr.region} autocomplete="address-level1" />
            </div>
            <div class="inputs-row">
                <div class="input">
                    <label for="vcard-postal">{ $t('profile.vcard.postal') }</label>
                    <input type="text" id="vcard-postal" bind:value={adr.postalCode} autocomplete="postal-code" />
                </div>

                <div class="input -grow">
                    <label for="vcard-country">{ $t('profile.vcard.country') }</label>
                    <select id="vcard-country" bind:value={adr.countryName} autocomplete="country">
                        <option value="">{ $t('profile.vcard.selectCountry') }</option>
                        <option value="CZ">Czech Republic</option>
                        <option value="DE">Germany</option>
                    </select>
                </div>
            </div>
        </div>
    {/each}

    {#each data.tel as tel}
        <div class="input">
            <label for="vcard-tel">{ $t('profile.vcard.tel') }</label>
            <input type="text" id="vcard-tel" bind:value={tel.value} autocomplete="tel" />
        </div>
    {/each}

    {#each data.email as email}
        <div class="input">
            <label for="vcard-email">{ $t('profile.vcard.email') }</label>
            <input type="email" id="vcard-email" bind:value={email.value} autocomplete="email" />
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
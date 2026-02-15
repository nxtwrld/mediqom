<script lang="ts">
    import { run } from 'svelte/legacy';

    import Prop from "$components/forms/Prop.svelte";
    import { importPublicKeySpki } from '$lib/encryption/rsa';
    interface Props {
        value?: string;
    }

    let { value = '' }: Props = $props();


    let key: CryptoKey | undefined = $state();
    let error: string | undefined = $state();




    async function importKey(pem: string) {
        return importPublicKeySpki(pem);
    }



    run(() => {
        if (value !== '') {
            importKey(value).then((k) => {
                if (k) {
                    key = k;
                    error = undefined;
                }
            })
            .catch((e) => {
                error = e?.message || "Invalid Key format";
            })
        }
    });
</script>


    <div class="details">
        {#if error !== undefined}
            <p class="error">Failed to parse the Public. Please, provide a valid public key</p>
        {:else if key !== undefined}
            <Prop value={key.type} >Key Type</Prop>
            <Prop value={key.algorithm.name} >Algorithm</Prop>
            <Prop value={(key.algorithm as any)?.hash?.name} >HASH</Prop>
            <Prop value={key.usages.join(', ')} >Usages</Prop>
        {/if}
    </div>

<style>

</style>

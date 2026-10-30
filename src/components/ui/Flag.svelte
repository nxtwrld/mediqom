<script lang="ts">

    interface Props {
        country?: string;
        height?: string;
    }

    let { country = 'us', height = "1.6rem" }: Props = $props();

    const flagMapping: Record<string, string> = {
        en: 'us',
        zh: 'cn',
        cs: 'cz',
        da: 'dk',
        el: 'gr',
    } 



    function getCode(country: string): string {
        return flagMapping[country] || country;
    }
    let flag = $derived(getCode(country.toLowerCase()));
</script>

<span class="fi fi-{flag}" style="height: {height}"></span>


<style>

</style>
<script lang="ts">
    import Profiles  from '$components/profile/Profiles.svelte';

    interface Props {
        children?: import('svelte').Snippet;
    }

    let { children }: Props = $props();
    console.log('load')
</script>
<div class="page -empty -scroll">

    <Profiles  />

  
    {@render children?.()}
</div>

<style>


</style>
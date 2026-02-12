
<script lang="ts">
    import user from '$lib/user';
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';
    import ui from '$lib/ui';
    import { t } from '$lib/i18n';

  /*  $: {
        if ($user && $user.subscription == 'individual') {
            goto('/med/p/'+$user.id);
        }
    }
*/
    onMount(() => {
        if ($user && $user.id && 'subscription' in $user && $user.subscription == 'individual') {
            goto('/med/p/'+$user.id);
        } else {
            goto('/med/p');
        }
    });

    </script>

<h1 class="h1">{$t('app.med.title')}</h1>

<p>{$t('app.med.description')}</p>

<button class="a" onclick={()=> ui.emit('overlay.import')}>{$t('app.search.commands.import-files')}</button>


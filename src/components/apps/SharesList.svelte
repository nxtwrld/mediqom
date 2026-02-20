<script lang="ts">
	import type { ShareRecord } from "$lib/share/types.d";
    import store from '$lib/share/store';
    import { date } from '$lib/datetime';
    import { confirm} from '$lib/ui';
    // import contacts from '$lib/contact/store'; // Module not available
	// import ListSwipe from "$components/ui/ListSwipe.svelte"; // Component not available
    import { t, _ } from '$lib/i18n';
    import { get } from 'svelte/store';

    interface Props {
        shares?: ShareRecord[];
    }

    let { shares = [] }: Props = $props();

    async function removeShare(share: ShareRecord) {
        // let contact = contacts.get(share.contact);
        const message = get(_)('app.apps.confirm-remove-share', { values: { name: 'contact' } }); // contact.fn not available
        if (await confirm(message))
            store.remove(share.uid);
    }
</script>


<ul class="list-items">
    {#each shares as share}
        <li>
            <!-- ListSwipe component not available -->
            <a href={share.href} class="a">
                {share.title}
                ({$t('app.apps.shared-on-date', { values: { date: date(share.created) } })})
                {$t('app.apps.items-linked-count', { values: { count: share.links.length } })}
            </a>
            <div class="tools">
                <button class="tool -negative" aria-label="Remove share" onclick={() => removeShare(share)}>
                    <svg>
                        <use href="/sprite.svg#remove" />
                    </svg>
                </button>
            </div>
        </li>
    {/each}
</ul>
<script lang="ts">
    import type { Link } from '$lib/common.types.d';
    import { LinkType } from '$lib/common.types.d';
    //import FocusLink from '$components/focus/FocusLink.svelte';
    //import QuestionLink from '$components/question/QuestionLink.svelte';
	//import ReportLink from "$components/report/ReportLink.svelte";
    //import ContactLink from "$components/contact/ContactLink.svelte";
    //import MedicationLink from "$components/event/MedicationLink.svelte";
    import LinkedItem from './LinkedItem.svelte';

    interface Props {
        item: Link;
        passive?: boolean;
    }

    let { item, passive = false }: Props = $props();


    function getComponent(link: Link) {
        switch (link.type) {
            /*
            case LinkType.Focus:
                return FocusLink;
            case LinkType.Question:
                return QuestionLink;
            case LinkType.Report:
                return ReportLink;
            case LinkType.Contact:
                return ContactLink;
            case LinkType.Medication:
                return MedicationLink;*/
            default:
                return null;
        }
    }

    let component = $derived(getComponent(item));
</script>

{#if component}
    {@const SvelteComponent = component as any}
    <SvelteComponent {item} passive={passive} />
{:else}
    <LinkedItem title="Item deleted" type="focus" passive={passive} />
{/if}





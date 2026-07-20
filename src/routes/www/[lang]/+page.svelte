<script lang="ts">
	import type { PageData } from './$types';
	import { onMount, onDestroy } from 'svelte';
	import { sections } from '$components/www/sections';
	import { createScrollObserver } from '$components/www/scroll-observer';
	import SectionHero from '$components/www/SectionHero.svelte';
	import SectionFeature from '$components/www/SectionFeature.svelte';
	import SectionDots from '$components/www/SectionDots.svelte';
	import AppDownload from '$components/www/AppDownload.svelte';
	import WwwCanvas from '$components/www/WwwCanvas.svelte';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const scrollObserver = createScrollObserver();
	let mounted = $state(false);

	onMount(() => {
		const sectionEls = sections
			.map((s) => document.getElementById(s.id))
			.filter((el): el is HTMLElement => el !== null);

		const scrollContainer = document.querySelector('.www-layout') as HTMLElement;
		scrollObserver.observe(sectionEls, scrollContainer);
		mounted = true;
	});

	onDestroy(() => {
		scrollObserver.destroy();
	});
</script>

<svelte:head>
	<title>Mediqom — Your body remembers everything. Now your records do too.</title>
	<meta name="description" content="Mediqom keeps your complete medical history in one place, so every doctor sees the whole story. Import, organize, and understand your health records with AI." />
</svelte:head>

<WwwCanvas activeSection={scrollObserver.activeSection} />

<div class="www-sections">
	<SectionHero lang={data.lang} />

	{#each sections.slice(1) as section}
		<SectionFeature
			id={section.id}
			titleKey={section.titleKey}
			descriptionKey={section.descriptionKey}
			screenshotUrl={section.screenshotUrl}
			alignment={section.alignment}
			linkKey={section.linkKey}
			linkUrl={section.linkUrl}
		/>
	{/each}
</div>

{#if mounted}
	<SectionDots activeSection={scrollObserver.activeSection} />
	<AppDownload activeSection={scrollObserver.activeSection} />
{/if}

<style>
	.www-sections {
		position: relative;
		z-index: 1;
	}
</style>

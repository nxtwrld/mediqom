<script lang="ts">
	import { run } from 'svelte/legacy';

	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import steps from './steps';
    import { onMount } from 'svelte';
	import type { VCard } from '$lib/contact/types.d';
	import { logger } from '$lib/logging/logger';
	let STEP = $state(0);

	interface EditData {
		bio: {
			email: string;
			fullName: string;
			avatarUrl: string;
			birthDate: string;
			language: string;
		};
		vcard: VCard;
		health: Record<string, any>;
		subscription: string;
		insurance:{
            number: string;
            provider: string;
        };
		privacy: {
			enabled: boolean;
			key_hash?: string;
			publicKey?: string;
			privateKey?: string;
		}
	}


	let { data, form } = $props();


	let readyNext: boolean = $state(false);
	let hash = $state('');
	let global: any = undefined;

	let { session, profile } = $state(data);


	function setLocation(loc: string) {
		if (global) global.location.hash = loc;
	}

	onMount(() => {
		global = (window as any);
		// set default step to 0 even on refresh
		location.hash = STEP.toString();
		hash = location.hash.slice(1);
		global.addEventListener('hashchange', () => {
			hash = global.location.hash.slice(1);;
		});
	})

	        let profileForm: HTMLFormElement | undefined = $state()
	let loading = $state(false)

	let editData: EditData = $state({
		bio: {
			email: '', // TODO: Fix when this component is needed
			fullName: form?.fullName ?? profile?.fullName ?? '',
			avatarUrl: profile?.avatarUrl ?? '',
			birthDate: form?.birthDate ?? profile?.birthDate ?? '',
			language: form?.language ?? profile?.language ?? 'en'
		},
		subscription: profile?.subscription ?? 'individual',
		vcard: JSON.parse(profile?.vcard ?? '{}'),
		insurance: JSON.parse(profile?.insurance ?? '{}'),
		health: JSON.parse(profile?.health ?? '{}'),
		privacy: {
			enabled: (profile?.privateKey && profile?.publicKey) ?? false,
			key_hash: profile?.key_hash ?? undefined,
			privateKey: profile?.privateKey ?? undefined,
			publicKey: profile?.publicKey ?? undefined	
		}
	})





	const handleSubmit: SubmitFunction = ({formElement, formData, action, cancel}) => {
		logger.api.debug('Edit data', editData);
		//console.log('handleSubmit', {formElement, formData, action, cancel})
		formData.append('fullName', editData.bio.fullName);
		formData.append('avatarUrl', editData.bio.avatarUrl);
		formData.append('birthDate', editData.bio.birthDate);
		formData.append('language', editData.bio.language);
		formData.append('vcard', JSON.stringify(editData.vcard));
		formData.append('subscription', editData.subscription);
		formData.append('insurance', JSON.stringify(editData.insurance));
		formData.append('health', JSON.stringify(editData.health));
		formData.append('publicKey', editData.privacy.publicKey || '');
		formData.append('privateKey', editData.privacy.privateKey || '');
		formData.append('key_hash', editData.privacy.key_hash || '');

		// TODO
		if (editData.privacy.enabled) {
			//formData.append('publicKey', editData.privacy.publicKey);
			//formData.append('privateKey', editData.privacy.privateKey);
		}



		loading = true
		return async () => {
			loading = false
		}
	}

	const handleSignOut: SubmitFunction = () => {
		loading = true
		return async ({ update }) => {
			loading = false
			update()
		}
	}

	function setStep(step: number) {
		readyNext = false;
		logger.api.debug('Ready next state:', readyNext);
		location.hash = step.toString();
	}
	
	        let { session: derivedSession, profile: derivedProfile } = $derived(data);
	run(() => {
		if (hash == '') {
			setLocation(STEP.toString());
		} else {
			STEP = parseInt(hash);
		}
	});

	const SvelteComponent = $derived(steps[STEP].component);
</script>

<div class="flex -center view-dark">

	<div class="form modal">

		<div class="form-contents">
		<SvelteComponent bind:data={editData} {profileForm} bind:ready={readyNext} />
		</div>

		<form

		method="post"
		action="?/update"
		use:enhance={handleSubmit}
		bind:this={profileForm}
	>  

		<div class="form-actions">

			{#if STEP > 0}
				<button
					type="button"
					class="button -block"
					onclick={() => setStep(STEP - 1)}
				>
					Back
				</button>
			{/if}

			{#if STEP === steps.length - 1}
				<input
					type="submit"
					class="button -block -primary"
					value={loading ? 'Loading...' : 'Save'}
					disabled={!readyNext || loading}
				/>
			{:else}
				<button
					type="button"
					class="button -block -primary"
					onclick={() => setStep(STEP + 1)}
					disabled={!readyNext}
				>
					Next
				</button>
			{/if}

		</div>
	</form>
	</div>
	<form class="signout" method="post" action="?/signout" use:enhance={handleSignOut}>
		<div>
			<button class="button block" disabled={loading}>Sign Out</button>
		</div>
	</form>
	
</div>


<style>
	.view-dark {
		background-color: var(--color-blue);
	}
	.modal {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		min-height: 40rem;
	}
	.modal .form-contents {
		flex-grow: 1;
	}
	.signout {
		position: fixed;
		top: calc(1rem + var(--safe-area-top));
		right: calc(1rem + var(--safe-area-right));
	}
</style>
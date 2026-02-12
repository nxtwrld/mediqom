<script lang="ts">
	import { run } from 'svelte/legacy';

	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import steps from '$components/onboarding/steps';
    import { onMount } from 'svelte';
	import type { VCard } from '$lib/contact/types.d';
    import { goto } from '$app/navigation';
	import { prepareKey, encrypt as encryptAES, exportKey } from '$lib/encryption/aes.js';
	import { encrypt as encryptRSA, pemToKey } from '$lib/encryption/rsa.js';
	import { log } from '$lib/logging/logger';
	import { t } from '$lib/i18n';

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
			passphrase?: string;
		}
	}


	let { data, form } = $props();


	let readyNext: boolean = $state(false);
	let hash = $state('');
	let global: any = undefined;
;

	let { session, profile, userEmail } = $state(data);


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
	let loading = $state(false);
	let error: string | null = $state(null);

	let editData: EditData = $state({
		                bio: {
                        email: userEmail || '',
                        fullName: (form as any)?.fullName ?? profile?.fullName ?? '',
                        avatarUrl: profile?.avatarUrl ?? '',
                        birthDate: profile?.birthDate ?? '',
                        language: (form as any)?.language ?? profile?.language ?? 'en'
                },
		subscription: profile?.subscription ?? 'individual',
		vcard: JSON.parse(profile?.vcard ?? '{}'),
		insurance: JSON.parse(profile?.insurance ?? '{}'),
		health: JSON.parse(profile?.health ?? '{}'),
		privacy: {
			enabled: (profile?.privateKey && profile?.publicKey) ?? false,
			key_hash: profile?.key_hash ?? undefined,
			privateKey: profile?.privateKey ?? undefined,
			publicKey: profile?.publicKey ?? undefined,
			passphrase: profile?.passphrase ?? undefined
		}
	})

	const handleSubmit: SubmitFunction = async ({formElement, formData, action, cancel}) => {
		//console.log('editData', editData);
		//console.log('handleSubmit', {formElement, formData, action, cancel})
		formData.append('fullName', editData.bio.fullName);
		formData.append('avatarUrl', editData.bio.avatarUrl);
		formData.append('language', editData.bio.language);
		formData.append('vcard', JSON.stringify(editData.vcard));
		formData.append('subscription', editData.subscription);
		formData.append('insurance', JSON.stringify(editData.insurance));
		formData.append('health', JSON.stringify(editData.health));
		if (!editData.privacy.enabled && editData.privacy.passphrase) {
			formData.append('passphrase', editData.privacy.passphrase);
		}

		formData.append('publicKey', editData.privacy.publicKey as string);
		formData.append('privateKey', editData.privacy.privateKey as string);
		formData.append('key_hash', editData.privacy.key_hash as string);
		
		// TODO Create health and profile documents



		const documents = [{
			type: 'health',
			metadata: {
				title: 'Health Profile',
				tags: ['health', 'profile'],
				date: new Date().toISOString(),
			},
			content: {
				title: 'Health Profile',
				tags: ['health', 'profile'],
				signals: {},
				...editData.health
			}
		}, {
			type: 'profile',
			metadata: {
				title: 'Profile',
				tags: ['profile'],
				date: new Date().toISOString(),
			},
			content: {
				title: 'Profile',
				tags: ['profile'],
				
			}
		}];

		const documentsEncrypted = await Promise.all(documents.map(async (d) => {
			const cryptoKey = await prepareKey();
			const encrypted = await Promise.all([d.content, d.metadata].map(s => encryptAES(cryptoKey, JSON.stringify(s))));
			const exportedKey = await exportKey(cryptoKey);
			const profile_key = await pemToKey(editData.privacy.publicKey as string);
			const keyEncrypted = await encryptRSA(profile_key, exportedKey);
			const keys = [{
				key:  keyEncrypted,
			}];
			return {
				type: d.type,
				content: encrypted[0],
				metadata: encrypted[1],
				keys
			};
		}));


		formData.append('documents', JSON.stringify(documentsEncrypted));

		loading = true
		return async ({ update, result }) => {
			log.ui.debug('result', result);
			if (result.type === 'success') {
				loading = false;
				log.ui.info('should go to /med');
				goto('/med');
				return;
			}
			                        if (result.type === 'failure') {
                                error = result.data?.error;
				log.ui.error('error', error);
				setStep(0);
				loading = false
			}
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
		location.hash = step.toString();
	}
	
	//let { session, profile } = $derived(data);
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
		{#if error}
			                        <div class="form-instructions -error">{typeof error === 'string' ? error : (error as any)?.message}</div>
		{/if}
		<div class="form-contents">
		<SvelteComponent bind:data={editData} {profileForm}  bind:ready={readyNext} />
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
					{$t('app.account.back')}
				</button>
			{/if}

			{#if STEP === steps.length - 1}
				<input
					type="submit"
					class="button -block -primary -large"
					value={loading ? $t('app.account.loading') : $t('app.buttons.save')}
					disabled={!readyNext || loading}
				/>
			{:else}
				<button
					type="button"
					class="button -block -primary"
					onclick={() => setStep(STEP + 1)}
					disabled={!readyNext}
				>
					{$t('app.account.next')}
				</button>
			{/if}

		</div>
	</form>
	</div>
	<form class="signout" method="post" action="?/signout" use:enhance={handleSignOut}>
		<div>
			<button class="button block" disabled={loading}>{$t('app.account.sign-out')}</button>
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
		top : 1rem;
		right: 1rem;
	}
</style>
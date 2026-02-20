<script lang="ts">
	import { run } from 'svelte/legacy';

	import steps from '$components/onboarding/steps';
	import { onMount } from 'svelte';
	import type { VCard } from '$lib/contact/types.d';
	import { goto } from '$app/navigation';
	import { prepareKey, encrypt as encryptAES, exportKey } from '$lib/encryption/aes.js';
	import { encrypt as encryptRSA, pemToKey } from '$lib/encryption/rsa.js';
	import { log } from '$lib/logging/logger';
	import { t } from '$lib/i18n';
	import { apiFetch } from '$lib/api/client';
	import { isNativePlatform } from '$lib/config/platform';
	import { getClient } from '$lib/supabase';

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


	let { data } = $props();


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
			fullName: profile?.fullName ?? '',
			avatarUrl: profile?.avatarUrl ?? '',
			birthDate: profile?.birthDate ?? '',
			language: profile?.language ?? 'en'
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

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();

		// Sync birthDate from bio to health document
		editData.health.birthDate = editData.bio.birthDate;

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

		loading = true;
		error = null;

		try {
			const payload = {
				fullName: editData.bio.fullName,
				avatarUrl: editData.bio.avatarUrl,
				language: editData.bio.language,
				subscription: editData.subscription,
				passphrase: (!editData.privacy.enabled && editData.privacy.passphrase)
					? editData.privacy.passphrase
					: null,
				publicKey: editData.privacy.publicKey,
				privateKey: editData.privacy.privateKey,
				key_hash: editData.privacy.key_hash,
				documents: documentsEncrypted,
			};

			const response = await apiFetch('/v1/account/onboarding', {
				method: 'POST',
				body: JSON.stringify(payload),
			});

			const result = await response.json();

			if (response.ok && result.success) {
				log.ui.info('should go to /med');
				goto('/med');
				return;
			}

			error = result.error || 'An error occurred';
			log.ui.error('error', error);
			setStep(0);
		} catch (err: any) {
			error = err.message || 'An error occurred';
			log.ui.error('submit error', err);
			setStep(0);
		} finally {
			loading = false;
		}
	}

	async function handleSignOut() {
		loading = true;
		try {
			if (isNativePlatform()) {
				const { signOut } = await import('$lib/capacitor/auth');
				await signOut();
			} else {
				const supabase = getClient();
				await supabase.auth.signOut();
			}
			goto('/auth');
		} catch (err) {
			log.ui.error('sign out error', err);
		} finally {
			loading = false;
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
		onsubmit={handleSubmit}
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
	<div class="signout">
		<button class="button block" disabled={loading} onclick={handleSignOut}>{$t('app.account.sign-out')}</button>
	</div>

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

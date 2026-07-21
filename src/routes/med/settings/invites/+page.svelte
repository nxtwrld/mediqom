<script lang="ts">
	import { t } from '$lib/i18n';
	import user from '$lib/user';
	import { apiFetch } from '$lib/api/client';

	interface InviteCode {
		code: string;
		status: 'available' | 'claimed';
		claimed_email: string | null;
		created_at: string;
		claimed_at: string | null;
	}

	let used = $state(0);
	let limit = $state(0);
	let codes = $state<InviteCode[]>([]);
	let loading = $state(true);
	let generating = $state(false);
	let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);
	let copiedCode = $state<string | null>(null);

	async function loadInvites() {
		loading = true;
		try {
			const response = await apiFetch('/v1/invite/mine');
			const result = await response.json();
			if (response.ok) {
				used = result.used;
				limit = result.limit;
				codes = result.codes;
			} else {
				message = { type: 'error', text: $t('app.settings.invites.error.load-failed') };
			}
		} catch (err) {
			console.error('[Settings Invites] Load error:', err);
			message = { type: 'error', text: $t('app.settings.invites.error.load-failed') };
		} finally {
			loading = false;
		}
	}

	loadInvites();

	async function generateCode() {
		generating = true;
		message = null;
		try {
			const response = await apiFetch('/v1/invite/generate', { method: 'POST' });
			const result = await response.json();
			if (response.ok) {
				await loadInvites();
			} else {
				message = { type: 'error', text: result.message || $t('app.settings.invites.error.generate-failed') };
			}
		} catch (err) {
			console.error('[Settings Invites] Generate error:', err);
			message = { type: 'error', text: $t('app.settings.invites.error.generate-failed') };
		} finally {
			generating = false;
		}
	}

	async function copyLink(code: string) {
		const link = `${window.location.origin}/auth?invite=${code}`;
		await navigator.clipboard.writeText(link);
		copiedCode = code;
		setTimeout(() => {
			if (copiedCode === code) copiedCode = null;
		}, 2000);
	}

	// Admin section
	const isAdmin = $derived(Boolean(($user as any)?.is_admin));

	let sendEmail = $state('');
	let sendLoading = $state(false);
	let sendMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	async function sendInvite() {
		sendLoading = true;
		sendMessage = null;
		try {
			const response = await apiFetch('/v1/admin/invite/send', {
				method: 'POST',
				body: JSON.stringify({ email: sendEmail })
			});
			const result = await response.json();
			if (response.ok && result.success) {
				sendMessage = { type: 'success', text: $t('app.settings.invites.admin.send-success') };
				sendEmail = '';
			} else {
				sendMessage = { type: 'error', text: result.message || $t('app.settings.invites.error.generate-failed') };
			}
		} catch (err) {
			console.error('[Settings Invites] Admin send error:', err);
			sendMessage = { type: 'error', text: $t('app.settings.invites.error.generate-failed') };
		} finally {
			sendLoading = false;
		}
	}

	let quotaEmail = $state('');
	let quotaBonus = $state(0);
	let quotaLoading = $state(false);
	let quotaMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	async function updateQuota() {
		quotaLoading = true;
		quotaMessage = null;
		try {
			const response = await apiFetch('/v1/admin/invite/quota', {
				method: 'POST',
				body: JSON.stringify({ email: quotaEmail, bonus: quotaBonus })
			});
			const result = await response.json();
			if (response.ok && result.success) {
				quotaMessage = { type: 'success', text: $t('app.settings.invites.admin.quota-success') };
			} else {
				quotaMessage = { type: 'error', text: result.message || $t('app.settings.invites.error.generate-failed') };
			}
		} catch (err) {
			console.error('[Settings Invites] Admin quota error:', err);
			quotaMessage = { type: 'error', text: $t('app.settings.invites.error.generate-failed') };
		} finally {
			quotaLoading = false;
		}
	}
</script>

<div class="settings-panel">
	<header>
		<h2 class="h2">{$t('app.settings.invites.title')}</h2>
		<p class="description">{$t('app.settings.invites.description')}</p>
	</header>

	{#if !loading}
	<p class="quota">
		{$t('app.settings.invites.remaining', { values: { used, limit } })}
	</p>

	<div class="form-actions">
		<button class="button -primary" type="button" onclick={generateCode} disabled={generating || used >= limit}>
			{ generating ? $t('app.settings.invites.generating') : $t('app.settings.invites.generate') }
		</button>
	</div>

	{#if used >= limit}
		<p class="message -error">{$t('app.settings.invites.no-invites-left')}</p>
	{/if}

	{#if message}
		<p class="message -{message.type}">{message.text}</p>
	{/if}

	<div class="section-divider"></div>

	{#if codes.length === 0}
		<p class="description">{$t('app.settings.invites.code-list-empty')}</p>
	{:else}
		<ul class="invite-list">
			{#each codes as invite (invite.code)}
			<li class="invite-row">
				<span class="invite-code">{invite.code}</span>
				<span class="invite-status -{invite.status}">
					{$t(`app.settings.invites.status.${invite.status}`)}
				</span>
				{#if invite.status === 'available'}
					<button class="button -small" type="button" onclick={() => copyLink(invite.code)}>
						{ copiedCode === invite.code ? $t('app.settings.invites.link-copied') : $t('app.settings.invites.copy-link') }
					</button>
				{/if}
			</li>
			{/each}
		</ul>
	{/if}
	{/if}

	{#if isAdmin}
	<div class="section-divider"></div>

	<section>
		<h3 class="h3">{$t('app.settings.invites.admin.title')}</h3>

		<div class="admin-block">
			<h4>{$t('app.settings.invites.admin.send-title')}</h4>
			<p class="description">{$t('app.settings.invites.admin.send-description')}</p>
			<form class="form">
				<div class="input">
					<label for="send-email">{$t('app.settings.invites.admin.quota-email-label')}</label>
					<input id="send-email" class="inputField" type="email" bind:value={sendEmail} disabled={sendLoading} />
				</div>
				<div class="form-actions">
					<button class="button -primary" type="button" onclick={sendInvite} disabled={sendLoading || !sendEmail}>
						{$t('app.settings.invites.admin.send-submit')}
					</button>
				</div>
			</form>
			{#if sendMessage}
				<p class="message -{sendMessage.type}">{sendMessage.text}</p>
			{/if}
		</div>

		<div class="admin-block">
			<h4>{$t('app.settings.invites.admin.quota-title')}</h4>
			<p class="description">{$t('app.settings.invites.admin.quota-description')}</p>
			<form class="form">
				<div class="input">
					<label for="quota-email">{$t('app.settings.invites.admin.quota-email-label')}</label>
					<input id="quota-email" class="inputField" type="email" bind:value={quotaEmail} disabled={quotaLoading} />
				</div>
				<div class="input">
					<label for="quota-bonus">{$t('app.settings.invites.admin.quota-bonus-label')}</label>
					<input id="quota-bonus" class="inputField" type="number" min="0" bind:value={quotaBonus} disabled={quotaLoading} />
				</div>
				<div class="form-actions">
					<button class="button -primary" type="button" onclick={updateQuota} disabled={quotaLoading || !quotaEmail}>
						{$t('app.settings.invites.admin.quota-submit')}
					</button>
				</div>
			</form>
			{#if quotaMessage}
				<p class="message -{quotaMessage.type}">{quotaMessage.text}</p>
			{/if}
		</div>
	</section>
	{/if}
</div>

<style>
	.settings-panel {
		background: var(--color-surface);
		border-radius: var(--ui-radius-medium);
		padding: var(--ui-pad-large);
		border: 1px solid var(--color-border);
	}

	header {
		margin-bottom: var(--ui-pad-large);
	}

	.description {
		color: var(--color-text-secondary);
		margin-top: var(--ui-pad-small);
	}

	.quota {
		font-weight: 500;
		margin-bottom: var(--ui-pad-medium);
	}

	.message {
		margin-top: var(--ui-pad-medium);
		padding: var(--ui-pad-small) var(--ui-pad-medium);
		border-radius: var(--ui-radius-small);
		font-weight: 500;
	}

	.message.-success {
		background: var(--color-positive-light);
		color: var(--color-positive);
		border: 1px solid var(--color-positive);
	}

	.message.-error {
		background: var(--color-negative-light);
		color: var(--color-negative);
		border: 1px solid var(--color-negative);
	}

	.section-divider {
		border-top: 1px solid var(--color-border);
		margin: var(--ui-pad-large) 0;
	}

	.invite-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--ui-pad-small);
	}

	.invite-row {
		display: flex;
		align-items: center;
		gap: var(--ui-pad-medium);
		padding: var(--ui-pad-small) var(--ui-pad-medium);
		border: 1px solid var(--color-border);
		border-radius: var(--ui-radius-small);
	}

	.invite-code {
		font-family: monospace;
		font-weight: 600;
		flex: 1;
	}

	.invite-status {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
	}

	.invite-status.-claimed {
		color: var(--color-positive);
	}

	section h3 {
		margin-bottom: var(--ui-pad-medium);
	}

	.admin-block {
		margin-bottom: var(--ui-pad-large);
	}

	.admin-block h4 {
		margin-bottom: var(--ui-pad-small);
	}

	@media (max-width: 768px) {
		.settings-panel {
			padding: var(--ui-pad-medium);
		}
	}
</style>

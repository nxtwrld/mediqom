<script lang="ts">
	import { _ } from 'svelte-i18n';
	import type { Session, User } from '@supabase/supabase-js';

	interface Props {
		session: Session | null;
		user: User | null;
		lang: string;
	}

	let { session = null, user = null, lang }: Props = $props();

	function getDisplayName(u: User | null): string {
		if (!u) return '';
		if (u.user_metadata?.full_name) return u.user_metadata.full_name;
		if (u.email) return u.email.split('@')[0];
		return u.id.substring(0, 8);
	}

	let isAuthenticated = $derived(!!session && !!user);
	let displayName = $derived(getDisplayName(user));
</script>

{#if isAuthenticated}
	<div class="user-menu">
		<a href="/med" class="user-link">
			<div class="user-avatar">
				{displayName.charAt(0).toUpperCase()}
			</div>
			<span class="user-name">{displayName}</span>
		</a>
	</div>
{:else}
	<a href="/auth" class="login-button">
		{$_('www.nav.login', { default: 'Login' })}
	</a>
{/if}

<style>
	.login-button {
		padding: 0.45rem 1rem;
		border-radius: 0.375rem;
		text-decoration: none;
		font-weight: 500;
		font-size: 0.85rem;
		transition: all 0.2s;
		white-space: nowrap;
		background: transparent;
		color: var(--www-text, #1a1a2e);
		border: 1px solid rgba(0, 0, 0, 0.15);
	}

	.login-button:hover {
		color: var(--www-text, #1a1a2e);
		border-color: rgba(0, 0, 0, 0.3);
		background: rgba(0, 0, 0, 0.03);
	}

	.user-menu {
		position: relative;
	}

	.user-link {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.75rem;
		border-radius: 0.375rem;
		text-decoration: none;
		color: var(--www-text, #1a1a2e);
		transition: all 0.2s;
		border: 1px solid transparent;
	}

	.user-link:hover {
		color: var(--www-text, #1a1a2e);
		background: rgba(0, 0, 0, 0.04);
	}

	.user-avatar {
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 50%;
		background: var(--color-primary, #16d3dd);
		color: #0a0e1a;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		font-size: 0.8rem;
	}

	.user-name {
		font-weight: 500;
		font-size: 0.85rem;
		max-width: 120px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@media (max-width: 768px) {
		.login-button,
		.user-link {
			width: 100%;
			text-align: center;
			padding: 0.75rem 1.25rem;
		}
	}
</style>

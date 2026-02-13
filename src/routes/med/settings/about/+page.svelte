<script lang="ts">
	import { t } from '$lib/i18n';

	// Static version information
	const appVersion = '1.0.0-beta';
	const buildDate = new Date().toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});
</script>

<div class="settings-panel">
	<header>
		<h2 class="h2">{$t('app.settings.about.title')}</h2>
	</header>

	<!-- Version Information Section -->
	<section class="about-section">
		<h3 class="h3">{$t('app.settings.about.version-info')}</h3>
		<div class="info-box">
			<div class="info-item">
				<strong>{$t('app.settings.about.version')}:</strong>
				{appVersion}
			</div>
			<div class="info-item">
				<strong>{$t('app.settings.about.build')}:</strong>
				{buildDate}
			</div>
		</div>
	</section>

	<!-- Links Section -->
	<section class="about-section">
		<h3 class="h3">{$t('app.settings.about.links.title')}</h3>
		<div class="links-grid">
			<a href="https://mediqom.com/docs" class="link-card" target="_blank" rel="noopener">
				<span class="link-icon">📚</span>
				<span class="link-text">{$t('app.settings.about.links.documentation')}</span>
			</a>
			<a href="https://mediqom.com/privacy" class="link-card" target="_blank" rel="noopener">
				<span class="link-icon">🔒</span>
				<span class="link-text">{$t('app.settings.about.links.privacy')}</span>
			</a>
			<a href="https://mediqom.com/terms" class="link-card" target="_blank" rel="noopener">
				<span class="link-icon">📄</span>
				<span class="link-text">{$t('app.settings.about.links.terms')}</span>
			</a>
			<a
				href="https://github.com/mediqom/mediqom"
				class="link-card"
				target="_blank"
				rel="noopener"
			>
				<span class="link-icon">💻</span>
				<span class="link-text">{$t('app.settings.about.links.github')}</span>
			</a>
			<a href="mailto:support@mediqom.com" class="link-card">
				<span class="link-icon">✉️</span>
				<span class="link-text">{$t('app.settings.about.links.support')}</span>
			</a>
		</div>
	</section>

	<!-- Credits Section -->
	<section class="about-section">
		<h3 class="h3">{$t('app.settings.about.credits.title')}</h3>
		<p class="credits-text">
			{$t('app.settings.about.credits.description')}
		</p>
	</section>
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

	.about-section {
		margin-bottom: var(--ui-pad-xlarge);
	}

	.about-section:last-child {
		margin-bottom: 0;
	}

	.about-section h3 {
		margin-bottom: var(--ui-pad-medium);
	}

	.info-box {
		background: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: var(--ui-radius-small);
		padding: var(--ui-pad-medium);
	}

	.info-item {
		margin: var(--ui-pad-small) 0;
	}

	.info-item strong {
		color: var(--color-text-primary);
	}

	.links-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--ui-pad-medium);
	}

	.link-card {
		display: flex;
		align-items: center;
		gap: var(--ui-pad-small);
		padding: var(--ui-pad-medium);
		background: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: var(--ui-radius-small);
		text-decoration: none;
		color: var(--color-text-primary);
		transition: all 0.2s ease;
	}

	.link-card:hover {
		background: var(--color-gray-300);
		border-color: var(--color-interactivity);
		transform: translateY(-2px);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.link-icon {
		font-size: 1.5rem;
	}

	.link-text {
		font-weight: 500;
	}

	.credits-text {
		color: var(--color-text-secondary);
		line-height: 1.6;
	}

	@media (max-width: 768px) {
		.settings-panel {
			padding: var(--ui-pad-medium);
		}

		.links-grid {
			grid-template-columns: 1fr;
		}
	}
</style>

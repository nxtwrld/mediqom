export const SETTINGS_BASE = '/med/settings';

export const sections = [
	{ path: 'general', key: 'app.settings.tabs.general' },
	{ path: 'profile', key: 'app.settings.tabs.profile' },
	{ path: 'privacy', key: 'app.settings.tabs.privacy' },
	{ path: 'invites', key: 'app.settings.tabs.invites' },
	{ path: 'subscription', key: 'app.settings.tabs.subscription' },
	{ path: 'about', key: 'app.settings.tabs.about' }
] as const;

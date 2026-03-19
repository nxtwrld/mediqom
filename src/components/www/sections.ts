export interface Section {
	id: string;
	titleKey: string;
	descriptionKey: string;
	canvasColor: string;
	screenshotUrl?: string;
	alignment: 'left' | 'right';
}

export const sections: Section[] = [
	{
		id: 'hero',
		titleKey: 'www.hero.title',
		descriptionKey: 'www.hero.description',
		canvasColor: '#16d3dd',
		alignment: 'left'
	},
	{
		id: 'profiles',
		titleKey: 'www.profiles.title',
		descriptionKey: 'www.profiles.description',
		canvasColor: '#16d3dd',
		screenshotUrl: '/www/screenshots/profiles.webp',
		alignment: 'right'
	},
	{
		id: 'import',
		titleKey: 'www.import.title',
		descriptionKey: 'www.import.description',
		canvasColor: '#29cc97',
		screenshotUrl: '/www/screenshots/import.webp',
		alignment: 'left'
	},
	{
		id: 'signals',
		titleKey: 'www.signals.title',
		descriptionKey: 'www.signals.description',
		canvasColor: '#a989ee',
		screenshotUrl: '/www/screenshots/signals.webp',
		alignment: 'right'
	},
	{
		id: 'timeline',
		titleKey: 'www.timeline.title',
		descriptionKey: 'www.timeline.description',
		canvasColor: '#16d3dd',
		screenshotUrl: '/www/screenshots/timeline.webp',
		alignment: 'left'
	},
	{
		id: 'weekly-plan',
		titleKey: 'www.weekly-plan.title',
		descriptionKey: 'www.weekly-plan.description',
		canvasColor: '#e9a642',
		screenshotUrl: '/www/screenshots/weekly-plan.webp',
		alignment: 'right'
	},
	{
		id: 'medications',
		titleKey: 'www.medications.title',
		descriptionKey: 'www.medications.description',
		canvasColor: '#29cc97',
		screenshotUrl: '/www/screenshots/medications.webp',
		alignment: 'left'
	},
	{
		id: 'imaging',
		titleKey: 'www.imaging.title',
		descriptionKey: 'www.imaging.description',
		canvasColor: '#3571ff',
		screenshotUrl: '/www/screenshots/imaging.webp',
		alignment: 'right'
	},
	{
		id: 'ai-chat',
		titleKey: 'www.ai-chat.title',
		descriptionKey: 'www.ai-chat.description',
		canvasColor: '#a989ee',
		screenshotUrl: '/www/screenshots/ai-chat.webp',
		alignment: 'left'
	},
	{
		id: 'security',
		titleKey: 'www.security.title',
		descriptionKey: 'www.security.description',
		canvasColor: '#16d3dd',
		screenshotUrl: '/www/screenshots/security.webp',
		alignment: 'right'
	}
];

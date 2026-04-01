export interface SectionRayMapping {
	maleIcon: string;
	femaleIcon: string;
	maleScreenshot: string;
	femaleScreenshot: string;
}

export interface Section {
	id: string;
	titleKey: string;
	descriptionKey: string;
	canvasColor: string;
	screenshotUrl?: string;
	alignment: 'left' | 'right';
	rayMapping?: SectionRayMapping;
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
		alignment: 'right',
		rayMapping: {
			maleIcon: 'anatomy',
			femaleIcon: 'doctor',
			maleScreenshot: '/www/screenshots/anatomy.png',
			femaleScreenshot: '/www/screenshots/anatomy.png'
		}
	},
	{
		id: 'import',
		titleKey: 'www.import.title',
		descriptionKey: 'www.import.description',
		canvasColor: '#29cc97',
		screenshotUrl: '/www/screenshots/import.webp',
		alignment: 'left',
		rayMapping: {
			maleIcon: 'report',
			femaleIcon: 'search',
			maleScreenshot: '/www/screenshots/anatomy.png',
			femaleScreenshot: '/www/screenshots/anatomy.png'
		}
	},
	{
		id: 'signals',
		titleKey: 'www.signals.title',
		descriptionKey: 'www.signals.description',
		canvasColor: '#a989ee',
		screenshotUrl: '/www/screenshots/signals.webp',
		alignment: 'right',
		rayMapping: {
			maleIcon: 'chart-line',
			femaleIcon: 'prop-laboratory',
			maleScreenshot: '/www/screenshots/anatomy.png',
			femaleScreenshot: '/www/screenshots/anatomy.png'
		}
	},
	{
		id: 'timeline',
		titleKey: 'www.timeline.title',
		descriptionKey: 'www.timeline.description',
		canvasColor: '#16d3dd',
		screenshotUrl: '/www/screenshots/timeline.webp',
		alignment: 'left',
		rayMapping: {
			maleIcon: 'form-tablet',
			femaleIcon: 'form-patch',
			maleScreenshot: '/www/screenshots/anatomy.png',
			femaleScreenshot: '/www/screenshots/anatomy.png'
		}
	},
	{
		id: 'weekly-plan',
		titleKey: 'www.weekly-plan.title',
		descriptionKey: 'www.weekly-plan.description',
		canvasColor: '#e9a642',
		screenshotUrl: '/www/screenshots/weekly-plan.webp',
		alignment: 'right',
		rayMapping: {
			maleIcon: 'form-capsule',
			femaleIcon: 'form-spray',
			maleScreenshot: '/www/screenshots/anatomy.png',
			femaleScreenshot: '/www/screenshots/anatomy.png'
		}
	},
	{
		id: 'medications',
		titleKey: 'www.medications.title',
		descriptionKey: 'www.medications.description',
		canvasColor: '#29cc97',
		screenshotUrl: '/www/screenshots/medications.webp',
		alignment: 'left',
		rayMapping: {
			maleIcon: 'pills',
			femaleIcon: 'form-spray',
			maleScreenshot: '/www/screenshots/anatomy.png',
			femaleScreenshot: '/www/screenshots/anatomy.png'
		}
	},
	{
		id: 'imaging',
		titleKey: 'www.imaging.title',
		descriptionKey: 'www.imaging.description',
		canvasColor: '#3571ff',
		screenshotUrl: '/www/screenshots/imaging.webp',
		alignment: 'right',
		rayMapping: {
			maleIcon: 'anatomy',
			femaleIcon: 'search',
			maleScreenshot: '/www/screenshots/anatomy.png',
			femaleScreenshot: '/www/screenshots/anatomy.png'
		}
	},
	{
		id: 'ai-chat',
		titleKey: 'www.ai-chat.title',
		descriptionKey: 'www.ai-chat.description',
		canvasColor: '#a989ee',
		screenshotUrl: '/www/screenshots/ai-chat.webp',
		alignment: 'left',
		rayMapping: {
			maleIcon: 'report',
			femaleIcon: 'ai-chat',
			maleScreenshot: '/www/screenshots/anatomy.png',
			femaleScreenshot: '/www/screenshots/anatomy.png'
		}
	},
	{
		id: 'security',
		titleKey: 'www.security.title',
		descriptionKey: 'www.security.description',
		canvasColor: '#16d3dd',
		screenshotUrl: '/www/screenshots/security.webp',
		alignment: 'right',
		rayMapping: {
			maleIcon: 'form-tablet',
			femaleIcon: 'doctor',
			maleScreenshot: '/www/screenshots/anatomy.png',
			femaleScreenshot: '/www/screenshots/anatomy.png'
		}
	}
];

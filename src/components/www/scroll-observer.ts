import { writable, type Writable } from 'svelte/store';

export interface ScrollObserver {
	activeSection: Writable<number>;
	progress: Writable<number>;
	observe(elements: HTMLElement[]): void;
	destroy(): void;
}

export function createScrollObserver(): ScrollObserver {
	const activeSection = writable(0);
	const progress = writable(0);
	let observer: IntersectionObserver | null = null;
	let sectionVisibility = new Map<HTMLElement, number>();
	let elements: HTMLElement[] = [];

	function updateActive() {
		let maxRatio = 0;
		let maxIndex = 0;
		for (const [el, ratio] of sectionVisibility) {
			const idx = elements.indexOf(el);
			if (ratio > maxRatio) {
				maxRatio = ratio;
				maxIndex = idx;
			}
		}
		activeSection.set(maxIndex);
		progress.set(maxIndex / Math.max(elements.length - 1, 1));
	}

	function observe(els: HTMLElement[]) {
		destroy();
		elements = els;
		sectionVisibility = new Map();

		const thresholds: number[] = [];
		for (let i = 0; i <= 20; i++) thresholds.push(i / 20);

		observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					sectionVisibility.set(entry.target as HTMLElement, entry.intersectionRatio);
				}
				updateActive();
			},
			{ threshold: thresholds }
		);

		for (const el of elements) {
			observer.observe(el);
		}
	}

	function destroy() {
		if (observer) {
			observer.disconnect();
			observer = null;
		}
		sectionVisibility.clear();
		elements = [];
	}

	return { activeSection, progress, observe, destroy };
}

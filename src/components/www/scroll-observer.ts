import { writable, type Writable } from 'svelte/store';

export interface ScrollObserver {
	activeSection: Writable<number>;
	progress: Writable<number>;
	observe(elements: HTMLElement[], scrollContainer: HTMLElement): void;
	destroy(): void;
}

export function createScrollObserver(): ScrollObserver {
	const activeSection = writable(0);
	const progress = writable(0);
	let elements: HTMLElement[] = [];
	let container: HTMLElement | null = null;
	let rafId = 0;

	function update() {
		if (!container || elements.length === 0) return;

		const scrollTop = container.scrollTop;
		const viewportH = container.clientHeight;
		const center = scrollTop + viewportH / 2;

		let closestIdx = 0;
		let closestDist = Infinity;

		for (let i = 0; i < elements.length; i++) {
			const el = elements[i];
			const elCenter = el.offsetTop + el.offsetHeight / 2;
			const dist = Math.abs(center - elCenter);
			if (dist < closestDist) {
				closestDist = dist;
				closestIdx = i;
			}
		}

		activeSection.set(closestIdx);
		progress.set(closestIdx / Math.max(elements.length - 1, 1));
	}

	function onScroll() {
		if (rafId) cancelAnimationFrame(rafId);
		rafId = requestAnimationFrame(update);
	}

	function observe(els: HTMLElement[], scrollContainer: HTMLElement) {
		destroy();
		elements = els;
		container = scrollContainer;
		container.addEventListener('scroll', onScroll, { passive: true });
		update();
	}

	function destroy() {
		if (container) {
			container.removeEventListener('scroll', onScroll);
			container = null;
		}
		if (rafId) cancelAnimationFrame(rafId);
		elements = [];
	}

	return { activeSection, progress, observe, destroy };
}

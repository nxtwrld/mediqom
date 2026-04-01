import { writable, type Writable } from 'svelte/store';

export interface ScrollObserver {
	activeSection: Writable<number>;
	progress: Writable<number>;
	observe(elements: HTMLElement[], scrollContainer: HTMLElement): void;
	destroy(): void;
}

const SCROLL_COOLDOWN_MS = 800;
const GESTURE_GAP_MS = 200;

export function createScrollObserver(): ScrollObserver {
	const activeSection = writable(0);
	const progress = writable(0);
	let elements: HTMLElement[] = [];
	let container: HTMLElement | null = null;
	let currentSection = 0;
	let isScrolling = false;

	// Gesture tracking: one navigation per gesture.
	// A "gesture" = continuous stream of wheel events.
	// It ends when no wheel event arrives for GESTURE_GAP_MS.
	let gestureHandled = false;
	let gestureTimer: ReturnType<typeof setTimeout> | null = null;

	function setSection(index: number) {
		currentSection = index;
		activeSection.set(index);
		progress.set(index / Math.max(elements.length - 1, 1));
	}

	function navigateTo(index: number) {
		if (!container || index < 0 || index >= elements.length) return;
		if (index === currentSection) return;

		isScrolling = true;
		setSection(index);

		container.scrollTo({ top: elements[index].offsetTop, behavior: 'smooth' });

		// Keep isScrolling true until the scroll animation finishes
		setTimeout(() => {
			isScrolling = false;
		}, SCROLL_COOLDOWN_MS);
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();

		// Reset gesture end timer — gesture is still active
		if (gestureTimer) clearTimeout(gestureTimer);
		gestureTimer = setTimeout(() => {
			// Gesture ended (no wheel events for GESTURE_GAP_MS)
			gestureHandled = false;
			gestureTimer = null;
		}, GESTURE_GAP_MS);

		// Only navigate once per gesture
		if (gestureHandled) return;

		const direction = Math.sign(e.deltaY);
		if (direction === 0) return;

		gestureHandled = true;
		const nextIdx = Math.max(0, Math.min(elements.length - 1, currentSection + direction));
		navigateTo(nextIdx);
	}

	function onScroll() {
		// Only update from native scroll if not driven by our programmatic navigation
		// This handles dot navigation and other programmatic scrolls
		if (isScrolling || !container || elements.length === 0) return;

		const closestIdx = findClosestSection();
		if (closestIdx !== currentSection) {
			setSection(closestIdx);
		}
	}

	function findClosestSection(): number {
		if (!container || elements.length === 0) return 0;

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

		return closestIdx;
	}

	function observe(els: HTMLElement[], scrollContainer: HTMLElement) {
		destroy();
		elements = els;
		container = scrollContainer;
		container.addEventListener('wheel', onWheel, { passive: false });
		container.addEventListener('scroll', onScroll, { passive: true });

		// Sync initial state
		currentSection = findClosestSection();
		activeSection.set(currentSection);
		progress.set(currentSection / Math.max(elements.length - 1, 1));
	}

	function destroy() {
		if (container) {
			container.removeEventListener('wheel', onWheel);
			container.removeEventListener('scroll', onScroll);
			container = null;
		}
		if (gestureTimer) clearTimeout(gestureTimer);
		gestureHandled = false;
		elements = [];
	}

	return { activeSection, progress, observe, destroy };
}

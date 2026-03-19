<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { sections } from './sections';
	import type { Writable } from 'svelte/store';
	import type { WwwBodiesSystem } from './www-bodies';

	interface Props {
		activeSection: Writable<number>;
	}

	let { activeSection }: Props = $props();

	let canvasEl: HTMLCanvasElement | undefined = $state();
	let bodies: WwwBodiesSystem | null = null;
	let renderer: import('three').WebGLRenderer | null = null;
	let scene: import('three').Scene | null = null;
	let camera: import('three').PerspectiveCamera | null = null;
	let frameId = 0;
	let lastSectionIndex = -1;
	let unsubscribe: (() => void) | null = null;
	let resizeObs: ResizeObserver | null = null;

	async function init() {
		if (!canvasEl) return;

		const THREE = await import('three');
		const { createWwwBodies } = await import('./www-bodies');

		const isMobile = window.innerWidth < 768;

		renderer = new THREE.WebGLRenderer({
			canvas: canvasEl,
			alpha: true,
			antialias: !isMobile
		});
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.setClearColor(0x000000, 0);

		scene = new THREE.Scene();
		camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
		camera.position.set(0, 0, 6);

		bodies = createWwwBodies(isMobile);
		scene.add(bodies.group);

		handleResize();

		resizeObs = new ResizeObserver(handleResize);
		resizeObs.observe(canvasEl.parentElement!);

		unsubscribe = activeSection.subscribe((index) => {
			if (index !== lastSectionIndex && bodies) {
				lastSectionIndex = index;
				const section = sections[index];
				if (section) {
					const canvasPosition = isMobile
						? 'center'
						: index === 0
							? 'center'
							: section.alignment === 'right'
								? 'left'
								: 'right';
					bodies.setPosition(canvasPosition, 0.8);
				}
			}
		});

		function animate() {
			frameId = requestAnimationFrame(animate);
			if (bodies) bodies.update();
			if (renderer && scene && camera) renderer.render(scene, camera);
		}
		animate();
	}

	onMount(() => {
		init();
	});

	function handleResize() {
		if (!renderer || !camera || !canvasEl) return;
		const w = window.innerWidth;
		const h = window.innerHeight;
		renderer.setSize(w, h);
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
	}

	onDestroy(() => {
		if (frameId) cancelAnimationFrame(frameId);
		if (unsubscribe) unsubscribe();
		if (resizeObs) resizeObs.disconnect();
		if (bodies) bodies.dispose();
		if (renderer) {
			renderer.dispose();
			renderer = null;
		}
	});
</script>

<canvas class="www-canvas" bind:this={canvasEl}></canvas>

<style>
	.www-canvas {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100dvh;
		z-index: 0;
		pointer-events: none;
		background: var(--www-bg, #f5f6f8);
	}
</style>

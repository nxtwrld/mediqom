<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { sections } from './sections';
	import type { Writable } from 'svelte/store';
	import type { WwwBodiesSystem } from './www-bodies';

	interface Props {
		activeSection: Writable<number>;
	}

	let { activeSection }: Props = $props();

	let containerEl: HTMLDivElement | undefined = $state();
	let canvasEl: HTMLCanvasElement | undefined = $state();
	let bodies: WwwBodiesSystem | null = null;
	let renderer: import('three').WebGLRenderer | null = null;
	let labelRenderer: import('three/addons/renderers/CSS2DRenderer.js').CSS2DRenderer | null = null;
	let scene: import('three').Scene | null = null;
	let camera: import('three').PerspectiveCamera | null = null;
	let frameId = 0;
	let lastSectionIndex = -1;
	let unsubscribe: (() => void) | null = null;
	let resizeObs: ResizeObserver | null = null;

	async function init() {
		if (!canvasEl || !containerEl) return;

		const THREE = await import('three');
		const { createWwwBodies } = await import('./www-bodies');
		const { CSS2DRenderer } = await import('three/addons/renderers/CSS2DRenderer.js');

		const isMobile = window.innerWidth < 768;

		renderer = new THREE.WebGLRenderer({
			canvas: canvasEl,
			alpha: true,
			antialias: !isMobile
		});
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.setClearColor(0x000000, 0);

		// CSS2DRenderer for feature ray icons
		labelRenderer = new CSS2DRenderer();
		labelRenderer.domElement.style.position = 'absolute';
		labelRenderer.domElement.style.top = '0';
		labelRenderer.domElement.style.left = '0';
		labelRenderer.domElement.style.pointerEvents = 'none';
		labelRenderer.domElement.style.zIndex = '1';
		containerEl.appendChild(labelRenderer.domElement);

		scene = new THREE.Scene();
		camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
		camera.position.set(0, 0, 6);

		bodies = createWwwBodies(isMobile);
		scene.add(bodies.group);

		handleResize();

		resizeObs = new ResizeObserver(handleResize);
		resizeObs.observe(containerEl);

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

					// Trigger ray screenshot promotion (desktop only)
					if (!isMobile) {
						bodies.setActiveSection(index);
					}
				}
			}
		});

		function animate() {
			frameId = requestAnimationFrame(animate);
			if (bodies) bodies.update(camera ?? undefined);
			if (renderer && scene && camera) {
				renderer.render(scene, camera);
				if (labelRenderer) labelRenderer.render(scene, camera);
			}
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
		if (labelRenderer) labelRenderer.setSize(w, h);
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
	}

	onDestroy(() => {
		if (frameId) cancelAnimationFrame(frameId);
		if (unsubscribe) unsubscribe();
		if (resizeObs) resizeObs.disconnect();
		if (bodies) bodies.dispose();
		if (labelRenderer) {
			labelRenderer.domElement.remove();
			labelRenderer = null;
		}
		if (renderer) {
			renderer.dispose();
			renderer = null;
		}
	});
</script>

<div class="www-canvas-container" bind:this={containerEl}>
	<canvas class="www-canvas" bind:this={canvasEl}></canvas>
</div>

<style>
	.www-canvas-container {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100dvh;
		z-index: 0;
		pointer-events: none;
	}
	.www-canvas {
		width: 100%;
		height: 100%;
	}
	:global(.feature-ray-icon) {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.9);
		border: 2px solid var(--www-ray-color, #16d3dd);
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
		/* Fast scale-out when demoting (0.2s), slow scale-up when promoting (0.5s) */
		transition:
			opacity 0.2s ease,
			width 0.2s ease,
			height 0.2s ease,
			border-radius 0.2s ease,
			background 0.2s ease,
			box-shadow 0.2s ease,
			border-color 0.2s ease;
		opacity: 0;
		overflow: hidden;
		position: relative;
	}
	:global(.feature-ray-icon svg) {
		width: 16px;
		height: 16px;
		fill: var(--www-ray-color, #16d3dd);
		flex-shrink: 0;
		transition: opacity 0.3s ease, transform 0.3s ease;
	}
	:global(.feature-ray-screenshot) {
		display: none;
		opacity: 0;
		transition: opacity 0.4s ease 0.15s;
		width: 100%;
		height: 100%;
		border-radius: 50%;
		overflow: hidden;
		background-size: cover;
		background-position: center;
		background-repeat: no-repeat;
	}

	/* Promoted state — icon grows into round screenshot (slower scale-up) */
	:global(.feature-ray-icon.-promoted) {
		width: 280px;
		height: 280px;
		border-radius: 50%;
		background: #fff;
		border: 2px solid rgba(255, 255, 255, 0.9);
		box-shadow: 0 4px 32px rgba(0, 0, 0, 0.15);
		padding: 4px;
		z-index: 10;
		transition:
			opacity 0.5s ease,
			width 0.5s ease-out,
			height 0.5s ease-out,
			border-radius 0.5s ease,
			background 0.3s ease,
			box-shadow 0.5s ease,
			border-color 0.3s ease;
	}
	:global(.feature-ray-icon.-promoted.-promoted-small) {
		width: 200px;
		height: 200px;
		padding: 3px;
	}
	:global(.feature-ray-icon.-promoted svg) {
		display: none;
	}
	:global(.feature-ray-icon.-promoted .feature-ray-screenshot) {
		display: block;
		opacity: 1;
	}

	@media (max-width: 767px) {
		:global(.feature-ray-icon) {
			width: 24px;
			height: 24px;
		}
		:global(.feature-ray-icon svg) {
			width: 12px;
			height: 12px;
		}
		/* No promotion on mobile */
		:global(.feature-ray-icon.-promoted) {
			width: 24px;
			height: 24px;
			border-radius: 50%;
			background: rgba(255, 255, 255, 0.9);
			border: 2px solid var(--www-ray-color, #16d3dd);
			box-shadow: none;
			padding: 0;
			min-height: unset;
		}
		:global(.feature-ray-icon.-promoted svg) {
			position: static;
			width: 12px;
			height: 12px;
			opacity: 1;
		}
		:global(.feature-ray-icon.-promoted .feature-ray-screenshot) {
			display: none;
		}
	}
	@media (max-width: 479px) {
		:global(.feature-ray-icon) {
			display: none;
		}
	}
</style>

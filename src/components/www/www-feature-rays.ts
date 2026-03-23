import * as THREE from 'three';

const RAY_LENGTH = 0.6;
const RAY_LENGTH_PROMOTED = 0.9;
const PROMOTION_SPEED = 3.0; // promotionProgress units per second (CSS scale)
const PROMOTED_RENDER_ORDER = 100;
const PROMOTE_TRANSITION = 0.5; // seconds to animate position to target

interface RayIcon {
	name: string;
	sprite: string;
}

const MALE_ICONS: RayIcon[] = [
	{ name: 'anatomy', sprite: '/icons.svg' },
	{ name: 'form-capsule', sprite: '/icons.svg' },
	{ name: 'report', sprite: '/icons.svg' },
	{ name: 'form-tablet', sprite: '/icons.svg' },
	{ name: 'chart-line', sprite: '/icons.svg' },
	{ name: 'pills', sprite: '/icons.svg' }
];

const FEMALE_ICONS: RayIcon[] = [
	{ name: 'ai-chat', sprite: '/icons.svg' },
	{ name: 'doctor', sprite: '/icons.svg' },
	{ name: 'form-patch', sprite: '/icons.svg' },
	{ name: 'form-spray', sprite: '/icons.svg' },
	{ name: 'search', sprite: '/icons.svg' },
	{ name: 'prop-laboratory', sprite: '/icons-o.svg' }
];

// ── Screenshot position+size sets ──
// Coordinated pairs so male+female screenshots don't overlap.
// Positions are in renderGroup local space (Y: body center=0, head~1.5, feet~-1.5).
// Z pushes toward camera. All Y ≤ 0.2 to avoid covering head.

export interface ScreenshotSlot {
	position: THREE.Vector3;
	size: number; // diameter in px
}

export interface ScreenshotSet {
	male: ScreenshotSlot;
	female: ScreenshotSlot;
}

// When bodies are on LEFT side of screen (section.alignment = 'right')
export const LEFT_SIDE_SETS: ScreenshotSet[] = [
	{
		male:   { position: new THREE.Vector3(0.2, -0.4, 0.8), size: 300 },
		female: { position: new THREE.Vector3( 0,  0.1, 0.9), size: 180 },
	},
	{
		male:   { position: new THREE.Vector3(0.1, -0.1, 0.9), size: 280 },
		female: { position: new THREE.Vector3( -0.1, -0.6, 0.8), size: 200 },
	},
	{
		male:   { position: new THREE.Vector3(0.2, 0.2, 0.7), size: 300 },
		female: { position: new THREE.Vector3( -0.1,  -0.7, 0.8), size: 200 },
	}
];

// When bodies are on RIGHT side of screen (section.alignment = 'left')
export const RIGHT_SIDE_SETS: ScreenshotSet[] = [
	{
		male:   { position: new THREE.Vector3(0.3, -0.5, 0.8), size: 180 },
		female: { position: new THREE.Vector3( 0, -0.5, 0.9), size: 280 },
	},
	{
		male:   { position: new THREE.Vector3(0.4, -0.6, 0.9), size: 300 },
		female: { position: new THREE.Vector3( 0.1,  0.0, 0.8), size: 200 },
	},
	{
		male:   { position: new THREE.Vector3(0.4,  0.0, 0.7), size: 180 },
		female: { position: new THREE.Vector3( 0.1, -0.4, 0.9), size: 300 },
	}
];

export interface FeatureRaysConfig {
	mesh: THREE.Mesh;
	side: 'left' | 'right';
	icons: RayIcon[];
	color: string;
	rayCount: number;
}

export interface FeatureRaysSystem {
	renderGroup: THREE.Group;
	meshGroup: THREE.Group;
	update(elapsed: number, camera?: THREE.Camera): void;
	setOpacity(opacity: number): void;
	setColor(hex: string): void;
	promoteRay(iconName: string, screenshotUrl: string, targetPos: THREE.Vector3, targetSize: number): void;
	demoteAll(): void;
	dispose(): void;
}

interface FeatureRay {
	scanSpeed: number;
	scanPhase: number;
	scanAmplitude: number;
	scanCenter: number;
	azimuth: number;
	icon: RayIcon;
	css2d: InstanceType<typeof import('three/addons/renderers/CSS2DRenderer.js').CSS2DObject>;
	visible: boolean;
	screenshotEl: HTMLDivElement;
	// Promotion state
	promoted: boolean;
	promotionProgress: number;  // 0-1, drives CSS scale
	frozen: boolean;            // true once position transition complete
	// Hardcoded target position (renderGroup local space)
	targetLocalPos: THREE.Vector3 | null;
	startLocalPos: THREE.Vector3 | null;
	transitionStart: number;
}

export function getIconsForSide(side: 'left' | 'right'): RayIcon[] {
	return side === 'left' ? MALE_ICONS : FEMALE_ICONS;
}

export async function createFeatureRays(config: FeatureRaysConfig): Promise<FeatureRaysSystem> {
	const { CSS2DObject: CSS2DObjectClass } = await import(
		'three/addons/renderers/CSS2DRenderer.js'
	);

	const { mesh, side, icons, color, rayCount } = config;

	const renderGroup = new THREE.Group();
	const meshGroup = new THREE.Group();

	const raycastMesh = mesh.clone();
	raycastMesh.material = new THREE.MeshBasicMaterial({ visible: false });
	meshGroup.add(raycastMesh);

	const raycaster = new THREE.Raycaster();
	const rayOrigin = new THREE.Vector3();
	const rayDirection = new THREE.Vector3();
	const CAST_RADIUS = 2.5;

	let lastElapsed = 0;

	// Build per-ray state
	const rays: FeatureRay[] = [];
	for (let i = 0; i < rayCount; i++) {
		const icon = icons[i % icons.length];

		const div = document.createElement('div');
		div.className = 'feature-ray-icon';
		div.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg"><use href="${icon.sprite}#${icon.name}"></use></svg>`;

		const screenshotEl = document.createElement('div');
		screenshotEl.className = 'feature-ray-screenshot';
		div.appendChild(screenshotEl);

		const css2d = new CSS2DObjectClass(div);
		css2d.visible = false;
		renderGroup.add(css2d);

		const baseAzimuth = (i / rayCount) * Math.PI * 2;
		const jitter = (Math.random() - 0.5) * (Math.PI * 2 / rayCount) * 0.5;
		const baseY = -1.3 + (i / (rayCount - 1 || 1)) * 2.6;
		const yJitter = (Math.random() - 0.5) * 0.4;

		rays.push({
			scanSpeed: 0.15 + Math.random() * 0.25,
			scanPhase: Math.random() * Math.PI * 2,
			scanAmplitude: 0.1 + Math.random() * 0.15,
			scanCenter: baseY + yJitter,
			azimuth: baseAzimuth + jitter,
			icon,
			css2d,
			visible: false,
			screenshotEl,
			promoted: false,
			promotionProgress: 0,
			frozen: false,
			targetLocalPos: null,
			startLocalPos: null,
			transitionStart: -1
		});
	}

	// Line geometry
	const linePositions = new Float32Array(rayCount * 2 * 3);
	const lineGeometry = new THREE.BufferGeometry();
	const posAttr = new THREE.BufferAttribute(linePositions, 3);
	posAttr.setUsage(THREE.DynamicDrawUsage);
	lineGeometry.setAttribute('position', posAttr);

	const lineMaterial = new THREE.LineBasicMaterial({
		color: new THREE.Color(color),
		transparent: true,
		opacity: 0,
		depthTest: false,
		depthWrite: false
	});

	const lineSegments = new THREE.LineSegments(lineGeometry, lineMaterial);
	lineSegments.frustumCulled = false;
	renderGroup.add(lineSegments);

	// Reusable temp objects
	const hitPoint = new THREE.Vector3();
	const outwardDir = new THREE.Vector3();
	const worldQuat = new THREE.Quaternion();
	const invMatrix = new THREE.Matrix4();
	const tempVec = new THREE.Vector3();
	const ndcVec = new THREE.Vector3();
	let currentOpacity = 0;
	const NDC_MARGIN = 0.92;

	function update(elapsed: number, camera?: THREE.Camera) {
		const dt = elapsed - lastElapsed;
		lastElapsed = elapsed;

		let needsUpdate = false;

		// Update promotion progress (CSS scale)
		for (const ray of rays) {
			if (ray.promoted) {
				if (ray.promotionProgress < 1) {
					ray.promotionProgress = Math.min(1, ray.promotionProgress + dt * PROMOTION_SPEED);
				}
			} else {
				ray.frozen = false;
				if (ray.promotionProgress > 0) {
					ray.promotionProgress = Math.max(0, ray.promotionProgress - dt * PROMOTION_SPEED);
				}
			}
		}

		// Update world matrices once per frame
		meshGroup.updateMatrixWorld(true);
		renderGroup.updateMatrixWorld(true);
		meshGroup.getWorldQuaternion(worldQuat);
		invMatrix.copy(renderGroup.matrixWorld).invert();

		const meshWorldRotY = Math.atan2(
			meshGroup.matrixWorld.elements[8],
			meshGroup.matrixWorld.elements[10]
		);

		for (let i = 0; i < rays.length; i++) {
			const ray = rays[i];
			const idx = i * 6;

			// ── State 1: Frozen — arrived at target, skip ──
			if (ray.frozen) continue;

			// ── State 2: Promoted — animate position to hardcoded target ──
			if (ray.promoted) {
				if (ray.transitionStart < 0) {
					ray.transitionStart = elapsed;
				}

				const t = Math.min(1, (elapsed - ray.transitionStart) / PROMOTE_TRANSITION);
				const st = smoothStep(t);
				ray.css2d.position.lerpVectors(ray.startLocalPos!, ray.targetLocalPos!, st);

				if (t >= 1) {
					ray.frozen = true;
				}

				// Zero line during promotion
				zeroLineSegment(linePositions, idx);

				if (!ray.visible) {
					ray.css2d.visible = true;
					ray.visible = true;
				}
				(ray.css2d.element as HTMLElement).style.opacity = String(currentOpacity);
				needsUpdate = true;
				continue;
			}

			// ── State 3: Normal scanning ──
			const pp = ray.promotionProgress;
			const scanningY = ray.scanCenter + ray.scanAmplitude * Math.sin(elapsed * ray.scanSpeed + ray.scanPhase);
			const frontAz = -meshWorldRotY;
			const spreadAngle = ((ray.azimuth % (Math.PI * 2)) / (Math.PI * 2)) * Math.PI - Math.PI / 2;
			const az = frontAz + spreadAngle;

			const currentRayLength = lerp(RAY_LENGTH, RAY_LENGTH_PROMOTED, pp);

			rayOrigin.set(Math.sin(az) * CAST_RADIUS, scanningY, Math.cos(az) * CAST_RADIUS);
			rayOrigin.applyMatrix4(meshGroup.matrixWorld);

			rayDirection.set(-Math.sin(az), 0, -Math.cos(az)).normalize();
			rayDirection.applyQuaternion(worldQuat);

			raycaster.set(rayOrigin, rayDirection);
			const intersections = raycaster.intersectObject(raycastMesh, false);

			const isTransitioningOut = pp > 0;

			if (intersections.length > 0) {
				hitPoint.copy(intersections[0].point);
				outwardDir.set(Math.sin(az), 0, Math.cos(az)).normalize();
				outwardDir.applyQuaternion(worldQuat);
				tempVec.copy(hitPoint).addScaledVector(outwardDir, currentRayLength);

				let inViewport = true;
				if (camera) {
					ndcVec.copy(tempVec).project(camera);
					if (isTransitioningOut) {
						const halfW = 160, halfH = 160;
						const mX = halfW / (window.innerWidth / 2);
						const mY = halfH / (window.innerHeight / 2);
						const maxX = 1.0 - mX, maxY = 1.0 - mY;
						const cX = Math.max(-maxX, Math.min(maxX, ndcVec.x));
						const cY = Math.max(-maxY, Math.min(maxY, ndcVec.y));
						if (cX !== ndcVec.x || cY !== ndcVec.y) {
							ndcVec.x = cX;
							ndcVec.y = cY;
							tempVec.copy(ndcVec).unproject(camera);
						}
					} else if (
						Math.abs(ndcVec.x) > NDC_MARGIN ||
						Math.abs(ndcVec.y) > NDC_MARGIN ||
						ndcVec.z < 0 || ndcVec.z > 1
					) {
						inViewport = false;
					}
				}

				const localHit = hitPoint.clone().applyMatrix4(invMatrix);
				const localEnd = tempVec.clone().applyMatrix4(invMatrix);

				if (inViewport) {
					linePositions[idx]     = localHit.x;
					linePositions[idx + 1] = localHit.y;
					linePositions[idx + 2] = localHit.z;
					linePositions[idx + 3] = localEnd.x;
					linePositions[idx + 4] = localEnd.y;
					linePositions[idx + 5] = localEnd.z;

					ray.css2d.position.copy(localEnd);

					if (!ray.visible) {
						ray.css2d.visible = true;
						ray.visible = true;
					}
					(ray.css2d.element as HTMLElement).style.opacity = String(currentOpacity);
				} else {
					zeroLineSegment(linePositions, idx);
					if (ray.visible) {
						ray.css2d.visible = false;
						(ray.css2d.element as HTMLElement).style.opacity = '0';
						ray.visible = false;
					}
				}
				needsUpdate = true;
			} else {
				if (isTransitioningOut) {
					zeroLineSegment(linePositions, idx);
					if (!ray.visible) {
						ray.css2d.visible = true;
						ray.visible = true;
					}
					(ray.css2d.element as HTMLElement).style.opacity = String(currentOpacity);
					needsUpdate = true;
				} else if (ray.visible) {
					zeroLineSegment(linePositions, idx);
					ray.css2d.visible = false;
					(ray.css2d.element as HTMLElement).style.opacity = '0';
					ray.visible = false;
					needsUpdate = true;
				}
			}
		}

		if (needsUpdate) {
			posAttr.needsUpdate = true;
		}
	}

	function promoteRay(
		iconName: string,
		screenshotUrl: string,
		targetPos: THREE.Vector3,
		targetSize: number
	) {
		for (const ray of rays) {
			if (ray.icon.name === iconName && !ray.promoted) {
				ray.promoted = true;
				ray.frozen = false;
				ray.targetLocalPos = targetPos.clone();
				ray.startLocalPos = ray.css2d.position.clone();
				ray.transitionStart = -1; // set on first update frame

				ray.screenshotEl.style.backgroundImage = `url(${screenshotUrl})`;
				const el = ray.css2d.element as HTMLElement;
				el.style.setProperty('--promoted-size', `${targetSize}px`);
				el.classList.add('-promoted');
				ray.css2d.renderOrder = PROMOTED_RENDER_ORDER;
				break;
			}
		}
	}

	function demoteAll() {
		for (const ray of rays) {
			if (ray.promoted || ray.frozen) {
				ray.promoted = false;
				ray.frozen = false;
				ray.targetLocalPos = null;
				ray.startLocalPos = null;
				ray.transitionStart = -1;
				const el = ray.css2d.element as HTMLElement;
				el.classList.remove('-promoted');
				el.style.removeProperty('--promoted-size');
				ray.css2d.renderOrder = 0;
			}
		}
	}

	function setOpacity(opacity: number) {
		currentOpacity = opacity;
		lineMaterial.opacity = opacity * 0.6;
		for (const ray of rays) {
			if (ray.visible) {
				(ray.css2d.element as HTMLElement).style.opacity = String(opacity);
			}
		}
	}

	function setColor(hex: string) {
		lineMaterial.color.set(hex);
	}

	function dispose() {
		lineGeometry.dispose();
		lineMaterial.dispose();
		for (const ray of rays) {
			ray.css2d.element.remove();
			renderGroup.remove(ray.css2d);
		}
	}

	setOpacity(0);

	return { renderGroup, meshGroup, update, setOpacity, setColor, promoteRay, demoteAll, dispose };
}

function smoothStep(t: number): number {
	return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function zeroLineSegment(positions: Float32Array, idx: number) {
	positions[idx] = 0;
	positions[idx + 1] = 0;
	positions[idx + 2] = 0;
	positions[idx + 3] = 0;
	positions[idx + 4] = 0;
	positions[idx + 5] = 0;
}

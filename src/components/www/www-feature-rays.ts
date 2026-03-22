import * as THREE from 'three';

const RAY_LENGTH = 0.6;
const RAY_LENGTH_PROMOTED = 0.9;
const PROMOTION_SPEED = 3.0; // promotionProgress units per second
const PROMOTED_RENDER_ORDER = 100;

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

export interface FeatureRaysConfig {
	mesh: THREE.Mesh;
	side: 'left' | 'right';
	icons: RayIcon[];
	color: string;
	rayCount: number;
}

export interface FeatureRaysSystem {
	renderGroup: THREE.Group;  // lines + CSS2D — does NOT rotate with body
	meshGroup: THREE.Group;    // invisible mesh — DOES rotate with body
	update(elapsed: number, camera?: THREE.Camera): void;
	setOpacity(opacity: number): void;
	setColor(hex: string): void;
	promoteRay(iconName: string, screenshotUrl: string): void;
	demoteAll(): void;
	dispose(): void;
}

interface FeatureRay {
	scanSpeed: number;
	scanPhase: number;
	scanAmplitude: number;
	scanCenter: number;
	azimuth: number;       // angle around Y axis in mesh-local space
	icon: RayIcon;
	css2d: InstanceType<typeof import('three/addons/renderers/CSS2DRenderer.js').CSS2DObject>;
	visible: boolean;
	// Promotion state
	promoted: boolean;
	promotionProgress: number;  // 0 = normal icon, 1 = full screenshot card
	frozen: boolean;            // true once fully promoted — stop all position updates
	lockedScanCenter: number;
	lockedAzimuth: number;
	screenshotEl: HTMLDivElement;
}

export function getIconsForSide(side: 'left' | 'right'): RayIcon[] {
	return side === 'left' ? MALE_ICONS : FEMALE_ICONS;
}

export async function createFeatureRays(config: FeatureRaysConfig): Promise<FeatureRaysSystem> {
	const { CSS2DObject: CSS2DObjectClass } = await import(
		'three/addons/renderers/CSS2DRenderer.js'
	);

	const { mesh, side, icons, color, rayCount } = config;

	// Create groups
	const renderGroup = new THREE.Group();
	const meshGroup = new THREE.Group();

	// Clone mesh for raycasting — keep Object3D visible (needed for raycasting)
	// but use an invisible material so it doesn't render
	const raycastMesh = mesh.clone();
	raycastMesh.material = new THREE.MeshBasicMaterial({
		visible: false
	});
	meshGroup.add(raycastMesh);

	// Raycaster
	const raycaster = new THREE.Raycaster();
	const rayOrigin = new THREE.Vector3();
	const rayDirection = new THREE.Vector3();

	// Cast distance — far enough to be outside any body mesh
	const CAST_RADIUS = 2.5;

	let lastElapsed = 0;

	// Build per-ray state — distribute azimuth evenly around the body
	const rays: FeatureRay[] = [];
	for (let i = 0; i < rayCount; i++) {
		const icon = icons[i % icons.length];

		const div = document.createElement('div');
		div.className = 'feature-ray-icon';
		div.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg"><use href="${icon.sprite}#${icon.name}"></use></svg>`;

		// Add screenshot container (hidden by default, uses background-image)
		const screenshotEl = document.createElement('div');
		screenshotEl.className = 'feature-ray-screenshot';
		div.appendChild(screenshotEl);

		const css2d = new CSS2DObjectClass(div);
		css2d.visible = false;
		renderGroup.add(css2d);

		// Spread azimuth evenly around full circle with a small random jitter
		const baseAzimuth = (i / rayCount) * Math.PI * 2;
		const jitter = (Math.random() - 0.5) * (Math.PI * 2 / rayCount) * 0.5;

		// Distribute scanCenter across full body height (~3 units, centered at 0)
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
			promoted: false,
			promotionProgress: 0,
			frozen: false,
			lockedScanCenter: 0,
			lockedAzimuth: 0,
			screenshotEl
		});
	}

	// Line geometry: 2 vertices per ray (start + end), using LineSegments
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

	// Reusable temp objects (allocated once)
	const hitPoint = new THREE.Vector3();
	const outwardDir = new THREE.Vector3();
	const worldQuat = new THREE.Quaternion();
	const invMatrix = new THREE.Matrix4();
	const tempVec = new THREE.Vector3();
	const ndcVec = new THREE.Vector3();
	let currentOpacity = 0;

	// Viewport margin in NDC units
	const NDC_MARGIN = 0.92;

	function update(elapsed: number, camera?: THREE.Camera) {
		const dt = elapsed - lastElapsed;
		lastElapsed = elapsed;

		let needsUpdate = false;

		// Update promotion progress for all rays
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

			// Frozen rays are fully promoted — skip all position updates
			if (ray.frozen) continue;

			const pp = ray.promotionProgress; // 0-1

			// Compute scanning Y position — snap to locked when promoted (no lerp)
			const scanningY = ray.scanCenter + ray.scanAmplitude * Math.sin(elapsed * ray.scanSpeed + ray.scanPhase);
			const scanY = ray.promoted ? ray.lockedScanCenter : scanningY;

			// Effective azimuth — snap to locked when promoted
			const frontAz = -meshWorldRotY;
			const spreadAngle = ((ray.azimuth % (Math.PI * 2)) / (Math.PI * 2)) * Math.PI - Math.PI / 2;
			const normalAz = frontAz + spreadAngle;
			const az = ray.promoted ? frontAz + ray.lockedAzimuth : normalAz;

			// Interpolate ray length based on promotion
			const currentRayLength = lerp(RAY_LENGTH, RAY_LENGTH_PROMOTED, pp);

			const originX = Math.sin(az) * CAST_RADIUS;
			const originZ = Math.cos(az) * CAST_RADIUS;
			rayOrigin.set(originX, scanY, originZ);
			rayOrigin.applyMatrix4(meshGroup.matrixWorld);

			rayDirection.set(-Math.sin(az), 0, -Math.cos(az)).normalize();
			rayDirection.applyQuaternion(worldQuat);

			raycaster.set(rayOrigin, rayDirection);
			const intersections = raycaster.intersectObject(raycastMesh, false);

			const idx = i * 6;

			const isPromoted = ray.promoted || pp > 0;

			if (intersections.length > 0) {
				hitPoint.copy(intersections[0].point);

				outwardDir.set(Math.sin(az), 0, Math.cos(az)).normalize();
				outwardDir.applyQuaternion(worldQuat);

				tempVec.copy(hitPoint).addScaledVector(outwardDir, currentRayLength);

				// Promoted rays: clamp endpoint to stay within viewport with margin
				// Non-promoted rays: cull if outside viewport
				let inViewport = true;
				if (camera) {
					ndcVec.copy(tempVec).project(camera);
					if (isPromoted) {
						// Clamp center so the full circle (up to 280px) + 20px margin stays on-screen
						// NDC spans -1 to 1 = viewport width, so half-viewport = 1.0 NDC
						const halfWidth = 160; // 280/2 + 20px margin
						const halfHeight = 160;
						const marginX = halfWidth / (window.innerWidth / 2);
						const marginY = halfHeight / (window.innerHeight / 2);
						const maxX = 1.0 - marginX;
						const maxY = 1.0 - marginY;
						const clampedX = Math.max(-maxX, Math.min(maxX, ndcVec.x));
						const clampedY = Math.max(-maxY, Math.min(maxY, ndcVec.y));
						if (clampedX !== ndcVec.x || clampedY !== ndcVec.y) {
							ndcVec.x = clampedX;
							ndcVec.y = clampedY;
							// Unproject clamped NDC back to world space at same depth
							tempVec.copy(ndcVec).unproject(camera);
						}
					} else {
						if (
							Math.abs(ndcVec.x) > NDC_MARGIN ||
							Math.abs(ndcVec.y) > NDC_MARGIN ||
							ndcVec.z < 0 || ndcVec.z > 1
						) {
							inViewport = false;
						}
					}
				}

				const localHit = hitPoint.clone().applyMatrix4(invMatrix);
				const localEnd = tempVec.clone().applyMatrix4(invMatrix);

				if (inViewport) {
					linePositions[idx] = localHit.x;
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

					// Freeze promoted ray after first successful position set
					if (ray.promoted && !ray.frozen) {
						ray.frozen = true;
					}
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
				// Raycast miss — promoted rays keep last known position, others hide
				if (isPromoted) {
					// Keep visible at last known css2d position, just zero the line
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

	function promoteRay(iconName: string, screenshotUrl: string) {
		for (const ray of rays) {
			if (ray.icon.name === iconName && !ray.promoted) {
				ray.promoted = true;
				// Lock height with random jitter for variety across transitions
				const baseY = side === 'left' ? -0.7 : 0.2;
				ray.lockedScanCenter = baseY + (Math.random() - 0.5) * 0.6;
				// Lock azimuth with jitter
				const baseAz = side === 'left' ? 0.4 : 0.3;
				ray.lockedAzimuth = baseAz + (Math.random() - 0.5) * 0.4;
				// Set screenshot
				ray.screenshotEl.style.backgroundImage = `url(${screenshotUrl})`;
				// Add promoted CSS class — right side gets smaller variant
				const el = ray.css2d.element as HTMLElement;
				el.classList.add('-promoted');
				if (side === 'right') el.classList.add('-promoted-small');
				// Use renderOrder so CSS2DRenderer sorts promoted above normal labels
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
				const el = ray.css2d.element as HTMLElement;
				el.classList.remove('-promoted', '-promoted-small');
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

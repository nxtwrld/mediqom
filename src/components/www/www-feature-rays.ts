import * as THREE from 'three';

const RAY_LENGTH = 0.6;

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
	update(elapsed: number): void;
	setOpacity(opacity: number): void;
	setColor(hex: string): void;
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
		visible: false // Material.visible=false prevents rendering, but Object3D.visible=true allows raycasting
	});
	meshGroup.add(raycastMesh);

	// Raycaster
	const raycaster = new THREE.Raycaster();
	const rayOrigin = new THREE.Vector3();
	const rayDirection = new THREE.Vector3();

	// Cast distance — far enough to be outside any body mesh
	const CAST_RADIUS = 2.5;

	// Build per-ray state — distribute azimuth evenly around the body
	const rays: FeatureRay[] = [];
	for (let i = 0; i < rayCount; i++) {
		const icon = icons[i % icons.length];

		const div = document.createElement('div');
		div.className = 'feature-ray-icon';
		div.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg"><use href="${icon.sprite}#${icon.name}"></use></svg>`;

		const css2d = new CSS2DObjectClass(div);
		css2d.visible = false;
		renderGroup.add(css2d);

		// Spread azimuth evenly around full circle with a small random jitter
		const baseAzimuth = (i / rayCount) * Math.PI * 2;
		const jitter = (Math.random() - 0.5) * (Math.PI * 2 / rayCount) * 0.5;

		// Distribute scanCenter across full body height (~3 units, centered at 0)
		// Spread evenly from -1.3 to 1.3 with slight random offset
		const baseY = -1.3 + (i / (rayCount - 1 || 1)) * 2.6;
		const yJitter = (Math.random() - 0.5) * 0.4;

		rays.push({
			scanSpeed: 0.15 + Math.random() * 0.25,
			scanPhase: Math.random() * Math.PI * 2,
			scanAmplitude: 0.1 + Math.random() * 0.15,   // small vertical wobble
			scanCenter: baseY + yJitter,                   // spread head to heels
			azimuth: baseAzimuth + jitter,
			icon,
			css2d,
			visible: false
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
	let currentOpacity = 0;

	function update(elapsed: number) {
		let needsUpdate = false;

		// Update world matrices once per frame
		meshGroup.updateMatrixWorld(true);
		renderGroup.updateMatrixWorld(true);
		meshGroup.getWorldQuaternion(worldQuat);
		invMatrix.copy(renderGroup.matrixWorld).invert();

		// Get the mesh rotation around Y so we can cast from the camera-facing side
		// The mesh rotates via meshGroup.rotation.y (plus parent group transforms)
		// We need the effective Y rotation to know which local azimuth faces camera (world +Z)
		const meshWorldRotY = Math.atan2(
			meshGroup.matrixWorld.elements[8],  // m31
			meshGroup.matrixWorld.elements[10]  // m33
		);

		for (let i = 0; i < rays.length; i++) {
			const ray = rays[i];

			// Compute scanning Y position
			const scanY =
				ray.scanCenter + ray.scanAmplitude * Math.sin(elapsed * ray.scanSpeed + ray.scanPhase);

			// Effective azimuth: ray's base azimuth, but we offset by mesh rotation
			// so rays always distribute around the camera-facing hemisphere.
			// The camera looks down -Z, so "front" in world space is +Z direction.
			// In mesh-local space, the front-facing azimuth = -meshWorldRotY
			// We offset each ray's azimuth relative to this front direction,
			// clamping to the front semicircle so endpoints always face the camera.
			const frontAz = -meshWorldRotY;
			// Map ray azimuth into front hemisphere: spread across [-π/2, π/2] around front
			const spreadAngle = ((ray.azimuth % (Math.PI * 2)) / (Math.PI * 2)) * Math.PI - Math.PI / 2;
			const az = frontAz + spreadAngle;

			const originX = Math.sin(az) * CAST_RADIUS;
			const originZ = Math.cos(az) * CAST_RADIUS;
			rayOrigin.set(originX, scanY, originZ);
			rayOrigin.applyMatrix4(meshGroup.matrixWorld);

			// Direction: inward toward body center
			rayDirection.set(-Math.sin(az), 0, -Math.cos(az)).normalize();
			rayDirection.applyQuaternion(worldQuat);

			raycaster.set(rayOrigin, rayDirection);
			const intersections = raycaster.intersectObject(raycastMesh, false);

			const idx = i * 6;

			if (intersections.length > 0) {
				hitPoint.copy(intersections[0].point);

				// Outward direction: from body center outward at this azimuth
				outwardDir.set(Math.sin(az), 0, Math.cos(az)).normalize();
				outwardDir.applyQuaternion(worldQuat);

				// Endpoint in world space
				tempVec.copy(hitPoint).addScaledVector(outwardDir, RAY_LENGTH);

				// Convert hit + endpoint to renderGroup local space
				const localHit = hitPoint.clone().applyMatrix4(invMatrix);
				const localEnd = tempVec.clone().applyMatrix4(invMatrix);

				linePositions[idx] = localHit.x;
				linePositions[idx + 1] = localHit.y;
				linePositions[idx + 2] = localHit.z;
				linePositions[idx + 3] = localEnd.x;
				linePositions[idx + 4] = localEnd.y;
				linePositions[idx + 5] = localEnd.z;

				// CSS2D position in renderGroup local space
				ray.css2d.position.copy(localEnd);

				if (!ray.visible) {
					ray.css2d.visible = true;
					ray.visible = true;
				}
				(ray.css2d.element as HTMLElement).style.opacity = String(currentOpacity);

				needsUpdate = true;
			} else {
				// Miss — hide this ray
				if (ray.visible) {
					linePositions[idx] = 0;
					linePositions[idx + 1] = 0;
					linePositions[idx + 2] = 0;
					linePositions[idx + 3] = 0;
					linePositions[idx + 4] = 0;
					linePositions[idx + 5] = 0;

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

	return { renderGroup, meshGroup, update, setOpacity, setColor, dispose };
}

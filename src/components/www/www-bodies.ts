import * as THREE from 'three';

const MALE_URL = '/anatomy_models/male_integumentary_system_obj/integumentary_system.obj';
const FEMALE_URL = '/anatomy_models/female_integumentary_system_obj/integumentary_system.obj';

const TARGET_HEIGHT = 3;
const FEMALE_HEIGHT = 2.8;
const MALE_X = -0.9;
const FEMALE_X = 0.9;
const MALE_ROTATION_Y = Math.PI * 0.15; // face slightly right
const FEMALE_ROTATION_Y = -Math.PI * 0.15; // face slightly left

const PATHS_DESKTOP = 6;
const PATHS_MOBILE = 4;
const MAX_POINTS_DESKTOP = 3333;
const MAX_POINTS_MOBILE = 2000;
const DISTANCE_THRESHOLD = 0.12;
const MIN_NORMAL_DOT = 0.3; // reject if normals diverge too much (cos ~73°)
const MAX_SAMPLE_ATTEMPTS = 150;
const POINTS_PER_FRAME = 3;
const ROTATION_SPEED = 0.004;

const HERO_SPREAD = 2.1;          // ~25% from viewport edge (visible half-width ≈ 2.8)
const FEATURE_SPREAD = 0.4;
const FEATURE_OFFSET_X = 1.8;
const SPIN_EXTRA = Math.PI * 2;
const POSITION_DURATION = 0.8;

const FADE_DURATION = 15.0; // seconds before a point fully fades
const BASE_OPACITY = 0.5;
const LINE_BASE_COLOR = '#16d3dd';

const COLOR_PALETTE = ['#16d3dd', '#29cc97', '#a989ee', '#e9a642', '#3571ff'];
const COLOR_ROTATE_INTERVAL = 8.0;  // seconds between color changes
const COLOR_TRANSITION = 2.0;       // seconds to transition between colors

const VERTEX_SHADER = /* glsl */ `
attribute float aBirthTime;
attribute vec3 aColor;
uniform float uTime;
uniform float uFadeDuration;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vColor = aColor;
  float age = uTime - aBirthTime;
  vAlpha = 1.0 - clamp(age / uFadeDuration, 0.0, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT_SHADER = /* glsl */ `
uniform float uBaseOpacity;
varying vec3 vColor;
varying float vAlpha;

void main() {
  if (vAlpha < 0.01) discard;
  gl_FragColor = vec4(vColor, vAlpha * uBaseOpacity);
}
`;

export interface WwwBodiesSystem {
	group: THREE.Group;
	update(): void;
	setPosition(position: 'center' | 'left' | 'right', duration?: number): void;
	dispose(): void;
	readonly loaded: boolean;
}

class Path {
	private positions: Float32Array;
	private posAttr: THREE.BufferAttribute;
	private birthTimes: Float32Array;
	private birthAttr: THREE.BufferAttribute;
	private colors: Float32Array;
	private colorAttr: THREE.BufferAttribute;
	private geometry: THREE.BufferGeometry;
	private line: THREE.Line;
	private pointCount = 1;
	private maxPoints: number;
	private sampler: InstanceType<
		typeof import('three/examples/jsm/math/MeshSurfaceSampler.js').MeshSurfaceSampler
	>;
	private lastPoint = new THREE.Vector3();
	private lastNormal = new THREE.Vector3();
	private tempPosition = new THREE.Vector3();
	private tempNormal = new THREE.Vector3();
	private threshold: number;
	private done = false;
	private stalledFrames = 0;
	private activeColor = { r: 1, g: 1, b: 1 };
	private clock: THREE.Clock;
	private lastBirthTime: number;
	private offset: THREE.Vector3;

	constructor(
		sampler: Path['sampler'],
		material: THREE.ShaderMaterial,
		maxPoints: number,
		threshold: number,
		offset: THREE.Vector3,
		rotationY: number,
		clock: THREE.Clock,
		initialColor: { r: number; g: number; b: number }
	) {
		this.sampler = sampler;
		this.maxPoints = maxPoints;
		this.threshold = threshold;
		this.clock = clock;
		this.offset = offset;
		this.activeColor = { ...initialColor };

		const now = clock.getElapsedTime();
		this.lastBirthTime = now;

		// Pre-allocate buffers with DynamicDrawUsage for frequent updates
		this.positions = new Float32Array(maxPoints * 3);
		this.posAttr = new THREE.BufferAttribute(this.positions, 3);
		this.posAttr.setUsage(THREE.DynamicDrawUsage);

		this.birthTimes = new Float32Array(maxPoints);
		this.birthAttr = new THREE.BufferAttribute(this.birthTimes, 1);
		this.birthAttr.setUsage(THREE.DynamicDrawUsage);

		this.colors = new Float32Array(maxPoints * 3);
		this.colorAttr = new THREE.BufferAttribute(this.colors, 3);
		this.colorAttr.setUsage(THREE.DynamicDrawUsage);

		this.geometry = new THREE.BufferGeometry();
		this.geometry.setAttribute('position', this.posAttr);
		this.geometry.setAttribute('aBirthTime', this.birthAttr);
		this.geometry.setAttribute('aColor', this.colorAttr);

		// Sample initial point (with normal)
		this.sampler.sample(this.tempPosition, this.tempNormal);
		this.positions[0] = this.tempPosition.x;
		this.positions[1] = this.tempPosition.y;
		this.positions[2] = this.tempPosition.z;
		this.birthTimes[0] = now;
		this.colors[0] = this.activeColor.r;
		this.colors[1] = this.activeColor.g;
		this.colors[2] = this.activeColor.b;
		this.lastPoint.copy(this.tempPosition);
		this.lastNormal.copy(this.tempNormal);

		this.geometry.setDrawRange(0, 1);

		this.line = new THREE.Line(this.geometry, material);
		this.line.position.copy(offset);
		this.line.rotation.y = rotationY;
		this.line.frustumCulled = false;
	}

	get mesh(): THREE.Line {
		return this.line;
	}

	setActiveColor(r: number, g: number, b: number): void {
		this.activeColor.r = r;
		this.activeColor.g = g;
		this.activeColor.b = b;
	}

	/** Check if path is done AND all points have faded */
	canRecycle(currentTime: number): boolean {
		return this.done && currentTime - this.lastBirthTime > FADE_DURATION;
	}

	restart(): void {
		const now = this.clock.getElapsedTime();
		this.lastBirthTime = now;
		this.pointCount = 1;
		this.done = false;
		this.stalledFrames = 0;

		// Sample new starting point (with normal)
		this.sampler.sample(this.tempPosition, this.tempNormal);
		this.positions[0] = this.tempPosition.x;
		this.positions[1] = this.tempPosition.y;
		this.positions[2] = this.tempPosition.z;
		this.birthTimes[0] = now;
		this.colors[0] = this.activeColor.r;
		this.colors[1] = this.activeColor.g;
		this.colors[2] = this.activeColor.b;
		this.lastPoint.copy(this.tempPosition);
		this.lastNormal.copy(this.tempNormal);

		this.posAttr.needsUpdate = true;
		this.birthAttr.needsUpdate = true;
		this.colorAttr.needsUpdate = true;
		this.geometry.setDrawRange(0, 1);
	}

	update(): void {
		if (this.done) return;

		const now = this.clock.getElapsedTime();
		let added = false;

		for (let p = 0; p < POINTS_PER_FRAME; p++) {
			if (this.pointCount >= this.maxPoints) {
				this.done = true;
				break;
			}

			// Find a nearby point on the surface
			let found = false;
			let attempts = 0;

			while (!found && attempts < MAX_SAMPLE_ATTEMPTS) {
				this.sampler.sample(this.tempPosition, this.tempNormal);
				if (
					this.tempPosition.distanceTo(this.lastPoint) < this.threshold &&
					this.lastNormal.dot(this.tempNormal) > MIN_NORMAL_DOT
				) {
					found = true;
				}
				attempts++;
			}

			if (!found) continue;

			const idx = this.pointCount;
			const i3 = idx * 3;
			this.positions[i3] = this.tempPosition.x;
			this.positions[i3 + 1] = this.tempPosition.y;
			this.positions[i3 + 2] = this.tempPosition.z;
			this.birthTimes[idx] = now;
			this.colors[i3] = this.activeColor.r;
			this.colors[i3 + 1] = this.activeColor.g;
			this.colors[i3 + 2] = this.activeColor.b;
			this.lastPoint.copy(this.tempPosition);
			this.lastNormal.copy(this.tempNormal);
			this.lastBirthTime = now;
			this.pointCount++;
			added = true;
		}

		if (added) {
			this.stalledFrames = 0;
			this.posAttr.needsUpdate = true;
			this.birthAttr.needsUpdate = true;
			this.colorAttr.needsUpdate = true;
			this.geometry.setDrawRange(0, this.pointCount);
		} else {
			this.stalledFrames++;
			// If stuck for several frames, jump to a new random surface point
			if (this.stalledFrames > 3) {
				this.sampler.sample(this.tempPosition, this.tempNormal);
				this.lastPoint.copy(this.tempPosition);
				this.lastNormal.copy(this.tempNormal);
				this.stalledFrames = 0;
			}
		}
	}

	dispose(): void {
		this.geometry.dispose();
	}
}

/**
 * Bake scale + center transform into geometry vertices directly.
 * MeshSurfaceSampler reads raw geometry, so transforms must be in vertices.
 */
function normalizeModel(mesh: THREE.Mesh, targetHeight: number): void {
	const geometry = mesh.geometry;

	// Ensure vertex normals exist so MeshSurfaceSampler can interpolate them
	if (!geometry.getAttribute('normal')) {
		geometry.computeVertexNormals();
	}

	geometry.computeBoundingBox();
	const box = geometry.boundingBox!;
	const size = new THREE.Vector3();
	const center = new THREE.Vector3();
	box.getSize(size);
	box.getCenter(center);

	const scale = targetHeight / size.y;

	const matrix = new THREE.Matrix4();
	matrix.makeTranslation(-center.x, -center.y, -center.z);
	const scaleMatrix = new THREE.Matrix4();
	scaleMatrix.makeScale(scale, scale, scale);
	matrix.premultiply(scaleMatrix);

	geometry.applyMatrix4(matrix);
}

async function loadModel(url: string): Promise<THREE.Mesh> {
	const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
	const { mergeGeometries } = await import('three/examples/jsm/utils/BufferGeometryUtils.js');
	return new Promise((resolve, reject) => {
		new OBJLoader().load(
			url,
			(obj) => {
				// Try to find the "body" mesh first; fall back to merging all meshes
				let bodyMesh: THREE.Mesh | null = null;
				const geometries: THREE.BufferGeometry[] = [];

				obj.traverse((child) => {
					if (child instanceof THREE.Mesh) {
						if (child.name === 'body') {
							bodyMesh = child;
						}
						geometries.push(child.geometry);
					}
				});

				if (bodyMesh) {
					resolve(bodyMesh);
				} else if (geometries.length > 0) {
					// Merge all geometries into a single mesh
					const merged = mergeGeometries(geometries);
					if (merged) {
						resolve(new THREE.Mesh(merged));
					} else {
						reject(new Error('Failed to merge geometries'));
					}
				} else {
					reject(new Error('No mesh found in OBJ'));
				}
			},
			undefined,
			reject
		);
	});
}

function smoothStep(t: number): number {
	return t * t * (3 - 2 * t);
}

export function createWwwBodies(isMobile: boolean): WwwBodiesSystem {
	const group = new THREE.Group();
	const clock = new THREE.Clock(true);

	const pathCount = isMobile ? PATHS_MOBILE : PATHS_DESKTOP;
	const maxPoints = isMobile ? MAX_POINTS_MOBILE : MAX_POINTS_DESKTOP;

	const sharedMaterial = new THREE.ShaderMaterial({
		vertexShader: VERTEX_SHADER,
		fragmentShader: FRAGMENT_SHADER,
		transparent: true,
		depthTest: false,
		depthWrite: false,
		uniforms: {
			uTime: { value: 0 },
			uFadeDuration: { value: FADE_DURATION },
			uBaseOpacity: { value: BASE_OPACITY }
		}
	});

	const paths: Path[] = [];
	let _loaded = false;

	// Color auto-rotation state
	const paletteColors = COLOR_PALETTE.map((hex) => new THREE.Color(hex));
	let colorIndex = 0;
	let colorFrom = paletteColors[0].clone();
	let colorTo = paletteColors[0].clone();
	let currentColor = paletteColors[0].clone();
	let colorProgress = 1;
	let colorStartTime = 0;
	let colorNextChange = COLOR_ROTATE_INTERVAL;

	// Position transition state
	interface PositionTarget {
		groupX: number;
		maleX: number;
		femaleX: number;
	}

	function getPositionTarget(position: 'center' | 'left' | 'right'): PositionTarget {
		if (position === 'center') {
			return { groupX: 0, maleX: -HERO_SPREAD, femaleX: HERO_SPREAD };
		}
		const sign = position === 'left' ? -1 : 1;
		return { groupX: sign * FEATURE_OFFSET_X, maleX: -FEATURE_SPREAD, femaleX: FEATURE_SPREAD };
	}

	let posFrom: PositionTarget = getPositionTarget('center');
	let posTo: PositionTarget = getPositionTarget('center');
	let posCurrent: PositionTarget = { ...posFrom };
	let posProgress = 1;
	let posDuration = POSITION_DURATION;
	let posStartTime = 0;
	let spinFrom = 0;
	let spinExtra = 0;
	let rotationAngle = 0;
	let currentPosition: 'center' | 'left' | 'right' = 'center';

	async function initBodies() {
		try {
			const { MeshSurfaceSampler } = await import(
				'three/examples/jsm/math/MeshSurfaceSampler.js'
			);

			const [maleMesh, femaleMesh] = await Promise.all([
				loadModel(MALE_URL),
				loadModel(FEMALE_URL)
			]);

			// Bake normalization into geometry so sampler reads correct coordinates
			normalizeModel(maleMesh, TARGET_HEIGHT);
			normalizeModel(femaleMesh, FEMALE_HEIGHT);

			const maleSampler = new MeshSurfaceSampler(maleMesh).build();
			const femaleSampler = new MeshSurfaceSampler(femaleMesh).build();

			const maleOffset = new THREE.Vector3(MALE_X, 0, 0);
			const femaleOffset = new THREE.Vector3(FEMALE_X, 0, 0);

			const initColor = { r: paletteColors[0].r, g: paletteColors[0].g, b: paletteColors[0].b };

			for (let i = 0; i < pathCount; i++) {
				const malePath = new Path(
					maleSampler,
					sharedMaterial,
					maxPoints,
					DISTANCE_THRESHOLD,
					maleOffset,
					MALE_ROTATION_Y,
					clock,
					initColor
				);
				paths.push(malePath);
				group.add(malePath.mesh);

				const femalePath = new Path(
					femaleSampler,
					sharedMaterial,
					maxPoints,
					DISTANCE_THRESHOLD,
					femaleOffset,
					FEMALE_ROTATION_Y,
					clock,
					initColor
				);
				paths.push(femalePath);
				group.add(femalePath.mesh);
			}

			// Apply current position to group and paths
			group.position.x = posCurrent.groupX;
			for (let i = 0; i < paths.length; i++) {
				const targetX = i % 2 === 0 ? posCurrent.maleX : posCurrent.femaleX;
				paths[i].mesh.position.x = targetX;
			}

			_loaded = true;
		} catch (err) {
			console.error('Failed to load body models:', err);
		}
	}

	// Start loading immediately
	initBodies();

	function update() {
		if (!_loaded) return;

		const elapsed = clock.getElapsedTime();

		// Update shared time uniform
		sharedMaterial.uniforms.uTime.value = elapsed;

		// Auto-rotate color
		// Auto-rotate color on interval
		if (elapsed >= colorNextChange && colorProgress >= 1) {
			colorIndex = (colorIndex + 1) % paletteColors.length;
			colorFrom.copy(currentColor);
			colorTo.copy(paletteColors[colorIndex]);
			colorProgress = 0;
			colorStartTime = elapsed;
			colorNextChange = elapsed + COLOR_ROTATE_INTERVAL;
		}
		if (colorProgress < 1) {
			colorProgress = Math.min(1, (elapsed - colorStartTime) / COLOR_TRANSITION);
			const t = smoothStep(colorProgress);
			currentColor.copy(colorFrom).lerp(colorTo, t);
		}

		// Push current color to all paths
		for (const path of paths) {
			path.setActiveColor(currentColor.r, currentColor.g, currentColor.b);
		}

		// Grow lines & recycle finished paths
		for (const path of paths) {
			path.update();
			if (path.canRecycle(elapsed)) {
				path.restart();
			}
		}

		// Position transition
		if (posProgress < 1) {
			posProgress = Math.min(1, (elapsed - posStartTime) / posDuration);
			const t = smoothStep(posProgress);
			posCurrent.groupX = posFrom.groupX + (posTo.groupX - posFrom.groupX) * t;
			posCurrent.maleX = posFrom.maleX + (posTo.maleX - posFrom.maleX) * t;
			posCurrent.femaleX = posFrom.femaleX + (posTo.femaleX - posFrom.femaleX) * t;

			group.position.x = posCurrent.groupX;

			// Rotation during transition: base spin + extra spin
			const timeSinceStart = elapsed - posStartTime;
			rotationAngle = spinFrom + timeSinceStart * ROTATION_SPEED + spinExtra * t;
		} else {
			rotationAngle += ROTATION_SPEED;
		}

		// Apply rotation and position to each mesh individually
		// (rotating each mesh keeps them turning in sync without orbiting the group center)
		for (let i = 0; i < paths.length; i++) {
			const baseRotY = i % 2 === 0 ? MALE_ROTATION_Y : FEMALE_ROTATION_Y;
			paths[i].mesh.rotation.y = baseRotY + rotationAngle;
			if (posProgress < 1) {
				const targetX = i % 2 === 0 ? posCurrent.maleX : posCurrent.femaleX;
				paths[i].mesh.position.x = targetX;
			}
		}
	}

	function setPosition(position: 'center' | 'left' | 'right', duration = POSITION_DURATION) {
		if (position === currentPosition) return;
		const movingRight = (position === 'right') || (position === 'center' && currentPosition === 'left');

		posFrom = { ...posCurrent };
		posTo = getPositionTarget(position);
		posProgress = 0;
		posDuration = duration;
		posStartTime = clock.getElapsedTime();
		spinFrom = rotationAngle;
		spinExtra = movingRight ? SPIN_EXTRA : -SPIN_EXTRA;
		currentPosition = position;
	}

	function dispose() {
		for (const path of paths) {
			path.dispose();
		}
		sharedMaterial.dispose();
		clock.stop();
	}

	return {
		group,
		update,
		setPosition,
		dispose,
		get loaded() {
			return _loaded;
		}
	};
}

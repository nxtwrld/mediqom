import * as THREE from 'three';
import { isTouchDevice } from '$lib/device';

const PARTICLE_COUNT_DESKTOP = 8192;
const PARTICLE_COUNT_MOBILE = 4096;

let points: THREE.Points | null = null;
let material: THREE.ShaderMaterial | null = null;
let geometry: THREE.BufferGeometry | null = null;
let parentScene: THREE.Scene | null = null;
const clock = new THREE.Clock(false);

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform vec3  uCenter;
  uniform float uHeight;
  uniform float uRadius;

  attribute float aOffset;       // position along the closed loop [0, 1]
  attribute float aRadiusScale;
  attribute float aAngleJitter;  // small angular spread around the spine
  attribute float aSize;
  attribute float aAlpha;

  varying float vAlpha;
  varying float vHeat;

  void main() {
    // Single closed loop: t wraps seamlessly 0→1→0
    float t = fract(uTime * 0.08 + aOffset);

    // Y: one full sine cycle = up then back down, no endpoints
    float y = sin(t * 6.2832) * 0.5 * uHeight;

    // Angle: continuous rotation along the loop + slow global spin
    float angle = t * 6.2832 * 3.0 + uTime * 0.3 + aAngleJitter;

    float r = uRadius * aRadiusScale;

    vec3 pos = uCenter + vec3(cos(angle) * r, y, sin(angle) * r);

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPos;

    // Size attenuation
    gl_PointSize = aSize * (80.0 / -mvPos.z);

    // Twinkle animation
    float twinkle = 0.7 + 0.3 * sin(uTime * 3.0 + aOffset * 40.0);
    vAlpha = aAlpha * twinkle;

    // Color oscillation: 0 = amber, 1 = red — varies per particle over time
    vHeat = 0.5 + 0.5 * sin(uTime * 1.5 + aOffset * 20.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying float vAlpha;
  varying float vHeat;

  void main() {
    // Soft circular point with edge falloff
    float dist = length(gl_PointCoord - vec2(0.5));
    float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
    alpha *= vAlpha;

    if (alpha < 0.01) discard;

    // Fiery color: mix amber (1.0, 0.75, 0.2) → red (1.0, 0.15, 0.05)
    vec3 amber = vec3(1.0, 0.75, 0.2);
    vec3 red   = vec3(1.0, 0.3, 0.1);
    vec3 color = mix(amber, red, vHeat) * 1.5;

    gl_FragColor = vec4(color, alpha);
  }
`;

export function createParticleSwarm(
	object: THREE.Object3D,
	scene: THREE.Scene,
	color?: THREE.Color
): void {
	removeParticleSwarm();

	const count = isTouchDevice() ? PARTICLE_COUNT_MOBILE : PARTICLE_COUNT_DESKTOP;

	// Compute bounding box dimensions
	const box = new THREE.Box3().setFromObject(object);
	const center = new THREE.Vector3();
	const size = new THREE.Vector3();
	box.getCenter(center);
	box.getSize(size);

	const height = size.y;
	const radius = Math.max(size.x, size.z) * 0.5;

	// Create per-particle attributes
	const offsets = new Float32Array(count);
	const radiusScales = new Float32Array(count);
	const angleJitters = new Float32Array(count);
	const sizes = new Float32Array(count);
	const alphas = new Float32Array(count);

	for (let i = 0; i < count; i++) {
		offsets[i] = i / count; // evenly distributed along the closed loop
		radiusScales[i] = 1.0 + Math.random() * 0.5; // 1.0–1.5
		angleJitters[i] = (Math.random() - 0.5) * 2.8; // ±1.4 rad (~80°) spread
		sizes[i] = 1.0 + Math.random() * 2.0; // 1.0–3.0
		alphas[i] = 0.2 + Math.random() * 0.3; // 0.2–0.5 (subtle)
	}

	geometry = new THREE.BufferGeometry();
	// Dummy position attribute (required by Three.js, actual positions computed in shader)
	geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
	geometry.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 1));
	geometry.setAttribute('aRadiusScale', new THREE.BufferAttribute(radiusScales, 1));
	geometry.setAttribute('aAngleJitter', new THREE.BufferAttribute(angleJitters, 1));
	geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
	geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));

	material = new THREE.ShaderMaterial({
		vertexShader,
		fragmentShader,
		uniforms: {
			uTime: { value: 0.0 },
			uCenter: { value: center },
			uHeight: { value: height },
			uRadius: { value: radius },
			uColor: { value: color ? color.clone() : new THREE.Color(0xffbf40) } // kept for API compat
		},
		blending: THREE.AdditiveBlending,
		transparent: true,
		depthWrite: false,
		depthTest: true
	});

	points = new THREE.Points(geometry, material);
	points.renderOrder = 998;
	points.raycast = () => {};
	points.name = '__particle_swarm__';

	parentScene = scene;
	scene.add(points);
	clock.start();
}

export function updateParticleSwarm(): void {
	if (!material || !clock.running) return;
	material.uniforms.uTime.value = clock.getElapsedTime();
}

export function removeParticleSwarm(): void {
	if (points && parentScene) {
		parentScene.remove(points);
	}
	if (geometry) {
		geometry.dispose();
		geometry = null;
	}
	if (material) {
		material.dispose();
		material = null;
	}
	points = null;
	parentScene = null;
	clock.stop();
}

import * as THREE from 'three';
import { isTouchDevice } from '$lib/device';

const PARTICLE_COUNT_DESKTOP = 32768;
const PARTICLE_COUNT_MOBILE = 16384;

export interface TransporterRing {
	points: THREE.Points;
	material: THREE.ShaderMaterial;
	geometry: THREE.BufferGeometry;
	scene: THREE.Scene;
}

const vertexShader = /* glsl */ `
	uniform float uTime;
	uniform vec3 uCenter;
	uniform float uRingY;
	uniform float uRadius;
	uniform float uBandWidth;
	uniform float uFade;
	uniform float uScale; // model scale factor for size attenuation

	attribute float aAngle;
	attribute float aRadiusJitter;
	attribute float aYJitter;
	attribute float aSize;
	attribute float aAlpha;
	attribute float aOffset;

	varying float vAlpha;
	varying float vHeat;
	varying float vRadius; // 0 = center, 1 = edge

	// Hash function for pseudo-random jumping
	float hash(float n) { return fract(sin(n) * 43758.5453); }

	void main() {
		// Each particle jumps to a new position at its own rate
		float jumpRate = 4.0 + aOffset * 12.0; // different particles jump at different speeds
		float jumpPhase = floor(uTime * jumpRate);
		float h1 = hash(aOffset * 1234.5 + jumpPhase);
		float h2 = hash(aOffset * 5678.9 + jumpPhase * 2.0);
		float h3 = hash(aOffset * 9012.3 + jumpPhase * 3.0);

		// Random angle with spin
		float angle = h1 * 6.2832 + uTime * 2.5;

		// Radius: biased toward center (energy sphere) with Saturn ring tail
		float baseR = aRadiusJitter; // already pow-distributed from CPU
		float r = uRadius * (baseR + h2 * 0.15); // slight random radial offset per jump

		// Spherical Y distribution for center, flat ring for edges
		// For center particles: Y spread = sphere height at that radius
		float sphereY = sqrt(max(0.0, 1.0 - baseR * baseR)); // 1 at center, 0 at edge
		float ySpread = mix(sphereY * 0.25, 0.05, smoothstep(0.0, 0.5, baseR));
		float y = uRingY + (h3 - 0.5) * 2.0 * uRadius * ySpread;

		vec3 pos = uCenter + vec3(cos(angle) * r, y, sin(angle) * r);

		vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
		gl_Position = projectionMatrix * mvPos;

		// Core particles are larger, edge particles smaller
		float sizeMult = mix(2.5, 0.6, baseR);
		gl_PointSize = aSize * sizeMult * (uScale * 200.0 / -mvPos.z);

		// Spark flash with jump-based randomness
		float sparkHash = hash(aOffset * 3456.7 + jumpPhase * 5.0);
		float spark = step(0.55, sparkHash); // ~45% visible per jump frame
		float intensity = sparkHash * sparkHash;
		// Core particles dimmer individually (additive blending accumulates many)
		float coreBrightness = mix(0.3, 0.8, smoothstep(0.0, 0.4, baseR));
		vAlpha = aAlpha * spark * intensity * coreBrightness * uFade;

		vRadius = baseR;
		vHeat = fract(aOffset * 7.0 + uTime * 0.5);
	}
`;

const fragmentShader = /* glsl */ `
	varying float vAlpha;
	varying float vHeat;
	varying float vRadius;

	void main() {
		vec2 p = gl_PointCoord - vec2(0.5);
		float dist = length(p);

		float alpha;
		if (vRadius < 0.3) {
			// Core: soft energy glow sphere
			alpha = exp(-dist * 8.0);
		} else {
			// Ring: sharp spark with cross spikes
			float core = exp(-dist * 20.0);
			float sx = exp(-abs(p.y) * 30.0) * exp(-abs(p.x) * 8.0);
			float sy = exp(-abs(p.x) * 30.0) * exp(-abs(p.y) * 8.0);
			alpha = core + (sx + sy) * 0.4;
		}
		alpha = clamp(alpha, 0.0, 1.0) * vAlpha;

		if (alpha < 0.01) discard;

		// Color: core is bright white-blue, ring is deeper blue with rare warm accents
		vec3 color;
		if (vRadius < 0.25) {
			// Bright energy core: blue with slight brightness variation
			vec3 coreBlue = vec3(0.1, 0.3, 1.0);
			vec3 brightBlue2 = vec3(0.15, 0.5, 1.0);
			color = mix(brightBlue2, coreBlue, vRadius / 0.25) * 1.5;
		} else if (vHeat < 0.95) {
			// Blue ring sparks
			vec3 deepBlue = vec3(0.0, 0.1, 0.8);
			vec3 brightBlue = vec3(0.1, 0.4, 1.0);
			color = mix(deepBlue, brightBlue, vHeat / 0.95) * 3.0;
		} else {
			// Rare warm accents
			vec3 orange = vec3(0.8, 0.3, 0.0);
			vec3 yellow = vec3(1.0, 0.7, 0.0);
			color = mix(orange, yellow, (vHeat - 0.95) / 0.05) * 3.0;
		}

		gl_FragColor = vec4(color, alpha);
	}
`;

/**
 * Creates a particle ring that follows the transporter cutoff band.
 */
export function createTransporterRing(
	meshes: THREE.Mesh[],
	scene: THREE.Scene,
	boundsSource?: THREE.Object3D
): TransporterRing {
	const count = isTouchDevice() ? PARTICLE_COUNT_MOBILE : PARTICLE_COUNT_DESKTOP;

	// Use boundsSource (e.g. shade_skin) for consistent full-body sizing, fallback to meshes
	const box = new THREE.Box3();
	if (boundsSource) {
		boundsSource.updateWorldMatrix(true, false);
		box.expandByObject(boundsSource);
	} else {
		for (const mesh of meshes) {
			mesh.updateWorldMatrix(true, false);
			box.expandByObject(mesh);
		}
	}
	const center = new THREE.Vector3();
	const size = new THREE.Vector3();
	box.getCenter(center);
	box.getSize(size);
	const radius = Math.max(size.x, size.z) * 0.35;
	const scale = size.y / 200; // scale factor relative to female model baseline

	// Per-particle attributes
	const angles = new Float32Array(count);
	const radiusJitters = new Float32Array(count);
	const yJitters = new Float32Array(count);
	const sizes = new Float32Array(count);
	const alphas = new Float32Array(count);
	const offsets = new Float32Array(count);

	for (let i = 0; i < count; i++) {
		angles[i] = Math.random() * Math.PI * 2;
		// Bias toward center: pow(random, 2) concentrates particles near r=0
		radiusJitters[i] = Math.pow(Math.random(), 2);
		yJitters[i] = (Math.random() - 0.5) * 2;
		sizes[i] = 1.5 + Math.random() * 3.0;
		alphas[i] = 0.7 + Math.random() * 0.3;
		offsets[i] = Math.random();
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
	geometry.setAttribute('aAngle', new THREE.BufferAttribute(angles, 1));
	geometry.setAttribute('aRadiusJitter', new THREE.BufferAttribute(radiusJitters, 1));
	geometry.setAttribute('aYJitter', new THREE.BufferAttribute(yJitters, 1));
	geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
	geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
	geometry.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 1));

	const material = new THREE.ShaderMaterial({
		vertexShader,
		fragmentShader,
		uniforms: {
			uTime: { value: 0.0 },
			uCenter: { value: center },
			uRingY: { value: box.min.y },
			uRadius: { value: radius },
			uBandWidth: { value: 15.0 },
			uFade: { value: 0.0 },
			uScale: { value: scale },
		},
		blending: THREE.AdditiveBlending,
		transparent: true,
		depthWrite: false,
		depthTest: true,
	});

	const points = new THREE.Points(geometry, material);
	points.renderOrder = 998;
	points.raycast = () => {};
	points.name = '__transporter_ring__';

	scene.add(points);

	return { points, material, geometry, scene };
}

/**
 * Update ring position and time each frame.
 */
export function updateTransporterRing(
	ring: TransporterRing,
	cutoffY: number,
	bandWidth: number,
	progress = 0.5
): void {
	ring.material.uniforms.uRingY.value = cutoffY + bandWidth * 0.5;
	ring.material.uniforms.uBandWidth.value = bandWidth;
	ring.material.uniforms.uTime.value = performance.now() / 1000;
	// Fade in over first 15%, fade out over last 30%
	const fadeIn = Math.min(progress / 0.15, 1.0);
	const fadeOut = Math.min((1.0 - progress) / 0.30, 1.0);
	ring.material.uniforms.uFade.value = Math.min(fadeIn, fadeOut);
}

/**
 * Remove and dispose the ring.
 */
export function removeTransporterRing(ring: TransporterRing): void {
	ring.scene.remove(ring.points);
	ring.geometry.dispose();
	ring.material.dispose();
}

import * as THREE from 'three';

const PARTICLE_COUNT_DESKTOP = 512;
const PARTICLE_COUNT_MOBILE = 256;

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uHeight;
  uniform float uRadius;
  uniform float uSpeed;

  attribute float aOffset;
  attribute float aRadiusScale;
  attribute float aAngleJitter;
  attribute float aSize;
  attribute float aAlpha;

  varying float vAlpha;
  varying float vHeat;

  void main() {
    float speed = uSpeed;
    float t = fract(uTime * 0.06 * speed + aOffset);

    float y = sin(t * 6.2832) * 0.5 * uHeight;
    float angle = t * 6.2832 * 3.0 + uTime * 0.2 + aAngleJitter;
    float r = uRadius * aRadiusScale;

    vec3 pos = vec3(cos(angle) * r, y, sin(angle) * r);

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPos;
    gl_PointSize = aSize * (60.0 / -mvPos.z);

    float twinkle = 0.6 + 0.4 * sin(uTime * 2.5 + aOffset * 30.0);
    vAlpha = aAlpha * twinkle;
    vHeat = 0.5 + 0.5 * sin(uTime * 1.2 + aOffset * 15.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uColorAlt;

  varying float vAlpha;
  varying float vHeat;

  void main() {
    float dist = length(gl_PointCoord - vec2(0.5));
    float alpha = 1.0 - smoothstep(0.25, 0.5, dist);
    alpha *= vAlpha;

    if (alpha < 0.01) discard;

    vec3 color = mix(uColor, uColorAlt, vHeat);
    gl_FragColor = vec4(color, alpha);
  }
`;

export interface WwwParticleSystem {
	points: THREE.Points;
	material: THREE.ShaderMaterial;
	update(): void;
	setColor(hex: string, duration?: number): void;
	setSpeed(speed: number): void;
	dispose(): void;
}

function hexToVec3(hex: string): THREE.Color {
	return new THREE.Color(hex);
}

function lightenColor(color: THREE.Color, factor: number): THREE.Color {
	return new THREE.Color(
		color.r + (1 - color.r) * factor,
		color.g + (1 - color.g) * factor,
		color.b + (1 - color.b) * factor
	);
}

export function createWwwParticles(isMobile: boolean): WwwParticleSystem {
	const count = isMobile ? PARTICLE_COUNT_MOBILE : PARTICLE_COUNT_DESKTOP;
	const clock = new THREE.Clock(true);

	const offsets = new Float32Array(count);
	const radiusScales = new Float32Array(count);
	const angleJitters = new Float32Array(count);
	const sizes = new Float32Array(count);
	const alphas = new Float32Array(count);

	for (let i = 0; i < count; i++) {
		offsets[i] = i / count;
		radiusScales[i] = 0.8 + Math.random() * 0.8;
		angleJitters[i] = (Math.random() - 0.5) * 3.0;
		sizes[i] = 1.5 + Math.random() * 3.0;
		alphas[i] = 0.12 + Math.random() * 0.25;
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
	geometry.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 1));
	geometry.setAttribute('aRadiusScale', new THREE.BufferAttribute(radiusScales, 1));
	geometry.setAttribute('aAngleJitter', new THREE.BufferAttribute(angleJitters, 1));
	geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
	geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));

	const baseColor = hexToVec3('#16d3dd');
	const altColor = lightenColor(baseColor, 0.4);

	const material = new THREE.ShaderMaterial({
		vertexShader,
		fragmentShader,
		uniforms: {
			uTime: { value: 0.0 },
			uHeight: { value: 3.0 },
			uRadius: { value: 2.5 },
			uSpeed: { value: 1.0 },
			uColor: { value: baseColor },
			uColorAlt: { value: altColor }
		},
		blending: THREE.NormalBlending,
		transparent: true,
		depthWrite: false,
		depthTest: false
	});

	const points = new THREE.Points(geometry, material);
	points.raycast = () => {};

	// Color transition state
	let colorFrom = baseColor.clone();
	let colorTo = baseColor.clone();
	let colorProgress = 1;
	let colorDuration = 1;
	let colorStartTime = 0;
	let targetSpeed = 1;

	function update() {
		const elapsed = clock.getElapsedTime();
		material.uniforms.uTime.value = elapsed;

		// Smooth color transition
		if (colorProgress < 1) {
			colorProgress = Math.min(1, (elapsed - colorStartTime) / colorDuration);
			const t = smoothStep(colorProgress);
			const current = new THREE.Color().lerpColors(colorFrom, colorTo, t);
			material.uniforms.uColor.value = current;
			material.uniforms.uColorAlt.value = lightenColor(current, 0.4);
		}

		// Smooth speed transition
		const currentSpeed = material.uniforms.uSpeed.value;
		if (Math.abs(currentSpeed - targetSpeed) > 0.01) {
			material.uniforms.uSpeed.value += (targetSpeed - currentSpeed) * 0.02;
		}
	}

	function setColor(hex: string, duration = 1.0) {
		colorFrom = (material.uniforms.uColor.value as THREE.Color).clone();
		colorTo = hexToVec3(hex);
		colorProgress = 0;
		colorDuration = duration;
		colorStartTime = clock.getElapsedTime();
	}

	function setSpeed(speed: number) {
		targetSpeed = speed;
	}

	function dispose() {
		geometry.dispose();
		material.dispose();
		clock.stop();
	}

	return { points, material, update, setColor, setSpeed, dispose };
}

function smoothStep(t: number): number {
	return t * t * (3 - 2 * t);
}

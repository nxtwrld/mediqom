import * as THREE from 'three';
import TWEEN from '@tweenjs/tween.js';

export interface TransporterUniforms {
	uCutoffY: { value: number };
	uBandWidth: { value: number };
	uTransTime: { value: number };
	uTransColor: { value: THREE.Color };
	uTransActive: { value: number };
	uTransDirection: { value: number }; // 1.0 = materialize (up), -1.0 = dematerialize (down)
}

function createTransporterUniforms(bandWidth = 15): TransporterUniforms {
	return {
		uCutoffY: { value: -99999 },
		uBandWidth: { value: bandWidth },
		uTransTime: { value: 0 },
		uTransColor: { value: new THREE.Color(0x22aaff) },
		uTransActive: { value: 0 },
		uTransDirection: { value: 1.0 },
	};
}

// GLSL snippets injected into existing materials
const VERTEX_PARS = /* glsl */ `
varying float vWorldY_trans;
`;

const VERTEX_MAIN = /* glsl */ `
vWorldY_trans = (modelMatrix * vec4(transformed, 1.0)).y;
`;

const FRAGMENT_PARS = /* glsl */ `
uniform float uCutoffY;
uniform float uBandWidth;
uniform float uTransTime;
uniform vec3 uTransColor;
uniform float uTransActive;
uniform float uTransDirection;
varying float vWorldY_trans;
`;

const FRAGMENT_MAIN = /* glsl */ `
if (uTransActive > 0.5) {
	float edgeY = uCutoffY;
	float bandTop = edgeY + uBandWidth;

	if (uTransDirection > 0.0) {
		// Materialize: sweep bottom-to-top, discard above band
		if (vWorldY_trans > bandTop) discard;
		if (vWorldY_trans > edgeY) {
			float bandPos = (vWorldY_trans - edgeY) / uBandWidth;
			float n = fract(sin(dot(gl_FragCoord.xy + uTransTime * 30.0, vec2(12.9898, 78.233))) * 43758.5453);
			float sparkle = step(bandPos * 0.7, n) * (1.0 - bandPos);
			gl_FragColor.rgb += uTransColor * sparkle * 2.5;
			gl_FragColor.a *= (1.0 - bandPos * bandPos);
		}
	} else {
		// Dematerialize: sweep top-to-bottom, discard below edge
		if (vWorldY_trans < edgeY) discard;
		if (vWorldY_trans < bandTop) {
			float bandPos = (bandTop - vWorldY_trans) / uBandWidth;
			float n = fract(sin(dot(gl_FragCoord.xy + uTransTime * 30.0, vec2(12.9898, 78.233))) * 43758.5453);
			float sparkle = step(bandPos * 0.7, n) * (1.0 - bandPos);
			gl_FragColor.rgb += uTransColor * sparkle * 2.5;
			gl_FragColor.a *= (1.0 - bandPos * bandPos);
		}
	}
}
`;

// Track injected materials — each material gets its own uniforms instance
const injectedMaterials = new WeakMap<THREE.Material, TransporterUniforms>();

/**
 * Ensures a material has the transporter shader injected.
 * Each material gets its own independent uniforms (safe for per-group animation).
 * Returns the uniforms bound to this material.
 */
export function injectTransporterEffect(material: THREE.Material): TransporterUniforms {
	const existing = injectedMaterials.get(material);
	if (existing) return existing;

	const uniforms = createTransporterUniforms();
	injectedMaterials.set(material, uniforms);

	material.transparent = true;

	const prevOnBeforeCompile = material.onBeforeCompile;

	material.onBeforeCompile = (shader) => {
		if (prevOnBeforeCompile) {
			prevOnBeforeCompile.call(material, shader, undefined as any);
		}

		shader.uniforms.uCutoffY = uniforms.uCutoffY;
		shader.uniforms.uBandWidth = uniforms.uBandWidth;
		shader.uniforms.uTransTime = uniforms.uTransTime;
		shader.uniforms.uTransColor = uniforms.uTransColor;
		shader.uniforms.uTransActive = uniforms.uTransActive;
		shader.uniforms.uTransDirection = uniforms.uTransDirection;

		shader.vertexShader = shader.vertexShader.replace(
			'void main() {',
			VERTEX_PARS + '\nvoid main() {'
		);

		if (shader.vertexShader.includes('#include <worldpos_vertex>')) {
			shader.vertexShader = shader.vertexShader.replace(
				'#include <worldpos_vertex>',
				'#include <worldpos_vertex>\n' + VERTEX_MAIN
			);
		} else if (shader.vertexShader.includes('#include <fog_vertex>')) {
			shader.vertexShader = shader.vertexShader.replace(
				'#include <fog_vertex>',
				'#include <fog_vertex>\n' + VERTEX_MAIN
			);
		} else {
			shader.vertexShader = shader.vertexShader.replace(
				/}\s*$/,
				VERTEX_MAIN + '\n}'
			);
		}

		shader.fragmentShader = shader.fragmentShader.replace(
			'void main() {',
			FRAGMENT_PARS + '\nvoid main() {'
		);

		if (shader.fragmentShader.includes('#include <dithering_fragment>')) {
			shader.fragmentShader = shader.fragmentShader.replace(
				'#include <dithering_fragment>',
				'#include <dithering_fragment>\n' + FRAGMENT_MAIN
			);
		} else {
			shader.fragmentShader = shader.fragmentShader.replace(
				/}\s*$/,
				FRAGMENT_MAIN + '\n}'
			);
		}
	};

	material.needsUpdate = true;
	return uniforms;
}

/**
 * Collect unique TransporterUniforms from a set of meshes.
 */
function collectUniforms(meshes: THREE.Mesh[]): TransporterUniforms[] {
	const set = new Set<TransporterUniforms>();
	for (const mesh of meshes) {
		const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
		for (const mat of mats) {
			const u = injectedMaterials.get(mat);
			if (u) set.add(u);
		}
	}
	return [...set];
}

/**
 * Animate transporter effect on a group of meshes.
 * Each mesh's material has its own uniforms — this syncs them all via a proxy TWEEN.
 */
export function animateTransporterMeshes(
	meshes: THREE.Mesh[],
	direction: 'materialize' | 'dematerialize',
	duration = 3000,
	onComplete?: () => void
): void {
	const allUniforms = collectUniforms(meshes);
	if (allUniforms.length === 0) {
		onComplete?.();
		return;
	}

	// Compute bounding box
	const box = new THREE.Box3();
	for (const mesh of meshes) {
		mesh.updateWorldMatrix(true, false);
		box.expandByObject(mesh);
	}

	const bandWidth = allUniforms[0].uBandWidth.value;
	const minY = box.min.y;
	const maxY = box.max.y;
	const dir = direction === 'materialize' ? 1.0 : -1.0;

	// Both directions sweep bottom-to-top; the GLSL branch controls which side is discarded
	const startY = minY - bandWidth;
	const endY = maxY + bandWidth;

	const proxy = { y: startY };

	// Activate all uniforms
	for (const u of allUniforms) {
		u.uTransDirection.value = dir;
		u.uTransActive.value = 1.0;
		u.uCutoffY.value = startY;
	}

	new TWEEN.Tween(proxy)
		.to({ y: endY }, duration)
		.easing(TWEEN.Easing.Quadratic.InOut)
		.onUpdate(() => {
			for (const u of allUniforms) {
				u.uCutoffY.value = proxy.y;
			}
		})
		.onComplete(() => {
			for (const u of allUniforms) {
				u.uTransActive.value = 0.0;
			}
			onComplete?.();
		})
		.start();
}

/**
 * Update time uniform on all active transporter materials in a mesh list.
 * Call from the animation loop.
 */
export function updateTransporterTime(meshes: THREE.Mesh[]): void {
	const t = performance.now() / 1000;
	const allUniforms = collectUniforms(meshes);
	for (const u of allUniforms) {
		if (u.uTransActive.value > 0.5) {
			u.uTransTime.value = t;
		}
	}
}

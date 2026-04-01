import * as THREE from "three";

/** Shell presets: [inflate, opacity, fresnelPower] */
const SHELL_PRESETS: [number, number, number][] = [
  [0.03, 0.8,  1.5],  // inner: bright, close, sharp rim
  [0.08, 0.5,  1.0],  // mid: medium spread, softer
  [0.16, 0.25, 0.7],  // outer: wide, faint, very soft
];

export function createAuraUniforms(inflate = 0.06, opacity = 0.5, fresnelPower = 1.5) {
  return {
    uTime: { value: 0.0 },
    uColor: { value: new THREE.Color(0xffbf40) },
    uIntensity: { value: 0.6 },
    uInflate: { value: inflate },
    uOpacity: { value: opacity },
    uFresnelPower: { value: fresnelPower },
  };
}

export const auraVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uInflate;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec3 inflated = position + normal * uInflate;
    vec4 mvPos = modelViewMatrix * vec4(inflated, 1.0);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

export const auraFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3  uColor;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uFresnelPower;

  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    float fresnel = 1.0 - abs(dot(vNormal, vViewDir));
    fresnel = pow(fresnel, uFresnelPower);
    // Base glow so inner shell is visible even on flat faces
    float rim = mix(0.15, 1.0, fresnel);

    // Slow breathing pulse
    float pulse = 0.5 + 0.3 * sin(uTime * 2.5);

    float alpha = rim * uOpacity * pulse;
    // Color brightness independent of alpha for more saturated glow
    vec3 col = uColor * uIntensity * rim * pulse;
    gl_FragColor = vec4(col, alpha);
  }
`;

/**
 * Creates 3 ShaderMaterials for concentric glow shells.
 * Each has different inflate/opacity for a soft falloff effect.
 * Caller updates uniforms.uTime.value each frame on all 3.
 */
export function createAuraShellMaterials(color?: THREE.Color): THREE.ShaderMaterial[] {
  return SHELL_PRESETS.map(([inflate, opacity, fresnelPower]) => {
    const uniforms = createAuraUniforms(inflate, opacity, fresnelPower);
    if (color) uniforms.uColor.value.copy(color);

    return new THREE.ShaderMaterial({
      vertexShader: auraVertexShader,
      fragmentShader: auraFragmentShader,
      uniforms,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
  });
}

// Keep a default export so existing `shaders.ts` index still works
export default {
  vertexShader: auraVertexShader,
  fragmentShader: auraFragmentShader,
  uniforms: createAuraUniforms(),
  extras: {
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
  },
};

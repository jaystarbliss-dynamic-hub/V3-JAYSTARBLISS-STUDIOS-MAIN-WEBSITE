import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/**
 * Lightweight ambient GLSL backdrop for Coding Lab Glass Effect Mode.
 * Palette: Jaystarbliss deep slate (#0F172A), obsidian (#090D16), subtle crimson (#991B1B / #B91C1C),
 * and frosted pearl (#CBD5E1) soft atmospheric light waves.
 *
 * Performance & Reliability Guards:
 * - Mounted ONLY when Glass Effect Mode is active (lazy-loaded by CodingLabEditorHost).
 * - Automatically falls back to an identical static CSS radial gradient on:
 *   - prefers-reduced-motion: reduce
 *   - Software WebGL renderers (SwiftShader / llvmpipe / Microsoft Basic Render)
 *   - Missing WebGL or webglcontextlost events
 * - Pauses rendering when document.visibilityState !== 'visible'.
 * - Caps DPR at 1.25 and throttles animation to ~30fps.
 * - Full GPU disposal on unmount.
 */
const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uResolution;

  float wave(vec2 p, float t, float freq, float amp) {
    return sin(p.x * freq + t) * cos(p.y * (freq * 0.85) - t * 0.7) * amp;
  }

  void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);

    float t = uTime * 0.16;

    // Gentle organic atmospheric drift
    float w1 = wave(p + vec2(0.25, -0.15), t, 2.2, 0.5) + 0.5;
    float w2 = wave(p * 1.4 - vec2(0.18, 0.22), t * 1.15, 1.9, 0.5) + 0.5;

    // Jaystarbliss Glass palette: obsidian -> slate -> subtle crimson glow -> frosted pearl mist
    vec3 obsidian = vec3(0.035, 0.055, 0.098);
    vec3 deepSlate = vec3(0.075, 0.118, 0.205);
    vec3 crimsonGlow = vec3(0.58, 0.10, 0.13);
    vec3 frostedPearl = vec3(0.76, 0.82, 0.90);

    vec3 base = mix(obsidian, deepSlate, smoothstep(0.0, 1.0, uv.y * 0.65 + w1 * 0.35));

    // Soft crimson atmospheric pool drifting along upper-right / lower-left corners
    vec2 crimsonCenter = vec2(0.32 * sin(t * 0.65) + 0.25, 0.22 * cos(t * 0.5) + 0.18);
    float crimsonMask = exp(-length(p - crimsonCenter) * 2.15);
    base = mix(base, crimsonGlow, crimsonMask * 0.30);

    // Frosted pearl ambient sheen drifting near top-left chrome edge
    vec2 pearlCenter = vec2(-0.35 + 0.18 * cos(t * 0.55), 0.26 + 0.12 * sin(t * 0.45));
    float pearlMask = exp(-length(p - pearlCenter) * 2.55);
    base = mix(base, frostedPearl, pearlMask * 0.14 * (0.65 + 0.35 * w2));

    // Subtle vignette so studio edges feel calm and framed
    float vig = smoothstep(1.35, 0.2, length(p));
    base *= mix(0.84, 1.04, vig);

    gl_FragColor = vec4(base, 1.0);
  }
`;

const SOFTWARE_RENDERER_REGEX = /swiftshader|llvmpipe|software|microsoft basic render|mesa offscreen/i;

export const CodingLabAmbientShader: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [useStaticFallback, setUseStaticFallback] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setUseStaticFallback(true);
      return;
    }

    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotionQuery.matches) {
      setUseStaticFallback(true);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer | null = null;
    let geometry: THREE.PlaneGeometry | null = null;
    let material: THREE.ShaderMaterial | null = null;
    let frameId: number | null = null;
    let disposed = false;

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: false,
        depth: false,
        stencil: false,
        powerPreference: 'low-power',
        preserveDrawingBuffer: false,
      });

      const gl = renderer.getContext();
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const rendererName = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '');
        if (SOFTWARE_RENDERER_REGEX.test(rendererName)) {
          renderer.dispose();
          setUseStaticFallback(true);
          return;
        }
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      renderer.setPixelRatio(dpr);
      renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';
      container.innerHTML = '';
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

      const uniforms = {
        uTime: { value: 0 },
        uResolution: {
          value: new THREE.Vector2(
            container.clientWidth || window.innerWidth,
            container.clientHeight || window.innerHeight
          ),
        },
      };

      geometry = new THREE.PlaneGeometry(2, 2);
      material = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms,
        depthTest: false,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);

      const handleResize = () => {
        if (disposed || !renderer || !container) return;
        const w = Math.max(container.clientWidth, 1);
        const h = Math.max(container.clientHeight, 1);
        renderer.setSize(w, h, false);
        uniforms.uResolution.value.set(w, h);
      };

      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);

      const handleContextLost = (e: Event) => {
        e.preventDefault();
        if (frameId !== null) {
          window.cancelAnimationFrame(frameId);
          frameId = null;
        }
        setUseStaticFallback(true);
      };

      renderer.domElement.addEventListener('webglcontextlost', handleContextLost, false);

      let lastRenderTs = 0;
      const startTs = performance.now();
      const FRAME_INTERVAL_MS = 1000 / 30; // ~30fps ambient drift for calm GPU usage

      const renderLoop = (now: number) => {
        if (disposed) return;
        frameId = window.requestAnimationFrame(renderLoop);
        if (document.visibilityState !== 'visible') return;
        if (now - lastRenderTs < FRAME_INTERVAL_MS) return;
        lastRenderTs = now;
        uniforms.uTime.value = (now - startTs) * 0.001;
        renderer?.render(scene, camera);
      };

      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          lastRenderTs = 0;
        }
      };

      const handleReducedMotionChange = (e: MediaQueryListEvent) => {
        if (e.matches) {
          setUseStaticFallback(true);
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      reducedMotionQuery.addEventListener?.('change', handleReducedMotionChange);
      frameId = window.requestAnimationFrame(renderLoop);

      return () => {
        disposed = true;
        if (frameId !== null) window.cancelAnimationFrame(frameId);
        resizeObserver.disconnect();
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        reducedMotionQuery.removeEventListener?.('change', handleReducedMotionChange);
        renderer?.domElement.removeEventListener('webglcontextlost', handleContextLost);
        geometry?.dispose();
        material?.dispose();
        renderer?.dispose();
        if (container) container.innerHTML = '';
      };
    } catch {
      geometry?.dispose();
      material?.dispose();
      renderer?.dispose();
      setUseStaticFallback(true);
    }
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      style={{
        background:
          'radial-gradient(circle at 82% 18%, rgba(185, 28, 28, 0.28) 0%, transparent 46%), radial-gradient(circle at 14% 22%, rgba(226, 232, 240, 0.14) 0%, transparent 42%), linear-gradient(145deg, #090d16 0%, #0f172a 55%, #191322 100%)',
      }}
    >
      {!useStaticFallback && <div ref={containerRef} className="w-full h-full" />}
    </div>
  );
};

export default CodingLabAmbientShader;

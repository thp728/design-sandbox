// Resolved parameters to a three.js scene: the swept form, its material, the rect area lights and
// a framed physical camera. No environment and no floor, so rays that miss the form return 0.
import { BufferAttribute, BufferGeometry, Color, MathUtils, Mesh, MeshPhysicalMaterial, RectAreaLight, SRGBColorSpace, Scene } from 'three';
import { PhysicalCamera } from 'three-gpu-pathtracer/src/objects/PhysicalCamera.js';
import { QUALITY, buildForm } from './form/index.js';
import { fitCamera, orbitDirection } from './framing.js';

function hsvColor(h, s, v) {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return new Color().setRGB(f(5), f(3), f(1), SRGBColorSpace);
}

// Tanner Helland's blackbody fit, normalised so the brightest channel is 1.
function kelvinColor(k) {
  const t = k / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = [r, g, b].map((x) => MathUtils.clamp(x, 0, 255));
  const m = Math.max(...c);
  return new Color().setRGB(c[0] / m, c[1] / m, c[2] / m, SRGBColorSpace);
}

function material(params) {
  const color = hsvColor(params['material.hue'], params['material.saturation'], params['material.value']);
  const roughness = params['material.roughness'];
  switch (params['material.kind']) {
    case 'metal':
      return new MeshPhysicalMaterial({ color, metalness: 1, roughness });
    case 'satin':
      return new MeshPhysicalMaterial({ color, metalness: 0, roughness: Math.max(roughness, 0.3), sheen: 1, sheenColor: color.clone().lerp(new Color(1, 1, 1), 0.4), sheenRoughness: 0.5 });
    default:
      return new MeshPhysicalMaterial({ color, metalness: 0, roughness, clearcoat: 1, clearcoatRoughness: Math.min(roughness, 0.05) });
  }
}

function lights(params) {
  const out = [];
  for (let i = 0; i < params['light.count']; i++) {
    const p = (k) => params[`light.${i}.${k}`];
    const base = p('role') === 'rim' ? 180 : 0;
    const light = new RectAreaLight(kelvinColor(p('kelvin')), p('intensity'), p('size'), p('size') * p('aspect'));
    light.position.copy(orbitDirection(params['camera.azimuth'] + base + p('azimuth'), p('elevation'))).multiplyScalar(p('distance'));
    light.lookAt(0, 0, 0);
    out.push(light);
  }
  return out;
}

/**
 * @param {object} params resolved parameters
 * @param {{width: number, height: number, tier: 'draft' | 'final'}} opts
 */
export function buildScene(params, { width, height, tier = 'draft' }) {
  const form = buildForm(params, QUALITY[tier]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(form.position, 3));
  geometry.setAttribute('normal', new BufferAttribute(form.normal, 3));
  geometry.setIndex(new BufferAttribute(form.index, 1));
  geometry.computeBoundingSphere();

  const scene = new Scene();
  scene.background = null;
  scene.environment = null;
  scene.add(new Mesh(geometry, material(params)), ...lights(params));

  const camera = new PhysicalCamera(30, width / height, 0.01, 100);
  const framing = fitCamera(camera, form.position, params, { width, height });
  return { scene, camera, framing, triangles: form.index.length / 3 };
}

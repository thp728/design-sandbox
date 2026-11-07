// Places the camera so the form's projected bounds sit where the frame parameters say: centred on
// (frame.cx, frame.cy), frame.size of the frame height tall, and clear of the black top band.
// Framing moves the camera along its view axis for size and shifts the lens for position, so the
// perspective stays the one the camera angle chose.
import { MathUtils, Vector3 } from 'three';

const MAX_SAMPLES = 40000;
const EDGE_MARGIN = 0.01; // vertex sampling and pixel jitter can put light just past the bounds
const DOF_MARGIN = 0.05; // extra top clearance per unit of aperture, as a share of the height
const MIN_DISTANCE = 1.6; // in form radii, keeps the camera well outside the form

export function orbitDirection(azimuthDeg, elevationDeg) {
  const az = MathUtils.degToRad(azimuthDeg), el = MathUtils.degToRad(elevationDeg);
  return new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

// Projected bounds in frame space: x 0 left to 1 right, y 0 bottom to 1 top.
export function projectedBounds(camera, positions) {
  const stride = Math.max(1, Math.floor(positions.length / 3 / MAX_SAMPLES));
  const v = new Vector3();
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  camera.updateMatrixWorld();
  for (let i = 0; i < positions.length / 3; i += stride) {
    v.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]).project(camera);
    const x = (v.x + 1) / 2, y = (v.y + 1) / 2;
    if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x;
    if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
  }
  return b;
}

/**
 * @param {import('three').PerspectiveCamera} camera
 * @param {Float32Array} positions form vertices
 * @param {object} params resolved parameters
 * @param {{width: number, height: number}} size
 */
export function fitCamera(camera, positions, params, { width, height }) {
  camera.fov = params['camera.fov'];
  camera.aspect = width / height;
  camera.clearViewOffset();
  const dir = orbitDirection(params['camera.azimuth'], params['camera.elevation']);
  const roll = MathUtils.degToRad(params['camera.roll']);
  const place = (d) => {
    camera.position.copy(dir).multiplyScalar(d);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.rotateZ(roll);
    camera.updateProjectionMatrix();
  };

  // Size: projected height scales roughly with 1 / distance, so a few rounds converge.
  const targetHeight = params['frame.size'];
  let d = 4;
  for (let k = 0; k < 8; k++) {
    place(d);
    const b = projectedBounds(camera, positions);
    const h = b.y1 - b.y0;
    if (!(h > 0)) break;
    d = Math.max(MIN_DISTANCE, d * (h / targetHeight));
  }
  place(d);
  // Too close to get bigger without distorting: zoom the lens the rest of the way.
  for (let k = 0; k < 6 && d === MIN_DISTANCE; k++) {
    const b = projectedBounds(camera, positions);
    const h = b.y1 - b.y0;
    if (Math.abs(h - targetHeight) < 0.005) break;
    camera.fov = MathUtils.radToDeg(2 * Math.atan(Math.tan(MathUtils.degToRad(camera.fov) / 2) * (h / targetHeight)));
    camera.updateProjectionMatrix();
  }

  // Position: shift the lens so the bounds' centre lands on (cx, cy), then pull it down if the top
  // would enter the black band.
  const b = projectedBounds(camera, positions);
  const dx = params['frame.cx'] - (b.x0 + b.x1) / 2;
  let dy = params['frame.cy'] - (b.y0 + b.y1) / 2;
  // The notch area hangs twice the band deep, so a form under it must sit lower.
  const halfNotch = params['frame.safe.notch'] / 2;
  const underNotch = b.x0 + dx < 0.5 + halfNotch && b.x1 + dx > 0.5 - halfNotch;
  const band = params['frame.safe.top'] * (underNotch ? 2 : 1);
  const topLimit = 1 - band - EDGE_MARGIN - DOF_MARGIN * params['camera.dof.aperture'];
  if (b.y1 + dy > topLimit) dy = topLimit - b.y1;
  camera.setViewOffset(width, height, -dx * width, dy * height, width, height);
  camera.updateProjectionMatrix();

  // Focus: the form's centre, moved by the focus offset (negative pulls closer).
  camera.focusDistance = d * (1 + 0.5 * params['camera.dof.focus']);
  camera.bokehSize = params['camera.dof.aperture'] * 250;
  camera.updateMatrixWorld();

  return { distance: d, bounds: projectedBounds(camera, positions), topLimit };
}

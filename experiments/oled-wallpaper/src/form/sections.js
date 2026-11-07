// Cross-sections in a unit box, u along the ribbon's width and v along its thickness, both in
// [-0.5, 0.5]. Points run counter-clockwise seen from ahead along the path, which the sweep relies
// on for outward winding.
//
// A section is a list of strips. A strip with `closed: true` is one smooth loop. Flat faces are
// separate open strips with their own vertices, so normals never smooth round a corner.

export function buildSection(params, around) {
  const kind = params['form.section'];
  if (kind === 'flat') {
    const c = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    const normals = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    return {
      strips: c.map((p, i) => ({ points: [p, c[(i + 1) % 4]], normals: [normals[i], normals[i]], closed: false })),
      cap: c,
    };
  }
  if (kind === 'tube') {
    const e = 2 + 8 * params['form.section.squareness'];
    const points = [], normals = [];
    for (let k = 0; k < around; k++) {
      const a = (2 * Math.PI * k) / around, ca = Math.cos(a), sa = Math.sin(a);
      const u = 0.5 * Math.sign(ca) * Math.abs(ca) ** (2 / e), v = 0.5 * Math.sign(sa) * Math.abs(sa) ** (2 / e);
      // gradient of |2u|^e + |2v|^e
      const nu = Math.sign(u) * Math.abs(2 * u) ** (e - 1), nv = Math.sign(v) * Math.abs(2 * v) ** (e - 1);
      const l = Math.hypot(nu, nv) || 1;
      points.push([u, v]);
      normals.push([nu / l, nv / l]);
    }
    return { strips: [{ points, normals, closed: true }], cap: points };
  }
  throw new Error(`section ${kind} has no builder`);
}

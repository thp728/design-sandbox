// Measures a decoded 8-bit RGBA image: black share, the darkest lit level, haze at levels 1 to 3,
// light inside the safe zones, and small isolated brights that would halo on mini-LED.

export const DEFAULT_LIMITS = {
  hazePct: 0.5, // share of the frame allowed at levels 1 to 3
  brightLevel: 96, // a pixel counts as bright when its brightest channel reaches this
  minSpeckArea: 4, // smaller bright regions are single-pixel fireflies, not specks
  zones: [64, 40], // the 16" MacBook Pro's ~2,500 local dimming zones, as columns and rows
};

/**
 * @param {{width: number, height: number, data: Uint8Array | Uint8ClampedArray}} img
 * @param {{safeTop?: number, notch?: number, limits?: object}} opts
 */
export function analyze({ width, height, data }, { safeTop = 0.06, notch = 0.2, limits = {} } = {}) {
  const L = { ...DEFAULT_LIMITS, ...limits };
  const n = width * height;
  const bandRows = Math.round(safeTop * height);
  const notchRows = Math.round(2 * safeTop * height);
  const notchX0 = Math.round((0.5 - notch / 2) * width), notchX1 = Math.round((0.5 + notch / 2) * width);
  let black = 0, haze = 0, darkest = 256, band = 0, notchLit = 0;

  for (let i = 0, p = 0; p < n; i += 4, p++) {
    const m = Math.max(data[i], data[i + 1], data[i + 2]);
    if (m === 0) { black++; continue; }
    if (m < darkest) darkest = m;
    if (m <= 3) haze++;
    const y = (p / width) | 0, x = p - y * width;
    if (y < bandRows) band++;
    else if (y < notchRows && x >= notchX0 && x < notchX1) notchLit++;
  }

  const [zx, zy] = L.zones;
  const maxSpeckArea = Math.max(L.minSpeckArea + 1, Math.round((width / zx) * (height / zy) / 4));
  const specks = findSpecks(blurredBright(data, width, height, L.brightLevel), width, height, L.minSpeckArea, maxSpeckArea);

  const report = {
    width, height,
    blackPct: (100 * black) / n,
    darkest: darkest === 256 ? null : darkest,
    hazePct: (100 * haze) / n,
    safeTopLit: band,
    notchLit,
    specks: specks.length,
    maxSpeckArea,
  };
  report.failures = [
    report.hazePct > L.hazePct && `haze: ${report.hazePct.toFixed(2)}% of the frame sits at levels 1 to 3, limit ${L.hazePct}%`,
    band > 0 && `top band: ${band} lit pixels in the top ${(safeTop * 100).toFixed(1)}%`,
    notchLit > 0 && `notch: ${notchLit} lit pixels in the centre-top area`,
    specks.length > 0 && `specks: ${specks.length} isolated bright regions of ${L.minSpeckArea} to ${maxSpeckArea} px, first at ${specks[0].x},${specks[0].y}`,
  ].filter(Boolean);
  return report;
}

// Bright mask from the brightest channel after a box blur about 1/864 of the width across, so
// sampling grain averages away while a real highlight of a few pixels survives.
function blurredBright(data, width, height, level) {
  const r = Math.max(1, Math.round(width / 864));
  const m = new Float32Array(width * height);
  for (let p = 0, i = 0; p < m.length; p++, i += 4) m[p] = Math.max(data[i], data[i + 1], data[i + 2]);
  const tmp = new Float32Array(m.length);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += m[y * width + Math.min(width - 1, Math.max(0, x))];
    for (let x = 0; x < width; x++) {
      tmp[y * width + x] = sum / (2 * r + 1);
      sum += m[y * width + Math.min(width - 1, x + r + 1)] - m[y * width + Math.max(0, x - r)];
    }
  }
  const mask = new Uint8Array(m.length);
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(height - 1, Math.max(0, y)) * width + x];
    for (let y = 0; y < height; y++) {
      if (sum / (2 * r + 1) >= level) mask[y * width + x] = 1;
      sum += tmp[Math.min(height - 1, y + r + 1) * width + x] - tmp[Math.max(0, y - r) * width + x];
    }
  }
  return mask;
}

// Connected bright regions (4-neighbour) whose area falls in [minArea, maxArea).
function findSpecks(mask, width, height, minArea, maxArea) {
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  const found = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let top = 0, area = 0;
    stack[top++] = start;
    seen[start] = 1;
    while (top > 0) {
      const p = stack[--top];
      area++;
      const y = (p / width) | 0, x = p - y * width;
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[top++] = p - 1; }
      if (x < width - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[top++] = p + 1; }
      if (y > 0 && mask[p - width] && !seen[p - width]) { seen[p - width] = 1; stack[top++] = p - width; }
      if (y < height - 1 && mask[p + width] && !seen[p + width]) { seen[p + width] = 1; stack[top++] = p + width; }
    }
    if (area >= minArea && area < maxArea) found.push({ x: start % width, y: (start / width) | 0, area });
  }
  return found;
}

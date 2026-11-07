import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScene } from '../src/scene.js';
import { resolve } from '../src/resolve.js';

const size = { width: 864, height: 559 };

test('the form centres where the frame asks, unless that would enter the top band', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const { params } = resolve({ seed });
    const { framing } = buildScene(params, size);
    const b = framing.bounds;
    assert.ok(b.y1 <= framing.topLimit + 1e-3, `seed ${seed}: top ${b.y1.toFixed(3)} over limit ${framing.topLimit.toFixed(3)}`);
    assert.ok(Math.abs((b.x0 + b.x1) / 2 - params['frame.cx']) < 0.02, `seed ${seed}: centre x ${((b.x0 + b.x1) / 2).toFixed(3)} vs ${params['frame.cx']}`);
    const cy = (b.y0 + b.y1) / 2;
    const pulledDown = b.y1 >= framing.topLimit - 1e-3;
    assert.ok(pulledDown ? cy <= params['frame.cy'] + 0.02 : Math.abs(cy - params['frame.cy']) < 0.02, `seed ${seed}: centre y ${cy.toFixed(3)} vs ${params['frame.cy']}`);
    assert.ok(Math.abs(b.y1 - b.y0 - params['frame.size']) < 0.05, `seed ${seed}: height ${(b.y1 - b.y0).toFixed(3)} vs ${params['frame.size']}`);
  }
});

test('the defaults frame the form low and right of centre', () => {
  const { framing } = buildScene(resolve().params, size);
  const b = framing.bounds;
  assert.ok((b.x0 + b.x1) / 2 > 0.5 && (b.y0 + b.y1) / 2 < 0.5);
});

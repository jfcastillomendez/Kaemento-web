const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const {estimate, m2PerKit} = require('../kit-estimate.js');

test('Area uses 10 m² per kit and rounds up to a whole kit, including decimal boundaries', () => {
  assert.equal(m2PerKit, 10);
  for (const [area, kits] of [[0.01,1],[10,1],[10.01,2],[20,2],[20.01,3],[24,3],[26,3],[200,20],[200.01,21],[100000,10000]]) {
    assert.equal(estimate(area), kits);
    assert.equal(estimate(String(area)), kits);
  }
  assert.equal(estimate('.5'), 1);
  assert.equal(estimate('26.00'), 3);
  // A manual quantity must never be mistaken for the area; no inverse rounding.
  for (let hundredths = 1; hundredths <= 21000; hundredths++) {
    const area = hundredths / 100, kits = estimate(area);
    assert.ok(kits * m2PerKit >= area);
    assert.ok((kits - 1) * m2PerKit < area);
  }
});

test('Empty, invalid or unsupported areas do not produce a kit suggestion', () => {
  for (const area of ['', ' ', 'abc', '26m²', '1e2', '26,5', '0.001', 0, -1, NaN, Infinity, 100000.01, null, undefined, true, [], {}]) {
    assert.equal(estimate(area), null, String(area));
  }
});

test('Browser helper exports the same calculation without creating another calculator', () => {
  const window = {};
  // No document is available: the helper must not inject a second UI.
  vm.runInNewContext(fs.readFileSync(require.resolve('../kit-estimate.js'), 'utf8'), {window});
  assert.equal(window.KaementoKitCoverage.m2PerKit, 10);
  assert.equal(window.KaementoKitCoverage.estimate('24'), 3);
});

test('Both purchase pages load the shared area rule before the price and simulator consumers', () => {
  for (const file of ['index.html', 'productos/microcemento-kaemento.html']) {
    const html = fs.readFileSync(require.resolve('../' + file), 'utf8');
    assert.equal((html.match(/src="\/kit-estimate\.js\?/g) || []).length, 1);
    assert.ok(html.indexOf('/kit-estimate.js?') < html.indexOf('/bold-checkout.js?'));
    assert.ok(html.indexOf('/kit-estimate.js?') < html.indexOf('/microcemento-preview.js?'));
  }
});

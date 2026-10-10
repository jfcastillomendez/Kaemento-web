const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {entries, search} = require('../site-search.js');
const root = path.resolve(__dirname, '..');

test('Search finds products, services, manuals and commercial actions without accents or exact casing', () => {
  assert.equal(search('BOQUILLA MAGICA')[0].href, '/productos/boquilla-magica.html');
  assert.equal(search('microcemento')[0].href, '/productos/microcemento-kaemento.html');
  assert.equal(search('comprar kit')[0].href, '/productos/microcemento-kaemento.html#comprar-microcemento');
  for (const query of ['simulador', 'tonalidad', 'tonalidades', 'visualizador', 'mezcla paredes', 'simulador cocina']) {
    assert.equal(search(query)[0].href, '/productos/microcemento-kaemento.html#vista-colores-microcemento');
  }
  assert.equal(search('manual de aplicacion')[0].href, '/catalogos/manual-aplicacion-microcemento-kaemento.pdf');
  assert.equal(search('impermeabilizacion')[0].href, '/servicios/fachadas-impermeabilizacion.html');
  assert.equal(search('distribuidores')[0].href, '/red-kaemento.html#aliados');
  assert.equal(search('aplicadores')[0].href, '/red-kaemento.html#aplicadores');
  assert.equal(search('sellador brillante')[0].href, '/productos/microcemento-kaemento.html#comprar-microcemento');
  assert.equal(search('manuales microcemento').length, 2);
  assert.ok(search('microce').length > 0);
  assert.deepEqual(search('zzyyxx-no-existe'), []);
  assert.deepEqual(search('   '), []);
  assert.deepEqual(search('de la'), []);
});

test('Every public search destination and anchor exists; downloads and navigation are covered without duplicates', () => {
  assert.equal(new Set(entries.map(e => e.href)).size, entries.length);
  for (const entry of entries) {
    assert.ok(entry.href.startsWith('/') && !entry.href.startsWith('//'));
    assert.ok(!entry.href.includes('?'));
    const [file, anchor] = entry.href.split('#');
    const destination = path.join(root, file);
    assert.ok(fs.existsSync(destination), entry.href);
    if (anchor) {
      const generated = anchor === 'vista-colores-microcemento' && fs.readFileSync(path.join(root,'microcemento-preview.js'),'utf8').includes("section.id = 'vista-colores-microcemento'");
      assert.ok(generated || fs.readFileSync(destination, 'utf8').includes(`id="${anchor}"`), entry.href);
    }
  }
  assert.equal(entries.filter(e => e.href.endsWith('.pdf')).length, 6);
  const navigation = JSON.parse(fs.readFileSync(path.join(root, 'data/site.json'), 'utf8'));
  for (const [kind, routes] of [['productos', navigation.products], ['servicios', navigation.services]]) {
    for (const [slug] of routes) assert.ok(entries.some(e => e.href === `/${kind}/${slug}.html`), slug);
  }
});

test('Search uses only public destinations, never echoes a private query, and contains no network, tracking or storage API', () => {
  const query = 'PersonaSintetica privacidad-prueba@example.invalid 3001234567';
  assert.deepEqual(search(query), []);
  assert.ok(!JSON.stringify(entries).includes(query));
  const source = fs.readFileSync(path.join(root, 'site-search.js'), 'utf8');
  assert.doesNotMatch(source, /\b(fetch|XMLHttpRequest|sendBeacon|kaementoTrack|gtag|dataLayer|localStorage|sessionStorage|postMessage)\b/);
  assert.doesNotMatch(source, /innerHTML\s*=.*(query|input\.value)/);
  assert.doesNotMatch(source, /<form\b/);
});

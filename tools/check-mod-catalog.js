#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const siteRoot = path.resolve(__dirname, '..');
const dataRoot = path.join(siteRoot, 'mod-data');
const sourceRoot = path.resolve(__dirname, '..', '..', '..', 'INF_DATA');
const summary = JSON.parse(fs.readFileSync(path.join(dataRoot, 'summary.json'), 'utf8'));

assert.strictEqual(summary.schemaVersion, 1, 'Unexpected summary schema');

for (const kind of ['vehicles', 'outfits']) {
  const catalogRoot = path.join(dataRoot, kind);
  const catalog = JSON.parse(fs.readFileSync(path.join(catalogRoot, 'index.json'), 'utf8'));
  assert.strictEqual(catalog.schemaVersion, 2, `${kind}: unexpected schema`);
  assert.strictEqual(catalog.kind, kind, `${kind}: kind mismatch`);
  assert.strictEqual(catalog.totalItems, catalog.items.length, `${kind}: item count mismatch`);
  assert.strictEqual(catalog.totalModels, catalog.models.length, `${kind}: model count mismatch`);
  assert.strictEqual(summary.catalogs[kind].items, catalog.totalItems, `${kind}: summary item mismatch`);
  assert.strictEqual(summary.catalogs[kind].models, catalog.totalModels, `${kind}: summary model mismatch`);
  assert.ok(Number.isInteger(catalog.chunkSize) && catalog.chunkSize > 0, `${kind}: invalid chunk size`);

  const paths = new Set();
  let previous = null;
  let chunk = null;
  for (let index = 0; index < catalog.items.length; index += 1) {
    const item = catalog.items[index];
    if (index % catalog.chunkSize === 0) {
      const chunkName = String(Math.floor(index / catalog.chunkSize)).padStart(3, '0') + '.json';
      chunk = JSON.parse(fs.readFileSync(path.join(catalogRoot, 'chunks', chunkName), 'utf8'));
      assert.ok(chunk.length > 0 && chunk.length <= catalog.chunkSize, `${kind}: invalid chunk ${chunkName}`);
    }
    const detail = chunk[index % catalog.chunkSize];
    assert.ok(Array.isArray(item) && item[0] && item[1] && Number.isInteger(item[3]) && Number.isInteger(item[4]) && Number.isInteger(item[5]), `${kind}: incomplete index item`);
    assert.ok(catalog.models[item[3]] && catalog.categories[item[4]] && catalog.formats[item[5]], `${kind}: invalid dictionary reference`);
    assert.ok(Array.isArray(detail) && detail[0] && Array.isArray(detail[1]), `${kind}: incomplete detail item`);
    assert.ok(!detail[0].startsWith('data/'), `${kind}: obsolete data/ prefix`);
    assert.ok(!paths.has(detail[0].toLowerCase()), `${kind}: duplicate path ${detail[0]}`);
    paths.add(detail[0].toLowerCase());
    assert.ok(fs.existsSync(path.join(sourceRoot, ...detail[0].split('/'))), `${kind}: missing source ${detail[0]}`);
    assert.ok(detail[1].every((preview) => fs.existsSync(path.join(sourceRoot, ...preview.split('/')))), `${kind}: missing preview for ${detail[0]}`);
    assert.doesNotThrow(() => detail[0].split('/').map(encodeURIComponent).join('/'), `${kind}: URL encoding failed`);
    const current = { name: item[0], model: catalog.models[item[3]], path: detail[0] };
    if (previous) {
      const order = previous.model.localeCompare(current.model, 'en', { sensitivity: 'base', numeric: true }) ||
        previous.name.localeCompare(current.name, 'en', { sensitivity: 'base', numeric: true }) ||
        previous.path.localeCompare(current.path, 'en', { sensitivity: 'base', numeric: true });
      assert.ok(order <= 0, `${kind}: catalog order is unstable near ${current.path}`);
    }
    previous = current;
  }

  const searchable = catalog.items.filter((item) =>
    [item[0], item[1], item[2], catalog.models[item[3]], catalog.categories[item[4]], catalog.formats[item[5]]]
      .join('\n').toLowerCase().includes('black')
  );
  assert.ok(searchable.length > 0, `${kind}: representative search returned no results`);
  console.log(`${kind}: ${catalog.totalItems} files, ${catalog.totalModels} models, ${catalog.categories.length} categories, ${catalog.formats.length} formats`);
}

console.log('Mod catalog validation passed.');

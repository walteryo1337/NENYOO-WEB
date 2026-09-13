#!/usr/bin/env node
/* Validate the translation files against i18n/en.json.

   Checks, per language:
     - every source key is present, non-empty and actually translated
     - placeholder tokens (<0>, <0/>, </0>) match the source exactly,
       since a dropped token silently deletes markup at render time
     - no stray keys that no longer exist in the source

   Usage:  node tools/check-i18n.js
*/
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'i18n');
const en = JSON.parse(fs.readFileSync(path.join(DIR, 'en.json'), 'utf8'));
const KEYS = Object.keys(en);

/* order-independent multiset of placeholder tokens */
function tokens(s) {
  return (String(s).match(/<\/?\d+\/?>/g) || []).slice().sort().join('');
}

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json') && f !== 'en.json');
let bad = 0;

for (const f of files.sort()) {
  const code = path.basename(f, '.json');
  const d = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));

  const missing = [], empty = [], mismatch = [], untranslated = [];

  for (const k of KEYS) {
    if (!(k in d)) { missing.push(k); continue; }
    const v = d[k];
    if (typeof v !== 'string' || !v.trim()) { empty.push(k); continue; }
    if (tokens(v) !== tokens(k)) mismatch.push(k);
    else if (v === k && /[A-Za-z]{4}/.test(k.replace(/<\/?\d+\/?>/g, ''))) untranslated.push(k);
  }
  const extra = Object.keys(d).filter(k => !(k in en));

  const errs = missing.length + empty.length + mismatch.length + extra.length;
  const flag = errs ? 'FAIL' : 'ok  ';
  console.log(
    `${flag} ${code}  ${KEYS.length - missing.length}/${KEYS.length} keys` +
    (mismatch.length ? `  placeholder:${mismatch.length}` : '') +
    (empty.length ? `  empty:${empty.length}` : '') +
    (extra.length ? `  stray:${extra.length}` : '') +
    (untranslated.length ? `  same-as-en:${untranslated.length}` : '')
  );

  const show = (label, list) => list.slice(0, 6).forEach(k =>
    console.log(`      ${label}: ${JSON.stringify(k.slice(0, 72))}`));
  show('missing', missing);
  show('empty', empty);
  mismatch.slice(0, 6).forEach(k =>
    console.log(`      placeholder: ${JSON.stringify(k.slice(0, 52))}\n` +
                `                -> ${JSON.stringify(String(d[k]).slice(0, 52))}`));
  show('stray', extra);

  if (errs) bad++;
}

console.log(`\n${files.length} languages, ${bad} with errors`);
process.exit(bad ? 1 : 0);

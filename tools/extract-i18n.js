#!/usr/bin/env node
/* Rebuild i18n/en.json from the pages.

   A "translation unit" is an element whose content is text plus inline markup;
   it becomes ONE entry so word order can move freely between languages. Inline
   children collapse to numbered placeholders:

     <h1>The ultimate <span class="glitch">GTA V</span> mod menu</h1>
       -> "The ultimate <0>GTA V</0> mod menu"

   Tags, classes, styles and SVG path data never reach the translation files,
   so restyling the markup cannot invalidate a translation.

   The key derivation here must stay in lockstep with i18n.js — if the two
   disagree, lookups silently miss and the page stays English.

   Usage:  node tools/extract-i18n.js          # report + rewrite i18n/en.json
           node tools/extract-i18n.js --check   # report only, non-zero on drift
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP_PAGES = new Set(['roadmap.html']);      // instant redirect, nothing to translate

/* ---------------------------------------------------------
   Minimal HTML parser. The site is hand-written, well-formed
   static markup, so this only covers what is actually there.
   --------------------------------------------------------- */
const VOID = new Set(['area','base','br','col','embed','hr','img','input','link',
  'meta','param','source','track','wbr']);
const RAWTEXT = new Set(['script','style']);

function parse(html) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  let i = 0;

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) { top().children.push({ tag: '#text', text: html.slice(i) }); break; }
    if (lt > i) top().children.push({ tag: '#text', text: html.slice(i, lt) });

    if (html.startsWith('<!--', lt)) {
      const e = html.indexOf('-->', lt);
      i = e === -1 ? html.length : e + 3;
      continue;
    }
    if (html.startsWith('<!', lt)) {
      const e = html.indexOf('>', lt);
      i = e === -1 ? html.length : e + 1;
      continue;
    }

    let j = lt + 1, q = null;                       // find '>' outside quotes
    while (j < html.length) {
      const c = html[j];
      if (q) { if (c === q) q = null; }
      else if (c === '"' || c === "'") q = c;
      else if (c === '>') break;
      j++;
    }
    const raw = html.slice(lt + 1, j);
    i = j + 1;

    if (raw[0] === '/') {
      const tag = raw.slice(1).trim().toLowerCase();
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].tag === tag) { stack.length = k; break; }
      }
      continue;
    }

    const m = raw.match(/^([a-zA-Z0-9-]+)/);
    if (!m) continue;
    const tag = m[1].toLowerCase();

    const attrs = {};
    const re = /([a-zA-Z0-9_:@.-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    re.lastIndex = m[1].length;
    let a;
    while ((a = re.exec(raw))) {
      if (a[1] === '/') continue;
      attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
    }

    const node = { tag, attrs, children: [] };
    top().children.push(node);
    if (VOID.has(tag) || raw.endsWith('/')) continue;

    if (RAWTEXT.has(tag)) {
      const close = html.toLowerCase().indexOf('</' + tag, i);
      const end = close === -1 ? html.length : close;
      const gt = html.indexOf('>', end);
      i = gt === -1 ? html.length : gt + 1;
      continue;
    }
    stack.push(node);
  }
  return root;
}

const ENTS = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' ', hellip:'…',
  middot:'·', times:'×', rarr:'→', larr:'←', mdash:'—', ndash:'–', bull:'•',
  lsquo:'‘', rsquo:'’', ldquo:'“', rdquo:'”',
  deg:'°', copy:'©', reg:'®', trade:'™', laquo:'«', raquo:'»' };

function decode(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (full, body) => {
    if (body[0] === '#') {
      const n = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : full;
    }
    return ENTS[body] ?? ENTS[body.toLowerCase()] ?? full;
  });
}
const textOf = n => n.tag === '#text' ? decode(n.text)
  : n.tag[0] === '#' ? '' : n.children.map(textOf).join('');

/* ---------------------------------------------------------
   Unit selection — mirrors i18n.js
   --------------------------------------------------------- */
const INLINE = new Set(('a span strong em b i br small mark code sub sup u s abbr ' +
  'kbd time wbr img svg bdi bdo q cite var del ins button label').split(' '));
const SKIP = new Set('script style pre noscript template canvas iframe'.split(' '));
const OPAQUE = new Set('svg img br wbr input'.split(' '));

/* brand names, product tiers, code identifiers and sample values stay verbatim */
const DENY = [
  /^N3NY000$/i, /^Nenyooo?$/i, /^Discord$/i, /^BattlEye$/i, /^GTA ?V$/i,
  /^0x/, /^https?:\/\//, /^J\.A\.R\.V\.I\.S/, /^(Jake|Mike|Alex|Sam)$/,
  /^ScriptHookV$/i, /^JOAAT/i, /^HWID$/i, /^n3ny000 · console/i,
  /^MVP( Plus)?$/, /^VIP$/, /^ID$/, /^FAQ$/, /^Lua$/i,
  /^X{4}(-X{4})+$/i, /^you@example\.com$/i, /^Infamous$/i,
  /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/, /^v\d+(\.\d+)+$/i,
  /^(Paysafe|Skrill|PayPal|Steam|MEGA)$/i, /^Nenyoo Loader$/i,
];

const norm = s => String(s).replace(/\s+/g, ' ').trim();
const stripPh = s => s.replace(/<\/?\d+\/?>/g, '');
const isEl = n => n.tag[0] !== '#';
const hasBlockChild = n => n.children.some(c => isEl(c) && !INLINE.has(c.tag));
const directText = n => n.children.some(c => c.tag === '#text' && norm(decode(c.text)));

const units = new Map();
function add(key, page) {
  const k = norm(key);
  const plain = norm(stripPh(k));
  if (plain.length < 2 || !/[A-Za-z]/.test(plain)) return;
  if (/^[\d\s.,:%+\-—·|/×✓★]+$/.test(plain)) return;
  if (DENY.some(re => re.test(plain))) return;
  if (!units.has(k)) units.set(k, new Set());
  units.get(k).add(page);
}

function serialize(node) {
  let out = '', idx = 0;
  for (const c of node.children) {
    if (c.tag === '#text') { out += decode(c.text); continue; }
    if (!isEl(c)) continue;
    const n = idx++;
    if (OPAQUE.has(c.tag) || !norm(textOf(c))) { out += `<${n}/>`; continue; }
    out += `<${n}>` + serialize(c) + `</${n}>`;
  }
  return out;
}

function walk(node, page) {
  for (const c of node.children) {
    if (!isEl(c) || SKIP.has(c.tag) || 'data-no-i18n' in c.attrs) continue;

    for (const a of ['placeholder', 'title', 'aria-label', 'alt']) {
      if (c.attrs[a]) add(decode(c.attrs[a]), page);
    }
    if (c.tag === 'meta') {
      const ok = c.attrs.name === 'description' ||
                 c.attrs.property === 'og:title' || c.attrs.property === 'og:description';
      if (ok && c.attrs.content) add(decode(c.attrs.content), page);
      continue;
    }
    if (c.tag === 'input' && c.attrs.value && /^(submit|button)$/i.test(c.attrs.type || '')) {
      add(decode(c.attrs.value), page);
    }
    if (c.tag === 'title') { add(textOf(c), page); continue; }
    if (c.tag === 'svg') continue;

    if (!hasBlockChild(c) && directText(c)) { add(serialize(c), page); continue; }
    if (hasBlockChild(c)) {
      for (const t of c.children) {
        if (t.tag === '#text' && norm(decode(t.text))) add(decode(t.text), page);
      }
    }
    walk(c, page);
  }
}

const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && !SKIP_PAGES.has(f));
for (const p of pages) walk(parse(fs.readFileSync(path.join(ROOT, p), 'utf8')), p);

const keys = [...units.keys()].sort((a, b) => a.localeCompare(b));
const enPath = path.join(ROOT, 'i18n', 'en.json');
const prev = fs.existsSync(enPath) ? JSON.parse(fs.readFileSync(enPath, 'utf8')) : {};

const added = keys.filter(k => !(k in prev));
const removed = Object.keys(prev).filter(k => !units.has(k));

console.log(`${pages.length} pages, ${keys.length} units`);
if (added.length)   console.log(`\n+ ${added.length} new:\n` + added.map(k => '  ' + k.slice(0, 80)).join('\n'));
if (removed.length) console.log(`\n- ${removed.length} gone:\n` + removed.map(k => '  ' + k.slice(0, 80)).join('\n'));
if (!added.length && !removed.length) console.log('no change');

if (process.argv.includes('--check')) process.exit(added.length || removed.length ? 1 : 0);

const out = {};
for (const k of keys) out[k] = k;
fs.writeFileSync(enPath, JSON.stringify(out, null, 2) + '\n', 'utf8');

if (added.length || removed.length) {
  console.log('\ni18n/en.json rewritten. The other 13 files still hold the old key set —');
  console.log('run node tools/check-i18n.js to see exactly which entries need attention.');
}

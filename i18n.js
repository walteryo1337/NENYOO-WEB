/* ============================================================
   N3NY000 — i18n runtime

   Strings are keyed by their English source, matching the loader's
   lang_*.json convention. Inline markup inside a translatable block
   collapses to numbered placeholders:

     <h1>The ultimate <span class="glitch">GTA V</span> mod menu</h1>
       key -> "The ultimate <0>GTA V</0> mod menu"
       de  -> "Das ultimative <0>GTA V</0> Mod-Menü"

   so word order is free to move and restyling the markup never
   invalidates a translation. <N> maps back to the Nth element child
   of the live node at render time.

   Loaded on every page. Everything is a no-op when the language is
   English or the dictionary is missing.
   ============================================================ */
(function () {
  'use strict';

  var STORE_KEY = 'nenyoo_lang';
  var DEFAULT = 'en';

  /* ---------------------------------------------------------
     Languages. `name` is the endonym — a picker that lists
     "Deutsch" is usable by someone who can't read "German".
     --------------------------------------------------------- */
  var LANGS = [
    { code: 'en', name: 'English',    label: 'EN' },
    { code: 'de', name: 'Deutsch',    label: 'DE' },
    { code: 'es', name: 'Español',    label: 'ES' },
    { code: 'fr', name: 'Français',   label: 'FR' },
    { code: 'it', name: 'Italiano',   label: 'IT' },
    { code: 'pt', name: 'Português',  label: 'PT' },
    { code: 'pl', name: 'Polski',     label: 'PL' },
    { code: 'ru', name: 'Русский',    label: 'RU' },
    { code: 'tr', name: 'Türkçe',     label: 'TR' },
    { code: 'cn', name: '中文',        label: 'CN' },
    { code: 'jp', name: '日本語',      label: 'JP' },
    { code: 'kr', name: '한국어',      label: 'KR' },
    { code: 'hi', name: 'हिन्दी',       label: 'HI' },
    { code: 'th', name: 'ไทย',        label: 'TH' }
  ];

  /* Flag art is inline SVG, never emoji: Windows ships no flag-emoji
     font, so 🇩🇪 renders as the letters "DE" for most of our visitors. */
  var FLAGS = {
    en: '<svg viewBox="0 0 24 16"><path fill="#012169" d="M0 0h24v16H0z"/><path stroke="#fff" stroke-width="3.2" d="M0 0l24 16M24 0L0 16"/><path stroke="#C8102E" stroke-width="1.9" d="M0 0l24 16M24 0L0 16"/><path fill="#fff" d="M9.6 0h4.8v16H9.6z"/><path fill="#fff" d="M0 5.6h24v4.8H0z"/><path fill="#C8102E" d="M10.8 0h2.4v16h-2.4z"/><path fill="#C8102E" d="M0 6.8h24v2.4H0z"/></svg>',
    de: '<svg viewBox="0 0 24 16"><path fill="#000" d="M0 0h24v5.34H0z"/><path fill="#D00" d="M0 5.34h24v5.33H0z"/><path fill="#FFCE00" d="M0 10.67h24V16H0z"/></svg>',
    es: '<svg viewBox="0 0 24 16"><path fill="#AA151B" d="M0 0h24v16H0z"/><path fill="#F1BF00" d="M0 4h24v8H0z"/></svg>',
    fr: '<svg viewBox="0 0 24 16"><path fill="#002395" d="M0 0h8v16H0z"/><path fill="#fff" d="M8 0h8v16H8z"/><path fill="#ED2939" d="M16 0h8v16h-8z"/></svg>',
    it: '<svg viewBox="0 0 24 16"><path fill="#009246" d="M0 0h8v16H0z"/><path fill="#fff" d="M8 0h8v16H8z"/><path fill="#CE2B37" d="M16 0h8v16h-8z"/></svg>',
    pt: '<svg viewBox="0 0 24 16"><path fill="#046A38" d="M0 0h24v16H0z"/><path fill="#DA291C" d="M9.6 0H24v16H9.6z"/><circle cx="9.6" cy="8" r="3.4" fill="#FFE900" stroke="#046A38" stroke-width=".7"/><circle cx="9.6" cy="8" r="1.7" fill="#fff" stroke="#DA291C" stroke-width=".7"/></svg>',
    pl: '<svg viewBox="0 0 24 16"><path fill="#fff" d="M0 0h24v8H0z"/><path fill="#DC143C" d="M0 8h24v8H0z"/></svg>',
    ru: '<svg viewBox="0 0 24 16"><path fill="#fff" d="M0 0h24v5.34H0z"/><path fill="#0039A6" d="M0 5.34h24v5.33H0z"/><path fill="#D52B1E" d="M0 10.67h24V16H0z"/></svg>',
    tr: '<svg viewBox="0 0 24 16"><path fill="#E30A17" d="M0 0h24v16H0z"/><circle cx="9" cy="8" r="4" fill="#fff"/><circle cx="10.4" cy="8" r="3.2" fill="#E30A17"/><path fill="#fff" d="M14.4 8l3.3-1.08-2.04 2.8V6.28l2.04 2.8z"/></svg>',
    cn: '<svg viewBox="0 0 24 16"><path fill="#DE2910" d="M0 0h24v16H0z"/><path fill="#FFDE00" d="M4 2.2l.92 2.84-2.42-1.76h3l-2.42 1.76z"/><path fill="#FFDE00" d="M9.2 1.6l.36 1.1-.94-.68h1.16l-.94.68zM11 3.8l.36 1.1-.94-.68h1.16l-.94.68zM11 6.4l.36 1.1-.94-.68h1.16l-.94.68zM9.2 8.4l.36 1.1-.94-.68h1.16l-.94.68z"/></svg>',
    jp: '<svg viewBox="0 0 24 16"><path fill="#fff" d="M0 0h24v16H0z"/><circle cx="12" cy="8" r="4.8" fill="#BC002D"/></svg>',
    kr: '<svg viewBox="0 0 24 16"><path fill="#fff" d="M0 0h24v16H0z"/><path fill="#CD2E3A" d="M12 3.2a4.8 4.8 0 010 9.6 2.4 2.4 0 000-4.8 2.4 2.4 0 010-4.8z"/><path fill="#0047A0" d="M12 3.2a4.8 4.8 0 000 9.6 2.4 2.4 0 010-4.8 2.4 2.4 0 000-4.8z"/><g fill="#000"><path d="M3 3.4l1.7 1.2-.4.6L2.6 4zM3.9 2.1l1.7 1.2-.4.6-1.7-1.2z"/><path d="M19.3 11.6l1.7 1.2-.4.6-1.7-1.2zM20.2 10.3l1.7 1.2-.4.6-1.7-1.2z"/></g></svg>',
    hi: '<svg viewBox="0 0 24 16"><path fill="#FF9933" d="M0 0h24v5.34H0z"/><path fill="#fff" d="M0 5.34h24v5.33H0z"/><path fill="#138808" d="M0 10.67h24V16H0z"/><circle cx="12" cy="8" r="2.1" fill="none" stroke="#000080" stroke-width=".55"/><circle cx="12" cy="8" r=".45" fill="#000080"/></svg>',
    th: '<svg viewBox="0 0 24 16"><path fill="#A51931" d="M0 0h24v16H0z"/><path fill="#F4F5F8" d="M0 2.67h24v10.66H0z"/><path fill="#2D2A4A" d="M0 5.34h24v5.33H0z"/></svg>'
  };

  /* ---------------------------------------------------------
     Key derivation. Mirrors tools/extract-i18n.js exactly — if
     these two ever disagree, lookups silently miss.
     --------------------------------------------------------- */
  var INLINE = ('a span strong em b i br small mark code sub sup u s abbr kbd time ' +
    'wbr img svg bdi bdo q cite var del ins button label').split(' ');
  var SKIP = 'script style pre noscript template canvas iframe'.split(' ');
  var OPAQUE = 'svg img br wbr input'.split(' ');

  function has(arr, v) { return arr.indexOf(v) !== -1; }
  function tagOf(el) { return el.tagName ? el.tagName.toLowerCase() : ''; }
  function norm(s) { return String(s).replace(/\s+/g, ' ').trim(); }

  function elChildren(el) {
    var out = [], n = el.firstChild;
    for (; n; n = n.nextSibling) if (n.nodeType === 1) out.push(n);
    return out;
  }
  function hasBlockChild(el) {
    var k = elChildren(el);
    for (var i = 0; i < k.length; i++) if (!has(INLINE, tagOf(k[i]))) return true;
    return false;
  }
  function hasDirectText(el) {
    for (var n = el.firstChild; n; n = n.nextSibling)
      if (n.nodeType === 3 && norm(n.nodeValue)) return true;
    return false;
  }

  function serialize(el) {
    var out = '', idx = 0;
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) { out += n.nodeValue; continue; }
      if (n.nodeType !== 1) continue;
      var i = idx++;
      if (has(OPAQUE, tagOf(n)) || !norm(n.textContent)) { out += '<' + i + '/>'; continue; }
      out += '<' + i + '>' + serialize(n) + '</' + i + '>';
    }
    return out;
  }

  /* ---------------------------------------------------------
     Rendering a translated unit back into the live node.
     --------------------------------------------------------- */
  /* Placeholder indices restart at every nesting level, so <0> can legally
     contain another <0>. Match by depth rather than the first </N> found. */
  function findClose(str, n, from) {
    var open = '<' + n + '>', close = '</' + n + '>', depth = 1, i = from;
    while (i < str.length) {
      var o = str.indexOf(open, i), c = str.indexOf(close, i);
      if (c === -1) return -1;
      if (o !== -1 && o < c) { depth++; i = o + open.length; }
      else { if (--depth === 0) return c; i = c + close.length; }
    }
    return -1;
  }

  function render(str, originals) {
    var frag = document.createDocumentFragment();
    var re = /<(\d+)(\/)?>/g, pos = 0, m;

    while ((m = re.exec(str))) {
      if (m.index > pos) frag.appendChild(document.createTextNode(str.slice(pos, m.index)));
      var origin = originals[+m[1]];

      if (m[2]) {                                  // <N/> — opaque, reuse as-is
        if (origin) frag.appendChild(origin.cloneNode(true));
        pos = re.lastIndex;
        continue;
      }
      var close = findClose(str, m[1], re.lastIndex);
      if (close === -1) { pos = re.lastIndex; continue; }

      if (origin) {
        var clone = origin.cloneNode(true);
        var nested = elChildren(clone);
        while (clone.firstChild) clone.removeChild(clone.firstChild);
        clone.appendChild(render(str.slice(re.lastIndex, close), nested));
        frag.appendChild(clone);
      }
      pos = re.lastIndex = close + m[1].length + 3;
    }
    if (pos < str.length) frag.appendChild(document.createTextNode(str.slice(pos)));
    return frag;
  }

  /* ---------------------------------------------------------
     State
     --------------------------------------------------------- */
  var dict = null;          // key -> translated string
  var current = DEFAULT;
  var applying = false;     // guards the MutationObserver against our own writes
  var seen = window.WeakMap ? new WeakMap() : null;   // el -> {key, originals}
  var attrSeen = window.WeakMap ? new WeakMap() : null;
  var origTitle = null, origDesc = null;

  function lookup(key) {
    if (!dict) return null;
    var v = dict[key];
    return (typeof v === 'string' && v) ? v : null;
  }

  /* The key and the original children are captured once, before the first
     write — re-deriving them later would read back translated text. */
  function record(el) {
    var rec = seen && seen.get(el);
    if (!rec) {
      rec = { key: norm(serialize(el)), originals: elChildren(el) };
      if (seen) seen.set(el, rec);
    }
    return rec;
  }

  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

  function applyAttrs(el) {
    var rec = attrSeen && attrSeen.get(el);
    if (!rec) {
      rec = {};
      for (var i = 0; i < ATTRS.length; i++) {
        var v = el.getAttribute(ATTRS[i]);
        if (v) rec[ATTRS[i]] = v;
      }
      if (tagOf(el) === 'input' && /^(submit|button)$/i.test(el.type || '')) {
        if (el.value) rec.value = el.value;
      }
      if (attrSeen) attrSeen.set(el, rec);
    }
    for (var a in rec) {
      if (!Object.prototype.hasOwnProperty.call(rec, a)) continue;
      var t = lookup(norm(rec[a]));
      if (a === 'value') el.value = t || rec[a];
      else el.setAttribute(a, t || rec[a]);
    }
  }

  function walk(root) {
    var kids = elChildren(root);
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i], tag = tagOf(el);
      if (has(SKIP, tag) || el.hasAttribute('data-no-i18n')) continue;
      if ((el.getAttribute('class') || '').indexOf('i18n-') === 0) continue;

      applyAttrs(el);
      if (tag === 'svg') continue;

      if (!hasBlockChild(el) && hasDirectText(el)) {
        var rec = record(el);
        var t = lookup(rec.key);          // a miss leaves the English in place
        if (t && t !== rec.key) {
          while (el.firstChild) el.removeChild(el.firstChild);
          el.appendChild(render(t, rec.originals));
        }
        continue;
      }
      walk(el);
    }
  }

  /* og:* matters as much as the visible page here — most links to this
     site are pasted into Discord, which renders the card, not the page. */
  var META_SEL = ['meta[name="description"]',
                  'meta[property="og:title"]',
                  'meta[property="og:description"]'];

  function applyHead() {
    if (origTitle === null) origTitle = norm(document.title);
    var t = lookup(origTitle);
    if (t) document.title = t;

    if (origDesc === null) {
      origDesc = [];
      for (var i = 0; i < META_SEL.length; i++) {
        var el = document.querySelector(META_SEL[i]);
        origDesc.push(el ? norm(el.getAttribute('content') || '') : null);
      }
    }
    for (var j = 0; j < META_SEL.length; j++) {
      if (!origDesc[j]) continue;
      var node = document.querySelector(META_SEL[j]);
      var v = lookup(origDesc[j]);
      if (node && v) node.setAttribute('content', v);
    }

    /* the loader's codes are legacy; the document needs real BCP-47 tags */
    var bcp = { cn: 'zh', jp: 'ja', kr: 'ko' };
    document.documentElement.setAttribute('lang', bcp[current] || current);
  }

  function apply() {
    if (!document.body) return;
    applying = true;
    try {
      walk(document.body);
      applyHead();
      document.documentElement.setAttribute('data-lang', current);
    } finally {
      applying = false;
    }
  }

  /* ---------------------------------------------------------
     Dynamic content: features.js, guides and the dashboard all
     render after load, so newly inserted subtrees get the same
     treatment. Our own writes are filtered out via `applying`.
     --------------------------------------------------------- */
  var pending = null;
  function observe() {
    if (!window.MutationObserver) return;
    new MutationObserver(function (records) {
      if (applying || !dict || current === DEFAULT) return;
      for (var i = 0; i < records.length; i++) {
        if (records[i].addedNodes && records[i].addedNodes.length) {
          if (pending) clearTimeout(pending);
          pending = setTimeout(function () { pending = null; apply(); }, 60);
          return;
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  /* ---------------------------------------------------------
     Load + switch
     --------------------------------------------------------- */
  function stored() {
    try { return localStorage.getItem(STORE_KEY) || ''; } catch (e) { return ''; }
  }
  function remember(code) {
    try { localStorage.setItem(STORE_KEY, code); } catch (e) {}
  }
  function known(code) {
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i].code === code) return true;
    return false;
  }

  /* navigator.language -> our codes; zh/ja/ko carry legacy names here.

     `firm` means the browser named a language we actually ship. Only a soft
     result (English, i.e. our fallback) is open to the country tiebreaker
     below — a browser set to German is a deliberate signal and outranks
     whatever an exit node claims. */
  function detect() {
    var s = stored();
    if (s && known(s)) return { code: s, firm: true };
    var list = navigator.languages || [navigator.language || ''];
    for (var i = 0; i < list.length; i++) {
      var tag = String(list[i]).toLowerCase();
      var base = tag.split('-')[0];
      var map = { zh: 'cn', ja: 'jp', ko: 'kr' };
      var code = map[base] || base;
      if (known(code)) return { code: code, firm: code !== DEFAULT };
    }
    return { code: DEFAULT, firm: false };
  }

  /* ---------------------------------------------------------
     Country tiebreaker.

     Catches the visitor running an English OS from a country we do ship a
     language for. Deliberately conservative: a country is only mapped when
     one of our languages is the clear majority there.

     Left unmapped on purpose —
       UA  no Ukrainian in the set; defaulting it to Russian is not ours to do
       TW/HK/MO  Traditional Chinese; our zh file is Simplified
       BE/CH/CY  genuinely split, and the browser already answers better
     --------------------------------------------------------- */
  var GEO_KEY = 'nenyoo_country';
  var COUNTRY_LANG = {
    DE: 'de', AT: 'de',
    ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es',
    EC: 'es', GT: 'es', CU: 'es', BO: 'es', DO: 'es', HN: 'es', PY: 'es',
    SV: 'es', NI: 'es', CR: 'es', PA: 'es', UY: 'es', PR: 'es',
    FR: 'fr', MC: 'fr',
    IT: 'it', SM: 'it',
    PT: 'pt', BR: 'pt', AO: 'pt', MZ: 'pt',
    PL: 'pl',
    RU: 'ru', BY: 'ru', KZ: 'ru', KG: 'ru',
    TR: 'tr',
    CN: 'cn', SG: 'cn',
    JP: 'jp',
    KR: 'kr',
    IN: 'hi',
    TH: 'th'
  };

  function cachedCountry() {
    try { return localStorage.getItem(GEO_KEY) || ''; } catch (e) { return ''; }
  }
  function cacheCountry(cc) {
    try { localStorage.setItem(GEO_KEY, cc); } catch (e) {}
  }

  /* One lookup per visitor, not per visit — the answer is cached even when it
     maps to nothing, so a miss never re-requests. Fails silently to English. */
  function lookupCountry() {
    var hit = cachedCountry();
    if (hit) return Promise.resolve(hit === '-' ? '' : hit);

    return new Promise(function (resolve) {
      var done = false;
      var finish = function (cc) {
        if (done) return;
        done = true;
        cacheCountry(cc || '-');
        resolve(cc || '');
      };
      setTimeout(function () { finish(''); }, 2500);   // never hold the page

      fetch('https://api.country.is/', { mode: 'cors', credentials: 'omit' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          finish(d && d.country ? String(d.country).toUpperCase() : '');
        })
        .catch(function () { finish(''); });
    });
  }

  function load(code) {
    if (code === DEFAULT) return Promise.resolve(null);
    return fetch('/i18n/' + code + '.json', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function setLang(code, persist) {
    if (!known(code)) code = DEFAULT;
    if (persist) remember(code);

    if (code === DEFAULT) {
      if (current !== DEFAULT) { location.reload(); return Promise.resolve(); }
      current = DEFAULT;
      dict = null;
      syncPicker();
      return Promise.resolve();
    }
    return load(code).then(function (d) {
      if (!d) return;
      dict = d;
      current = code;
      apply();
      syncPicker();
    });
  }

  /* ---------------------------------------------------------
     Picker UI
     --------------------------------------------------------- */
  function flag(code) { return FLAGS[code] || FLAGS.en; }
  function langByCode(code) {
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i].code === code) return LANGS[i];
    return LANGS[0];
  }

  var pickers = [];

  function buildPicker(variant) {
    var wrap = document.createElement('div');
    wrap.className = 'i18n-pick' + (variant ? ' i18n-pick-' + variant : '');
    wrap.setAttribute('data-no-i18n', '');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'i18n-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Change language');

    var menu = document.createElement('div');
    menu.className = 'i18n-menu';
    menu.setAttribute('role', 'listbox');

    LANGS.forEach(function (l) {
      var it = document.createElement('button');
      it.type = 'button';
      it.className = 'i18n-item';
      it.setAttribute('role', 'option');
      it.setAttribute('data-code', l.code);
      it.innerHTML = '<span class="i18n-flag">' + flag(l.code) + '</span>' +
                     '<span class="i18n-name"></span>';
      it.querySelector('.i18n-name').textContent = l.name;
      it.addEventListener('click', function () {
        close();
        setLang(l.code, true);
      });
      menu.appendChild(it);
    });

    function open() {
      wrap.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      document.addEventListener('click', outside, true);
      document.addEventListener('keydown', onKey, true);
    }
    function close() {
      wrap.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', outside, true);
      document.removeEventListener('keydown', onKey, true);
    }
    function outside(e) { if (!wrap.contains(e.target)) close(); }
    function onKey(e) { if (e.key === 'Escape') { close(); btn.focus(); } }

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      wrap.classList.contains('is-open') ? close() : open();
    });

    wrap.appendChild(btn);
    wrap.appendChild(menu);
    pickers.push({ wrap: wrap, btn: btn, menu: menu });
    return wrap;
  }

  function syncPicker() {
    var l = langByCode(current);
    pickers.forEach(function (p) {
      p.btn.innerHTML = '<span class="i18n-flag">' + flag(l.code) + '</span>' +
                        '<span class="i18n-code"></span>' +
                        '<svg class="i18n-caret" viewBox="0 0 10 6" aria-hidden="true">' +
                        '<path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
      p.btn.querySelector('.i18n-code').textContent = l.label;
      var items = p.menu.querySelectorAll('.i18n-item');
      for (var i = 0; i < items.length; i++) {
        var on = items[i].getAttribute('data-code') === current;
        items[i].classList.toggle('is-active', on);
        items[i].setAttribute('aria-selected', on ? 'true' : 'false');
      }
    });
  }

  function mount() {
    var actions = document.querySelector('.nav-actions');
    if (actions) {
      var burger = actions.querySelector('.nav-burger');
      var p = buildPicker('');
      burger ? actions.insertBefore(p, burger) : actions.appendChild(p);
    }
    var drawer = document.querySelector('.nav-drawer');
    if (drawer) drawer.appendChild(buildPicker('drawer'));

    // pages without the shared nav (login, signup, forgot…) get a floating one
    if (!actions && !drawer) {
      var f = buildPicker('float');
      if (document.body) document.body.appendChild(f);
    }
    syncPicker();
  }

  /* ---------------------------------------------------------
     Boot. The dictionary fetch starts during head parse so the
     English flash on a translated page stays short.

     A firm pick (saved choice, or a browser language we ship) resolves here
     with no network geo lookup at all — most visitors never trigger one. Only
     the soft case consults the country, and a cached country still resolves
     synchronously, so the lookup happens once per visitor at most.
     --------------------------------------------------------- */
  var picked = detect();
  var initial = picked.code;
  var early = initial === DEFAULT ? Promise.resolve(null) : load(initial);

  /* soft pick + a country we already know: settle it before first paint */
  if (!picked.firm) {
    var knownCC = cachedCountry();
    var byGeo = knownCC && knownCC !== '-' ? COUNTRY_LANG[knownCC] : null;
    if (byGeo && known(byGeo)) {
      initial = byGeo;
      early = load(initial);
    }
  }

  function start() {
    mount();
    observe();
    early.then(function (d) {
      if (d) { dict = d; current = initial; apply(); }
      syncPicker();

      /* Still English and nothing saved — ask once where they are. The page is
         already usable, so this only ever upgrades it; a failure leaves English
         in place. Never persisted as a choice, so changing the browser's
         language still wins on a later visit. */
      if (!picked.firm && current === DEFAULT && !cachedCountry()) {
        lookupCountry().then(function (cc) {
          var lang = cc && COUNTRY_LANG[cc];
          if (!lang || !known(lang) || lang === DEFAULT) return;
          if (stored()) return;                 // they chose while we waited
          load(lang).then(function (d2) {
            if (!d2 || stored()) return;
            dict = d2; current = lang;
            apply();
            syncPicker();
          });
        });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.NenyooI18n = {
    langs: LANGS,
    set: function (c) { return setLang(c, true); },
    get: function () { return current; },
    key: function (el) { return norm(serialize(el)); }
  };
})();

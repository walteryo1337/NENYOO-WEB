(function () {
  'use strict';

  var root = document.querySelector('[data-mod-catalog]');
  if (!root) return;

  var kind = root.getAttribute('data-mod-catalog');
  var noun = kind === 'vehicles' ? 'vehicle' : 'outfit';
  var dataUrl = '/mod-data/' + kind + '/index.json';
  var catalog = null;
  var filtered = [];
  var searchTimer = 0;
  var renderVersion = 0;
  var chunkCache = new Map();
  var state = { q: '', model: 'all', category: 'all', format: 'all', page: 1, perPage: 24 };
  var els = {
    loading: document.getElementById('catalogLoading'),
    error: document.getElementById('catalogError'),
    errorText: document.getElementById('catalogErrorText'),
    retry: document.getElementById('catalogRetry'),
    empty: document.getElementById('catalogEmpty'),
    results: document.getElementById('catalogResults'),
    groups: document.getElementById('catalogGroups'),
    pagination: document.getElementById('catalogPagination'),
    previous: document.getElementById('catalogPrevious'),
    next: document.getElementById('catalogNext'),
    pageInfo: document.getElementById('catalogPageInfo'),
    resultSummary: document.getElementById('catalogResultSummary'),
    q: document.getElementById('catalogSearch'),
    clear: document.getElementById('catalogClear'),
    model: document.getElementById('catalogModel'),
    category: document.getElementById('catalogCategory'),
    format: document.getElementById('catalogFormat'),
    perPage: document.getElementById('catalogPerPage'),
    total: document.getElementById('catalogTotal'),
    models: document.getElementById('catalogModels'),
    showing: document.getElementById('catalogShowing'),
    modal: document.getElementById('catalogModal'),
    modalImage: document.getElementById('catalogModalImage'),
    modalCaption: document.getElementById('catalogModalCaption'),
    modalClose: document.getElementById('catalogModalClose'),
    modalPrevious: document.getElementById('catalogModalPrevious'),
    modalNext: document.getElementById('catalogModalNext')
  };
  var modalState = { item: null, index: 0, opener: null };

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function number(value) {
    return new Intl.NumberFormat().format(value);
  }

  function parsePositiveInt(value, fallback) {
    var parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function readState() {
    var params = new URLSearchParams(window.location.search);
    state.q = (params.get('q') || '').trim();
    state.model = params.get('model') || 'all';
    state.category = params.get('category') || 'all';
    state.format = params.get('format') || 'all';
    state.page = parsePositiveInt(params.get('page'), 1);
    var size = parsePositiveInt(params.get('perPage'), 24);
    state.perPage = [12, 24, 48].indexOf(size) === -1 ? 24 : size;
  }

  function writeState(push) {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.model !== 'all') params.set('model', state.model);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.format !== 'all') params.set('format', state.format);
    if (state.page > 1) params.set('page', String(state.page));
    if (state.perPage !== 24) params.set('perPage', String(state.perPage));
    var url = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash;
    window.history[push ? 'pushState' : 'replaceState'](null, '', url);
  }

  function applyStateToControls() {
    els.q.value = state.q;
    els.clear.classList.toggle('is-hidden', !state.q);
    els.model.value = optionExists(els.model, state.model) ? state.model : 'all';
    els.category.value = optionExists(els.category, state.category) ? state.category : 'all';
    els.format.value = optionExists(els.format, state.format) ? state.format : 'all';
    els.perPage.value = String(state.perPage);
    state.model = els.model.value;
    state.category = els.category.value;
    state.format = els.format.value;
  }

  function optionExists(select, value) {
    return Array.prototype.some.call(select.options, function (option) { return option.value === value; });
  }

  function addOptions(select, values) {
    values.forEach(function (value) {
      var option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  }

  function sourceUrl(relativePath) {
    return catalog.sourceBaseUrl + relativePath.split('/').map(encodeURIComponent).join('/');
  }

  function filterItems() {
    var query = state.q.toLocaleLowerCase();
    filtered = [];
    catalog.items.forEach(function (item, index) {
      var model = catalog.models[item[3]];
      var category = catalog.categories[item[4]];
      var format = catalog.formats[item[5]];
      if (state.model !== 'all' && model !== state.model) return;
      if (state.category !== 'all' && category !== state.category) return;
      if (state.format !== 'all' && format !== state.format) return;
      if (query && ![item[0], item[1], item[2], model, category, format].some(function (value) {
        return String(value).toLocaleLowerCase().indexOf(query) !== -1;
      })) return;
      filtered.push(index);
    });
  }

  function chunkName(chunkIndex) {
    return String(chunkIndex).padStart(3, '0');
  }

  function loadChunk(chunkIndex) {
    if (chunkCache.has(chunkIndex)) return chunkCache.get(chunkIndex);
    var pending = fetch('/mod-data/' + kind + '/chunks/' + chunkName(chunkIndex) + '.json')
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .catch(function (error) {
        chunkCache.delete(chunkIndex);
        throw error;
      });
    chunkCache.set(chunkIndex, pending);
    return pending;
  }

  function loadChunks(indices) {
    var chunks = [...new Set(indices.map(function (index) { return Math.floor(index / catalog.chunkSize); }))];
    return Promise.all(chunks.map(loadChunk));
  }

  async function hydrate(index) {
    var row = catalog.items[index];
    var chunkIndex = Math.floor(index / catalog.chunkSize);
    var chunk = await loadChunk(chunkIndex);
    var detail = chunk[index % catalog.chunkSize];
    if (!detail) throw new Error('Missing catalog detail for item ' + index);
    return {
      id: kind + '-' + index,
      name: row[0],
      filename: row[1],
      hash: row[2],
      model: catalog.models[row[3]],
      category: catalog.categories[row[4]],
      format: catalog.formats[row[5]],
      path: detail[0],
      previews: detail[1] || []
    };
  }

  function placeholder() {
    return el('span', 'preset-placeholder', kind === 'vehicles' ? '◇' : '◆');
  }

  function preview(item) {
    if (!item.previews.length) {
      var empty = el('div', 'preset-preview');
      empty.setAttribute('aria-hidden', 'true');
      empty.appendChild(placeholder());
      return empty;
    }

    var button = el('button', 'preset-preview');
    button.type = 'button';
    button.setAttribute('aria-label', 'Open previews for ' + item.name);
    var image = document.createElement('img');
    image.src = sourceUrl(item.previews[0]);
    image.alt = item.name + ' preview';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.fetchPriority = 'low';
    image.addEventListener('error', function () {
      button.removeChild(image);
      button.appendChild(placeholder());
      button.disabled = true;
    }, { once: true });
    button.appendChild(image);
    if (item.previews.length > 1) button.appendChild(el('span', 'preview-count', '1 / ' + item.previews.length));
    button.addEventListener('click', function () { openModal(item, button); });
    return button;
  }

  function tag(text) {
    return el('span', 'preset-tag', text);
  }

  function card(item) {
    var article = el('article', 'preset-card');
    article.id = item.id;
    article.appendChild(preview(item));
    var body = el('div', 'preset-body');
    var heading = el('h3', 'preset-name', item.name);
    heading.title = item.filename;
    body.appendChild(heading);
    var tags = el('div', 'preset-tags');
    tags.appendChild(tag(item.category));
    tags.appendChild(tag(item.format));
    body.appendChild(tags);
    body.appendChild(el('div', 'preset-hash', item.hash ? 'Hash ' + item.hash : item.filename));
    var download = el('button', 'preset-download', '↓ Download ' + item.format);
    download.type = 'button';
    var message = el('p', 'preset-message');
    message.setAttribute('aria-live', 'polite');
    download.addEventListener('click', function () { downloadItem(item, download, message); });
    body.appendChild(download);
    body.appendChild(message);
    article.appendChild(body);
    return article;
  }

  async function render() {
    var version = ++renderVersion;
    filterItems();
    var totalPages = Math.max(1, Math.ceil(filtered.length / state.perPage));
    state.page = Math.min(Math.max(state.page, 1), totalPages);
    var start = (state.page - 1) * state.perPage;
    var pageIndices = filtered.slice(start, start + state.perPage);
    var groupTotals = new Map();
    filtered.forEach(function (index) {
      var model = catalog.models[catalog.items[index][3]];
      groupTotals.set(model, (groupTotals.get(model) || 0) + 1);
    });

    els.groups.replaceChildren();
    if (!filtered.length) {
      els.results.classList.add('is-hidden');
      els.pagination.classList.add('is-hidden');
      els.empty.classList.remove('is-hidden');
      els.resultSummary.textContent = 'No matching ' + kind;
      els.showing.textContent = '0';
      return;
    }

    root.setAttribute('aria-busy', 'true');
    try {
      await loadChunks(pageIndices);
    } catch (_) {
      if (version !== renderVersion) return;
      els.results.classList.add('is-hidden');
      els.errorText.textContent = 'The visible ' + noun + ' details could not be loaded. Check your connection and try again.';
      els.error.classList.remove('is-hidden');
      root.removeAttribute('aria-busy');
      return;
    }
    if (version !== renderVersion) return;
    var pageItems = await Promise.all(pageIndices.map(hydrate));

    els.error.classList.add('is-hidden');
    els.empty.classList.add('is-hidden');
    els.results.classList.remove('is-hidden');
    els.pagination.classList.toggle('is-hidden', totalPages <= 1);
    var currentGroup = null;
    var grid = null;
    pageItems.forEach(function (item) {
      if (item.model !== currentGroup) {
        currentGroup = item.model;
        var section = el('section', 'model-group');
        section.setAttribute('aria-labelledby', 'model-' + item.id);
        var heading = el('h2', 'model-heading');
        var name = el('span', '', item.model);
        name.id = 'model-' + item.id;
        heading.appendChild(name);
        heading.appendChild(el('span', 'model-count', number(groupTotals.get(item.model)) + ' matches'));
        section.appendChild(heading);
        grid = el('div', 'catalog-grid');
        section.appendChild(grid);
        els.groups.appendChild(section);
      }
      grid.appendChild(card(item));
    });

    els.pageInfo.textContent = 'Page ' + state.page + ' of ' + totalPages;
    els.previous.disabled = state.page <= 1;
    els.next.disabled = state.page >= totalPages;
    els.resultSummary.textContent = 'Showing ' + number(start + 1) + '–' + number(Math.min(start + state.perPage, filtered.length)) + ' of ' + number(filtered.length);
    els.showing.textContent = number(filtered.length);
    root.removeAttribute('aria-busy');

    var nextIndices = filtered.slice(start + state.perPage, start + state.perPage * 2);
    var prefetch = function () { loadChunks(nextIndices).catch(function () {}); };
    if (nextIndices.length) {
      if ('requestIdleCallback' in window) window.requestIdleCallback(prefetch, { timeout: 1500 });
      else window.setTimeout(prefetch, 200);
    }
  }

  async function downloadItem(item, button, message) {
    var url = sourceUrl(item.path);
    button.disabled = true;
    button.textContent = 'Preparing…';
    message.classList.remove('is-error');
    message.textContent = '';
    try {
      var response = await fetch(url);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      var blobUrl = URL.createObjectURL(await response.blob());
      var anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = item.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 1000);
      message.textContent = 'Download started.';
    } catch (error) {
      message.classList.add('is-error');
      message.textContent = 'Direct download opened in a new tab.';
      window.open(url, '_blank', 'noopener');
    } finally {
      button.disabled = false;
      button.textContent = '↓ Download ' + item.format;
    }
  }

  function showModalImage() {
    var item = modalState.item;
    if (!item) return;
    els.modalImage.src = sourceUrl(item.previews[modalState.index]);
    els.modalImage.alt = item.name + ' preview ' + (modalState.index + 1);
    els.modalCaption.textContent = item.name + ' · ' + (modalState.index + 1) + ' / ' + item.previews.length;
    var multiple = item.previews.length > 1;
    els.modalPrevious.classList.toggle('is-hidden', !multiple);
    els.modalNext.classList.toggle('is-hidden', !multiple);
  }

  function openModal(item, opener) {
    modalState = { item: item, index: 0, opener: opener };
    showModalImage();
    els.modal.classList.add('is-open');
    els.modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    els.modalClose.focus();
  }

  function closeModal() {
    els.modal.classList.remove('is-open');
    els.modal.setAttribute('aria-hidden', 'true');
    els.modalImage.removeAttribute('src');
    document.body.style.overflow = '';
    if (modalState.opener) modalState.opener.focus();
    modalState.item = null;
  }

  function moveModal(delta) {
    if (!modalState.item) return;
    var length = modalState.item.previews.length;
    modalState.index = (modalState.index + delta + length) % length;
    showModalImage();
  }

  function setFilter(key, value) {
    state[key] = value;
    state.page = 1;
    writeState(false);
    render();
  }

  function bindEvents() {
    els.q.addEventListener('input', function () {
      els.clear.classList.toggle('is-hidden', !els.q.value);
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(function () { setFilter('q', els.q.value.trim()); }, 250);
    });
    els.clear.addEventListener('click', function () {
      els.q.value = '';
      els.q.focus();
      els.clear.classList.add('is-hidden');
      setFilter('q', '');
    });
    ['model', 'category', 'format'].forEach(function (key) {
      els[key].addEventListener('change', function () { setFilter(key, els[key].value); });
    });
    els.perPage.addEventListener('change', function () {
      state.perPage = parsePositiveInt(els.perPage.value, 24);
      state.page = 1;
      writeState(false);
      render();
    });
    els.previous.addEventListener('click', function () {
      if (state.page <= 1) return;
      state.page -= 1;
      writeState(true);
      render();
      root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    els.next.addEventListener('click', function () {
      if (state.page * state.perPage >= filtered.length) return;
      state.page += 1;
      writeState(true);
      render();
      root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    els.retry.addEventListener('click', function () {
      chunkCache.clear();
      load();
    });
    els.modalClose.addEventListener('click', closeModal);
    els.modalPrevious.addEventListener('click', function () { moveModal(-1); });
    els.modalNext.addEventListener('click', function () { moveModal(1); });
    els.modal.addEventListener('click', function (event) { if (event.target === els.modal) closeModal(); });
    document.addEventListener('keydown', function (event) {
      if (!modalState.item) return;
      if (event.key === 'Escape') closeModal();
      else if (event.key === 'ArrowLeft') moveModal(-1);
      else if (event.key === 'ArrowRight') moveModal(1);
      else if (event.key === 'Tab') {
        var controls = [els.modalClose, els.modalPrevious, els.modalNext].filter(function (control) {
          return !control.classList.contains('is-hidden');
        });
        var current = controls.indexOf(document.activeElement);
        var next = event.shiftKey ? (current <= 0 ? controls.length - 1 : current - 1) : (current + 1) % controls.length;
        event.preventDefault();
        controls[next].focus();
      }
    });
    window.addEventListener('popstate', function () {
      readState();
      applyStateToControls();
      render();
    });
  }

  async function load() {
    els.loading.classList.remove('is-hidden');
    els.error.classList.add('is-hidden');
    els.empty.classList.add('is-hidden');
    els.results.classList.add('is-hidden');
    try {
      var response = await fetch(dataUrl);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      var result = await response.json();
      if (result.schemaVersion !== 2 || !Array.isArray(result.items) || !Array.isArray(result.models)) throw new Error('Unsupported catalog format');
      catalog = result;
      while (els.model.options.length > 1) els.model.remove(1);
      while (els.category.options.length > 1) els.category.remove(1);
      while (els.format.options.length > 1) els.format.remove(1);
      addOptions(els.model, catalog.models);
      addOptions(els.category, catalog.categories);
      addOptions(els.format, catalog.formats);
      els.total.textContent = number(catalog.totalItems);
      els.models.textContent = number(catalog.totalModels);
      readState();
      applyStateToControls();
      await render();
    } catch (error) {
      els.errorText.textContent = 'The ' + noun + ' index could not be loaded. Check your connection and try again.';
      els.error.classList.remove('is-hidden');
    } finally {
      els.loading.classList.add('is-hidden');
    }
  }

  bindEvents();
  load();
})();

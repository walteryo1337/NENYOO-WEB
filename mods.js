(function () {
  'use strict';
  var status = document.getElementById('modsDataStatus');

  function number(value) {
    return new Intl.NumberFormat().format(value);
  }

  fetch('/mod-data/summary.json')
    .then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(function (data) {
      ['vehicles', 'outfits'].forEach(function (kind) {
        var catalog = data.catalogs[kind];
        if (!catalog) return;
        document.getElementById(kind + 'Count').textContent = number(catalog.items);
        document.getElementById(kind + 'Models').textContent = number(catalog.models);
      });
      status.textContent = 'Catalog updated ' + new Date(data.generatedAt).toLocaleDateString();
    })
    .catch(function () {
      status.textContent = 'Catalog totals are temporarily unavailable.';
    });
})();

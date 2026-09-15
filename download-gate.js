/* Page-level login check. The file host must enforce access for a private download. */
(function () {
  'use strict';

  var PRIMARY_DOWNLOAD_URL = 'https://filego.at/bucket/478623fd-e37e-4f4b-81f4-98056832f534';
  var A = window.NenyooAuth;
  var gate = document.getElementById('downloadGate');
  var unlocked = document.getElementById('downloadUnlocked');
  var link = document.getElementById('loaderDl');
  var status = document.getElementById('downloadStatus');

  function showStatus(message, error) {
    status.textContent = message;
    status.style.color = error ? '#f0857d' : 'var(--ink-2)';
  }

  if (!A || !A.getToken()) return;
  showStatus('Checking your login…', false);
  A.api('GET', '/auth/session').then(function (result) {
    if (result.ok && A.pickCustomer(result.data)) {
      link.href = PRIMARY_DOWNLOAD_URL;
      gate.hidden = true;
      unlocked.hidden = false;
    } else if (result.status === 401 || (result.data && result.data.valid === false)) {
      A.clearToken();
      showStatus('Your login expired. Please log in again.', true);
    } else {
      showStatus('Could not verify your login. Please try again.', true);
    }
  });
})();

(() => {
  'use strict';

  const SCORE_KEY = 'ringrechner.pwa.v1.currentScore';
  const HAPTICS_KEY = 'ringrechner.pwa.v1.hapticsEnabled';
  const appShell = document.querySelector('#app-shell');
  const appContent = document.querySelector('#app-content');
  const storageNotice = document.querySelector('#storage-notice');
  const resetDialog = document.querySelector('#reset-dialog');
  const settingsDialog = document.querySelector('#settings-dialog');
  const settingsHandle = settingsDialog.querySelector('.dialog-handle');
  const hapticsToggle = document.querySelector('#haptics-toggle');
  const hapticsDescription = document.querySelector('#haptics-description');
  const installButton = document.querySelector('#install-app');
  const installSubtitle = document.querySelector('#install-subtitle');
  const installNotice = document.querySelector('#install-notice');
  const supportsHaptics = typeof navigator.vibrate === 'function';

  const state = {
    mode: 'wholeRings',
    rings: Array(11).fill(0),
    ringHistory: [],
    decimalShots: [],
  };
  let draft = '10,0';
  let hapticsEnabled = true;
  let storageMessage = '';
  let deferredInstallPrompt = null;
  let installGuideShown = false;
  let appInstalled = false;
  let installPromptPending = false;
  let settingsDragStartY = null;

  function closeOnBackdrop(dialog) {
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      const clickedOutside = event.clientX < bounds.left || event.clientX > bounds.right
        || event.clientY < bounds.top || event.clientY > bounds.bottom;
      if (clickedOutside) dialog.close();
    });
  }

  function clearSettingsDrag() {
    settingsDragStartY = null;
    settingsDialog.classList.remove('is-dragging');
    settingsDialog.style.removeProperty('--sheet-drag-offset');
  }

  closeOnBackdrop(resetDialog);
  closeOnBackdrop(settingsDialog);

  settingsHandle.addEventListener('pointerdown', (event) => {
    if (!settingsDialog.open || (event.pointerType === 'mouse' && event.button !== 0)) return;
    settingsDragStartY = event.clientY;
    settingsHandle.setPointerCapture(event.pointerId);
    settingsDialog.classList.add('is-dragging');
    event.preventDefault();
  });
  settingsHandle.addEventListener('pointermove', (event) => {
    if (settingsDragStartY === null) return;
    const dragDistance = Math.max(0, event.clientY - settingsDragStartY);
    settingsDialog.style.setProperty('--sheet-drag-offset', `${dragDistance}px`);
  });
  settingsHandle.addEventListener('pointerup', (event) => {
    if (settingsDragStartY === null) return;
    const dragDistance = Math.max(0, event.clientY - settingsDragStartY);
    clearSettingsDrag();
    if (dragDistance >= 88) settingsDialog.close();
  });
  settingsHandle.addEventListener('pointercancel', clearSettingsDrag);
  settingsDialog.addEventListener('close', clearSettingsDrag);

  function loadSavedState() {
    try {
      const savedValue = localStorage.getItem(SCORE_KEY);
      if (savedValue) {
        const saved = JSON.parse(savedValue);
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
          throw new TypeError('Ungültige Wertung.');
        }

        if (saved.mode === 'wholeRings' || saved.mode === 'tenths') {
          state.mode = saved.mode;
        }
        if (Array.isArray(saved.rings)) {
          for (let ring = 0; ring <= 10 && ring < saved.rings.length; ring += 1) {
            const count = saved.rings[ring];
            if (Number.isSafeInteger(count) && count >= 0) state.rings[ring] = count;
          }
        }
        if (Array.isArray(saved.ringHistory)) {
          state.ringHistory = saved.ringHistory.filter((change) => (
            change && Number.isInteger(change.ring) && change.ring >= 0 && change.ring <= 10
            && (change.delta === -1 || change.delta === 1)
          ));
        }
        if (Array.isArray(saved.decimalShots)) {
          state.decimalShots = saved.decimalShots.filter(
            (shot) => Number.isInteger(shot) && shot >= 0 && shot <= 109,
          );
        }
      }
    } catch {
      storageMessage = 'Die Wertung kann gerade nicht lokal gespeichert werden.';
    }

    try {
      const savedHaptics = localStorage.getItem(HAPTICS_KEY);
      if (savedHaptics !== null) hapticsEnabled = savedHaptics === 'true';
    } catch {
      // Haptics are optional; score storage has its own notice.
    }
  }

  function saveScore() {
    try {
      localStorage.setItem(SCORE_KEY, JSON.stringify({
        version: 1,
        mode: state.mode,
        rings: state.rings,
        ringHistory: state.ringHistory,
        decimalShots: state.decimalShots,
      }));
      storageMessage = '';
    } catch {
      storageMessage = 'Die Wertung kann gerade nicht lokal gespeichert werden.';
    }
  }

  function saveHaptics() {
    try {
      localStorage.setItem(HAPTICS_KEY, String(hapticsEnabled));
      if (storageMessage === 'Einstellung konnte nicht gespeichert werden.') storageMessage = '';
    } catch {
      storageMessage = 'Einstellung konnte nicht gespeichert werden.';
    }
    updateStorageNotice();
  }

  function updateStorageNotice() {
    storageNotice.textContent = storageMessage;
    storageNotice.hidden = storageMessage.length === 0;
  }

  function formatTenths(scoreTenths) {
    return `${Math.floor(scoreTenths / 10)},${scoreTenths % 10}`;
  }

  function formatAverage(totalTenths, shotCount) {
    if (shotCount === 0) return '–';
    const hundredths = Math.floor((totalTenths * 10 + Math.floor(shotCount / 2)) / shotCount);
    const whole = Math.floor(hundredths / 100);
    const fraction = String(hundredths % 100).padStart(2, '0');
    return `${whole},${fraction}`;
  }

  function parseShot(value) {
    const normalized = value.trim().replaceAll(',', '.');
    if (!/^\d{1,2}(?:\.\d)?$/.test(normalized)) return null;
    const [wholeText, decimalText] = normalized.split('.');
    const whole = Number(wholeText);
    const decimal = decimalText === undefined ? 0 : Number(decimalText);
    const scoreTenths = whole * 10 + decimal;
    return scoreTenths <= 109 ? scoreTenths : null;
  }

  function getMetrics() {
    if (state.mode === 'wholeRings') {
      const shots = state.rings.reduce((sum, count) => sum + count, 0);
      const score = state.rings.reduce((sum, count, ring) => sum + ring * count, 0);
      return {
        shots,
        total: String(score),
        average: formatAverage(score * 10, shots),
        hasScore: shots > 0,
      };
    }

    const totalTenths = state.decimalShots.reduce((sum, shot) => sum + shot, 0);
    const shots = state.decimalShots.length;
    return {
      shots,
      total: formatTenths(totalTenths),
      average: formatAverage(totalTenths, shots),
      hasScore: shots > 0,
    };
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  function buttonIcon(name) {
    if (name === 'plus') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2" /></svg>';
    if (name === 'minus') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2" /></svg>';
    if (name === 'reset') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m4 4v5m4-5v5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" /></svg>';
    if (name === 'undo') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5M4 9h9a7 7 0 0 1 7 7v3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" /></svg>';
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2" /></svg>';
  }

  function renderWholeRings() {
    const rows = [];
    for (let ring = 10; ring >= 0; ring -= 1) {
      const count = state.rings[ring];
      rows.push(`
        <tr>
          <td><span class="ring-badge${ring === 10 ? ' is-ten' : ''}">${ring}</span></td>
          <td class="ring-count">${count}×</td>
          <td class="ring-points">${ring * count}</td>
          <td>
            <div class="ring-controls">
              <button class="ring-button" type="button" data-action="ring-minus" data-ring="${ring}" aria-label="Ring ${ring} verringern" ${count === 0 ? 'disabled' : ''}>${buttonIcon('minus')}</button>
              <button class="ring-button" type="button" data-action="ring-plus" data-ring="${ring}" aria-label="Ring ${ring} hinzufügen">${buttonIcon('plus')}</button>
            </div>
          </td>
        </tr>`);
    }

    const hasScore = getMetrics().hasScore;
    return `
      <section class="scoring-section" aria-labelledby="whole-rings-title">
        <div class="tenths-heading">
          <div class="section-heading">
            <h1 id="whole-rings-title">Treffer nach Ringwert</h1>
            <p>Mit + und − die Trefferzahl anpassen.</p>
          </div>
          <button class="undo-button" type="button" data-action="undo-ring" aria-label="Letzte Änderung rückgängig machen" title="Letzte Änderung rückgängig machen" ${state.ringHistory.length > 0 ? '' : 'disabled'}>${buttonIcon('undo')}</button>
        </div>
        <div class="ring-card">
          <table class="ring-table">
            <caption class="visually-hidden">Trefferzahl und Punkte je Ringwert</caption>
            <thead><tr><th scope="col">Ring</th><th scope="col">Treffer</th><th scope="col">Punkte</th><th scope="col"><span class="visually-hidden">Treffer anpassen</span></th></tr></thead>
            <tbody>${rows.join('')}</tbody>
          </table>
        </div>
        <button class="reset-button" type="button" data-action="reset" ${hasScore ? '' : 'disabled'}>${buttonIcon('reset')}<span>Zurücksetzen</span></button>
      </section>`;
  }

  function renderShotList() {
    if (state.decimalShots.length === 0) {
      return `
        <div class="empty-shots">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8" /><circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" stroke-width="1.8" /><circle cx="12" cy="12" r="1" fill="currentColor" /></svg>
          <p>Deine Schüsse erscheinen hier.</p>
        </div>`;
    }

    const shots = state.decimalShots.map((shot, index) => `
      <span class="shot-chip" role="listitem" aria-label="Schuss ${index + 1}: ${formatTenths(shot)}">${formatTenths(shot)}</span>`).join('');
    return `<div class="shots-card"><div class="shot-list" role="list" aria-label="Eingegebene Schüsse">${shots}</div></div>`;
  }

  function renderTenths() {
    const validShot = parseShot(draft) !== null;
    const hasShots = state.decimalShots.length > 0;
    return `
      <section class="scoring-section" aria-labelledby="tenths-title">
        <div class="tenths-heading">
          <div class="section-heading">
            <h1 id="tenths-title">Einzelschüsse</h1>
            <p>In der Reihenfolge deiner Eingabe.</p>
          </div>
          <button class="undo-button" type="button" data-action="undo-shot" aria-label="Letzten Schuss löschen" title="Letzten Schuss löschen" ${hasShots ? '' : 'disabled'}>${buttonIcon('undo')}</button>
        </div>
        <div class="tenths-workspace">
          <div class="shots-column">${renderShotList()}</div>
          <form class="shot-entry-card" id="shot-form" novalidate>
            <h2>Neuer Schuss</h2>
            <label class="input-label" for="shot-input">Ringwert</label>
            <div class="shot-input-wrap">
              <input class="shot-input" id="shot-input" data-shot-input type="text" inputmode="decimal" autocomplete="off" maxlength="4" value="${escapeHtml(draft)}" aria-invalid="${!validShot}" aria-describedby="shot-error">
              <span class="shot-input-suffix">Punkte</span>
            </div>
            <p class="shot-error" id="shot-error"${validShot ? ' hidden' : ''}>Wert zwischen 0,0 und 10,9 eingeben</p>
            <div class="step-controls" aria-label="Ringwert anpassen">
              <button class="step-button" type="button" data-action="step" data-amount="-10" ${canStep(-10) ? '' : 'disabled'}>−1,0</button>
              <button class="step-button" type="button" data-action="step" data-amount="-1" ${canStep(-1) ? '' : 'disabled'}>−0,1</button>
              <button class="step-button" type="button" data-action="step" data-amount="1" ${canStep(1) ? '' : 'disabled'}>+0,1</button>
              <button class="step-button" type="button" data-action="step" data-amount="10" ${canStep(10) ? '' : 'disabled'}>+1,0</button>
            </div>
            <button class="primary-button add-shot-button" type="submit" ${validShot ? '' : 'disabled'}>${buttonIcon('plus')}<span>Schuss hinzufügen</span></button>
          </form>
        </div>
        <button class="reset-button" type="button" data-action="reset" ${getMetrics().hasScore ? '' : 'disabled'}>${buttonIcon('reset')}<span>Zurücksetzen</span></button>
      </section>`;
  }

  function canStep(amount) {
    const current = parseShot(draft);
    return current !== null && current + amount >= 0 && current + amount <= 109;
  }

  function updateShotEditor() {
    const input = appContent.querySelector('[data-shot-input]');
    if (!input) return;
    const valid = parseShot(input.value) !== null;
    input.setAttribute('aria-invalid', String(!valid));
    const error = appContent.querySelector('#shot-error');
    error.hidden = valid;
    appContent.querySelector('[type="submit"]').disabled = !valid;
    appContent.querySelectorAll('[data-action="step"]').forEach((button) => {
      button.disabled = !canStep(Number(button.dataset.amount));
    });
  }

  function updateHapticsSetting() {
    hapticsToggle.disabled = !supportsHaptics;
    hapticsToggle.checked = supportsHaptics && hapticsEnabled;
    hapticsDescription.textContent = supportsHaptics
      ? 'Kurze Vibration bei Tastendruck'
      : 'Auf diesem Gerät nicht verfügbar';
  }

  function isAppInstalled() {
    return appInstalled || window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  }

  function getInstallPlatform() {
    const isAppleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isAppleMobile) return 'ios';
    if (/Android/i.test(navigator.userAgent)) return 'android';
    return 'other';
  }

  function getInstallInstructions() {
    const platform = getInstallPlatform();
    if (platform === 'ios') {
      return 'iPhone oder iPad: Öffne diese Seite in Safari. Tippe auf „Teilen“ → '
        + '„Zum Home-Bildschirm hinzufügen“. Aktiviere „Als Web-App öffnen“, '
        + 'wenn die Option angezeigt wird, und tippe auf „Hinzufügen“.';
    }
    if (platform === 'android') {
      return 'Android: Öffne das Menü ⋮ in Chrome und wähle „App installieren“ '
        + 'oder „Zum Startbildschirm hinzufügen“. Wenn du diese Seite in einer '
        + 'anderen App geöffnet hast, öffne sie zuerst in Chrome.';
    }
    return 'Öffne das Browsermenü und wähle „Installieren“ oder '
      + '„Zum Startbildschirm hinzufügen“.';
  }

  function updateInstallSetting() {
    const installed = isAppInstalled();
    const platform = getInstallPlatform();
    installButton.disabled = installed || installPromptPending;
    installButton.textContent = installed
      ? 'Bereits installiert'
      : installPromptPending
        ? 'Installationsdialog geöffnet …'
        : deferredInstallPrompt ? 'Jetzt installieren' : 'Installationsanleitung';
    installSubtitle.textContent = installed
      ? 'Die App ist bereits installiert.'
      : deferredInstallPrompt
        ? 'Der Browser öffnet den Installationsdialog.'
        : platform === 'ios'
          ? 'Über Safari zum Home-Bildschirm hinzufügen.'
          : platform === 'android'
            ? 'Installation über das Menü von Chrome oder deinem Browser.'
            : 'Installation über das Menü deines Browsers.';
    installNotice.hidden = !installGuideShown;
  }

  function render() {
    const metrics = getMetrics();
    document.querySelector('#summary-shots').textContent = String(metrics.shots);
    document.querySelector('#summary-total').textContent = metrics.total;
    document.querySelector('#summary-average').textContent = metrics.average;

    document.querySelectorAll('[data-mode]').forEach((button) => {
      const selected = button.dataset.mode === state.mode;
      button.setAttribute('aria-pressed', String(selected));
    });

    appContent.innerHTML = state.mode === 'wholeRings' ? renderWholeRings() : renderTenths();
    updateStorageNotice();
    updateHapticsSetting();
    updateInstallSetting();
    updateShotEditor();
  }

  function playHaptic() {
    if (hapticsEnabled && supportsHaptics) navigator.vibrate(10);
  }

  function changeHaptics(enabled) {
    if (supportsHaptics) navigator.vibrate(10);
    hapticsEnabled = enabled;
    saveHaptics();
    updateHapticsSetting();
  }

  function handleModeChange(button) {
    const nextMode = button.dataset.mode;
    if (nextMode === state.mode) return;
    playHaptic();
    state.mode = nextMode;
    saveScore();
    render();
    button.focus();
  }

  function handleAction(button) {
    const action = button.dataset.action;
    if (action === 'ring-plus' || action === 'ring-minus') {
      const ring = Number(button.dataset.ring);
      const delta = action === 'ring-plus' ? 1 : -1;
      if (delta < 0 && state.rings[ring] === 0) return;
      state.rings[ring] += delta;
      state.ringHistory.push({ ring, delta });
      playHaptic();
      saveScore();
      render();
      appContent.querySelector(`[data-action="${action}"][data-ring="${ring}"]`)?.focus({ preventScroll: true });
      return;
    }

    if (action === 'step') {
      const amount = Number(button.dataset.amount);
      const current = parseShot(draft);
      if (current === null || current + amount < 0 || current + amount > 109) return;
      playHaptic();
      draft = formatTenths(current + amount);
      const input = appContent.querySelector('[data-shot-input]');
      input.value = draft;
      updateShotEditor();
      return;
    }

    if (action === 'undo-ring') {
      const change = state.ringHistory.pop();
      if (!change) return;
      state.rings[change.ring] -= change.delta;
      playHaptic();
      saveScore();
      render();
      appContent.querySelector('[data-action="undo-ring"]')?.focus({ preventScroll: true });
      return;
    }

    if (action === 'undo-shot') {
      if (state.decimalShots.length === 0) return;
      playHaptic();
      state.decimalShots.pop();
      saveScore();
      render();
      appContent.querySelector('[data-action="undo-shot"]')?.focus({ preventScroll: true });
      return;
    }

    if (action === 'reset') {
      if (!getMetrics().hasScore) return;
      playHaptic();
      resetDialog.showModal();
    }
  }

  appShell.addEventListener('click', (event) => {
    const modeButton = event.target.closest('[data-mode]');
    if (modeButton) {
      handleModeChange(modeButton);
      return;
    }
    const actionButton = event.target.closest('[data-action]');
    if (actionButton && !actionButton.disabled) handleAction(actionButton);
  });

  appContent.addEventListener('input', (event) => {
    if (!event.target.matches('[data-shot-input]')) return;
    draft = event.target.value;
    updateShotEditor();
  });

  appContent.addEventListener('submit', (event) => {
    if (event.target.id !== 'shot-form') return;
    event.preventDefault();
    const shot = parseShot(draft);
    if (shot === null) return;
    playHaptic();
    state.decimalShots.push(shot);
    saveScore();
    render();
  });

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('button')) return;
    const activeElement = document.activeElement;
    if (activeElement?.matches('[data-shot-input]')) activeElement.blur();
  });

  document.querySelector('#confirm-reset').addEventListener('click', () => {
    playHaptic();
    if (state.mode === 'wholeRings') {
      state.rings.fill(0);
      state.ringHistory = [];
    } else {
      state.decimalShots = [];
      draft = '10,0';
    }
    saveScore();
    render();
    resetDialog.close();
  });
  document.querySelector('#cancel-reset').addEventListener('click', () => {
    playHaptic();
    resetDialog.close();
  });

  document.querySelector('#open-settings').addEventListener('click', () => {
    playHaptic();
    if (settingsDialog.open) settingsDialog.close();
    else settingsDialog.showModal();
  });
  document.querySelector('#close-settings').addEventListener('click', () => {
    playHaptic();
    settingsDialog.close();
  });
  hapticsToggle.addEventListener('change', () => changeHaptics(hapticsToggle.checked));
  installButton.addEventListener('click', async () => {
    playHaptic();
    if (!deferredInstallPrompt) {
      installGuideShown = true;
      installNotice.textContent = getInstallInstructions();
      updateInstallSetting();
      return;
    }

    const installPrompt = deferredInstallPrompt;
    deferredInstallPrompt = null;
    installGuideShown = false;
    installPromptPending = true;
    updateInstallSetting();
    try {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') {
        installGuideShown = true;
        installNotice.textContent = 'Die Installation wurde gestartet.';
      } else {
        installGuideShown = true;
        installNotice.textContent = getInstallInstructions();
      }
    } catch {
      installGuideShown = true;
      installNotice.textContent = getInstallInstructions();
    }
    installPromptPending = false;
    updateInstallSetting();
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installGuideShown = false;
    updateInstallSetting();
  });
  window.addEventListener('appinstalled', () => {
    appInstalled = true;
    deferredInstallPrompt = null;
    installGuideShown = false;
    installPromptPending = false;
    updateInstallSetting();
  });
  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', updateInstallSetting);

  loadSavedState();
  render();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();

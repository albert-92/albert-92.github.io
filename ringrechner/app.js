(() => {
  'use strict';

  const SCORE_KEY = 'ringrechner.pwa.v1.currentScore';
  const HAPTICS_KEY = 'ringrechner.pwa.v1.hapticsEnabled';
  const appShell = document.querySelector('#app-shell');
  const appContent = document.querySelector('#app-content');
  const wholeRingsContent = document.querySelector('#whole-rings-content');
  const tenthsContent = document.querySelector('#tenths-content');
  const shotList = document.querySelector('[data-shot-list]');
  const shotsCard = document.querySelector('[data-shots-card]');
  const emptyShots = document.querySelector('[data-empty-shots]');
  const shotInput = document.querySelector('[data-shot-input]');
  const shotError = document.querySelector('#shot-error');
  const shotSubmitButton = document.querySelector('#shot-form [type="submit"]');
  const stepButtons = Array.from(document.querySelectorAll('[data-action="step"]'));
  const modeButtons = Array.from(document.querySelectorAll('[data-mode]'));
  const summaryShots = document.querySelector('#summary-shots');
  const summaryTotal = document.querySelector('#summary-total');
  const summaryAverage = document.querySelector('#summary-average');
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
    decimalTotalTenths: 0,
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
          state.decimalTotalTenths = state.decimalShots.reduce((sum, shot) => sum + shot, 0);
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
    updateStorageNotice();
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

    const shots = state.decimalShots.length;
    return {
      shots,
      total: formatTenths(state.decimalTotalTenths),
      average: formatAverage(state.decimalTotalTenths, shots),
      hasScore: shots > 0,
    };
  }

  function updateRingRow(ring) {
    const row = wholeRingsContent.querySelector(`[data-ring-row="${ring}"]`);
    if (!row) return;
    const count = state.rings[ring];
    row.querySelector('[data-ring-count]').textContent = `${count}×`;
    row.querySelector('[data-ring-points]').textContent = String(ring * count);
    row.querySelector('[data-action="ring-minus"]').disabled = count === 0;
  }

  function updateAllRingRows() {
    for (let ring = 0; ring <= 10; ring += 1) updateRingRow(ring);
  }

  function updateShotListVisibility() {
    const hasShots = state.decimalShots.length > 0;
    emptyShots.hidden = hasShots;
    shotsCard.hidden = !hasShots;
  }

  function createShotChip(shot, index) {
    const chip = document.createElement('span');
    chip.className = 'shot-chip';
    chip.setAttribute('role', 'listitem');
    chip.setAttribute('aria-label', `Schuss ${index + 1}: ${formatTenths(shot)}`);
    chip.textContent = formatTenths(shot);
    return chip;
  }

  function populateShotList() {
    const fragment = document.createDocumentFragment();
    state.decimalShots.forEach((shot, index) => fragment.append(createShotChip(shot, index)));
    shotList.replaceChildren(fragment);
    updateShotListVisibility();
  }

  function updateWholeRingControls() {
    const hasRingScore = state.rings.some((count) => count > 0);
    wholeRingsContent.querySelector('[data-action="undo-ring"]').disabled = state.ringHistory.length === 0;
    wholeRingsContent.querySelector('[data-action="reset"]').disabled = !hasRingScore;
  }

  function updateTenthsControls() {
    const hasTenthsShots = state.decimalShots.length > 0;
    tenthsContent.querySelector('[data-action="undo-shot"]').disabled = !hasTenthsShots;
    tenthsContent.querySelector('[data-action="reset"]').disabled = !hasTenthsShots;
    updateShotListVisibility();
  }

  function updateSummary() {
    const metrics = getMetrics();
    summaryShots.textContent = String(metrics.shots);
    summaryTotal.textContent = metrics.total;
    summaryAverage.textContent = metrics.average;
  }

  function canStep(amount) {
    const current = parseShot(draft);
    return current !== null && current + amount >= 0 && current + amount <= 109;
  }

  function updateShotEditor() {
    const valid = parseShot(shotInput.value) !== null;
    shotInput.setAttribute('aria-invalid', String(!valid));
    shotError.hidden = valid;
    shotSubmitButton.disabled = !valid;
    stepButtons.forEach((button) => {
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
    updateSummary();
    modeButtons.forEach((button) => {
      const selected = button.dataset.mode === state.mode;
      button.setAttribute('aria-pressed', String(selected));
    });
    wholeRingsContent.hidden = state.mode !== 'wholeRings';
    tenthsContent.hidden = state.mode !== 'tenths';
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
      updateRingRow(ring);
      updateSummary();
      updateWholeRingControls();
      saveScore();
      const focusTarget = delta < 0 && state.rings[ring] === 0
        ? wholeRingsContent.querySelector(`[data-action="ring-plus"][data-ring="${ring}"]`)
        : button;
      focusTarget.focus({ preventScroll: true });
      return;
    }

    if (action === 'step') {
      const amount = Number(button.dataset.amount);
      const current = parseShot(draft);
      if (current === null || current + amount < 0 || current + amount > 109) return;
      playHaptic();
      draft = formatTenths(current + amount);
      shotInput.value = draft;
      updateShotEditor();
      return;
    }

    if (action === 'undo-ring') {
      const change = state.ringHistory.pop();
      if (!change) return;
      state.rings[change.ring] -= change.delta;
      playHaptic();
      updateRingRow(change.ring);
      updateSummary();
      updateWholeRingControls();
      saveScore();
      const focusTarget = state.ringHistory.length > 0
        ? wholeRingsContent.querySelector('[data-action="undo-ring"]')
        : wholeRingsContent.querySelector(`[data-action="ring-plus"][data-ring="${change.ring}"]`);
      focusTarget.focus({ preventScroll: true });
      return;
    }

    if (action === 'undo-shot') {
      if (state.decimalShots.length === 0) return;
      playHaptic();
      state.decimalTotalTenths -= state.decimalShots.pop();
      shotList.lastElementChild?.remove();
      updateSummary();
      updateTenthsControls();
      saveScore();
      const focusTarget = state.decimalShots.length > 0
        ? button
        : shotSubmitButton.disabled
          ? modeButtons.find((modeButton) => modeButton.dataset.mode === 'tenths')
          : shotSubmitButton;
      focusTarget?.focus({ preventScroll: true });
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
    state.decimalTotalTenths += shot;
    shotList.append(createShotChip(shot, state.decimalShots.length - 1));
    updateSummary();
    updateTenthsControls();
    saveScore();
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
      updateAllRingRows();
      updateWholeRingControls();
    } else {
      state.decimalShots = [];
      state.decimalTotalTenths = 0;
      shotList.replaceChildren();
      draft = '10,0';
      shotInput.value = draft;
      updateShotEditor();
      updateTenthsControls();
    }
    updateSummary();
    saveScore();
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
  updateAllRingRows();
  populateShotList();
  updateWholeRingControls();
  updateTenthsControls();
  render();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();

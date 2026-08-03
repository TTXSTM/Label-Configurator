(function () {
  'use strict';

  var storageKey = 'label-configurator-draft-v2';
  var initialized = false;
  var saveTimer = null;
  var fields = ['title', 'inventory', 'serial', 'store'];
  var templatesKey = 'label-configurator-templates-v1';
  var fittingPreview = false;
  var previewAutoFitDone = false;

  function input(name) {
    return document.querySelector('[data-testid="input-' + name + '"]');
  }

  function setReactValue(element, value) {
    var prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function readDraft() {
    try { return JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch (error) { return null; }
  }

  function updateStatus(text, saving) {
    var status = document.querySelector('.lc-autosave');
    if (!status) return;
    status.classList.toggle('saving', Boolean(saving));
    status.querySelector('span:last-child').textContent = text;
  }

  function saveDraft() {
    var draft = {};
    fields.forEach(function (name) { draft[name] = input(name) ? input(name).value : ''; });
    draft.savedAt = Date.now();
    localStorage.setItem(storageKey, JSON.stringify(draft));
    updateStatus('Черновик сохранён', false);
  }

  function scheduleSave() {
    updateStatus('Сохраняю…', true);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 450);
  }

  function restoreDraft() {
    var draft = readDraft();
    if (!draft) return;
    fields.forEach(function (name) {
      var element = input(name);
      if (element && typeof draft[name] === 'string') setReactValue(element, draft[name]);
    });
  }

  function clearLabelData() {
    if (!window.confirm('Очистить название, инвентарный номер, S/N и магазин?')) return;
    fields.forEach(function (name) { var element = input(name); if (element) setReactValue(element, ''); });
    saveDraft();
    input('title')?.focus();
  }

  function clickButton(testId) {
    document.querySelector('[data-testid="' + testId + '"]')?.click();
  }

  function createQuickbar(page) {
    var header = page.querySelector(':scope > header');
    if (!header) return;
    var bar = document.createElement('div');
    bar.className = 'lc-quickbar';
    bar.innerHTML = '<div class="lc-workflow" aria-label="Этапы работы">' +
      '<span class="lc-workflow-step"><b>1</b> Выберите размер</span><span class="lc-workflow-arrow">→</span>' +
      '<span class="lc-workflow-step"><b>2</b> Заполните данные</span><span class="lc-workflow-arrow">→</span>' +
      '<span class="lc-workflow-step"><b>3</b> Проверьте и печатайте</span></div>' +
      '<div class="lc-quick-actions"><div class="lc-autosave"><i class="lc-autosave-dot"></i><span>Автосохранение включено</span></div>' +
      '<button class="lc-quick-btn" type="button" data-lc-action="clear">Очистить данные</button>' +
      '<button class="lc-quick-btn lc-quick-btn-primary" type="button" data-lc-action="batch">Печать список</button></div>';
    var shortcuts = document.createElement('div');
    shortcuts.className = 'lc-shortcuts';
    shortcuts.innerHTML = '<kbd>Ctrl</kbd> + <kbd>P</kbd> — печать &nbsp; <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> — печать список';
    header.insertAdjacentElement('afterend', bar);
    bar.insertAdjacentElement('afterend', shortcuts);
    bar.querySelector('[data-lc-action="clear"]').addEventListener('click', clearLabelData);
    bar.querySelector('[data-lc-action="batch"]').addEventListener('click', function () { clickButton('button-batch-print'); });
  }

  function readTemplates() {
    try { return JSON.parse(localStorage.getItem(templatesKey) || '[]'); } catch (error) { return []; }
  }

  function writeTemplates(templates) {
    localStorage.setItem(templatesKey, JSON.stringify(templates));
  }

  function loadFullConfig(config) {
    var reactInput = document.querySelector('[data-testid="input-load-config"]');
    if (!reactInput) { showEditToast('Не удалось найти загрузку макета'); return; }
    var file = new File([JSON.stringify(config)], 'saved-template.json', { type: 'application/json' });
    var transfer = new DataTransfer(); transfer.items.add(file); reactInput.files = transfer.files;
    reactInput.dispatchEvent(new Event('change', { bubbles: true }));
    setTimeout(function () {
      if (window.__lcApplyConfigExtras) window.__lcApplyConfigExtras(config);
      showEditToast('Шаблон восстановлен');
    }, 220);
  }

  function renderTemplates(manager) {
    var list = manager.querySelector('.lc-template-list');
    var templates = readTemplates();
    if (!templates.length) { list.innerHTML = '<div class="lc-template-empty">Сохранённых шаблонов пока нет</div>'; return; }
    list.innerHTML = templates.map(function (item) {
      var safeName = String(item.name).replace(/[&<>'"]/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'})[c]; });
      return '<div class="lc-template-row" data-template-id="' + item.id + '"><button class="lc-template-load" type="button" title="Загрузить">' + safeName + '<small class="lc-template-date">' + new Date(item.savedAt).toLocaleString('ru-RU') + '</small></button><button class="lc-template-replace" type="button" title="Обновить текущим макетом">↻</button><button class="lc-template-delete" type="button" title="Удалить">×</button></div>';
    }).join('');
  }

  function createTemplateManager() {
    if (document.querySelector('.lc-template-manager') || !window.__lcBuildConfig) return;
    var saveButton = document.querySelector('[data-testid="button-save-config"]');
    if (!saveButton) return;
    var content = saveButton.parentElement;
    while (content && !content.querySelector('[data-testid="button-reset"]')) content = content.parentElement;
    if (!content) return;
    var manager = document.createElement('div'); manager.className = 'lc-template-manager';
    manager.innerHTML = '<div class="lc-template-head"><strong>Мои шаблоны</strong><span>Сохраняется весь макет</span></div><div class="lc-template-create"><input class="lc-template-name" placeholder="Например: Касса 58×60"><button class="lc-template-save" type="button">Сохранить</button></div><div class="lc-template-list"></div>';
    content.insertBefore(manager, content.firstChild); renderTemplates(manager);
    manager.querySelector('.lc-template-save').addEventListener('click', function () {
      var nameInput = manager.querySelector('.lc-template-name'), name = nameInput.value.trim();
      if (!name) { nameInput.focus(); showEditToast('Введите название шаблона'); return; }
      var templates = readTemplates(); templates.unshift({ id: Date.now().toString(36), name: name, savedAt: Date.now(), config: window.__lcBuildConfig() });
      writeTemplates(templates); nameInput.value = ''; renderTemplates(manager); showEditToast('Весь макет сохранён');
    });
    manager.addEventListener('click', function (event) {
      var row = event.target.closest('.lc-template-row'); if (!row) return;
      var templates = readTemplates(), index = templates.findIndex(function (item) { return item.id === row.dataset.templateId; }); if (index < 0) return;
      if (event.target.closest('.lc-template-load')) loadFullConfig(templates[index].config);
      if (event.target.closest('.lc-template-replace')) { templates[index].config = window.__lcBuildConfig(); templates[index].savedAt = Date.now(); writeTemplates(templates); renderTemplates(manager); showEditToast('Шаблон обновлён'); }
      if (event.target.closest('.lc-template-delete') && confirm('Удалить шаблон «' + templates[index].name + '»?')) { templates.splice(index, 1); writeTemplates(templates); renderTemplates(manager); }
    });
  }

  function showEditToast(text) {
    var toast = document.querySelector('.lc-edit-toast');
    if (!toast) { toast = document.createElement('div'); toast.className = 'lc-edit-toast'; document.body.appendChild(toast); }
    toast.textContent = text; toast.classList.add('show');
    clearTimeout(toast._timer); toast._timer = setTimeout(function () { toast.classList.remove('show'); }, 1500);
  }

  function cleanPreviewValue(kind, text) {
    text = String(text || '').trim();
    if (kind === 'inventory') return text.replace(/^Инв\s*:\s*/i, '').trim();
    if (kind === 'serial') return text.replace(/^S\s*\/\s*N\s*:\s*/i, '').trim();
    return text;
  }

  function enableInlineEditing() {
    var map = { title: 'title', inventory: 'inventory', serial: 'serial', store: 'store' };
    Object.keys(map).forEach(function (previewName) {
      var preview = document.querySelector('[data-testid="preview-' + previewName + '"]');
      if (!preview || preview.dataset.lcInlineEdit === 'true') return;
      preview.dataset.lcInlineEdit = 'true';
      preview.dataset.lcPlaceholder = previewName === 'title' ? 'Название' : previewName === 'store' ? 'Магазин' : previewName === 'inventory' ? 'Инв: номер' : 'S/N: номер';
      preview.contentEditable = 'true';
      preview.spellcheck = false;
      preview.setAttribute('title', 'Нажмите, чтобы изменить');
      preview.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && previewName !== 'title') { event.preventDefault(); preview.blur(); }
        if (event.key === 'Escape') { event.preventDefault(); preview.textContent = preview._beforeEdit || preview.textContent; preview.blur(); }
      });
      preview.addEventListener('focus', function () { preview._beforeEdit = preview.textContent; });
      preview.addEventListener('blur', function () {
        var target = input(map[previewName]);
        if (!target) return;
        var value = cleanPreviewValue(previewName, preview.textContent);
        if (value !== target.value) { setReactValue(target, value); scheduleSave(); showEditToast('Изменение сохранено'); }
      });
    });
  }

  function addEditBadge() {
    if (document.querySelector('.lc-preview-edit-badge')) return;
    var stage = document.querySelector('[data-testid="stage-preview"]');
    if (!stage || !stage.parentNode) return;
    var badge = document.createElement('div'); badge.className = 'lc-preview-edit-badge'; badge.textContent = 'Нажмите на текст внутри этикетки, чтобы изменить'; stage.parentNode.insertBefore(badge, stage);
  }

  function fitPreviewToViewport() {
    if (fittingPreview || previewAutoFitDone) return;
    var stage = document.querySelector('[data-testid="stage-preview"]');
    var surface = document.querySelector('[data-testid="preview-label-surface"]');
    var zoomOut = document.querySelector('[data-testid="button-zoom-out"]');
    if (!stage || !surface || !zoomOut) return;
    var mobile = window.innerWidth < 768;
    var targetWidth = mobile ? stage.clientWidth - 28 : Math.min(480, stage.clientWidth * 0.58);
    var targetHeight = mobile ? Math.min(520, window.innerHeight * 0.66) : Math.min(520, window.innerHeight * 0.62);
    var initialRect = surface.getBoundingClientRect();
    if (initialRect.width <= targetWidth && initialRect.height <= targetHeight) { previewAutoFitDone = true; return; }
    fittingPreview = true;
    var attempts = 0;
    function shrink() {
      var currentStage = document.querySelector('[data-testid="stage-preview"]');
      var currentSurface = document.querySelector('[data-testid="preview-label-surface"]');
      var currentZoomOut = document.querySelector('[data-testid="button-zoom-out"]');
      if (attempts >= 14) { fittingPreview = false; previewAutoFitDone = true; return; }
      if (!currentStage || !currentSurface || !currentZoomOut) { attempts += 1; setTimeout(shrink, 70); return; }
      var currentRect = currentSurface.getBoundingClientRect();
      if (currentRect.width <= targetWidth && currentRect.height <= targetHeight) { fittingPreview = false; previewAutoFitDone = true; return; }
      attempts += 1; currentZoomOut.click(); setTimeout(shrink, 80);
    }
    shrink();
  }

  function enforceComfortableZoom() {
    var attempts = 0;
    var timer = setInterval(function () {
      attempts += 1;
      var value = document.querySelector('[data-testid="text-zoom-value"]');
      var zoomOut = document.querySelector('[data-testid="button-zoom-out"]');
      if (!value || !zoomOut) { if (attempts > 30) clearInterval(timer); return; }
      var percent = parseFloat(value.textContent);
      var target = window.innerWidth < 768 ? 125 : 150;
      if (!Number.isFinite(percent) || percent <= target || attempts > 30) { clearInterval(timer); previewAutoFitDone = true; return; }
      var steps = Math.max(1, Math.ceil((percent - target) / 20));
      clearInterval(timer);
      for (var i = 0; i < steps; i += 1) zoomOut.click();
      previewAutoFitDone = true;
    }, 180);
  }

  function initialize() {
    if (initialized) return;
    var page = document.querySelector('[data-testid="page-configurator"]');
    if (!page || !fields.every(function (name) { return input(name); })) return;
    initialized = true;
    var brand = document.querySelector('[data-testid="text-brand"]');
    if (brand) brand.textContent = 'Конструктор этикеток';
    restoreDraft();
    fields.forEach(function (name) { input(name).addEventListener('input', scheduleSave); });
    updateStatus(readDraft() ? 'Черновик восстановлен' : 'Автосохранение включено', false);
    addEditBadge();
    enableInlineEditing();
    createTemplateManager();
    setTimeout(enforceComfortableZoom, 300);
  }

  document.addEventListener('keydown', function (event) {
    if (!event.ctrlKey || event.altKey) return;
    if (event.key.toLowerCase() === 'p' && event.shiftKey) { event.preventDefault(); clickButton('button-batch-print'); }
  });

  document.addEventListener('click', function (event) {
    var control = event.target.closest && event.target.closest('[data-testid^="button-size-"],[data-testid^="button-orientation-"]');
    if (control) { previewAutoFitDone = false; setTimeout(enforceComfortableZoom, 180); }
  }, true);

  window.addEventListener('resize', function () { clearTimeout(window.__lcFitTimer); window.__lcFitTimer = setTimeout(function () { if (window.innerWidth < 768) { previewAutoFitDone = false; fitPreviewToViewport(); } }, 180); });

  new MutationObserver(function () { initialize(); if (initialized) { addEditBadge(); enableInlineEditing(); createTemplateManager(); if (!previewAutoFitDone) setTimeout(fitPreviewToViewport, 30); } }).observe(document.documentElement, { childList: true, subtree: true });
  initialize();
}());

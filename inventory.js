const STORAGE_KEY = 'inventory-scanner-records-v1';
const SETTINGS_KEY = 'inventory-scanner-settings-v1';

let records = readJson(STORAGE_KEY, []);
let settings = readJson(SETTINGS_KEY, { inventoryPrefixes: 'INV, ИНВ', serialPrefixes: 'SN, S/N' });
let pending = null;
let unresolvedScan = '';
let highlightedId = null;

const $ = (selector) => document.querySelector(selector);
const tableBody = $('#tableBody');
const scanInput = $('#scanInput');

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function normalize(value) { return String(value ?? '').trim(); }
function comparable(value) { return normalize(value).toLocaleUpperCase('ru-RU').replace(/\s+/g, ''); }
function uid() { return crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`; }
function today() { return new Date().toLocaleDateString('ru-RU'); }

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  $('#saveState').innerHTML = '<span></span> Сохранено';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function render(filter = $('#searchInput').value) {
  const query = comparable(filter);
  const visible = records.filter(r => !query || comparable(r.inventory).includes(query) || comparable(r.serial).includes(query));
  tableBody.innerHTML = visible.map((r, index) => `<tr data-id="${r.id}" class="${r.id === highlightedId ? 'highlight' : ''}">
    <td>${index + 1}</td><td><code>${escapeHtml(r.inventory)}</code></td><td><code>${escapeHtml(r.serial)}</code></td><td>${escapeHtml(r.date || '')}</td>
    <td><div class="row-actions"><button data-label="${r.id}" title="Открыть в макете">▣</button><button data-edit="${r.id}" title="Изменить">✎</button><button class="delete" data-delete="${r.id}" title="Удалить">✕</button></div></td></tr>`).join('');
  $('#recordCount').textContent = records.length;
  $('#emptyState').classList.toggle('hidden', visible.length > 0);
}

function prefixes(text) { return text.split(',').map(x => comparable(x)).filter(Boolean); }
function detectType(value) {
  const key = comparable(value);
  const existing = records.find(r => comparable(r.inventory) === key || comparable(r.serial) === key);
  if (existing) return comparable(existing.inventory) === key ? 'inventory' : 'serial';
  if (prefixes(settings.inventoryPrefixes).some(p => key.startsWith(p))) return 'inventory';
  if (prefixes(settings.serialPrefixes).some(p => key.startsWith(p))) return 'serial';
  return null;
}

function setMessage(text, kind = '') {
  const el = $('#message'); el.textContent = text; el.className = `message ${kind}`;
}

function focusScanner() { setTimeout(() => scanInput.focus(), 0); }

function processScan(raw, forcedType = null) {
  const value = normalize(raw);
  if (!value) return;
  $('#typeChoice').classList.add('hidden');
  unresolvedScan = '';
  const key = comparable(value);
  const found = records.find(r => comparable(r.inventory) === key || comparable(r.serial) === key);
  if (found) {
    highlightedId = found.id; pending = null; updatePending(); render();
    setMessage(`Найдено: ${found.inventory} ↔ ${found.serial}`, 'success');
    document.querySelector(`[data-id="${found.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    scanInput.value = ''; focusScanner(); return;
  }
  const type = forcedType || detectType(value);
  if (!type) {
    unresolvedScan = value; $('#typeChoice').classList.remove('hidden');
    setMessage(`Новый номер: ${value}. Укажите его тип.`); return;
  }
  if (!pending) {
    pending = { type, value };
    setMessage(type === 'inventory' ? 'Инвентарный принят. Сканируйте серийный.' : 'Серийный принят. Сканируйте инвентарный.', 'success');
    updatePending(); scanInput.value = ''; focusScanner(); return;
  }
  if (pending.type === type) {
    unresolvedScan = value; $('#typeChoice').classList.remove('hidden');
    setMessage('Похоже, оба номера одного типа. Выберите правильный тип.', 'error'); return;
  }
  const record = { id: uid(), inventory: type === 'inventory' ? value : pending.value, serial: type === 'serial' ? value : pending.value, date: today() };
  if (records.some(r => comparable(r.inventory) === comparable(record.inventory) || comparable(r.serial) === comparable(record.serial))) {
    setMessage('Такой номер уже есть в списке.', 'error'); return;
  }
  records.push(record); pending = null; highlightedId = record.id; save(); updatePending(); render();
  setMessage(`Запись добавлена: ${record.inventory} ↔ ${record.serial}`, 'success'); showToast('Запись сохранена'); scanInput.value = ''; focusScanner();
}

function updatePending() {
  $('#pendingCard').classList.toggle('hidden', !pending);
  if (!pending) return;
  $('#pendingValue').textContent = pending.value;
  $('#pendingHint').textContent = pending.type === 'inventory' ? 'Теперь нужен серийный номер' : 'Теперь нужен инвентарный номер';
}

function showToast(text) { const el = $('#toast'); el.textContent = text; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2200); }
function openRecord(record = null) {
  $('#dialogTitle').textContent = record ? 'Изменить запись' : 'Новая запись'; $('#editId').value = record?.id || '';
  $('#inventoryInput').value = record?.inventory || ''; $('#serialInput').value = record?.serial || ''; $('#recordDialog').showModal();
}

$('#scanForm').addEventListener('submit', e => { e.preventDefault(); processScan(scanInput.value); });
$('#typeChoice').addEventListener('click', e => { const type = e.target.dataset.type; if (!type) return; if (type === 'cancel') { unresolvedScan = ''; $('#typeChoice').classList.add('hidden'); setMessage('Готов к работе'); focusScanner(); } else processScan(unresolvedScan, type); });
$('#cancelPending').addEventListener('click', () => { pending = null; updatePending(); setMessage('Добавление отменено'); focusScanner(); });
$('#searchInput').addEventListener('input', e => render(e.target.value));
$('#addBtn').addEventListener('click', () => openRecord());
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));

$('#recordForm').addEventListener('submit', e => {
  e.preventDefault(); const inventory = normalize($('#inventoryInput').value), serial = normalize($('#serialInput').value), id = $('#editId').value;
  if (!inventory || !serial) return;
  const duplicate = records.find(r => r.id !== id && (comparable(r.inventory) === comparable(inventory) || comparable(r.serial) === comparable(serial)));
  if (duplicate) { showToast('Этот номер уже используется'); return; }
  if (id) Object.assign(records.find(r => r.id === id), { inventory, serial }); else records.push({ id: uid(), inventory, serial, date: today() });
  save(); render(); $('#recordDialog').close(); showToast('Запись сохранена'); focusScanner();
});

tableBody.addEventListener('click', e => {
  const labelId = e.target.dataset.label, editId = e.target.dataset.edit, deleteId = e.target.dataset.delete;
  if (labelId) {
    const record = records.find(r => r.id === labelId);
    localStorage.setItem('label-prefill-v1', JSON.stringify({ inventory: record.inventory, serial: record.serial }));
    location.href = 'index.html';
  }
  if (editId) openRecord(records.find(r => r.id === editId));
  if (deleteId && confirm('Удалить эту запись?')) { records = records.filter(r => r.id !== deleteId); save(); render(); showToast('Запись удалена'); }
});

$('#settingsBtn').addEventListener('click', () => { $('#inventoryPrefixes').value = settings.inventoryPrefixes; $('#serialPrefixes').value = settings.serialPrefixes; $('#settingsDialog').showModal(); });
$('#settingsForm').addEventListener('submit', e => { e.preventDefault(); settings = { inventoryPrefixes: $('#inventoryPrefixes').value, serialPrefixes: $('#serialPrefixes').value }; localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); $('#settingsDialog').close(); showToast('Правила сохранены'); focusScanner(); });

$('#exportBtn').addEventListener('click', () => {
  const rows = [['Инвентарный номер','Серийный номер','Дата'], ...records.map(r => [r.inventory,r.serial,r.date])];
  const csv = '\uFEFF' + rows.map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(';')).join('\r\n');
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'})); link.download = `оборудование-${new Date().toISOString().slice(0,10)}.csv`; link.click(); URL.revokeObjectURL(link.href); showToast('CSV скачан');
});

$('#csvInput').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  const text = await file.text(); const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean); if (!lines.length) return;
  const delimiter = lines[0].includes(';') ? ';' : ',';
  const parse = line => { const out=[]; let value='', quoted=false; for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'&&line[i+1]==='"'){value+='"';i++;}else if(c==='"')quoted=!quoted;else if(c===delimiter&&!quoted){out.push(value.trim());value='';}else value+=c;}out.push(value.trim());return out;};
  const parsed = lines.map(parse); const header = parsed[0].map(comparable); const hasHeader = header.some(x => x.includes('ИНВ') || x.includes('SERIAL') || x.includes('СЕРИЙ'));
  const invIndex = Math.max(0, header.findIndex(x => x.includes('ИНВ') || x.includes('INVENTORY'))); const serFound = header.findIndex(x => x.includes('СЕРИЙ') || x.includes('SERIAL') || x === 'SN'); const serialIndex = serFound >= 0 ? serFound : 1;
  let added = 0; parsed.slice(hasHeader ? 1 : 0).forEach(cols => { const inventory=normalize(cols[invIndex]),serial=normalize(cols[serialIndex]); if(inventory&&serial&&!records.some(r=>comparable(r.inventory)===comparable(inventory)||comparable(r.serial)===comparable(serial))){records.push({id:uid(),inventory,serial,date:today()});added++;} });
  save(); render(); e.target.value=''; showToast(`Загружено записей: ${added}`); focusScanner();
});

render(); updatePending(); focusScanner();

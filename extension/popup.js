import { loadLibrary } from './lib/storage.js';

const MAX_PREVIEW_LINES = 6;
const STATUS_RESET_MS = 3000;

const kindSelect = document.querySelector('#kind-select');
const categorySelect = document.querySelector('#category-select');
const itemSelect = document.querySelector('#item-select');
const previewContent = document.querySelector('#preview-content');
const copyButton = document.querySelector('#copy-button');
const dashboardButton = document.querySelector('#open-dashboard-button');
const statusText = document.querySelector('#status-text');

let statusTimerId;
let library = null;

function getPreviewLines(content) {
  return String(content).split('\n').slice(0, MAX_PREVIEW_LINES).join('\n');
}

function createOption(value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function setOptions(select, options) {
  select.replaceChildren(...options);
}

function setStatus(message, type) {
  clearTimeout(statusTimerId);

  statusText.textContent = message;
  statusText.classList.remove('status--success', 'status--error');

  if (type === 'success') {
    statusText.classList.add('status--success');
  }

  if (type === 'error') {
    statusText.classList.add('status--error');
  }

  if (!message) {
    return;
  }

  statusTimerId = setTimeout(() => {
    statusText.textContent = '';
    statusText.classList.remove('status--success', 'status--error');
  }, STATUS_RESET_MS);
}

function getCurrentKind() {
  return kindSelect.value;
}

function getCategoriesByKind(kind) {
  return kind === 'prompt' ? library.categories : library.checkpointCategories;
}

function getItemsByKind(kind) {
  return kind === 'prompt' ? library.prompts : library.checkpoints;
}

function getSelectedItem() {
  const items = getItemsByKind(getCurrentKind());
  return items.find((item) => item.id === itemSelect.value) || null;
}

function updatePreview() {
  const selectedItem = getSelectedItem();

  if (!selectedItem) {
    previewContent.textContent = 'No preview available.';
    copyButton.disabled = true;
    return;
  }

  const content = getCurrentKind() === 'prompt' ? selectedItem.body : selectedItem.body;
  previewContent.textContent = getPreviewLines(content);
  copyButton.disabled = false;
}

function renderItems() {
  const kind = getCurrentKind();
  const categoryId = categorySelect.value;
  const filtered = getItemsByKind(kind).filter((item) => item.categoryId === categoryId);

  setOptions(itemSelect, filtered.map((item) => createOption(item.id, item.title)));

  if (!filtered.length) {
    previewContent.textContent = 'No items found.';
    copyButton.disabled = true;
    return;
  }

  itemSelect.value = filtered[0].id;
  updatePreview();
}

function renderCategories() {
  const categories = getCategoriesByKind(getCurrentKind());
  setOptions(categorySelect, categories.map((category) => createOption(category.id, category.name)));

  if (!categories.length) {
    setOptions(itemSelect, []);
    previewContent.textContent = 'No categories found. Open dashboard to add data.';
    copyButton.disabled = true;
    return;
  }

  categorySelect.value = categories[0].id;
  renderItems();
}

function renderKinds() {
  setOptions(kindSelect, [
    createOption('prompt', 'Prompt'),
    createOption('checkpoint', 'Checkpoint')
  ]);

  kindSelect.value = 'prompt';
  renderCategories();
}

async function copySelectedItem() {
  const selectedItem = getSelectedItem();

  if (!selectedItem) {
    setStatus('Nothing selected to copy.', 'error');
    return;
  }

  try {
    await navigator.clipboard.writeText(selectedItem.body);
    setStatus('Copied to clipboard.', 'success');
  } catch (error) {
    console.error(error);
    setStatus('Copy failed. Please try again.', 'error');
  }
}

function bindEvents() {
  kindSelect.addEventListener('change', () => {
    renderCategories();
    setStatus('', undefined);
  });

  categorySelect.addEventListener('change', () => {
    renderItems();
    setStatus('', undefined);
  });

  itemSelect.addEventListener('change', () => {
    updatePreview();
    setStatus('', undefined);
  });

  copyButton.addEventListener('click', async () => {
    await copySelectedItem();
  });

  dashboardButton.addEventListener('click', async () => {
    await chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  });
}

async function initPopup() {
  try {
    library = await loadLibrary();
    renderKinds();
    bindEvents();
  } catch (error) {
    console.error(error);
    previewContent.textContent = 'Failed to load prompt library.';
    copyButton.disabled = true;
    setStatus('Please check extension storage.', 'error');
  }
}

initPopup();

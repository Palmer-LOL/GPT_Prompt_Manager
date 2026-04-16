const MAX_PREVIEW_LINES = 6;
const STATUS_RESET_MS = 3000;

const kindSelect = document.querySelector('#kind-select');
const categorySelect = document.querySelector('#category-select');
const itemSelect = document.querySelector('#item-select');
const previewContent = document.querySelector('#preview-content');
const copyButton = document.querySelector('#copy-button');
const statusText = document.querySelector('#status-text');

let statusTimerId;

function uniqueValues(values) {
  return [...new Set(values)];
}

function getPreviewLines(content) {
  return content.split('\n').slice(0, MAX_PREVIEW_LINES).join('\n');
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

async function loadSampleData() {
  const response = await fetch(chrome.runtime.getURL('data/sample-prompts.json'));

  if (!response.ok) {
    throw new Error(`Failed to load sample prompts: ${response.status}`);
  }

  const data = await response.json();
  return data.items;
}

function filterByKind(items, kind) {
  return items.filter((item) => item.kind === kind);
}

function filterByCategory(items, category) {
  return items.filter((item) => item.category === category);
}

function getSelectedItem(items) {
  return items.find((item) => item.id === itemSelect.value) ?? null;
}

function updatePreview(items) {
  const selectedItem = getSelectedItem(items);

  if (!selectedItem) {
    previewContent.textContent = 'No preview available.';
    copyButton.disabled = true;
    return;
  }

  previewContent.textContent = getPreviewLines(selectedItem.content);
  copyButton.disabled = false;
}

function renderItems(items, selectedKind, selectedCategory) {
  const filteredItems = filterByCategory(filterByKind(items, selectedKind), selectedCategory);
  const options = filteredItems.map((item) => createOption(item.id, item.title));

  setOptions(itemSelect, options);

  if (filteredItems.length === 0) {
    previewContent.textContent = 'No items found.';
    copyButton.disabled = true;
    return;
  }

  itemSelect.value = filteredItems[0].id;
  updatePreview(items);
}

function renderCategories(items, selectedKind) {
  const categories = uniqueValues(filterByKind(items, selectedKind).map((item) => item.category));
  const options = categories.map((category) => createOption(category, category));

  setOptions(categorySelect, options);

  if (categories.length === 0) {
    setOptions(itemSelect, []);
    previewContent.textContent = 'No items found.';
    copyButton.disabled = true;
    return;
  }

  categorySelect.value = categories[0];
  renderItems(items, selectedKind, categories[0]);
}

function renderKinds(items) {
  const kinds = uniqueValues(items.map((item) => item.kind));
  const options = kinds.map((kind) => createOption(kind, kind[0].toUpperCase() + kind.slice(1)));

  setOptions(kindSelect, options);

  if (kinds.length === 0) {
    previewContent.textContent = 'No items found.';
    copyButton.disabled = true;
    return;
  }

  kindSelect.value = kinds[0];
  renderCategories(items, kinds[0]);
}

async function copySelectedItem(items) {
  const selectedItem = getSelectedItem(items);

  if (!selectedItem) {
    setStatus('Nothing selected to copy.', 'error');
    return;
  }

  try {
    await navigator.clipboard.writeText(selectedItem.content);
    setStatus('Copied to clipboard.', 'success');
  } catch (error) {
    console.error(error);
    setStatus('Copy failed. Please try again.', 'error');
  }
}

function bindEvents(items) {
  kindSelect.addEventListener('change', () => {
    renderCategories(items, kindSelect.value);
    setStatus('', undefined);
  });

  categorySelect.addEventListener('change', () => {
    renderItems(items, kindSelect.value, categorySelect.value);
    setStatus('', undefined);
  });

  itemSelect.addEventListener('change', () => {
    updatePreview(items);
    setStatus('', undefined);
  });

  copyButton.addEventListener('click', async () => {
    await copySelectedItem(items);
  });
}

async function initPopup() {
  try {
    const items = await loadSampleData();

    renderKinds(items);
    bindEvents(items);
  } catch (error) {
    console.error(error);
    previewContent.textContent = 'Failed to load sample data.';
    copyButton.disabled = true;
    setStatus('Please check extension data files.', 'error');
  }
}

initPopup();

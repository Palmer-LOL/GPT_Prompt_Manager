const MAX_PREVIEW_LINES = 6;

const kindSelect = document.querySelector('#kind-select');
const categorySelect = document.querySelector('#category-select');
const itemSelect = document.querySelector('#item-select');
const previewContent = document.querySelector('#preview-content');
const statusText = document.querySelector('#status-text');

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

function renderCategories(items, selectedKind) {
  const categories = uniqueValues(filterByKind(items, selectedKind).map((item) => item.category));
  const options = categories.map((category) => createOption(category, category));

  setOptions(categorySelect, options);

  if (categories.length === 0) {
    setOptions(itemSelect, []);
    previewContent.textContent = 'No items found.';
    return;
  }

  renderItems(items, selectedKind, categories[0]);
}

function renderItems(items, selectedKind, selectedCategory) {
  const filteredItems = filterByCategory(filterByKind(items, selectedKind), selectedCategory);
  const options = filteredItems.map((item) => createOption(item.id, item.title));

  setOptions(itemSelect, options);

  if (filteredItems.length === 0) {
    previewContent.textContent = 'No items found.';
    return;
  }

  previewContent.textContent = getPreviewLines(filteredItems[0].content);
}

function updatePreview(items) {
  const selectedItem = items.find((item) => item.id === itemSelect.value);

  if (!selectedItem) {
    previewContent.textContent = 'No preview available.';
    return;
  }

  previewContent.textContent = getPreviewLines(selectedItem.content);
}

function bindEvents(items) {
  kindSelect.addEventListener('change', () => {
    renderCategories(items, kindSelect.value);
    statusText.textContent = 'Copy action will be added in the next step.';
  });

  categorySelect.addEventListener('change', () => {
    renderItems(items, kindSelect.value, categorySelect.value);
    statusText.textContent = 'Copy action will be added in the next step.';
  });

  itemSelect.addEventListener('change', () => {
    updatePreview(items);
    statusText.textContent = 'Copy action will be added in the next step.';
  });
}

function renderKinds(items) {
  const kinds = uniqueValues(items.map((item) => item.kind));
  const options = kinds.map((kind) => createOption(kind, kind[0].toUpperCase() + kind.slice(1)));

  setOptions(kindSelect, options);

  if (kinds.length === 0) {
    previewContent.textContent = 'No items found.';
    return;
  }

  renderCategories(items, kinds[0]);
}

async function initPopup() {
  try {
    const items = await loadSampleData();

    renderKinds(items);
    bindEvents(items);
  } catch (error) {
    console.error(error);
    previewContent.textContent = 'Failed to load sample data.';
    statusText.textContent = 'Please check extension data files.';
  }
}

initPopup();

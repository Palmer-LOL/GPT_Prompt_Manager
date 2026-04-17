import { createId, loadLibrary, saveLibrary } from './lib/storage.js';

const MODES = {
  prompts: {
    id: 'prompts',
    data: {
      categories: 'categories',
      items: 'prompts'
    },
    copy: {
      entity: 'Prompt',
      entityLower: 'prompt',
      categorySingular: 'category',
      categoryPlural: 'categories',
      categoryIdPrefix: 'cat',
      itemIdPrefix: 'prompt'
    }
  },
  checkpoints: {
    id: 'checkpoints',
    data: {
      categories: 'checkpointCategories',
      items: 'checkpoints'
    },
    copy: {
      entity: 'Checkpoint',
      entityLower: 'checkpoint',
      categorySingular: 'checkpoint category',
      categoryPlural: 'checkpoint categories',
      categoryIdPrefix: 'cp_cat',
      itemIdPrefix: 'cp'
    }
  }
};

const state = {
  activeMode: 'prompts',
  library: null,
  selectedCategoryId: {
    prompts: null,
    checkpoints: null
  },
  selectedItemId: {
    prompts: null,
    checkpoints: null
  },
  editingItemId: {
    prompts: null,
    checkpoints: null
  },
  statusTimer: null
};

const el = {
  status: document.querySelector('#save-status'),
  modeSelect: document.querySelector('#editor-mode'),

  categorySelect: document.querySelector('#category-select'),
  categoryName: document.querySelector('#category-name'),
  categoryAdd: document.querySelector('#category-add'),
  categoryRename: document.querySelector('#category-rename'),
  categoryPosition: document.querySelector('#category-position'),
  categoryDelete: document.querySelector('#category-delete'),

  itemSelect: document.querySelector('#item-select'),
  itemNew: document.querySelector('#item-new'),
  itemEdit: document.querySelector('#item-edit'),
  itemDelete: document.querySelector('#item-delete'),

  editorTitle: document.querySelector('#editor-title'),
  itemEditorCategory: document.querySelector('#item-editor-category'),
  itemEditorTitle: document.querySelector('#item-editor-title'),
  itemEditorDescription: document.querySelector('#item-editor-description'),
  itemEditorBody: document.querySelector('#item-editor-body'),
  itemEditorPosition: document.querySelector('#item-editor-position'),
  itemEditorSavedAt: document.querySelector('#item-editor-saved-at'),
  itemSave: document.querySelector('#item-save'),
  itemCancel: document.querySelector('#item-cancel')
};

function setStatus(message) {
  clearTimeout(state.statusTimer);
  el.status.textContent = message;
  if (!message) return;

  state.statusTimer = setTimeout(() => {
    el.status.textContent = '';
  }, 2500);
}

async function persist() {
  state.library = await saveLibrary(state.library);
  setStatus('Saved.');
}

function modeConfig(mode = state.activeMode) {
  return MODES[mode];
}

function collection(mode, key) {
  return state.library[modeConfig(mode).data[key]];
}

function getSelectedCategoryId(mode = state.activeMode) {
  return state.selectedCategoryId[mode];
}

function setSelectedCategoryId(mode, value) {
  state.selectedCategoryId[mode] = value;
}

function getSelectedItemId(mode = state.activeMode) {
  return state.selectedItemId[mode];
}

function setSelectedItemId(mode, value) {
  state.selectedItemId[mode] = value;
}

function getEditingItemId(mode = state.activeMode) {
  return state.editingItemId[mode];
}

function setEditingItemId(mode, value) {
  state.editingItemId[mode] = value;
}

function parseTargetPosition(value, maxPosition) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return maxPosition;
  }
  return Math.min(Math.max(parsed, 1), maxPosition);
}

function getSortedCategories(mode = state.activeMode) {
  return collection(mode, 'categories')
    .slice()
    .sort((a, b) => (a.position || 1) - (b.position || 1));
}

function getCategoryItems(mode = state.activeMode, categoryId = getSelectedCategoryId(mode)) {
  return collection(mode, 'items')
    .filter((item) => item.categoryId === categoryId)
    .sort((a, b) => (a.position || 1) - (b.position || 1));
}

function normalizeCategoryPositions(mode = state.activeMode) {
  const categories = getSortedCategories(mode);
  categories.forEach((category, index) => {
    category.position = index + 1;
  });
}

function normalizeItemPositions(mode = state.activeMode, categoryId) {
  const items = getCategoryItems(mode, categoryId);
  items.forEach((item, index) => {
    item.position = index + 1;
  });
}

function placeCategoryAtPosition(mode, category, requestedPosition) {
  const categories = collection(mode, 'categories').filter((item) => item.id !== category.id);
  const sortedWithout = categories.slice().sort((a, b) => (a.position || 1) - (b.position || 1));
  const targetPosition = parseTargetPosition(requestedPosition, sortedWithout.length + 1);

  sortedWithout.splice(targetPosition - 1, 0, category);
  sortedWithout.forEach((item, index) => {
    item.position = index + 1;
  });

  state.library[modeConfig(mode).data.categories] = sortedWithout;
}

function placeItemAtPosition(mode, item, categoryId, requestedPosition) {
  const items = collection(mode, 'items');
  const oldCategoryId = item.categoryId;

  const keepItems = items.filter((entry) => entry.id !== item.id);
  const otherCategoryItems = keepItems.filter((entry) => entry.categoryId !== categoryId);
  const targetCategoryItems = keepItems
    .filter((entry) => entry.categoryId === categoryId)
    .sort((a, b) => (a.position || 1) - (b.position || 1));

  const targetPosition = parseTargetPosition(requestedPosition, targetCategoryItems.length + 1);
  targetCategoryItems.splice(targetPosition - 1, 0, item);

  targetCategoryItems.forEach((entry, index) => {
    entry.categoryId = categoryId;
    entry.position = index + 1;
  });

  state.library[modeConfig(mode).data.items] = [...otherCategoryItems, ...targetCategoryItems];

  if (oldCategoryId && oldCategoryId !== categoryId) {
    normalizeItemPositions(mode, oldCategoryId);
  }
}

function ensureValidSelections(mode = state.activeMode) {
  const categories = getSortedCategories(mode);
  const currentCategoryId = getSelectedCategoryId(mode);
  if (!categories.some((category) => category.id === currentCategoryId)) {
    setSelectedCategoryId(mode, categories[0]?.id || null);
  }

  const items = getCategoryItems(mode);
  const currentItemId = getSelectedItemId(mode);
  if (!items.some((item) => item.id === currentItemId)) {
    setSelectedItemId(mode, items[0]?.id || null);
  }

  const editingId = getEditingItemId(mode);
  if (editingId && !collection(mode, 'items').some((item) => item.id === editingId)) {
    setEditingItemId(mode, null);
  }
}

function renderModeChrome() {
  const mode = state.activeMode;
  const config = modeConfig(mode);

  el.modeSelect.value = mode;
  el.editorTitle.textContent = `${config.copy.entity} Editor`;
  el.itemSave.textContent = `Save ${config.copy.entity}`;
  el.itemNew.textContent = `New ${config.copy.entity}`;
}

function renderCategorySelects() {
  const mode = state.activeMode;
  const categories = getSortedCategories(mode);
  const selectedCategoryId = getSelectedCategoryId(mode) || '';

  el.categorySelect.replaceChildren(
    ...categories.map((category) => {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = `${category.position || 1}. ${category.name}`;
      return option;
    })
  );

  el.itemEditorCategory.replaceChildren(
    ...categories.map((category) => {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = `${category.position || 1}. ${category.name}`;
      return option;
    })
  );

  const hasCategories = categories.length > 0;
  el.categorySelect.disabled = !hasCategories;
  el.itemEditorCategory.disabled = !hasCategories;
  el.categoryRename.disabled = !hasCategories;
  el.categoryPosition.disabled = !hasCategories;
  el.categoryDelete.disabled = !hasCategories;

  if (hasCategories) {
    el.categorySelect.value = selectedCategoryId;
  }
}

function renderItemSelect() {
  const mode = state.activeMode;
  const items = getCategoryItems(mode);
  const selectedItemId = getSelectedItemId(mode) || '';

  el.itemSelect.replaceChildren(
    ...items.map((item) => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = `${item.position || 1}. ${item.title}`;
      return option;
    })
  );

  const hasItems = items.length > 0;
  el.itemSelect.disabled = !hasItems;
  el.itemEdit.disabled = !hasItems;
  el.itemDelete.disabled = !hasItems;

  if (hasItems) {
    el.itemSelect.value = selectedItemId;
  }
}

function renderEditor() {
  const mode = state.activeMode;
  const categories = getSortedCategories(mode);
  const selectedCategoryId = getSelectedCategoryId(mode);
  const editing = collection(mode, 'items').find((item) => item.id === getEditingItemId(mode)) || null;

  const defaultCategoryId = editing?.categoryId || selectedCategoryId || categories[0]?.id || '';
  const itemCount = defaultCategoryId ? getCategoryItems(mode, defaultCategoryId).length : 0;

  const hasCategories = categories.length > 0;
  el.itemEditorTitle.disabled = !hasCategories;
  el.itemEditorDescription.disabled = !hasCategories;
  el.itemEditorBody.disabled = !hasCategories;
  el.itemEditorPosition.disabled = !hasCategories;
  el.itemSave.disabled = !hasCategories;

  el.itemEditorCategory.value = defaultCategoryId;
  el.itemEditorTitle.value = editing?.title || '';
  el.itemEditorDescription.value = editing?.description || '';
  el.itemEditorBody.value = editing?.body || '';
  el.itemEditorPosition.value = String(editing?.position || Math.max(itemCount, 0) + 1);
  el.itemEditorSavedAt.value = editing?.savedAt ? new Date(editing.savedAt).toLocaleString() : 'Not saved yet';
}

function render() {
  ensureValidSelections(state.activeMode);
  renderModeChrome();
  renderCategorySelects();
  renderItemSelect();
  renderEditor();
}

function bindEvents() {
  el.modeSelect.addEventListener('change', () => {
    state.activeMode = el.modeSelect.value;
    render();
  });

  el.categorySelect.addEventListener('change', () => {
    setSelectedCategoryId(state.activeMode, el.categorySelect.value || null);
    setSelectedItemId(state.activeMode, null);
    setEditingItemId(state.activeMode, null);
    render();
  });

  el.categoryAdd.addEventListener('click', async () => {
    const mode = state.activeMode;
    const config = modeConfig(mode);
    const name = el.categoryName.value.trim();
    if (!name) return;

    const categories = getSortedCategories(mode);
    const newCategory = {
      id: createId(config.copy.categoryIdPrefix),
      name,
      position: categories.length + 1
    };

    collection(mode, 'categories').push(newCategory);
    setSelectedCategoryId(mode, newCategory.id);
    setSelectedItemId(mode, null);
    setEditingItemId(mode, null);

    el.categoryName.value = '';
    await persist();
    render();
  });

  el.categoryRename.addEventListener('click', async () => {
    const mode = state.activeMode;
    const config = modeConfig(mode);
    const category = collection(mode, 'categories').find((item) => item.id === getSelectedCategoryId(mode));
    if (!category) return;

    const nextName = prompt(`Rename ${config.copy.categorySingular}`, category.name);
    if (!nextName || !nextName.trim()) return;
    category.name = nextName.trim();

    await persist();
    render();
  });

  el.categoryPosition.addEventListener('click', async () => {
    const mode = state.activeMode;
    const category = collection(mode, 'categories').find((item) => item.id === getSelectedCategoryId(mode));
    if (!category) return;

    const requestedPosition = prompt('Set category position', String(category.position || 1));
    if (requestedPosition === null) return;

    placeCategoryAtPosition(mode, category, requestedPosition);
    await persist();
    render();
  });

  el.categoryDelete.addEventListener('click', async () => {
    const mode = state.activeMode;
    const config = modeConfig(mode);
    const categoryId = getSelectedCategoryId(mode);
    const category = collection(mode, 'categories').find((item) => item.id === categoryId);
    if (!category) return;

    const items = collection(mode, 'items');
    const itemCount = items.filter((item) => item.categoryId === category.id).length;
    const ok = confirm(`Delete ${config.copy.categorySingular} "${category.name}" and ${itemCount} ${config.copy.entityLower}(s)?`);
    if (!ok) return;

    state.library[config.data.categories] = collection(mode, 'categories').filter((item) => item.id !== category.id);
    state.library[config.data.items] = items.filter((item) => item.categoryId !== category.id);
    normalizeCategoryPositions(mode);

    setSelectedCategoryId(mode, null);
    setSelectedItemId(mode, null);
    setEditingItemId(mode, null);

    await persist();
    render();
  });

  el.itemSelect.addEventListener('change', () => {
    setSelectedItemId(state.activeMode, el.itemSelect.value || null);
    setEditingItemId(state.activeMode, null);
    render();
  });

  el.itemNew.addEventListener('click', () => {
    const mode = state.activeMode;
    const selectedCategoryId = getSelectedCategoryId(mode);
    setEditingItemId(mode, null);

    el.itemEditorTitle.value = '';
    el.itemEditorDescription.value = '';
    el.itemEditorBody.value = '';
    el.itemEditorSavedAt.value = 'Not saved yet';
    if (selectedCategoryId) {
      el.itemEditorCategory.value = selectedCategoryId;
      el.itemEditorPosition.value = String(getCategoryItems(mode, selectedCategoryId).length + 1);
    } else {
      el.itemEditorPosition.value = '1';
    }
  });

  el.itemEdit.addEventListener('click', () => {
    const mode = state.activeMode;
    const selectedItemId = getSelectedItemId(mode);
    if (!selectedItemId) return;

    setEditingItemId(mode, selectedItemId);
    renderEditor();
  });

  el.itemDelete.addEventListener('click', async () => {
    const mode = state.activeMode;
    const config = modeConfig(mode);
    const selectedItemId = getSelectedItemId(mode);
    const item = collection(mode, 'items').find((entry) => entry.id === selectedItemId);
    if (!item) return;

    const ok = confirm(`Delete ${config.copy.entityLower} "${item.title}"?`);
    if (!ok) return;

    state.library[config.data.items] = collection(mode, 'items').filter((entry) => entry.id !== item.id);
    normalizeItemPositions(mode, item.categoryId);

    setSelectedItemId(mode, null);
    if (getEditingItemId(mode) === item.id) {
      setEditingItemId(mode, null);
    }

    await persist();
    render();
  });

  el.itemSave.addEventListener('click', async () => {
    const mode = state.activeMode;
    const config = modeConfig(mode);
    const categoryId = el.itemEditorCategory.value;
    const title = el.itemEditorTitle.value.trim();
    const description = el.itemEditorDescription.value.trim();
    const body = el.itemEditorBody.value;
    const requestedPosition = el.itemEditorPosition.value;

    if (!categoryId) {
      alert(`Create a ${config.copy.categorySingular} first.`);
      return;
    }

    if (!title) {
      alert(`${config.copy.entity} title is required.`);
      return;
    }

    const items = collection(mode, 'items');
    const editingId = getEditingItemId(mode);

    if (editingId) {
      const editing = items.find((item) => item.id === editingId);
      if (!editing) {
        alert(`${config.copy.entity} no longer exists.`);
        setEditingItemId(mode, null);
      } else {
        editing.title = title;
        editing.description = description;
        editing.body = body;
        editing.savedAt = new Date().toISOString();
        placeItemAtPosition(mode, editing, categoryId, requestedPosition);
      }
    } else {
      const newItem = {
        id: createId(config.copy.itemIdPrefix),
        categoryId,
        position: 1,
        title,
        description,
        body,
        savedAt: new Date().toISOString()
      };
      items.push(newItem);
      placeItemAtPosition(mode, newItem, categoryId, requestedPosition);
    }

    setSelectedCategoryId(mode, categoryId);
    setEditingItemId(mode, null);
    await persist();
    render();
  });

  el.itemCancel.addEventListener('click', () => {
    setEditingItemId(state.activeMode, null);
    renderEditor();
  });
}

async function init() {
  state.library = await loadLibrary();
  state.selectedCategoryId.prompts = getSortedCategories('prompts')[0]?.id || null;
  state.selectedCategoryId.checkpoints = getSortedCategories('checkpoints')[0]?.id || null;

  bindEvents();
  render();
}

init();

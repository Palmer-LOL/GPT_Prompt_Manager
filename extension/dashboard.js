import { createId, loadLibrary, saveLibrary } from './lib/storage.js';

const MODES = {
  prompts: {
    id: 'prompts',
    tab: {
      button: 'tabPrompts',
      panel: 'panelPrompts'
    },
    data: {
      categories: 'categories',
      items: 'prompts',
      selectedCategoryId: 'selectedPromptCategoryId',
      selectedItemId: 'selectedPromptId',
      editingItemId: 'editingPromptId'
    },
    elements: {
      categories: 'promptCategories',
      categoryName: 'promptCategoryName',
      categoryAdd: 'promptCategoryAdd',
      items: 'promptItems',
      newItem: 'promptNew',
      editorCategory: 'promptEditorCategory',
      editorTitle: 'promptEditorTitle',
      editorDescription: 'promptEditorDescription',
      editorBody: 'promptEditorBody',
      editorSavedAt: 'promptEditorSavedAt',
      save: 'promptSave',
      cancel: 'promptCancel'
    },
    copy: {
      entity: 'Prompt',
      entityLower: 'prompt',
      categoryEmpty: 'No categories yet.',
      itemEmpty: 'No prompts in this category.',
      createCategoryFirst: 'Create a category first.',
      titleRequired: 'Prompt title is required.',
      missingItem: 'Prompt no longer exists.',
      categoryIdPrefix: 'cat',
      itemIdPrefix: 'prompt'
    }
  },
  checkpoints: {
    id: 'checkpoints',
    tab: {
      button: 'tabCheckpoints',
      panel: 'panelCheckpoints'
    },
    data: {
      categories: 'checkpointCategories',
      items: 'checkpoints',
      selectedCategoryId: 'selectedCheckpointCategoryId',
      selectedItemId: 'selectedCheckpointId',
      editingItemId: 'editingCheckpointId'
    },
    elements: {
      categories: 'checkpointCategories',
      categoryName: 'checkpointCategoryName',
      categoryAdd: 'checkpointCategoryAdd',
      items: 'checkpointItems',
      newItem: 'checkpointNew',
      editorCategory: 'checkpointEditorCategory',
      editorTitle: 'checkpointEditorTitle',
      editorDescription: 'checkpointEditorDescription',
      editorBody: 'checkpointEditorBody',
      save: 'checkpointSave',
      cancel: 'checkpointCancel'
    },
    copy: {
      entity: 'Checkpoint',
      entityLower: 'checkpoint',
      categoryEmpty: 'No checkpoint categories yet.',
      itemEmpty: 'No checkpoints in this category.',
      createCategoryFirst: 'Create a checkpoint category first.',
      titleRequired: 'Checkpoint title is required.',
      missingItem: 'Checkpoint no longer exists.',
      categoryIdPrefix: 'cp_cat',
      itemIdPrefix: 'cp'
    }
  }
};

const state = {
  activeTab: MODES.prompts.id,
  library: null,
  selectedPromptCategoryId: null,
  selectedPromptId: null,
  editingPromptId: null,
  selectedCheckpointCategoryId: null,
  selectedCheckpointId: null,
  editingCheckpointId: null,
  statusTimer: null
};

const el = {
  status: document.querySelector('#save-status'),
  tabPrompts: document.querySelector('#tab-prompts'),
  tabCheckpoints: document.querySelector('#tab-checkpoints'),
  panelPrompts: document.querySelector('#panel-prompts'),
  panelCheckpoints: document.querySelector('#panel-checkpoints'),

  promptCategories: document.querySelector('#prompt-categories'),
  promptCategoryName: document.querySelector('#prompt-category-name'),
  promptCategoryAdd: document.querySelector('#prompt-category-add'),
  promptItems: document.querySelector('#prompt-items'),
  promptNew: document.querySelector('#prompt-new'),
  promptEditorCategory: document.querySelector('#prompt-editor-category'),
  promptEditorTitle: document.querySelector('#prompt-editor-title'),
  promptEditorDescription: document.querySelector('#prompt-editor-description'),
  promptEditorBody: document.querySelector('#prompt-editor-body'),
  promptEditorSavedAt: document.querySelector('#prompt-editor-saved-at'),
  promptSave: document.querySelector('#prompt-save'),
  promptCancel: document.querySelector('#prompt-cancel'),

  checkpointCategories: document.querySelector('#checkpoint-categories'),
  checkpointCategoryName: document.querySelector('#checkpoint-category-name'),
  checkpointCategoryAdd: document.querySelector('#checkpoint-category-add'),
  checkpointItems: document.querySelector('#checkpoint-items'),
  checkpointNew: document.querySelector('#checkpoint-new'),
  checkpointEditorCategory: document.querySelector('#checkpoint-editor-category'),
  checkpointEditorTitle: document.querySelector('#checkpoint-editor-title'),
  checkpointEditorDescription: document.querySelector('#checkpoint-editor-description'),
  checkpointEditorBody: document.querySelector('#checkpoint-editor-body'),
  checkpointSave: document.querySelector('#checkpoint-save'),
  checkpointCancel: document.querySelector('#checkpoint-cancel')
};

function setStatus(message) {
  clearTimeout(state.statusTimer);
  el.status.textContent = message;
  if (!message) {
    return;
  }

  state.statusTimer = setTimeout(() => {
    el.status.textContent = '';
  }, 2500);
}

async function persist() {
  state.library = await saveLibrary(state.library);
  setStatus('Saved.');
}

function moveInArray(list, index, direction) {
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= list.length) {
    return false;
  }

  [list[index], list[nextIndex]] = [list[nextIndex], list[index]];
  return true;
}

function moveItemWithinCategory(items, id, direction) {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) {
    return false;
  }

  const { categoryId } = items[index];
  const sameCategoryIndexes = items
    .map((item, itemIndex) => ({ item, itemIndex }))
    .filter(({ item }) => item.categoryId === categoryId)
    .map(({ itemIndex }) => itemIndex);

  const position = sameCategoryIndexes.indexOf(index);
  const targetPosition = position + direction;
  if (position < 0 || targetPosition < 0 || targetPosition >= sameCategoryIndexes.length) {
    return false;
  }

  const targetIndex = sameCategoryIndexes[targetPosition];
  [items[index], items[targetIndex]] = [items[targetIndex], items[index]];
  return true;
}

function getMode(mode) {
  return MODES[mode];
}

function getStateValue(mode, key) {
  const config = getMode(mode);
  return state[config.data[key]];
}

function setStateValue(mode, key, value) {
  const config = getMode(mode);
  state[config.data[key]] = value;
}

function getLibraryCollection(mode, key) {
  const config = getMode(mode);
  return state.library[config.data[key]];
}

function getElement(mode, key) {
  const config = getMode(mode);
  return el[config.elements[key]];
}

function renderTabs() {
  Object.values(MODES).forEach((modeConfig) => {
    const isActive = state.activeTab === modeConfig.id;
    el[modeConfig.tab.button].classList.toggle('tab--active', isActive);
    el[modeConfig.tab.panel].classList.toggle('panel--active', isActive);
  });
}

function createListItem({ label, meta, selected, controls }) {
  const li = document.createElement('li');
  if (selected) {
    li.classList.add('is-selected');
  }

  const labelWrap = document.createElement('div');
  labelWrap.className = 'item-label';

  const strong = document.createElement('strong');
  strong.textContent = label;
  labelWrap.appendChild(strong);

  if (meta) {
    const metaEl = document.createElement('div');
    metaEl.className = 'item-meta';
    metaEl.textContent = meta;
    labelWrap.appendChild(metaEl);
  }

  const controlsWrap = document.createElement('div');
  controlsWrap.className = 'controls';
  controls.forEach((button) => controlsWrap.appendChild(button));

  li.append(labelWrap, controlsWrap);
  return li;
}

function makeButton(text, onClick, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

function renderMode(mode) {
  renderModeCategories(mode);
  renderModeItems(mode);
  renderModeEditor(mode);
}

function renderModeCategories(mode) {
  const config = getMode(mode);
  const categories = getLibraryCollection(mode, 'categories');
  const categoryListEl = getElement(mode, 'categories');
  categoryListEl.replaceChildren();

  if (!categories.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = config.copy.categoryEmpty;
    categoryListEl.appendChild(empty);
    return;
  }

  const selectedCategoryId = getStateValue(mode, 'selectedCategoryId');
  if (!categories.some((category) => category.id === selectedCategoryId)) {
    setStateValue(mode, 'selectedCategoryId', categories[0].id);
  }

  categories.forEach((category, index) => {
    const selectButton = makeButton('Select', () => {
      setStateValue(mode, 'selectedCategoryId', category.id);
      setStateValue(mode, 'selectedItemId', null);
      setStateValue(mode, 'editingItemId', null);
      renderMode(mode);
    });

    const upButton = makeButton('↑', async () => {
      if (!moveInArray(categories, index, -1)) return;
      await persist();
      renderMode(mode);
    }, index === 0);

    const downButton = makeButton('↓', async () => {
      if (!moveInArray(categories, index, 1)) return;
      await persist();
      renderMode(mode);
    }, index === categories.length - 1);

    const renameButton = makeButton('Rename', async () => {
      const nextName = prompt('Rename category', category.name);
      if (!nextName || !nextName.trim()) return;
      category.name = nextName.trim();
      await persist();
      renderMode(mode);
    });

    const deleteButton = makeButton('Delete', async () => {
      const items = getLibraryCollection(mode, 'items');
      const itemCount = items.filter((item) => item.categoryId === category.id).length;
      const ok = confirm(`Delete category "${category.name}" and ${itemCount} ${config.copy.entityLower}(s)?`);
      if (!ok) return;

      state.library[config.data.categories] = categories.filter((item) => item.id !== category.id);
      state.library[config.data.items] = items.filter((item) => item.categoryId !== category.id);

      if (getStateValue(mode, 'selectedCategoryId') === category.id) {
        setStateValue(mode, 'selectedCategoryId', null);
      }
      const selectedItemId = getStateValue(mode, 'selectedItemId');
      if (selectedItemId && !state.library[config.data.items].some((item) => item.id === selectedItemId)) {
        setStateValue(mode, 'selectedItemId', null);
      }
      setStateValue(mode, 'editingItemId', null);
      await persist();
      renderMode(mode);
    });

    categoryListEl.appendChild(createListItem({
      label: category.name,
      selected: getStateValue(mode, 'selectedCategoryId') === category.id,
      controls: [selectButton, upButton, downButton, renameButton, deleteButton]
    }));
  });
}

function renderModeItems(mode) {
  const config = getMode(mode);
  const selectedCategoryId = getStateValue(mode, 'selectedCategoryId');
  const items = getLibraryCollection(mode, 'items').filter((item) => item.categoryId === selectedCategoryId);
  const itemsListEl = getElement(mode, 'items');

  itemsListEl.replaceChildren();

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = config.copy.itemEmpty;
    itemsListEl.appendChild(empty);
    setStateValue(mode, 'selectedItemId', null);
    return;
  }

  const selectedItemId = getStateValue(mode, 'selectedItemId');
  if (!items.some((item) => item.id === selectedItemId)) {
    setStateValue(mode, 'selectedItemId', items[0].id);
  }

  items.forEach((item, index) => {
    const selectButton = makeButton('Select', () => {
      setStateValue(mode, 'selectedItemId', item.id);
      setStateValue(mode, 'editingItemId', null);
      renderMode(mode);
    });

    const editButton = makeButton('Edit', () => {
      setStateValue(mode, 'editingItemId', item.id);
      renderModeEditor(mode);
    });

    const upButton = makeButton('↑', async () => {
      if (!moveItemWithinCategory(getLibraryCollection(mode, 'items'), item.id, -1)) return;
      await persist();
      renderMode(mode);
    }, index === 0);

    const downButton = makeButton('↓', async () => {
      if (!moveItemWithinCategory(getLibraryCollection(mode, 'items'), item.id, 1)) return;
      await persist();
      renderMode(mode);
    }, index === items.length - 1);

    const deleteButton = makeButton('Delete', async () => {
      const ok = confirm(`Delete ${config.copy.entityLower} "${item.title}"?`);
      if (!ok) return;

      state.library[config.data.items] = getLibraryCollection(mode, 'items').filter((entry) => entry.id !== item.id);
      if (getStateValue(mode, 'selectedItemId') === item.id) {
        setStateValue(mode, 'selectedItemId', null);
      }
      if (getStateValue(mode, 'editingItemId') === item.id) {
        setStateValue(mode, 'editingItemId', null);
      }
      await persist();
      renderMode(mode);
    });

    const savedAt = new Date(item.savedAt).toLocaleString();
    itemsListEl.appendChild(createListItem({
      label: item.title,
      meta: `Saved ${savedAt}`,
      selected: getStateValue(mode, 'selectedItemId') === item.id,
      controls: [selectButton, editButton, upButton, downButton, deleteButton]
    }));
  });
}

function renderModeEditor(mode) {
  const categories = getLibraryCollection(mode, 'categories');
  const editorCategoryEl = getElement(mode, 'editorCategory');
  const editorTitleEl = getElement(mode, 'editorTitle');
  const editorDescriptionEl = getElement(mode, 'editorDescription');
  const editorBodyEl = getElement(mode, 'editorBody');
  const saveEl = getElement(mode, 'save');

  editorCategoryEl.replaceChildren(
    ...categories.map((category) => {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.name;
      return option;
    })
  );

  const items = getLibraryCollection(mode, 'items');
  const editing = items.find((item) => item.id === getStateValue(mode, 'editingItemId')) || null;

  const selectedCategory = editing?.categoryId || getStateValue(mode, 'selectedCategoryId') || categories[0]?.id || '';
  editorCategoryEl.disabled = categories.length === 0;
  editorTitleEl.disabled = categories.length === 0;
  editorDescriptionEl.disabled = categories.length === 0;
  editorBodyEl.disabled = categories.length === 0;
  saveEl.disabled = categories.length === 0;

  editorCategoryEl.value = selectedCategory;
  editorTitleEl.value = editing?.title || '';
  editorDescriptionEl.value = editing?.description || '';
  editorBodyEl.value = editing?.body || '';

  const savedAtEl = getElement(mode, 'editorSavedAt');
  if (savedAtEl) {
    savedAtEl.disabled = true;
    savedAtEl.value = editing?.savedAt ? new Date(editing.savedAt).toLocaleString() : 'Not saved yet';
  }
}

function bindModeEvents(mode) {
  const config = getMode(mode);
  const categoryNameEl = getElement(mode, 'categoryName');
  const categoryAddEl = getElement(mode, 'categoryAdd');
  const newItemEl = getElement(mode, 'newItem');
  const editorCategoryEl = getElement(mode, 'editorCategory');
  const editorTitleEl = getElement(mode, 'editorTitle');
  const editorDescriptionEl = getElement(mode, 'editorDescription');
  const editorBodyEl = getElement(mode, 'editorBody');
  const saveEl = getElement(mode, 'save');
  const cancelEl = getElement(mode, 'cancel');
  const savedAtEl = getElement(mode, 'editorSavedAt');

  categoryAddEl.addEventListener('click', async () => {
    const name = categoryNameEl.value.trim();
    if (!name) return;
    getLibraryCollection(mode, 'categories').push({ id: createId(config.copy.categoryIdPrefix), name });
    categoryNameEl.value = '';
    await persist();
    renderMode(mode);
  });

  newItemEl.addEventListener('click', () => {
    setStateValue(mode, 'editingItemId', null);
    editorTitleEl.value = '';
    editorDescriptionEl.value = '';
    editorBodyEl.value = '';
    if (savedAtEl) {
      savedAtEl.value = 'Not saved yet';
    }
    const selectedCategoryId = getStateValue(mode, 'selectedCategoryId');
    if (selectedCategoryId) {
      editorCategoryEl.value = selectedCategoryId;
    }
  });

  saveEl.addEventListener('click', async () => {
    const categoryId = editorCategoryEl.value;
    const title = editorTitleEl.value.trim();
    const description = editorDescriptionEl.value.trim();
    const body = editorBodyEl.value;

    if (!categoryId) {
      alert(config.copy.createCategoryFirst);
      return;
    }

    if (!title) {
      alert(config.copy.titleRequired);
      return;
    }

    const items = getLibraryCollection(mode, 'items');
    const editingItemId = getStateValue(mode, 'editingItemId');
    if (editingItemId) {
      const editing = items.find((item) => item.id === editingItemId);
      if (!editing) {
        alert(config.copy.missingItem);
        setStateValue(mode, 'editingItemId', null);
      } else {
        editing.categoryId = categoryId;
        editing.title = title;
        editing.description = description;
        editing.body = body;
        editing.savedAt = new Date().toISOString();
      }
    } else {
      items.push({
        id: createId(config.copy.itemIdPrefix),
        categoryId,
        title,
        description,
        body,
        savedAt: new Date().toISOString()
      });
    }

    setStateValue(mode, 'selectedCategoryId', categoryId);
    setStateValue(mode, 'editingItemId', null);
    await persist();
    renderMode(mode);
  });

  cancelEl.addEventListener('click', () => {
    setStateValue(mode, 'editingItemId', null);
    renderModeEditor(mode);
  });
}

function renderPrompts() {
  renderMode('prompts');
}

function renderCheckpoints() {
  renderMode('checkpoints');
}

function bindPromptEvents() {
  bindModeEvents('prompts');
}

function bindCheckpointEvents() {
  bindModeEvents('checkpoints');
}

function bindTabEvents() {
  el.tabPrompts.addEventListener('click', () => {
    state.activeTab = 'prompts';
    renderTabs();
  });

  el.tabCheckpoints.addEventListener('click', () => {
    state.activeTab = 'checkpoints';
    renderTabs();
  });
}

async function init() {
  state.library = await loadLibrary();

  state.selectedPromptCategoryId = state.library.categories[0]?.id || null;
  state.selectedCheckpointCategoryId = state.library.checkpointCategories[0]?.id || null;

  renderTabs();
  renderPrompts();
  renderCheckpoints();

  bindTabEvents();
  bindPromptEvents();
  bindCheckpointEvents();
}

init();

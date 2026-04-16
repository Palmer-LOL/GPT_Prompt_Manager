import { createId, loadLibrary, saveLibrary } from './lib/storage.js';

const state = {
  activeTab: 'prompts',
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
  promptEditorBody: document.querySelector('#prompt-editor-body'),
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

function renderTabs() {
  const promptActive = state.activeTab === 'prompts';
  el.tabPrompts.classList.toggle('tab--active', promptActive);
  el.tabCheckpoints.classList.toggle('tab--active', !promptActive);
  el.panelPrompts.classList.toggle('panel--active', promptActive);
  el.panelCheckpoints.classList.toggle('panel--active', !promptActive);
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

function renderPromptCategories() {
  const categories = state.library.categories;
  el.promptCategories.replaceChildren();

  if (!categories.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No categories yet.';
    el.promptCategories.appendChild(empty);
    return;
  }

  if (!categories.some((category) => category.id === state.selectedPromptCategoryId)) {
    state.selectedPromptCategoryId = categories[0].id;
  }

  categories.forEach((category, index) => {
    const selectButton = makeButton('Select', () => {
      state.selectedPromptCategoryId = category.id;
      state.selectedPromptId = null;
      state.editingPromptId = null;
      renderPrompts();
    });

    const upButton = makeButton('↑', async () => {
      if (!moveInArray(state.library.categories, index, -1)) return;
      await persist();
      renderPrompts();
    }, index === 0);

    const downButton = makeButton('↓', async () => {
      if (!moveInArray(state.library.categories, index, 1)) return;
      await persist();
      renderPrompts();
    }, index === categories.length - 1);

    const renameButton = makeButton('Rename', async () => {
      const nextName = prompt('Rename category', category.name);
      if (!nextName || !nextName.trim()) return;
      category.name = nextName.trim();
      await persist();
      renderPrompts();
    });

    const deleteButton = makeButton('Delete', async () => {
      const promptCount = state.library.prompts.filter((promptItem) => promptItem.categoryId === category.id).length;
      const ok = confirm(`Delete category "${category.name}" and ${promptCount} prompt(s)?`);
      if (!ok) return;

      state.library.categories = state.library.categories.filter((item) => item.id !== category.id);
      state.library.prompts = state.library.prompts.filter((item) => item.categoryId !== category.id);
      if (state.selectedPromptCategoryId === category.id) {
        state.selectedPromptCategoryId = null;
      }
      if (state.selectedPromptId && !state.library.prompts.some((item) => item.id === state.selectedPromptId)) {
        state.selectedPromptId = null;
      }
      state.editingPromptId = null;
      await persist();
      renderPrompts();
    });

    el.promptCategories.appendChild(createListItem({
      label: category.name,
      selected: state.selectedPromptCategoryId === category.id,
      controls: [selectButton, upButton, downButton, renameButton, deleteButton]
    }));
  });
}

function renderPromptItems() {
  const categoryId = state.selectedPromptCategoryId;
  const prompts = state.library.prompts.filter((promptItem) => promptItem.categoryId === categoryId);

  el.promptItems.replaceChildren();

  if (!prompts.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No prompts in this category.';
    el.promptItems.appendChild(empty);
    state.selectedPromptId = null;
    return;
  }

  if (!prompts.some((promptItem) => promptItem.id === state.selectedPromptId)) {
    state.selectedPromptId = prompts[0].id;
  }

  prompts.forEach((promptItem, index) => {
    const selectButton = makeButton('Select', () => {
      state.selectedPromptId = promptItem.id;
      state.editingPromptId = null;
      renderPrompts();
    });

    const editButton = makeButton('Edit', () => {
      state.editingPromptId = promptItem.id;
      renderPromptEditor();
    });

    const upButton = makeButton('↑', async () => {
      if (!moveItemWithinCategory(state.library.prompts, promptItem.id, -1)) return;
      await persist();
      renderPrompts();
    }, index === 0);

    const downButton = makeButton('↓', async () => {
      if (!moveItemWithinCategory(state.library.prompts, promptItem.id, 1)) return;
      await persist();
      renderPrompts();
    }, index === prompts.length - 1);

    const deleteButton = makeButton('Delete', async () => {
      const ok = confirm(`Delete prompt "${promptItem.title}"?`);
      if (!ok) return;
      state.library.prompts = state.library.prompts.filter((item) => item.id !== promptItem.id);
      if (state.selectedPromptId === promptItem.id) {
        state.selectedPromptId = null;
      }
      if (state.editingPromptId === promptItem.id) {
        state.editingPromptId = null;
      }
      await persist();
      renderPrompts();
    });

    el.promptItems.appendChild(createListItem({
      label: promptItem.title,
      selected: state.selectedPromptId === promptItem.id,
      controls: [selectButton, editButton, upButton, downButton, deleteButton]
    }));
  });
}

function renderPromptEditor() {
  const categories = state.library.categories;
  el.promptEditorCategory.replaceChildren(
    ...categories.map((category) => {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.name;
      return option;
    })
  );

  const editing = state.library.prompts.find((promptItem) => promptItem.id === state.editingPromptId) || null;

  const selectedCategory = editing?.categoryId || state.selectedPromptCategoryId || categories[0]?.id || '';
  el.promptEditorCategory.disabled = categories.length === 0;
  el.promptEditorTitle.disabled = categories.length === 0;
  el.promptEditorBody.disabled = categories.length === 0;
  el.promptSave.disabled = categories.length === 0;

  el.promptEditorCategory.value = selectedCategory;
  el.promptEditorTitle.value = editing?.title || '';
  el.promptEditorBody.value = editing?.body || '';
}

function renderPrompts() {
  renderPromptCategories();
  renderPromptItems();
  renderPromptEditor();
}

function renderCheckpointCategories() {
  const categories = state.library.checkpointCategories;
  el.checkpointCategories.replaceChildren();

  if (!categories.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No checkpoint categories yet.';
    el.checkpointCategories.appendChild(empty);
    return;
  }

  if (!categories.some((category) => category.id === state.selectedCheckpointCategoryId)) {
    state.selectedCheckpointCategoryId = categories[0].id;
  }

  categories.forEach((category, index) => {
    const selectButton = makeButton('Select', () => {
      state.selectedCheckpointCategoryId = category.id;
      state.selectedCheckpointId = null;
      state.editingCheckpointId = null;
      renderCheckpoints();
    });

    const upButton = makeButton('↑', async () => {
      if (!moveInArray(state.library.checkpointCategories, index, -1)) return;
      await persist();
      renderCheckpoints();
    }, index === 0);

    const downButton = makeButton('↓', async () => {
      if (!moveInArray(state.library.checkpointCategories, index, 1)) return;
      await persist();
      renderCheckpoints();
    }, index === categories.length - 1);

    const renameButton = makeButton('Rename', async () => {
      const nextName = prompt('Rename category', category.name);
      if (!nextName || !nextName.trim()) return;
      category.name = nextName.trim();
      await persist();
      renderCheckpoints();
    });

    const deleteButton = makeButton('Delete', async () => {
      const checkpointCount = state.library.checkpoints.filter((item) => item.categoryId === category.id).length;
      const ok = confirm(`Delete category "${category.name}" and ${checkpointCount} checkpoint(s)?`);
      if (!ok) return;

      state.library.checkpointCategories = state.library.checkpointCategories.filter((item) => item.id !== category.id);
      state.library.checkpoints = state.library.checkpoints.filter((item) => item.categoryId !== category.id);
      if (state.selectedCheckpointCategoryId === category.id) {
        state.selectedCheckpointCategoryId = null;
      }
      if (state.selectedCheckpointId && !state.library.checkpoints.some((item) => item.id === state.selectedCheckpointId)) {
        state.selectedCheckpointId = null;
      }
      state.editingCheckpointId = null;
      await persist();
      renderCheckpoints();
    });

    el.checkpointCategories.appendChild(createListItem({
      label: category.name,
      selected: state.selectedCheckpointCategoryId === category.id,
      controls: [selectButton, upButton, downButton, renameButton, deleteButton]
    }));
  });
}

function renderCheckpointItems() {
  const categoryId = state.selectedCheckpointCategoryId;
  const checkpoints = state.library.checkpoints.filter((checkpoint) => checkpoint.categoryId === categoryId);

  el.checkpointItems.replaceChildren();

  if (!checkpoints.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No checkpoints in this category.';
    el.checkpointItems.appendChild(empty);
    state.selectedCheckpointId = null;
    return;
  }

  if (!checkpoints.some((checkpoint) => checkpoint.id === state.selectedCheckpointId)) {
    state.selectedCheckpointId = checkpoints[0].id;
  }

  checkpoints.forEach((checkpoint, index) => {
    const selectButton = makeButton('Select', () => {
      state.selectedCheckpointId = checkpoint.id;
      state.editingCheckpointId = null;
      renderCheckpoints();
    });

    const editButton = makeButton('Edit', () => {
      state.editingCheckpointId = checkpoint.id;
      renderCheckpointEditor();
    });

    const upButton = makeButton('↑', async () => {
      if (!moveItemWithinCategory(state.library.checkpoints, checkpoint.id, -1)) return;
      await persist();
      renderCheckpoints();
    }, index === 0);

    const downButton = makeButton('↓', async () => {
      if (!moveItemWithinCategory(state.library.checkpoints, checkpoint.id, 1)) return;
      await persist();
      renderCheckpoints();
    }, index === checkpoints.length - 1);

    const deleteButton = makeButton('Delete', async () => {
      const ok = confirm(`Delete checkpoint "${checkpoint.title}"?`);
      if (!ok) return;
      state.library.checkpoints = state.library.checkpoints.filter((item) => item.id !== checkpoint.id);
      if (state.selectedCheckpointId === checkpoint.id) {
        state.selectedCheckpointId = null;
      }
      if (state.editingCheckpointId === checkpoint.id) {
        state.editingCheckpointId = null;
      }
      await persist();
      renderCheckpoints();
    });

    const savedAt = new Date(checkpoint.savedAt).toLocaleString();
    el.checkpointItems.appendChild(createListItem({
      label: checkpoint.title,
      meta: `Saved ${savedAt}`,
      selected: state.selectedCheckpointId === checkpoint.id,
      controls: [selectButton, editButton, upButton, downButton, deleteButton]
    }));
  });
}

function renderCheckpointEditor() {
  const categories = state.library.checkpointCategories;
  el.checkpointEditorCategory.replaceChildren(
    ...categories.map((category) => {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.name;
      return option;
    })
  );

  const editing = state.library.checkpoints.find((item) => item.id === state.editingCheckpointId) || null;

  const selectedCategory = editing?.categoryId || state.selectedCheckpointCategoryId || categories[0]?.id || '';
  el.checkpointEditorCategory.disabled = categories.length === 0;
  el.checkpointEditorTitle.disabled = categories.length === 0;
  el.checkpointEditorDescription.disabled = categories.length === 0;
  el.checkpointEditorBody.disabled = categories.length === 0;
  el.checkpointSave.disabled = categories.length === 0;

  el.checkpointEditorCategory.value = selectedCategory;
  el.checkpointEditorTitle.value = editing?.title || '';
  el.checkpointEditorDescription.value = editing?.description || '';
  el.checkpointEditorBody.value = editing?.body || '';
}

function renderCheckpoints() {
  renderCheckpointCategories();
  renderCheckpointItems();
  renderCheckpointEditor();
}

function bindPromptEvents() {
  el.promptCategoryAdd.addEventListener('click', async () => {
    const name = el.promptCategoryName.value.trim();
    if (!name) return;
    state.library.categories.push({ id: createId('cat'), name });
    el.promptCategoryName.value = '';
    await persist();
    renderPrompts();
  });

  el.promptNew.addEventListener('click', () => {
    state.editingPromptId = null;
    el.promptEditorTitle.value = '';
    el.promptEditorBody.value = '';
    if (state.selectedPromptCategoryId) {
      el.promptEditorCategory.value = state.selectedPromptCategoryId;
    }
  });

  el.promptSave.addEventListener('click', async () => {
    const categoryId = el.promptEditorCategory.value;
    const title = el.promptEditorTitle.value.trim();
    const body = el.promptEditorBody.value;

    if (!categoryId) {
      alert('Create a category first.');
      return;
    }

    if (!title) {
      alert('Prompt title is required.');
      return;
    }

    if (state.editingPromptId) {
      const editing = state.library.prompts.find((item) => item.id === state.editingPromptId);
      if (!editing) {
        alert('Prompt no longer exists.');
        state.editingPromptId = null;
      } else {
        editing.categoryId = categoryId;
        editing.title = title;
        editing.body = body;
      }
    } else {
      state.library.prompts.push({ id: createId('prompt'), categoryId, title, body });
    }

    state.selectedPromptCategoryId = categoryId;
    state.editingPromptId = null;
    await persist();
    renderPrompts();
  });

  el.promptCancel.addEventListener('click', () => {
    state.editingPromptId = null;
    renderPromptEditor();
  });
}

function bindCheckpointEvents() {
  el.checkpointCategoryAdd.addEventListener('click', async () => {
    const name = el.checkpointCategoryName.value.trim();
    if (!name) return;
    state.library.checkpointCategories.push({ id: createId('cp_cat'), name });
    el.checkpointCategoryName.value = '';
    await persist();
    renderCheckpoints();
  });

  el.checkpointNew.addEventListener('click', () => {
    state.editingCheckpointId = null;
    el.checkpointEditorTitle.value = '';
    el.checkpointEditorDescription.value = '';
    el.checkpointEditorBody.value = '';
    if (state.selectedCheckpointCategoryId) {
      el.checkpointEditorCategory.value = state.selectedCheckpointCategoryId;
    }
  });

  el.checkpointSave.addEventListener('click', async () => {
    const categoryId = el.checkpointEditorCategory.value;
    const title = el.checkpointEditorTitle.value.trim();
    const description = el.checkpointEditorDescription.value.trim();
    const body = el.checkpointEditorBody.value;

    if (!categoryId) {
      alert('Create a checkpoint category first.');
      return;
    }

    if (!title) {
      alert('Checkpoint title is required.');
      return;
    }

    if (state.editingCheckpointId) {
      const editing = state.library.checkpoints.find((item) => item.id === state.editingCheckpointId);
      if (!editing) {
        alert('Checkpoint no longer exists.');
        state.editingCheckpointId = null;
      } else {
        editing.categoryId = categoryId;
        editing.title = title;
        editing.description = description;
        editing.body = body;
        editing.savedAt = new Date().toISOString();
      }
    } else {
      state.library.checkpoints.push({
        id: createId('cp'),
        categoryId,
        title,
        description,
        body,
        savedAt: new Date().toISOString()
      });
    }

    state.selectedCheckpointCategoryId = categoryId;
    state.editingCheckpointId = null;
    await persist();
    renderCheckpoints();
  });

  el.checkpointCancel.addEventListener('click', () => {
    state.editingCheckpointId = null;
    renderCheckpointEditor();
  });
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

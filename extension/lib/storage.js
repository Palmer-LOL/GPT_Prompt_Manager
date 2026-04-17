export const STORAGE_KEY_LIBRARY = 'gpm_library_v1';

const DEFAULT_LIBRARY = {
  categories: [
    { id: 'cat_writing', name: 'Writing' },
    { id: 'cat_engineering', name: 'Engineering' }
  ],
  prompts: [
    {
      id: 'prompt_release_note',
      categoryId: 'cat_writing',
      title: 'Draft a concise release note',
      description: 'Template for concise release communication.',
      body: 'Write a concise release note for the new extension milestone. Include changes, risks, and next steps in under 120 words.',
      savedAt: new Date().toISOString()
    },
    {
      id: 'prompt_plan_review',
      categoryId: 'cat_engineering',
      title: 'Review implementation plan',
      description: 'Checklist-style review prompt for implementation plans.',
      body: 'Review this implementation plan for missing acceptance criteria and validation steps. Return actionable suggestions only.',
      savedAt: new Date().toISOString()
    }
  ],
  checkpointCategories: [
    { id: 'cp_cat_session', name: 'Session' }
  ],
  checkpoints: [
    {
      id: 'cp_mvp_progress',
      categoryId: 'cp_cat_session',
      title: 'MVP Progress Checkpoint',
      description: 'Current implementation status for extension migration work.',
      body: 'Conversation Checkpoint\n\n1) Synopsis\nExtension popup supports browse and copy behavior.\n\n2) Key facts & decisions\n- Popup is browse/copy only\n- Dashboard owns editing workflows',
      savedAt: new Date().toISOString()
    }
  ]
};

function cloneDefaultLibrary() {
  return JSON.parse(JSON.stringify(DEFAULT_LIBRARY));
}

function uniqueById(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item || typeof item.id !== 'string' || !item.id.trim()) {
      return false;
    }

    if (seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}

export function createId(prefix = 'id') {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export function normalizeLibrary(library) {
  const base = cloneDefaultLibrary();

  if (!library || typeof library !== 'object') {
    return base;
  }

  const categories = uniqueById(Array.isArray(library.categories) ? library.categories : []).map((category) => ({
    id: String(category.id),
    name: String(category.name || category.id).trim()
  }));

  const checkpointCategories = uniqueById(
    Array.isArray(library.checkpointCategories) ? library.checkpointCategories : []
  ).map((category) => ({
    id: String(category.id),
    name: String(category.name || category.id).trim()
  }));

  const categoryIds = new Set(categories.map((category) => category.id));
  const checkpointCategoryIds = new Set(checkpointCategories.map((category) => category.id));

  const prompts = uniqueById(Array.isArray(library.prompts) ? library.prompts : [])
    .filter((prompt) => typeof prompt.categoryId === 'string' && categoryIds.has(prompt.categoryId))
    .map((prompt) => ({
      id: String(prompt.id),
      categoryId: String(prompt.categoryId),
      title: String(prompt.title || '').trim(),
      description: String(prompt.description || '').trim(),
      body: String(prompt.body || ''),
      savedAt: String(prompt.savedAt || new Date().toISOString())
    }))
    .filter((prompt) => prompt.title);

  const checkpoints = uniqueById(Array.isArray(library.checkpoints) ? library.checkpoints : [])
    .filter((checkpoint) => typeof checkpoint.categoryId === 'string' && checkpointCategoryIds.has(checkpoint.categoryId))
    .map((checkpoint) => ({
      id: String(checkpoint.id),
      categoryId: String(checkpoint.categoryId),
      title: String(checkpoint.title || '').trim(),
      description: String(checkpoint.description || '').trim(),
      body: String(checkpoint.body || ''),
      savedAt: String(checkpoint.savedAt || new Date().toISOString())
    }))
    .filter((checkpoint) => checkpoint.title);

  return {
    categories,
    prompts,
    checkpointCategories,
    checkpoints
  };
}

export function validateLibrary(library) {
  if (!library || typeof library !== 'object') {
    return { ok: false, error: 'Library must be an object.' };
  }

  for (const key of ['categories', 'prompts', 'checkpointCategories', 'checkpoints']) {
    if (!Array.isArray(library[key])) {
      return { ok: false, error: `Library is missing ${key}.` };
    }
  }

  return { ok: true };
}

export async function loadLibrary() {
  const stored = await chrome.storage.local.get(STORAGE_KEY_LIBRARY);
  const raw = stored?.[STORAGE_KEY_LIBRARY];

  if (!raw) {
    const seed = cloneDefaultLibrary();
    await saveLibrary(seed);
    return seed;
  }

  return normalizeLibrary(raw);
}

export async function saveLibrary(library) {
  const normalized = normalizeLibrary(library);
  await chrome.storage.local.set({
    [STORAGE_KEY_LIBRARY]: normalized
  });
  return normalized;
}

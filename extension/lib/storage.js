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
      position: 1,
      title: 'Draft a concise release note',
      description: 'Template for concise release communication.',
      body: 'Write a concise release note for the new extension milestone. Include changes, risks, and next steps in under 120 words.',
      savedAt: new Date().toISOString()
    },
    {
      id: 'prompt_plan_review',
      categoryId: 'cat_engineering',
      position: 1,
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
      position: 1,
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

  const normalizePositionedItems = (inputItems, validCategoryIds) => {
    const normalizedItems = uniqueById(Array.isArray(inputItems) ? inputItems : [])
      .filter((item) => typeof item.categoryId === 'string' && validCategoryIds.has(item.categoryId))
      .map((item, index) => {
        const parsedPosition = Number.parseInt(item.position, 10);
        return {
          id: String(item.id),
          categoryId: String(item.categoryId),
          title: String(item.title || '').trim(),
          description: String(item.description || '').trim(),
          body: String(item.body || ''),
          savedAt: String(item.savedAt || new Date().toISOString()),
          position: Number.isFinite(parsedPosition) && parsedPosition > 0 ? parsedPosition : null,
          __index: index
        };
      })
      .filter((item) => item.title);

    const itemsByCategory = new Map();
    normalizedItems.forEach((item) => {
      if (!itemsByCategory.has(item.categoryId)) {
        itemsByCategory.set(item.categoryId, []);
      }
      itemsByCategory.get(item.categoryId).push(item);
    });

    const positionById = new Map();
    itemsByCategory.forEach((items) => {
      items
        .sort((a, b) => {
          const aPosition = a.position ?? Number.MAX_SAFE_INTEGER;
          const bPosition = b.position ?? Number.MAX_SAFE_INTEGER;
          if (aPosition === bPosition) {
            return a.__index - b.__index;
          }
          return aPosition - bPosition;
        })
        .forEach((item, index) => {
          positionById.set(item.id, index + 1);
        });
    });

    return normalizedItems.map(({ __index, ...item }) => ({
      ...item,
      position: positionById.get(item.id) || 1
    }));
  };

  const prompts = normalizePositionedItems(library.prompts, categoryIds);
  const checkpoints = normalizePositionedItems(library.checkpoints, checkpointCategoryIds);

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

  const normalized = normalizeLibrary(raw);
  if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
    await chrome.storage.local.set({
      [STORAGE_KEY_LIBRARY]: normalized
    });
  }
  return normalized;
}

export async function saveLibrary(library) {
  const normalized = normalizeLibrary(library);
  await chrome.storage.local.set({
    [STORAGE_KEY_LIBRARY]: normalized
  });
  return normalized;
}

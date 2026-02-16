// ==UserScript==
// @name         GPT Prompt Manager
// @namespace    local.promptmanager
// @version      0.6.0
// @description  Prompt Manager Userscript for ChatGPT Web Interface.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(() => {
  'use strict';

  // -----------------------------
  // Sample library (optional)
  // -----------------------------
  const SAMPLE_CATEGORIES = [
    { id: 'cat_work', name: 'Work / InfoSec' },
    { id: 'cat_science', name: 'Philosophy / Science' },
    { id: 'cat_scratch', name: 'Scratch' },
  ];

  const SAMPLE_LIBRARY = {
    categories: SAMPLE_CATEGORIES,
    prompts: [
      {
        id: 'p_risk_summary',
        categoryId: 'cat_work',
        title: 'Risk summary (1 page)',
 body:
 `Write a 1-page risk summary.

 Context:
 - System/Process:
 - Data types:
 - Threats:
 - Controls:
 - Residual risk:
 - Recommended next steps:

 Constraints:
 - Be precise and non-alarmist.
 - Include assumptions explicitly.`
      },
      {
        id: 'p_policy_rewrite',
        categoryId: 'cat_work',
        title: 'Policy clause rewrite',
        body:
        `Rewrite the following policy clause for clarity, enforceability, and least-privilege alignment.

        Clause:
        <PASTE HERE>

        Requirements:
        - Keep intent the same unless you flag changes.
        - Provide: (1) clean rewrite (2) annotated rationale (3) options if tradeoffs exist.`
      },
      {
        id: 'p_first_principles',
        categoryId: 'cat_science',
        title: 'First-principles explanation',
        body:
        `Explain this from first principles.

        Topic:
        <PASTE HERE>

        Constraints:
        - Define terms on first use.
        - Make assumptions explicit.
        - Use one or two logical steps at a time, and pause at natural checkpoints.`
      },
      {
        id: 'p_blank_scaffold',
        categoryId: 'cat_scratch',
        title: 'Blank scaffold',
        body: `Context:\n\nGoal:\n\nConstraints:\n\nWhat I tried:\n\nQuestion:`
      }
    ],
    checkpointCategories: SAMPLE_CATEGORIES.map(c => ({ ...c })),
 checkpoints: []
  };

  // -----------------------------
  // Storage keys
  // -----------------------------
  const KEY_DATA = 'pf_library_v1';
  const KEY_AUTOSEND = 'pf_autosend_v1';
  const KEY_BACKUP_LAST = 'pf_library_backup_last';

  // -----------------------------
  // Helpers
  // -----------------------------
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function uid(prefix = 'id') {
    return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  }

  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[c]));
  }

  function cloneCategories(categories) {
    return (categories || []).map(c => ({ id: c.id, name: c.name }));
  }

  function getEstTimestamp(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZoneName: 'shortOffset'
    }).formatToParts(date);

    const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
    const offsetMatch = (map.timeZoneName || '').match(/GMT([+-]\d{1,2})/);
    let offset = '';
    if (offsetMatch) {
      const hours = Math.abs(parseInt(offsetMatch[1], 10));
      const sign = parseInt(offsetMatch[1], 10) >= 0 ? '+' : '-';
      offset = `${sign}${String(hours).padStart(2, '0')}:00`;
    }

    return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}${offset}`;
  }

  function isVisible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function findComposerElement() {
    const candidates = [
      'textarea',
      'div[contenteditable="true"]',
      '[role="textbox"][contenteditable="true"]',
      '[role="textbox"]'
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && isVisible(el)) return el;
    }
    return null;
  }

  function setComposerText(el, text) {
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      el.focus();
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    el.focus();
    try {
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
    } catch {
      el.textContent = text;
    }
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  }

  function getComposerText(el) {
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      return el.value || '';
    }
    return el.textContent || '';
  }

  function appendComposerText(el, text) {
    const existing = getComposerText(el);
    const separator = existing && !existing.endsWith('\n') ? '\n\n' : '';
    const combined = `${existing}${separator}${text}`;
    setComposerText(el, combined);
  }

  function getAutoSend() {
    try { return !!GM_getValue(KEY_AUTOSEND, false); } catch { return false; }
  }
  function setAutoSend(v) {
    try { GM_setValue(KEY_AUTOSEND, !!v); } catch { /* ignore */ }
  }

  async function clickSendIfEnabled() {
    if (!getAutoSend()) return;

    const btnSelectors = [
      'button[data-testid="send-button"]',
      'button[aria-label="Send message"]',
      'button[type="submit"]'
    ];

    for (const sel of btnSelectors) {
      const btn = document.querySelector(sel);
      if (btn && isVisible(btn) && !btn.disabled) {
        btn.click();
        return;
      }
    }
  }

  function downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // fallback below
      }
    }

    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }

  async function flashButtonLabel(button, nextLabel, duration = 1200) {
    if (!button) return;
    const original = button.textContent;
    button.textContent = nextLabel;
    button.disabled = true;
    await sleep(duration);
    button.textContent = original;
    button.disabled = false;
  }

  function validateLibraryShape(obj) {
    if (!obj || typeof obj !== 'object') return { ok: false, error: 'Root must be an object.' };
    if (!Array.isArray(obj.categories)) return { ok: false, error: 'Missing "categories" array.' };
    if (!Array.isArray(obj.prompts)) return { ok: false, error: 'Missing "prompts" array.' };

    for (const c of obj.categories) {
      if (!c || typeof c !== 'object') return { ok: false, error: 'Category entries must be objects.' };
      if (typeof c.id !== 'string' || !c.id.trim()) return { ok: false, error: 'Each category must have a non-empty string id.' };
      if (typeof c.name !== 'string' || !c.name.trim()) return { ok: false, error: 'Each category must have a non-empty string name.' };
    }

    for (const p of obj.prompts) {
      if (!p || typeof p !== 'object') return { ok: false, error: 'Prompt entries must be objects.' };
      if (typeof p.id !== 'string' || !p.id.trim()) return { ok: false, error: 'Each prompt must have a non-empty string id.' };
      if (typeof p.categoryId !== 'string' || !p.categoryId.trim()) return { ok: false, error: 'Each prompt must have a non-empty string categoryId.' };
      if (typeof p.title !== 'string' || !p.title.trim()) return { ok: false, error: 'Each prompt must have a non-empty string title.' };
      if (typeof p.body !== 'string') return { ok: false, error: 'Each prompt must have a string body.' };
    }

    const catIds = new Set(obj.categories.map(c => c.id));
    for (const p of obj.prompts) {
      if (!catIds.has(p.categoryId)) {
        return { ok: false, error: `Prompt "${p.title}" references missing categoryId "${p.categoryId}".` };
      }
    }

    const dupCheck = (arr, key) => {
      const seen = new Set();
      for (const item of arr) {
        if (seen.has(item[key])) return item[key];
        seen.add(item[key]);
      }
      return null;
    };
    const dupCat = dupCheck(obj.categories, 'id');
    if (dupCat) return { ok: false, error: `Duplicate category id: ${dupCat}` };
    const dupPrompt = dupCheck(obj.prompts, 'id');
    if (dupPrompt) return { ok: false, error: `Duplicate prompt id: ${dupPrompt}` };

    if (obj.checkpointCategories !== undefined) {
      if (!Array.isArray(obj.checkpointCategories)) return { ok: false, error: 'Missing "checkpointCategories" array.' };
      for (const c of obj.checkpointCategories) {
        if (!c || typeof c !== 'object') return { ok: false, error: 'Checkpoint category entries must be objects.' };
        if (typeof c.id !== 'string' || !c.id.trim()) return { ok: false, error: 'Each checkpoint category must have a non-empty string id.' };
        if (typeof c.name !== 'string' || !c.name.trim()) return { ok: false, error: 'Each checkpoint category must have a non-empty string name.' };
      }
      const dupCheckpointCat = dupCheck(obj.checkpointCategories, 'id');
      if (dupCheckpointCat) return { ok: false, error: `Duplicate checkpoint category id: ${dupCheckpointCat}` };
    }

    if (obj.checkpoints !== undefined) {
      if (!Array.isArray(obj.checkpoints)) return { ok: false, error: 'Checkpoints must be an array when provided.' };
      for (const c of obj.checkpoints) {
        if (!c || typeof c !== 'object') return { ok: false, error: 'Checkpoint entries must be objects.' };
        if (typeof c.id !== 'string' || !c.id.trim()) return { ok: false, error: 'Each checkpoint must have a non-empty string id.' };
        if (typeof c.categoryId !== 'string' || !c.categoryId.trim()) return { ok: false, error: 'Each checkpoint must have a non-empty string categoryId.' };
        if (typeof c.title !== 'string' || !c.title.trim()) return { ok: false, error: 'Each checkpoint must have a non-empty string title.' };
        if (typeof c.description !== 'string') return { ok: false, error: 'Each checkpoint must have a string description.' };
        if (typeof c.body !== 'string') return { ok: false, error: 'Each checkpoint must have a string body.' };
        if (typeof c.savedAt !== 'string' || !c.savedAt.trim()) return { ok: false, error: 'Each checkpoint must have a savedAt ISO string.' };
      }
      const checkpointCatSource = Array.isArray(obj.checkpointCategories) ? obj.checkpointCategories : obj.categories;
      const checkpointCatIds = new Set(checkpointCatSource.map(c => c.id));
      for (const cp of obj.checkpoints) {
        if (!checkpointCatIds.has(cp.categoryId)) {
          return { ok: false, error: `Checkpoint "${cp.title}" references missing categoryId "${cp.categoryId}".` };
        }
      }
      const dupCheckpoint = dupCheck(obj.checkpoints, 'id');
      if (dupCheckpoint) return { ok: false, error: `Duplicate checkpoint id: ${dupCheckpoint}` };
    }

    return { ok: true };
  }

  // -----------------------------
  // Library data model
  // data = { categories: [{id,name}], prompts:[{id,categoryId,title,body}], checkpointCategories:[{id,name}], checkpoints:[{id,categoryId,title,description,body,savedAt}] }
  // -----------------------------
  function loadLibrary() {
    const raw = (() => { try { return GM_getValue(KEY_DATA, ''); } catch { return ''; } })();
    const parsed = safeJsonParse(raw, null);
    if (parsed && Array.isArray(parsed.categories) && Array.isArray(parsed.prompts)) {
      if (!Array.isArray(parsed.checkpoints)) parsed.checkpoints = [];
      if (!Array.isArray(parsed.checkpointCategories)) parsed.checkpointCategories = cloneCategories(parsed.categories);
      return parsed;
    }

    // First run: seed with sample
    const seed = structuredClone
    ? structuredClone(SAMPLE_LIBRARY)
    : safeJsonParse(JSON.stringify(SAMPLE_LIBRARY), SAMPLE_LIBRARY);
    saveLibrary(seed);
    return seed;
  }

  function saveLibrary(data) {
    try { GM_setValue(KEY_DATA, JSON.stringify(data)); } catch { /* ignore */ }
  }

  function normalizeLibrary(data) {
    if (!Array.isArray(data.checkpoints)) data.checkpoints = [];
    if (!Array.isArray(data.checkpointCategories)) data.checkpointCategories = cloneCategories(data.categories);
    const catIds = new Set(data.categories.map(c => c.id));
    const checkpointCatIds = new Set(data.checkpointCategories.map(c => c.id));
    data.prompts = data.prompts.filter(p => catIds.has(p.categoryId));
    data.checkpoints = data.checkpoints.filter(c => checkpointCatIds.has(c.categoryId));
  }

  // -----------------------------
  // Dark-only CSS
  // -----------------------------
  GM_addStyle(`
  #pf_btn {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 999999;
  padding: 6px 8px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(32, 32, 36, 0.92);
  color: #e6e6eb;
  font: 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0,0,0,0.6);
  user-select: none;
  }

  #pf_panel {
  position: fixed;
  right: 18px;
  bottom: 64px;
  width: 440px;
  max-height: 72vh;
  overflow: auto;
  z-index: 999999;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(28, 28, 32, 0.96);
  color: #e6e6eb;
  box-shadow: 0 12px 40px rgba(0,0,0,0.75);
  padding: 12px;
  display: none;
  font: 13px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  }
  #pf_panel.pf_manage {
  width: min(900px, 92vw);
  }

  #pf_panel header {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  margin: -12px -12px 10px;
  padding: 12px;
  position: sticky;
  top: 0;
  z-index: 2;
  background: rgba(28, 28, 32, 0.98);
  border-bottom: 1px solid rgba(255,255,255,0.08);
  }

  .pf_tabs { display:flex; gap:8px; }
  .pf_tab {
    padding: 6px 10px;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.14);
    background: rgba(36,36,42,0.9);
    cursor: pointer;
    font-size: 12px;
    user-select: none;
  }
  .pf_tab.active {
    border-color: rgba(255,255,255,0.32);
    background: rgba(44,44,52,0.95);
    font-weight: 700;
  }

  .pf_row { display:flex; gap:10px; align-items:center; }
  .pf_toggle { display:flex; gap:6px; align-items:center; font-size:12px; opacity:0.95; white-space: nowrap; }
  .pf_btn2 {
    padding: 6px 10px;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.14);
    background: rgba(36,36,42,0.9);
    cursor: pointer;
    color: #e6e6eb;
    font-size: 12px;
    user-select: none;
  }
  .pf_btn2:hover { border-color: rgba(255,255,255,0.32); background: rgba(44,44,52,0.95); }

  #pf_panel input[type="text"], #pf_panel textarea, #pf_panel select {
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(18, 18, 22, 0.95);
  color: #e6e6eb;
  border: 1px solid rgba(255,255,255,0.18);
  outline: none;
  box-sizing: border-box;
  font-size: 13px;
  }
  #pf_panel textarea {
  min-height: 220px;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  line-height: 1.4;
  }

  #pf_panel input::placeholder { color: rgba(230,230,235,0.45); }

  .pf_section { margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.08); }
  .pf_group { margin: 10px 0 6px; font-weight: 800; font-size: 12px; color: rgba(230,230,235,0.65); }
  .pf_item {
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 12px;
    padding: 10px;
    margin: 8px 0;
    background: rgba(36, 36, 42, 0.9);
    cursor: pointer;
  }
  .pf_item:hover { background: rgba(44, 44, 52, 0.95); border-color: rgba(255,255,255,0.32); }
  .pf_title { font-weight: 800; margin-bottom: 4px; }
  .pf_body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11px; color: rgba(230,230,235,0.8); white-space: pre-wrap; max-height: 110px; overflow: hidden; }
  .pf_meta { font-size: 11px; opacity: 0.7; margin-top: 4px; }

  .pf_inline_actions { display:flex; gap:6px; margin-top:8px; flex-wrap: wrap; }
  .pf_smallbtn {
    padding: 4px 8px;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.14);
    background: rgba(18,18,22,0.9);
    cursor: pointer;
    font-size: 12px;
    color: rgba(230,230,235,0.92);
  }
  .pf_smallbtn:hover { border-color: rgba(255,255,255,0.32); background: rgba(26,26,32,0.95); }
  .pf_smallbtn[disabled] { opacity: 0.45; cursor: default; }

  #pf_close {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 16px;
  padding: 6px 8px;
  border-radius: 10px;
  color: #e6e6eb;
  }
  #pf_close:hover { background: rgba(255,255,255,0.08); }

  .pf_help { font-size: 12px; opacity: 0.8; line-height: 1.35; }
  .pf_two { display:grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .pf_stack { display:flex; flex-direction: column; gap: 8px; }
  .pf_manage_grid { display:grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; }
  .pf_action_grid { display:grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  @media (max-width: 900px) {
    .pf_manage_grid { grid-template-columns: 1fr; }
    .pf_action_grid { grid-template-columns: 1fr; }
  }
  `);

  // -----------------------------
  // UI
  // -----------------------------
  function buildUI() {
    if (document.getElementById('pf_btn')) return;

    const btn = document.createElement('div');
    btn.id = 'pf_btn';
    btn.textContent = '📎 Prompts';

    const panel = document.createElement('div');
    panel.id = 'pf_panel';

    panel.innerHTML = `
    <header>
    <div class="pf_tabs">
    <div class="pf_tab active" data-tab="insert">Insert</div>
    <div class="pf_tab" data-tab="prompt-settings">Prompt Settings</div>
    <div class="pf_tab" data-tab="checkpoint-settings">Checkpoint Settings</div>
    <div class="pf_tab" data-tab="manager-settings">Manager Settings</div>
    </div>
    <div class="pf_row">
    <label class="pf_toggle" title="When enabled, selecting a prompt will send it immediately.">
    <input id="pf_autosend" type="checkbox" />
    Auto-send
    </label>
    <button id="pf_close" aria-label="Close">✕</button>
    </div>
    </header>

    <div id="pf_tab_insert">
    <div class="pf_two">
    <select id="pf_insert_type">
    <option value="prompt">Prompt</option>
    <option value="checkpoint">Checkpoint</option>
    </select>
    <select id="pf_category_filter"></select>
    </div>
    <div style="margin-top:8px;">
    <input id="pf_search" type="text" placeholder="Filter (title or text)..." />
    </div>
    <div id="pf_insert_token_total" class="pf_meta" style="margin-top:8px;">Tokens (o200k_base): --</div>
    <div id="pf_list" style="margin-top:10px;"></div>
    </div>

    <div id="pf_tab_prompt_settings" style="display:none;">
    <div class="pf_help">
    Everything here is stored locally in Tampermonkey. No network calls, no sync, no surprises.
    </div>

    <div class="pf_section">
    <div class="pf_group">Prompt editor</div>
    <div id="pf_editor"></div>
    </div>

    <div class="pf_section">
    <div class="pf_group">Create category</div>
    <div class="pf_stack">
    <input id="pf_newcat_name" type="text" placeholder="New category name..." />
    <button id="pf_addcat" class="pf_btn2">Add category</button>
    </div>
    </div>

    <div class="pf_section">
    <div class="pf_manage_grid">
    <div>
    <div class="pf_group">Categories</div>
    <div id="pf_cats" style="margin-top:8px;"></div>
    </div>
    <div>
    <div class="pf_group">Prompts</div>
    <div class="pf_stack" style="margin-top:8px;">
    <select id="pf_prompt_order_category"></select>
    </div>
    <div id="pf_prompt_list" style="margin-top:8px;"></div>
    </div>
    </div>
    </div>
    </div>

    <div id="pf_tab_checkpoint_settings" style="display:none;">
    <div class="pf_help">
    Save agent checkpoints for later reuse. Stored locally in Tampermonkey alongside your prompt library.
    </div>
    <div class="pf_section">
    <div class="pf_group">Checkpoint editor</div>
    <div id="pf_checkpoint_editor"></div>
    </div>

    <div class="pf_section">
    <div class="pf_group">Create checkpoint category</div>
    <div class="pf_stack">
    <input id="pf_newcp_cat_name" type="text" placeholder="New checkpoint category name..." />
    <button id="pf_addcp_cat" class="pf_btn2">Add checkpoint category</button>
    </div>
    </div>

    <div class="pf_section">
    <div class="pf_group">Checkpoint tools</div>
    <div class="pf_stack">
    <button id="pf_newcheckpoint" class="pf_btn2">New checkpoint</button>
    </div>
    </div>

    <div class="pf_section">
    <div class="pf_manage_grid">
    <div>
    <div class="pf_group">Checkpoint categories</div>
    <div id="pf_cp_cats" style="margin-top:8px;"></div>
    </div>
    <div>
    <div class="pf_group">Checkpoints</div>
    <div id="pf_checkpoint_list" style="margin-top:8px;"></div>
    </div>
    </div>
    </div>
    </div>

    <div id="pf_tab_manager_settings" style="display:none;">
    <div class="pf_help">
    These tools manage your entire local library (prompts + checkpoints).
    </div>
    <div class="pf_section">
    <div class="pf_group">Manager tools</div>
    <div class="pf_action_grid">
    <button id="pf_reset" class="pf_btn2" title="Clear all prompts/categories or restore sample library.">Reset library</button>
    </div>

    <div class="pf_action_grid" style="margin-top:8px;">
    <button id="pf_export" class="pf_btn2" title="Download your library as JSON.">Export JSON</button>
    <button id="pf_import" class="pf_btn2" title="Import a JSON library file (replaces current).">Import JSON</button>
    </div>

    <input id="pf_import_file" type="file" accept="application/json,.json" style="display:none;" />
    </div>
    </div>
    `;

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    // State (in closure so handlers can update)
    let activeTab = 'insert';
    let insertType = 'prompt';
    let selectedPromptCategoryId = 'all';
    let selectedCheckpointCategoryId = 'all';
    let selectedPromptOrderCategoryId = 'all';
    let editingPromptId = null;
    let editingCheckpointId = null;

    // DOM refs
    const elClose = panel.querySelector('#pf_close');
    const elAutoSend = panel.querySelector('#pf_autosend');
    const elInsertType = panel.querySelector('#pf_insert_type');
    const elCategoryFilter = panel.querySelector('#pf_category_filter');
    const elSearch = panel.querySelector('#pf_search');
    const elList = panel.querySelector('#pf_list');
    const elTabInsert = panel.querySelector('#pf_tab_insert');
    const elTabPromptSettings = panel.querySelector('#pf_tab_prompt_settings');
    const elTabCheckpointSettings = panel.querySelector('#pf_tab_checkpoint_settings');
    const elTabManagerSettings = panel.querySelector('#pf_tab_manager_settings');

    const elCats = panel.querySelector('#pf_cats');
    const elNewCatName = panel.querySelector('#pf_newcat_name');
    const elAddCat = panel.querySelector('#pf_addcat');

    const elEditor = panel.querySelector('#pf_editor');
    const elReset = panel.querySelector('#pf_reset');

    const elExport = panel.querySelector('#pf_export');
    const elImport = panel.querySelector('#pf_import');
    const elImportFile = panel.querySelector('#pf_import_file');

    const elCheckpointCats = panel.querySelector('#pf_cp_cats');
    const elNewCheckpointCatName = panel.querySelector('#pf_newcp_cat_name');
    const elAddCheckpointCat = panel.querySelector('#pf_addcp_cat');

    const elNewCheckpoint = panel.querySelector('#pf_newcheckpoint');
    const elCheckpointEditor = panel.querySelector('#pf_checkpoint_editor');
    const elPromptList = panel.querySelector('#pf_prompt_list');
    const elCheckpointList = panel.querySelector('#pf_checkpoint_list');
    const elPromptOrderCategory = panel.querySelector('#pf_prompt_order_category');

    function showPanel() {
      panel.style.display = 'block';
      elAutoSend.checked = getAutoSend();
      panel.classList.toggle('pf_manage', activeTab !== 'insert');
      renderAll();
      if (activeTab === 'insert') elSearch.focus();
      else if (activeTab === 'prompt-settings') elNewCatName.focus();
      else if (activeTab === 'checkpoint-settings') elNewCheckpoint.focus();
    }

    function hidePanel() {
      panel.style.display = 'none';
      editingPromptId = null;
      editingCheckpointId = null;
    }

    elClose.addEventListener('click', hidePanel);

    btn.addEventListener('click', () => {
      if (panel.style.display === 'none' || !panel.style.display) showPanel();
      else hidePanel();
    });

      elAutoSend.addEventListener('change', (e) => setAutoSend(e.target.checked));

      panel.querySelectorAll('.pf_tab').forEach(tab => {
        tab.addEventListener('click', () => {
          activeTab = tab.dataset.tab;
          panel.querySelectorAll('.pf_tab').forEach(t => t.classList.toggle('active', t.dataset.tab === activeTab));
          elTabInsert.style.display = activeTab === 'insert' ? 'block' : 'none';
          elTabPromptSettings.style.display = activeTab === 'prompt-settings' ? 'block' : 'none';
          elTabCheckpointSettings.style.display = activeTab === 'checkpoint-settings' ? 'block' : 'none';
          elTabManagerSettings.style.display = activeTab === 'manager-settings' ? 'block' : 'none';
          panel.classList.toggle('pf_manage', activeTab !== 'insert');
          renderAll();
        });
      });

      elInsertType.addEventListener('change', () => {
        insertType = elInsertType.value;
        renderInsertList(elSearch.value);
      });

      elCategoryFilter.addEventListener('change', () => {
        if (insertType === 'prompt') {
          selectedPromptCategoryId = elCategoryFilter.value;
        } else {
          selectedCheckpointCategoryId = elCategoryFilter.value;
        }
        renderInsertList(elSearch.value);
      });

      elSearch.addEventListener('input', () => renderInsertList(elSearch.value));

      elPromptOrderCategory.addEventListener('change', () => {
        selectedPromptOrderCategoryId = elPromptOrderCategory.value;
        renderEditor();
      });

      // ---- Category actions ----
      elAddCat.addEventListener('click', () => {
        const name = (elNewCatName.value || '').trim();
        if (!name) return;
        const data = loadLibrary();
        data.categories.push({ id: uid('cat'), name });
        saveLibrary(data);
        elNewCatName.value = '';
        renderPromptSettings();
      });

      // ---- Checkpoint category actions ----
      elAddCheckpointCat.addEventListener('click', () => {
        const name = (elNewCheckpointCatName.value || '').trim();
        if (!name) return;
        const data = loadLibrary();
        data.checkpointCategories.push({ id: uid('cpcat'), name });
        saveLibrary(data);
        elNewCheckpointCatName.value = '';
        renderCheckpointSettings();
      });

      elReset.addEventListener('click', () => {
        const choice = prompt(
          'Reset library:\n' +
          'Type CLEAR to delete all categories/prompts.\n' +
          'Type SAMPLE to restore the sample library.\n' +
          'Anything else cancels.'
        );
        if (!choice) return;

        const upper = choice.trim().toUpperCase();

        if (upper === 'CLEAR') {
          saveLibrary({ categories: [], prompts: [], checkpointCategories: [], checkpoints: [] });
          editingPromptId = null;
          editingCheckpointId = null;
          renderPromptSettings();
          return;
        }
        if (upper === 'SAMPLE') {
          const seed = structuredClone
          ? structuredClone(SAMPLE_LIBRARY)
          : safeJsonParse(JSON.stringify(SAMPLE_LIBRARY), SAMPLE_LIBRARY);
          saveLibrary(seed);
          editingPromptId = null;
          editingCheckpointId = null;
          renderPromptSettings();
        }
      });

      // ---- Export / Import ----
      elExport.addEventListener('click', () => {
        const data = loadLibrary();
        normalizeLibrary(data);
        const exportedAt = getEstTimestamp();

        const payload = {
          meta: {
            exportedAt,
            schema: 'pf_library_v1',
            scriptVersion: '5.0'
          },
          data
        };

        const json = JSON.stringify(payload, null, 2);
        const stamp = payload.meta.exportedAt.replace(/[:.]/g, '-');
        downloadTextFile(`chatgpt-prompts-${stamp}.json`, json);
      });

      elImport.addEventListener('click', () => {
        elImportFile.value = '';
        elImportFile.click();
      });

      elImportFile.addEventListener('change', async () => {
        const file = elImportFile.files?.[0];
        if (!file) return;

        const text = await file.text();
        const parsed = safeJsonParse(text, null);
        if (!parsed) {
          alert('Import failed: file was not valid JSON.');
          return;
        }

        // Support either {meta,data} wrapper or raw {categories,prompts}
        const candidate = (parsed && parsed.data && parsed.meta) ? parsed.data : parsed;

        const v = validateLibraryShape(candidate);
        if (!v.ok) {
          alert(`Import failed: ${v.error}`);
          return;
        }

        const current = loadLibrary();
        const incoming = {
          ...candidate,
          checkpoints: Array.isArray(candidate.checkpoints) ? candidate.checkpoints : [],
                                    checkpointCategories: Array.isArray(candidate.checkpointCategories)
                                    ? candidate.checkpointCategories
                                    : cloneCategories(candidate.categories)
        };

        const ok = confirm(
          `Import will REPLACE your current library.\n\n` +
          `Current: ${current.categories.length} categories, ${current.prompts.length} prompts, ` +
          `${current.checkpointCategories.length} checkpoint categories, ${current.checkpoints.length} checkpoints\n` +
          `Incoming: ${incoming.categories.length} categories, ${incoming.prompts.length} prompts, ` +
          `${incoming.checkpointCategories.length} checkpoint categories, ${incoming.checkpoints.length} checkpoints\n\n` +
          `Proceed?`
        );
        if (!ok) return;

        // Save rollback snapshot (local storage)
        try {
          GM_setValue(KEY_BACKUP_LAST, JSON.stringify({
            meta: { backedUpAt: getEstTimestamp(), schema: 'pf_library_v1', scriptVersion: '5.0' },
                                                      data: current
          }));
        } catch { /* ignore */ }

        normalizeLibrary(incoming);
        saveLibrary(incoming);
        editingPromptId = null;
        renderAll();
      });

      // ---- Renderers ----
      function renderAll() {
        if (activeTab === 'insert') renderInsertList(elSearch.value);
        else if (activeTab === 'prompt-settings') renderPromptSettings();
        else if (activeTab === 'checkpoint-settings') renderCheckpointSettings();
      }

      function renderInsertList(filterText) {
        const data = loadLibrary();
        normalizeLibrary(data);

        const f = (filterText || '').trim().toLowerCase();

        const isPrompt = insertType === 'prompt';
        const cats = isPrompt ? data.categories : data.checkpointCategories;
        const items = isPrompt ? data.prompts : data.checkpoints;
        const selectedCategoryId = isPrompt ? selectedPromptCategoryId : selectedCheckpointCategoryId;

        if (!cats.some(c => c.id === selectedCategoryId)) {
          if (isPrompt) selectedPromptCategoryId = cats[0]?.id || 'all';
          else selectedCheckpointCategoryId = cats[0]?.id || 'all';
        }

        const categoryOptions = [
          `<option value="all">All categories</option>`,
          ...cats.map(c => `<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>`)
        ].join('');

        elInsertType.value = insertType;
        elCategoryFilter.innerHTML = categoryOptions;
        elCategoryFilter.value = isPrompt ? selectedPromptCategoryId : selectedCheckpointCategoryId;

        const visibleItems = [];
        const html = cats.map(cat => {
          if ((isPrompt ? selectedPromptCategoryId : selectedCheckpointCategoryId) !== 'all' &&
            (isPrompt ? selectedPromptCategoryId : selectedCheckpointCategoryId) !== cat.id) {
            return '';
            }

            const catItems = items
            .filter(item => item.categoryId === cat.id)
            .filter(item => {
              if (!f) return true;
              const titleMatch = (item.title || '').toLowerCase().includes(f);
              const bodyMatch = (item.body || '').toLowerCase().includes(f);
              return titleMatch || bodyMatch;
            });

            if (!catItems.length) return '';

            visibleItems.push(...catItems);

            const itemsHtml = catItems.map(item => `
            <div class="pf_item" data-item-id="${escHtml(item.id)}">
            <div class="pf_title">${escHtml(item.title)}</div>
            ${item.description ? `<div class="pf_help">${escHtml(item.description)}</div>` : ''}
            <div class="pf_body">${escHtml(item.body)}</div>
            <div class="pf_inline_actions">
            <button class="pf_smallbtn" data-act="item_insert" data-id="${escHtml(item.id)}">Insert</button>
            <button class="pf_smallbtn" data-act="item_copy" data-id="${escHtml(item.id)}">Copy</button>
            </div>
            </div>
            `).join('');

            return `<div class="pf_group">${escHtml(cat.name)}</div>${itemsHtml}`;
        }).join('');

        const emptyLabel = isPrompt
        ? 'No prompts match your filter — or your library is empty. Switch to “Prompt Settings” to add some.'
        : 'No checkpoints match your filter — or your library is empty. Switch to “Checkpoint Settings” to add some.';

        elList.innerHTML = html || `<div class="pf_help">${emptyLabel}</div>`;

        async function handleInsert(itemObj) {
          const composer = findComposerElement();
          if (!composer) {
            alert('Could not find the ChatGPT message box. The UI may have changed.');
            return;
          }

          appendComposerText(composer, itemObj.body);
          await sleep(60);
          await clickSendIfEnabled();
          hidePanel();
        }

        elList.querySelectorAll('.pf_item').forEach(node => {
          node.addEventListener('click', async (event) => {
            const target = event.target;
            if (target instanceof HTMLElement) {
              const actionBtn = target.closest('button[data-act]');
              if (actionBtn) {
                event.preventDefault();
                event.stopPropagation();
                const itemId = actionBtn.getAttribute('data-id');
                const data2 = loadLibrary();
                const pool = insertType === 'prompt' ? data2.prompts : data2.checkpoints;
                const itemObj = pool.find(p => p.id === itemId);
                if (!itemObj) return;

                if (actionBtn.dataset.act === 'item_copy') {
                  const ok = await copyToClipboard(itemObj.body);
                  if (!ok) {
                    alert('Copy failed. Please try again.');
                    return;
                  }
                  await flashButtonLabel(actionBtn, 'Copied');
                  return;
                }

                if (actionBtn.dataset.act === 'item_insert') {
                  await handleInsert(itemObj);
                  return;
                }
              }
            }

            const itemId = node.getAttribute('data-item-id');
            const data2 = loadLibrary();
            const pool = insertType === 'prompt' ? data2.prompts : data2.checkpoints;
            const itemObj = pool.find(p => p.id === itemId);
            if (!itemObj) return;
            await handleInsert(itemObj);
          });
        });
      }

      function renderPromptSettings() {
        const data = loadLibrary();
        normalizeLibrary(data);
        saveLibrary(data);

        renderCategories();
        renderEditor();
      }

      // ---- Checkpoint actions ----
      elNewCheckpoint.addEventListener('click', () => {
        editingCheckpointId = 'NEW';
        renderCheckpointSettings();
      });

      function renderCategories() {
        const data = loadLibrary();

        if (!data.categories.length) {
          elCats.innerHTML = `<div class="pf_help">No categories yet. Add one above.</div>`;
          return;
        }

        elCats.innerHTML = data.categories.map((c, idx) => `
        <div class="pf_item" style="cursor: default;">
        <div class="pf_title">${escHtml(c.name)}</div>
        <div class="pf_inline_actions">
        <button class="pf_smallbtn" data-act="cat_up" data-id="${escHtml(c.id)}" ${idx === 0 ? 'disabled' : ''}>↑</button>
        <button class="pf_smallbtn" data-act="cat_down" data-id="${escHtml(c.id)}" ${idx === data.categories.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="pf_smallbtn" data-act="cat_rename" data-id="${escHtml(c.id)}">Rename</button>
        <button class="pf_smallbtn" data-act="cat_delete" data-id="${escHtml(c.id)}">Delete</button>
        </div>
        </div>
        `).join('');

        elCats.querySelectorAll('button[data-act]').forEach(b => {
          b.addEventListener('click', () => {
            const act = b.dataset.act;
            const id = b.dataset.id;
            const data2 = loadLibrary();

            const idx = data2.categories.findIndex(x => x.id === id);
            if (idx < 0) return;

            if (act === 'cat_up' && idx > 0) {
              [data2.categories[idx - 1], data2.categories[idx]] = [data2.categories[idx], data2.categories[idx - 1]];
              saveLibrary(data2);
              renderCategories();
              return;
            }
            if (act === 'cat_down' && idx < data2.categories.length - 1) {
              [data2.categories[idx + 1], data2.categories[idx]] = [data2.categories[idx], data2.categories[idx + 1]];
              saveLibrary(data2);
              renderCategories();
              return;
            }
            if (act === 'cat_rename') {
              const newName = prompt('Rename category:', data2.categories[idx].name);
              if (!newName) return;
              data2.categories[idx].name = newName.trim() || data2.categories[idx].name;
              saveLibrary(data2);
              renderCategories();
              renderEditor();
              return;
            }
            if (act === 'cat_delete') {
              const cat = data2.categories[idx];
              const promptCount = data2.prompts.filter(p => p.categoryId === cat.id).length;
              const ok = confirm(
                `Delete category "${cat.name}"?\n` +
                `This will also delete ${promptCount} prompt(s) in it.`
              );
              if (!ok) return;

              data2.categories = data2.categories.filter(c => c.id !== cat.id);
              data2.prompts = data2.prompts.filter(p => p.categoryId !== cat.id);
              saveLibrary(data2);

              if (editingPromptId && editingPromptId !== 'NEW') {
                const stillExists = data2.prompts.some(p => p.id === editingPromptId);
                if (!stillExists) editingPromptId = null;
              }

              renderPromptSettings();
            }
          });
        });
      }

      function renderCheckpointCategories() {
        const data = loadLibrary();

        if (!data.checkpointCategories.length) {
          elCheckpointCats.innerHTML = `<div class="pf_help">No checkpoint categories yet. Add one above.</div>`;
          return;
        }

        elCheckpointCats.innerHTML = data.checkpointCategories.map((c, idx) => `
        <div class="pf_item" style="cursor: default;">
        <div class="pf_title">${escHtml(c.name)}</div>
        <div class="pf_inline_actions">
        <button class="pf_smallbtn" data-act="cp_cat_up" data-id="${escHtml(c.id)}" ${idx === 0 ? 'disabled' : ''}>↑</button>
        <button class="pf_smallbtn" data-act="cp_cat_down" data-id="${escHtml(c.id)}" ${idx === data.checkpointCategories.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="pf_smallbtn" data-act="cp_cat_rename" data-id="${escHtml(c.id)}">Rename</button>
        <button class="pf_smallbtn" data-act="cp_cat_delete" data-id="${escHtml(c.id)}">Delete</button>
        </div>
        </div>
        `).join('');

        elCheckpointCats.querySelectorAll('button[data-act]').forEach(b => {
          b.addEventListener('click', () => {
            const act = b.dataset.act;
            const id = b.dataset.id;
            const data2 = loadLibrary();

            const idx = data2.checkpointCategories.findIndex(x => x.id === id);
            if (idx < 0) return;

            if (act === 'cp_cat_up' && idx > 0) {
              [data2.checkpointCategories[idx - 1], data2.checkpointCategories[idx]] = [data2.checkpointCategories[idx], data2.checkpointCategories[idx - 1]];
              saveLibrary(data2);
              renderCheckpointSettings();
              return;
            }
            if (act === 'cp_cat_down' && idx < data2.checkpointCategories.length - 1) {
              [data2.checkpointCategories[idx + 1], data2.checkpointCategories[idx]] = [data2.checkpointCategories[idx], data2.checkpointCategories[idx + 1]];
              saveLibrary(data2);
              renderCheckpointSettings();
              return;
            }
            if (act === 'cp_cat_rename') {
              const newName = prompt('Rename checkpoint category:', data2.checkpointCategories[idx].name);
              if (!newName) return;
              data2.checkpointCategories[idx].name = newName.trim() || data2.checkpointCategories[idx].name;
              saveLibrary(data2);
              renderCheckpointSettings();
              return;
            }
            if (act === 'cp_cat_delete') {
              const cat = data2.checkpointCategories[idx];
              const checkpointCount = data2.checkpoints.filter(c => c.categoryId === cat.id).length;
              const ok = confirm(
                `Delete checkpoint category "${cat.name}"?\n` +
                `This will also delete ${checkpointCount} checkpoint(s) in it.`
              );
              if (!ok) return;

              data2.checkpointCategories = data2.checkpointCategories.filter(c => c.id !== cat.id);
              data2.checkpoints = data2.checkpoints.filter(c => c.categoryId !== cat.id);
              saveLibrary(data2);

              if (editingCheckpointId && editingCheckpointId !== 'NEW') {
                const stillExists = data2.checkpoints.some(c => c.id === editingCheckpointId);
                if (!stillExists) editingCheckpointId = null;
              }

              renderCheckpointSettings();
            }
          });
        });
      }

      function renderEditor() {
        const data = loadLibrary();

        const promptOrderCats = data.categories;
        if (!promptOrderCats.some(c => c.id === selectedPromptOrderCategoryId)) {
          selectedPromptOrderCategoryId = promptOrderCats[0]?.id || 'all';
        }

        elPromptOrderCategory.innerHTML = promptOrderCats.length
        ? promptOrderCats.map(c => `<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>`).join('')
        : `<option value="all">No categories yet</option>`;
        elPromptOrderCategory.disabled = promptOrderCats.length === 0;
        if (promptOrderCats.length) elPromptOrderCategory.value = selectedPromptOrderCategoryId;

        const activePromptCategory = promptOrderCats.find(c => c.id === selectedPromptOrderCategoryId);
        const promptList = activePromptCategory
        ? data.prompts.filter(p => p.categoryId === activePromptCategory.id)
        : [];

        const promptListHtml = promptList.length
        ? `
        <div class="pf_group">${escHtml(activePromptCategory.name)}</div>
        ${promptList.map((p, idx) => `
          <div class="pf_item" style="cursor: default;">
          <div class="pf_title">${escHtml(p.title)}</div>
          <div class="pf_help">Category: ${escHtml(activePromptCategory.name)}</div>
          <div class="pf_inline_actions">
          <button class="pf_smallbtn" data-act="p_up" data-id="${escHtml(p.id)}" ${idx === 0 ? 'disabled' : ''}>↑</button>
          <button class="pf_smallbtn" data-act="p_down" data-id="${escHtml(p.id)}" ${idx === promptList.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="pf_smallbtn" data-act="p_edit" data-id="${escHtml(p.id)}">Edit</button>
          <button class="pf_smallbtn" data-act="p_delete" data-id="${escHtml(p.id)}">Delete</button>
          </div>
          </div>
          `).join('')}
          `
          : `<div class="pf_help">No prompts yet for this category. Use the editor below to add one.</div>`;

          let editing = null;
          if (editingPromptId && editingPromptId !== 'NEW') {
            editing = data.prompts.find(p => p.id === editingPromptId) || null;
          }

          const isNewPrompt = !editingPromptId || editingPromptId === 'NEW';
          const catOptions = data.categories.map((c, i) => {
            const selected =
            (isNewPrompt && i === 0) ||
            (editing && editing.categoryId === c.id);
            return `<option value="${escHtml(c.id)}" ${selected ? 'selected' : ''}>${escHtml(c.name)}</option>`;
          }).join('');

          const editorDisabled = data.categories.length === 0;

          elPromptList.innerHTML = promptListHtml;

          const editorHtml = editorDisabled
          ? `<div class="pf_help">Create a category first (above), then you can add prompts.</div>`
          : `
          <div class="pf_stack">
          <input id="pf_ed_title" type="text" placeholder="Prompt title..." value="${escHtml(editing?.title ?? '')}" />
          <select id="pf_ed_cat">${catOptions}</select>
          <textarea id="pf_ed_body" placeholder="Prompt body...">${escHtml(editing?.body ?? '')}</textarea>
          <div class="pf_meta">Tokens (o200k_base): <span id="pf_ed_tokens">...</span></div>
          <div class="pf_inline_actions">
          <button id="pf_ed_save" class="pf_smallbtn">${isNewPrompt ? 'Add' : 'Save'}</button>
          <button id="pf_ed_cancel" class="pf_smallbtn">Cancel</button>
          </div>
          <div class="pf_help">
          Tip: keep placeholders like &lt;PASTE HERE&gt; or {{thing}} if you like. This script just inserts text.
          </div>
          </div>
          `;

          elEditor.innerHTML = editorHtml;

          // Prompt list button handlers
          elPromptList.querySelectorAll('button[data-act]').forEach(b => {
            b.addEventListener('click', () => {
              const act = b.dataset.act;
              const id = b.dataset.id;
              const data2 = loadLibrary();
              const pIdx = data2.prompts.findIndex(p => p.id === id);
              if (pIdx < 0) return;

              const p = data2.prompts[pIdx];

              if (act === 'p_edit') {
                editingPromptId = id;
                renderEditor();
                return;
              }

              if (act === 'p_delete') {
                const ok = confirm(`Delete prompt "${p.title}"?`);
                if (!ok) return;

                data2.prompts = data2.prompts.filter(x => x.id !== id);
                saveLibrary(data2);
                if (editingPromptId === id) editingPromptId = null;
                renderEditor();
                return;
              }

              // reorder within same category
              const sameCat = data2.prompts
              .map((pp, idx) => ({ pp, idx }))
              .filter(x => x.pp.categoryId === p.categoryId);

              const localPos = sameCat.findIndex(x => x.pp.id === id);
              if (localPos < 0) return;

              if (act === 'p_up' && localPos > 0) {
                const a = sameCat[localPos - 1].idx;
                const c = sameCat[localPos].idx;
                [data2.prompts[a], data2.prompts[c]] = [data2.prompts[c], data2.prompts[a]];
                saveLibrary(data2);
                renderEditor();
                return;
              }

              if (act === 'p_down' && localPos < sameCat.length - 1) {
                const c = sameCat[localPos].idx;
                const d = sameCat[localPos + 1].idx;
                [data2.prompts[c], data2.prompts[d]] = [data2.prompts[d], data2.prompts[c]];
                saveLibrary(data2);
                renderEditor();
              }
            });
          });

          // Editor buttons (delegated so it survives re-renders)
          // NOTE: renderEditor() rebuilds #pf_editor via innerHTML, so direct listeners can be lost.
          // We attach ONE click listener to elEditor and route by target id.
          if (!elEditor._pfDelegatedEditorClickBound) {
            elEditor._pfDelegatedEditorClickBound = true;

            elEditor.addEventListener('click', (ev) => {
              const t = ev.target;
              if (!(t instanceof HTMLElement)) return;

              if (t.id === 'pf_ed_cancel') {
                ev.preventDefault();
                ev.stopPropagation();
                editingPromptId = null;
                renderEditor();
                return;
              }

              if (t.id === 'pf_ed_save') {
                ev.preventDefault();
                ev.stopPropagation();

                const data2 = loadLibrary();
                if (data2.categories.length === 0) {
                  alert('Create a category first.');
                  return;
                }

                const title = (elEditor.querySelector('#pf_ed_title')?.value || '').trim();
                const body = (elEditor.querySelector('#pf_ed_body')?.value || '').trim();
                const categoryId = elEditor.querySelector('#pf_ed_cat')?.value;

                if (!title || !body || !categoryId) {
                  alert('Title, category, and body are required.');
                  return;
                }

                if (!editingPromptId || editingPromptId === 'NEW') {
                  data2.prompts.push({ id: uid('p'), categoryId, title, body });
                  saveLibrary(data2);
                  editingPromptId = null;
                  renderEditor();
                  return;
                }

                const idx = data2.prompts.findIndex(p => p.id === editingPromptId);
                if (idx < 0) {
                  alert('Could not find the prompt you were editing. It may have been deleted.');
                  editingPromptId = null;
                  renderEditor();
                  return;
                }

                data2.prompts[idx] = {
                  ...data2.prompts[idx],
                  title,
                  body,
                  categoryId
                };

                saveLibrary(data2);
                editingPromptId = null;
                renderEditor();
              }
            });
          }
      }

      function renderCheckpointSettings() {
        const data = loadLibrary();
        normalizeLibrary(data);
        saveLibrary(data);

        renderCheckpointCategories();

        const checkpointsByCat = data.checkpointCategories.map(cat => {
          const list = data.checkpoints.filter(c => c.categoryId === cat.id);
          if (!list.length) return '';

          const rows = list.map((c, idx) => `
          <div class="pf_item" style="cursor: default;">
          <div class="pf_title">${escHtml(c.title)}</div>
          <div class="pf_help">${escHtml(c.description || '')}</div>
          <div class="pf_meta">Saved: ${escHtml(new Date(c.savedAt).toLocaleString())}</div>
          <div class="pf_inline_actions">
          <button class="pf_smallbtn" data-act="cp_up" data-id="${escHtml(c.id)}" ${idx === 0 ? 'disabled' : ''}>↑</button>
          <button class="pf_smallbtn" data-act="cp_down" data-id="${escHtml(c.id)}" ${idx === list.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="pf_smallbtn" data-act="cp_edit" data-id="${escHtml(c.id)}">Edit</button>
          <button class="pf_smallbtn" data-act="cp_delete" data-id="${escHtml(c.id)}">Delete</button>
          </div>
          </div>
          `).join('');

          return `<div class="pf_group">${escHtml(cat.name)}</div>${rows}`;
        }).join('');

        const checkpointListHtml = checkpointsByCat || `<div class="pf_help">No checkpoints yet. Click “New checkpoint” above.</div>`;

        let editing = null;
        if (editingCheckpointId && editingCheckpointId !== 'NEW') {
          editing = data.checkpoints.find(c => c.id === editingCheckpointId) || null;
        }

        const isNewCheckpoint = editingCheckpointId === 'NEW' || !editingCheckpointId;
        const catOptions = data.checkpointCategories.map((c, i) => {
          const selected =
          (isNewCheckpoint && i === 0) ||
          (editing && editing.categoryId === c.id);
          return `<option value="${escHtml(c.id)}" ${selected ? 'selected' : ''}>${escHtml(c.name)}</option>`;
        }).join('');

        const editorDisabled = data.checkpointCategories.length === 0;

        elCheckpointList.innerHTML = checkpointListHtml;

        const editorHtml = editorDisabled
        ? `<div class="pf_help">Create a checkpoint category first (above), then you can add checkpoints.</div>`
        : `
        <div class="pf_stack">
        <input id="pf_cp_title" type="text" placeholder="Checkpoint title..." value="${escHtml(editing?.title ?? '')}" />
        <select id="pf_cp_cat">${catOptions}</select>
        <input id="pf_cp_desc" type="text" placeholder="Short description..." value="${escHtml(editing?.description ?? '')}" />
        <textarea id="pf_cp_body" placeholder="Checkpoint text...">${escHtml(editing?.body ?? '')}</textarea>
        <div class="pf_meta">Tokens (o200k_base): <span id="pf_cp_tokens">...</span></div>
        <div class="pf_inline_actions">
        <button id="pf_cp_save" class="pf_smallbtn">${isNewCheckpoint ? 'Add' : 'Save'}</button>
        <button id="pf_cp_cancel" class="pf_smallbtn">Cancel</button>
        </div>
        <div class="pf_help">
        Tip: include enough context to restore the agent's state later.
        </div>
        </div>
        `;

        elCheckpointEditor.innerHTML = editorHtml;

        elCheckpointList.querySelectorAll('button[data-act]').forEach(b => {
          b.addEventListener('click', async () => {
            const act = b.dataset.act;
            const id = b.dataset.id;
            const data2 = loadLibrary();
            const idx = data2.checkpoints.findIndex(c => c.id === id);
            if (idx < 0) return;

            const c = data2.checkpoints[idx];

            if (act === 'cp_edit') {
              editingCheckpointId = id;
              renderCheckpointSettings();
              return;
            }

            if (act === 'cp_delete') {
              const ok = confirm(`Delete checkpoint "${c.title}"?`);
              if (!ok) return;
              data2.checkpoints = data2.checkpoints.filter(x => x.id !== id);
              saveLibrary(data2);
              if (editingCheckpointId === id) editingCheckpointId = null;
              renderCheckpointSettings();
              return;
            }

            const sameCat = data2.checkpoints
            .map((cc, index) => ({ cc, index }))
            .filter(x => x.cc.categoryId === c.categoryId);
            const localPos = sameCat.findIndex(x => x.cc.id === id);
            if (localPos < 0) return;

            if (act === 'cp_up' && localPos > 0) {
              const a = sameCat[localPos - 1].index;
              const bIdx = sameCat[localPos].index;
              [data2.checkpoints[a], data2.checkpoints[bIdx]] = [data2.checkpoints[bIdx], data2.checkpoints[a]];
              saveLibrary(data2);
              renderCheckpointSettings();
              return;
            }

            if (act === 'cp_down' && localPos < sameCat.length - 1) {
              const bIdx = sameCat[localPos].index;
              const cIdx = sameCat[localPos + 1].index;
              [data2.checkpoints[bIdx], data2.checkpoints[cIdx]] = [data2.checkpoints[cIdx], data2.checkpoints[bIdx]];
              saveLibrary(data2);
              renderCheckpointSettings();
            }
          });
        });

        if (!elCheckpointEditor._pfDelegatedCheckpointClickBound) {
          elCheckpointEditor._pfDelegatedCheckpointClickBound = true;

          elCheckpointEditor.addEventListener('click', (ev) => {
            const t = ev.target;
            if (!(t instanceof HTMLElement)) return;

            if (t.id === 'pf_cp_cancel') {
              ev.preventDefault();
              ev.stopPropagation();
              editingCheckpointId = null;
              renderCheckpointSettings();
              return;
            }

            if (t.id === 'pf_cp_save') {
              ev.preventDefault();
              ev.stopPropagation();

              const data2 = loadLibrary();
              if (data2.checkpointCategories.length === 0) {
                alert('Create a checkpoint category first.');
                return;
              }

              const title = (elCheckpointEditor.querySelector('#pf_cp_title')?.value || '').trim();
              const description = (elCheckpointEditor.querySelector('#pf_cp_desc')?.value || '').trim();
              const body = (elCheckpointEditor.querySelector('#pf_cp_body')?.value || '').trim();
              const categoryId = elCheckpointEditor.querySelector('#pf_cp_cat')?.value;

              if (!title || !body || !categoryId) {
                alert('Title, category, and checkpoint text are required.');
                return;
              }

              const savedAt = new Date().toISOString();

              if (!editingCheckpointId || editingCheckpointId === 'NEW') {
                data2.checkpoints.push({ id: uid('cp'), categoryId, title, description, body, savedAt });
                saveLibrary(data2);
                editingCheckpointId = null;
                renderCheckpointSettings();
                return;
              }

              const idx = data2.checkpoints.findIndex(c => c.id === editingCheckpointId);
              if (idx < 0) {
                alert('Could not find the checkpoint you were editing. It may have been deleted.');
                editingCheckpointId = null;
                renderCheckpointSettings();
                return;
              }

              data2.checkpoints[idx] = {
                ...data2.checkpoints[idx],
                title,
                description,
                body,
                categoryId,
                savedAt
              };

              saveLibrary(data2);
              editingCheckpointId = null;
              renderCheckpointSettings();
            }
          });
        }
      }

      // Start hidden
      panel.style.display = 'none';
  }

  // -----------------------------
  // Bootstrap / SPA resilience
  // -----------------------------
  function bootstrap() {
    buildUI();

    const obs = new MutationObserver(() => {
      if (!document.getElementById('pf_btn')) buildUI();
    });
      obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();

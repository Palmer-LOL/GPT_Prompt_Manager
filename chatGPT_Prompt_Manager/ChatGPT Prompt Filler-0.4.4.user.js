// ==UserScript==
// @name         ChatGPT Prompt Filler
// @namespace    local.eric.promptfiller
// @version      0.4.4
// @description  Local prompt library for ChatGPT: categories + add/edit/delete + import/export JSON + insert into composer.
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
  const SAMPLE_LIBRARY = {
    categories: [
      { id: 'cat_work', name: 'Work / InfoSec' },
      { id: 'cat_science', name: 'Philosophy / Science' },
      { id: 'cat_scratch', name: 'Scratch' },
    ],
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
    ]
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

    return { ok: true };
  }

  // -----------------------------
  // Library data model
  // data = { categories: [{id,name}], prompts:[{id,categoryId,title,body}] }
  // -----------------------------
  function loadLibrary() {
    const raw = (() => { try { return GM_getValue(KEY_DATA, ''); } catch { return ''; } })();
    const parsed = safeJsonParse(raw, null);
    if (parsed && Array.isArray(parsed.categories) && Array.isArray(parsed.prompts)) return parsed;

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
    const catIds = new Set(data.categories.map(c => c.id));
    data.prompts = data.prompts.filter(p => catIds.has(p.categoryId));
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

    #pf_panel header {
      display: flex;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
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
      padding: 8px 10px;
      border-radius: 10px;
      background: rgba(18, 18, 22, 0.95);
      color: #e6e6eb;
      border: 1px solid rgba(255,255,255,0.18);
      outline: none;
      box-sizing: border-box;
    }
    #pf_panel textarea { min-height: 120px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; }

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
          <div class="pf_tab active" data-tab="use">Use</div>
          <div class="pf_tab" data-tab="manage">Manage</div>
        </div>
        <div class="pf_row">
          <label class="pf_toggle" title="When enabled, selecting a prompt will send it immediately.">
            <input id="pf_autosend" type="checkbox" />
            Auto-send
          </label>
          <button id="pf_close" aria-label="Close">✕</button>
        </div>
      </header>

      <div id="pf_tab_use">
        <input id="pf_search" type="text" placeholder="Filter prompts (title or text)..." />
        <div id="pf_list" style="margin-top:10px;"></div>
      </div>

      <div id="pf_tab_manage" style="display:none;">
        <div class="pf_help">
          Everything here is stored locally in Tampermonkey. No network calls, no sync, no surprises.
        </div>

        <div class="pf_section">
          <div class="pf_group">Categories</div>
          <div class="pf_two">
            <input id="pf_newcat_name" type="text" placeholder="New category name..." />
            <button id="pf_addcat" class="pf_btn2">Add category</button>
          </div>
          <div id="pf_cats" style="margin-top:8px;"></div>
        </div>

        <div class="pf_section">
          <div class="pf_group">Prompts</div>

          <div class="pf_two">
            <button id="pf_newprompt" class="pf_btn2">New prompt</button>
            <button id="pf_reset" class="pf_btn2" title="Clear all prompts/categories or restore sample library.">Reset library</button>
          </div>

          <div class="pf_two" style="margin-top:8px;">
            <button id="pf_export" class="pf_btn2" title="Download your library as JSON.">Export JSON</button>
            <button id="pf_import" class="pf_btn2" title="Import a JSON library file (replaces current).">Import JSON</button>
          </div>

          <input id="pf_import_file" type="file" accept="application/json,.json" style="display:none;" />

          <div id="pf_editor" style="margin-top:10px;"></div>
        </div>
      </div>
    `;

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    // State (in closure so handlers can update)
    let activeTab = 'use';
    let editingPromptId = null;

    // DOM refs
    const elClose = panel.querySelector('#pf_close');
    const elAutoSend = panel.querySelector('#pf_autosend');
    const elSearch = panel.querySelector('#pf_search');
    const elList = panel.querySelector('#pf_list');
    const elTabUse = panel.querySelector('#pf_tab_use');
    const elTabManage = panel.querySelector('#pf_tab_manage');

    const elCats = panel.querySelector('#pf_cats');
    const elNewCatName = panel.querySelector('#pf_newcat_name');
    const elAddCat = panel.querySelector('#pf_addcat');

    const elEditor = panel.querySelector('#pf_editor');
    const elNewPrompt = panel.querySelector('#pf_newprompt');
    const elReset = panel.querySelector('#pf_reset');

    const elExport = panel.querySelector('#pf_export');
    const elImport = panel.querySelector('#pf_import');
    const elImportFile = panel.querySelector('#pf_import_file');

    function showPanel() {
      panel.style.display = 'block';
      elAutoSend.checked = getAutoSend();
      renderAll();
      (activeTab === 'use' ? elSearch : elNewCatName).focus();
    }

    function hidePanel() {
      panel.style.display = 'none';
      editingPromptId = null;
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
        elTabUse.style.display = activeTab === 'use' ? 'block' : 'none';
        elTabManage.style.display = activeTab === 'manage' ? 'block' : 'none';
        renderAll();
      });
    });

    elSearch.addEventListener('input', () => renderUseList(elSearch.value));

    // ---- Category actions ----
    elAddCat.addEventListener('click', () => {
      const name = (elNewCatName.value || '').trim();
      if (!name) return;
      const data = loadLibrary();
      data.categories.push({ id: uid('cat'), name });
      saveLibrary(data);
      elNewCatName.value = '';
      renderManage();
    });

    // ---- Prompt actions ----
    elNewPrompt.addEventListener('click', () => {
      editingPromptId = 'NEW';
      renderEditor();
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
        saveLibrary({ categories: [], prompts: [] });
        editingPromptId = null;
        renderManage();
        return;
      }
      if (upper === 'SAMPLE') {
        const seed = structuredClone
          ? structuredClone(SAMPLE_LIBRARY)
          : safeJsonParse(JSON.stringify(SAMPLE_LIBRARY), SAMPLE_LIBRARY);
        saveLibrary(seed);
        editingPromptId = null;
        renderManage();
      }
    });

    // ---- Export / Import ----
    elExport.addEventListener('click', () => {
      const data = loadLibrary();
      normalizeLibrary(data);

      const payload = {
        meta: {
          exportedAt: new Date().toISOString(),
          schema: 'pf_library_v1',
          scriptVersion: '0.4.4'
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

      const ok = confirm(
        `Import will REPLACE your current library.\n\n` +
        `Current: ${current.categories.length} categories, ${current.prompts.length} prompts\n` +
        `Incoming: ${candidate.categories.length} categories, ${candidate.prompts.length} prompts\n\n` +
        `Proceed?`
      );
      if (!ok) return;

      // Save rollback snapshot (local storage)
      try {
        GM_setValue(KEY_BACKUP_LAST, JSON.stringify({
          meta: { backedUpAt: new Date().toISOString(), schema: 'pf_library_v1', scriptVersion: '0.4.4' },
          data: current
        }));
      } catch { /* ignore */ }

      saveLibrary(candidate);
      editingPromptId = null;
      renderAll();
    });

    // ---- Renderers ----
    function renderAll() {
      if (activeTab === 'use') renderUseList(elSearch.value);
      else renderManage();
    }

    function renderUseList(filterText) {
      const data = loadLibrary();
      normalizeLibrary(data);

      const f = (filterText || '').trim().toLowerCase();

      const cats = data.categories;
      const prompts = data.prompts;

      const html = cats.map(cat => {
        const catPrompts = prompts
          .filter(p => p.categoryId === cat.id)
          .filter(p => {
            if (!f) return true;
            return p.title.toLowerCase().includes(f) || p.body.toLowerCase().includes(f);
          });

        if (!catPrompts.length) return '';

        const itemsHtml = catPrompts.map(p => `
          <div class="pf_item" data-prompt-id="${escHtml(p.id)}">
            <div class="pf_title">${escHtml(p.title)}</div>
            <div class="pf_body">${escHtml(p.body)}</div>
          </div>
        `).join('');

        return `<div class="pf_group">${escHtml(cat.name)}</div>${itemsHtml}`;
      }).join('');

      elList.innerHTML = html || `<div class="pf_help">No prompts match your filter — or your library is empty. Switch to “Manage” to add some.</div>`;

      elList.querySelectorAll('.pf_item').forEach(node => {
        node.addEventListener('click', async () => {
          const pid = node.getAttribute('data-prompt-id');
          const data2 = loadLibrary();
          const promptObj = data2.prompts.find(p => p.id === pid);
          if (!promptObj) return;

          const composer = findComposerElement();
          if (!composer) {
            alert('Could not find the ChatGPT message box. The UI may have changed.');
            return;
          }

          setComposerText(composer, promptObj.body);
          await sleep(60);
          await clickSendIfEnabled();
          hidePanel();
        });
      });
    }

    function renderManage() {
      const data = loadLibrary();
      normalizeLibrary(data);
      saveLibrary(data);

      renderCategories();
      renderEditor();
    }

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
            const count = data2.prompts.filter(p => p.categoryId === cat.id).length;
            const ok = confirm(`Delete category "${cat.name}"?\nThis will also delete ${count} prompt(s) in it.`);
            if (!ok) return;

            data2.categories = data2.categories.filter(c => c.id !== cat.id);
            data2.prompts = data2.prompts.filter(p => p.categoryId !== cat.id);
            saveLibrary(data2);

            if (editingPromptId && editingPromptId !== 'NEW') {
              const stillExists = data2.prompts.some(p => p.id === editingPromptId);
              if (!stillExists) editingPromptId = null;
            }

            renderManage();
          }
        });
      });
    }

    function renderEditor() {
      const data = loadLibrary();

      const promptsByCat = data.categories.map(cat => {
        const ps = data.prompts.filter(p => p.categoryId === cat.id);
        if (!ps.length) return '';

        const rows = ps.map((p, idx) => `
          <div class="pf_item" style="cursor: default;">
            <div class="pf_title">${escHtml(p.title)}</div>
            <div class="pf_help">Category: ${escHtml(cat.name)}</div>
            <div class="pf_inline_actions">
              <button class="pf_smallbtn" data-act="p_up" data-id="${escHtml(p.id)}" ${idx === 0 ? 'disabled' : ''}>↑</button>
              <button class="pf_smallbtn" data-act="p_down" data-id="${escHtml(p.id)}" ${idx === ps.length - 1 ? 'disabled' : ''}>↓</button>
              <button class="pf_smallbtn" data-act="p_edit" data-id="${escHtml(p.id)}">Edit</button>
              <button class="pf_smallbtn" data-act="p_delete" data-id="${escHtml(p.id)}">Delete</button>
            </div>
          </div>
        `).join('');

        return `<div class="pf_group">${escHtml(cat.name)}</div>${rows}`;
      }).join('');

      const promptListHtml = promptsByCat || `<div class="pf_help">No prompts yet. Click “New prompt” above.</div>`;

      let editing = null;
      if (editingPromptId && editingPromptId !== 'NEW') {
        editing = data.prompts.find(p => p.id === editingPromptId) || null;
      }

      const catOptions = data.categories.map((c, i) => {
        const selected =
          (editingPromptId === 'NEW' && i === 0) ||
          (editing && editing.categoryId === c.id);
        return `<option value="${escHtml(c.id)}" ${selected ? 'selected' : ''}>${escHtml(c.name)}</option>`;
      }).join('');

      const editorDisabled = data.categories.length === 0;

      const editorHtml = `
        <div class="pf_group">Prompt editor</div>
        ${editorDisabled ? `<div class="pf_help">Create a category first (above), then you can add prompts.</div>` : `
          <div class="pf_two">
            <input id="pf_ed_title" type="text" placeholder="Prompt title..." value="${escHtml(editing?.title ?? '')}" />
            <select id="pf_ed_cat">${catOptions}</select>
          </div>
          <div style="margin-top:8px;">
            <textarea id="pf_ed_body" placeholder="Prompt body...">${escHtml(editing?.body ?? '')}</textarea>
          </div>
          <div class="pf_inline_actions">
            <button id="pf_ed_save" class="pf_smallbtn">${editingPromptId === 'NEW' ? 'Add' : 'Save'}</button>
            <button id="pf_ed_cancel" class="pf_smallbtn">Cancel</button>
          </div>
          <div class="pf_help" style="margin-top:8px;">
            Tip: keep placeholders like &lt;PASTE HERE&gt; or {{thing}} if you like. This script just inserts text.
          </div>
        `}
      `;

      elEditor.innerHTML = `
        <div class="pf_two">
          <div>${promptListHtml}</div>
          <div>${editorHtml}</div>
        </div>
      `;

      // Prompt list button handlers
      elEditor.querySelectorAll('button[data-act]').forEach(b => {
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

            if (editingPromptId === 'NEW') {
              data2.prompts.push({ id: uid('p'), categoryId, title, body });
              saveLibrary(data2);
              editingPromptId = null;
              renderEditor();
              return;
            }

            const idx = data2.prompts.findIndex(p => p.id === editingPromptId);
            if (idx < 0) {
              // Stale edit state: treat as "Add" instead of failing.
              data2.prompts.push({ id: uid('p'), categoryId, title, body });
              saveLibrary(data2);
              editingPromptId = null;
              renderEditor();
              return;
            }

            data2.prompts[idx].title = title;
            data2.prompts[idx].body = body;
            data2.prompts[idx].categoryId = categoryId;

            saveLibrary(data2);
            editingPromptId = null;
            renderEditor();
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

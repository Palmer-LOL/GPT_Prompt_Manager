#!/usr/bin/env python3
"""Standalone desktop prompt/checkpoint manager for Linux."""

from __future__ import annotations

import copy
import json
import os
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import tkinter as tk
from tkinter import filedialog, messagebox, ttk

SAMPLE_CATEGORIES = [
    {"id": "cat_work", "name": "Work / InfoSec"},
    {"id": "cat_science", "name": "Philosophy / Science"},
    {"id": "cat_scratch", "name": "Scratch"},
]

SAMPLE_LIBRARY = {
    "categories": SAMPLE_CATEGORIES,
    "prompts": [
        {
            "id": "p_risk_summary",
            "categoryId": "cat_work",
            "title": "Risk summary (1 page)",
            "body": """Write a 1-page risk summary.\n\nContext:\n- System/Process:\n- Data types:\n- Threats:\n- Controls:\n- Residual risk:\n- Recommended next steps:\n\nConstraints:\n- Be precise and non-alarmist.\n- Include assumptions explicitly.""",
        },
        {
            "id": "p_policy_rewrite",
            "categoryId": "cat_work",
            "title": "Policy clause rewrite",
            "body": """Rewrite the following policy clause for clarity, enforceability, and least-privilege alignment.\n\nClause:\n<PASTE HERE>\n\nRequirements:\n- Keep intent the same unless you flag changes.\n- Provide: (1) clean rewrite (2) annotated rationale (3) options if tradeoffs exist.""",
        },
        {
            "id": "p_first_principles",
            "categoryId": "cat_science",
            "title": "First-principles explanation",
            "body": """Explain this from first principles.\n\nTopic:\n<PASTE HERE>\n\nConstraints:\n- Define terms on first use.\n- Make assumptions explicit.\n- Use one or two logical steps at a time, and pause at natural checkpoints.""",
        },
        {
            "id": "p_blank_scaffold",
            "categoryId": "cat_scratch",
            "title": "Blank scaffold",
            "body": "Context:\n\nGoal:\n\nConstraints:\n\nWhat I tried:\n\nQuestion:",
        },
    ],
    "checkpointCategories": copy.deepcopy(SAMPLE_CATEGORIES),
    "checkpoints": [],
}


@dataclass
class Paths:
    data_dir: Path
    library_path: Path


def app_paths() -> Paths:
    base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    data_dir = base / "gpt_prompt_manager"
    return Paths(data_dir=data_dir, library_path=data_dir / "library.json")


def uid(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def est_timestamp() -> str:
    return datetime.now().astimezone().strftime("%Y-%m-%dT%H:%M:%S%z")


def validate_library_shape(obj: Any) -> tuple[bool, str | None]:
    if not isinstance(obj, dict):
        return False, "Root must be an object."
    if not isinstance(obj.get("categories"), list):
        return False, 'Missing "categories" array.'
    if not isinstance(obj.get("prompts"), list):
        return False, 'Missing "prompts" array.'

    def check_categories(categories: list[dict], label: str) -> tuple[bool, str | None]:
        ids: set[str] = set()
        for item in categories:
            if not isinstance(item, dict):
                return False, f"{label} entries must be objects."
            cid, name = item.get("id"), item.get("name")
            if not isinstance(cid, str) or not cid.strip():
                return False, f"Each {label.lower()} must have a non-empty string id."
            if not isinstance(name, str) or not name.strip():
                return False, f"Each {label.lower()} must have a non-empty string name."
            if cid in ids:
                return False, f"Duplicate {label.lower()} id: {cid}"
            ids.add(cid)
        return True, None

    ok, err = check_categories(obj["categories"], "Category")
    if not ok:
        return ok, err

    cat_ids = {c["id"] for c in obj["categories"]}
    prompt_ids: set[str] = set()
    for item in obj["prompts"]:
        if not isinstance(item, dict):
            return False, "Prompt entries must be objects."
        pid = item.get("id")
        category_id = item.get("categoryId")
        title = item.get("title")
        body = item.get("body")
        if not isinstance(pid, str) or not pid.strip():
            return False, "Each prompt must have a non-empty string id."
        if pid in prompt_ids:
            return False, f"Duplicate prompt id: {pid}"
        prompt_ids.add(pid)
        if not isinstance(category_id, str) or category_id not in cat_ids:
            return False, f"Prompt '{title}' references missing categoryId '{category_id}'."
        if not isinstance(title, str) or not title.strip():
            return False, "Each prompt must have a non-empty string title."
        if not isinstance(body, str):
            return False, "Each prompt must have a string body."

    checkpoint_categories = obj.get("checkpointCategories", copy.deepcopy(obj["categories"]))
    if not isinstance(checkpoint_categories, list):
        return False, 'Missing "checkpointCategories" array.'
    ok, err = check_categories(checkpoint_categories, "Checkpoint category")
    if not ok:
        return ok, err

    checkpoint_category_ids = {c["id"] for c in checkpoint_categories}
    checkpoints = obj.get("checkpoints", [])
    if not isinstance(checkpoints, list):
        return False, 'Checkpoints must be an array when provided.'

    checkpoint_ids: set[str] = set()
    for cp in checkpoints:
        if not isinstance(cp, dict):
            return False, "Checkpoint entries must be objects."
        cp_id = cp.get("id")
        if not isinstance(cp_id, str) or not cp_id.strip():
            return False, "Each checkpoint must have a non-empty string id."
        if cp_id in checkpoint_ids:
            return False, f"Duplicate checkpoint id: {cp_id}"
        checkpoint_ids.add(cp_id)

        category_id = cp.get("categoryId")
        if not isinstance(category_id, str) or category_id not in checkpoint_category_ids:
            return False, f"Checkpoint '{cp.get('title', '')}' references missing categoryId '{category_id}'."

        if not isinstance(cp.get("title"), str) or not cp["title"].strip():
            return False, "Each checkpoint must have a non-empty string title."
        if not isinstance(cp.get("description"), str):
            return False, "Each checkpoint must have a string description."
        if not isinstance(cp.get("body"), str):
            return False, "Each checkpoint must have a string body."
        if not isinstance(cp.get("savedAt"), str) or not cp["savedAt"].strip():
            return False, "Each checkpoint must have a savedAt ISO string."

    return True, None


class PromptManagerApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("GPT Prompt Manager (Desktop)")
        self.root.geometry("1100x720")

        self.paths = app_paths()
        self.paths.data_dir.mkdir(parents=True, exist_ok=True)

        self.library = self.load_library()

        self.selected_prompt_id: str | None = None
        self.selected_checkpoint_id: str | None = None

        self._apply_dark_theme()
        self._build_ui()
        self.refresh_all()

    def _apply_dark_theme(self) -> None:
        colors = {
            "bg": "#0b0b0b",
            "panel": "#1a1a1a",
            "field": "#101010",
            "text": "#f1f1f1",
            "muted": "#b0b0b0",
            "accent": "#ff8c00",
            "accent_active": "#ffad42",
        }
        self.root.configure(bg=colors["bg"])

        style = ttk.Style(self.root)
        if "clam" in style.theme_names():
            style.theme_use("clam")

        style.configure(".", background=colors["bg"], foreground=colors["text"])
        style.configure("TFrame", background=colors["bg"])
        style.configure("TLabel", background=colors["bg"], foreground=colors["text"])
        style.configure("TButton", background=colors["panel"], foreground=colors["text"])
        style.map(
            "TButton",
            background=[("active", colors["accent"]), ("pressed", colors["accent_active"])],
            foreground=[("disabled", colors["muted"])],
        )
        style.configure("TEntry", fieldbackground=colors["field"], foreground=colors["text"])
        style.configure("TNotebook", background=colors["bg"], borderwidth=0)
        style.configure("TNotebook.Tab", background=colors["panel"], foreground=colors["text"], padding=(12, 6))
        style.map(
            "TNotebook.Tab",
            background=[("selected", colors["accent"]), ("active", colors["panel"])],
            foreground=[("selected", "#ffffff")],
        )

        # Apply defaults for classic tkinter widgets (Listbox/Text).
        self.root.option_add("*Listbox.Background", colors["field"])
        self.root.option_add("*Listbox.Foreground", colors["text"])
        self.root.option_add("*Listbox.selectBackground", colors["accent"])
        self.root.option_add("*Listbox.selectForeground", "#ffffff")
        self.root.option_add("*Listbox.highlightBackground", colors["panel"])
        self.root.option_add("*Listbox.highlightColor", colors["accent"])
        self.root.option_add("*Text.Background", colors["field"])
        self.root.option_add("*Text.Foreground", colors["text"])
        self.root.option_add("*Text.insertBackground", colors["text"])
        self.root.option_add("*Text.highlightBackground", colors["panel"])
        self.root.option_add("*Text.highlightColor", colors["accent"])

    def load_library(self) -> dict[str, Any]:
        if not self.paths.library_path.exists():
            return self._extracted_from_load_library_3()
        try:
            return self._extracted_from_load_library_7()
        except Exception as exc:
            messagebox.showwarning("Invalid library", f"Could not parse existing library file.\n\n{exc}\n\nUsing sample seed.")
            return self._extracted_from_load_library_3()

    # TODO Rename this here and in `load_library`
    def _extracted_from_load_library_7(self):
        parsed = json.loads(self.paths.library_path.read_text(encoding="utf-8"))
        ok, err = validate_library_shape(parsed)
        if not ok:
            raise ValueError(err)
        if "checkpointCategories" not in parsed:
            parsed["checkpointCategories"] = copy.deepcopy(parsed["categories"])
        if "checkpoints" not in parsed:
            parsed["checkpoints"] = []
        return parsed

    # TODO Rename this here and in `load_library`
    def _extracted_from_load_library_3(self):
        seeded = copy.deepcopy(SAMPLE_LIBRARY)
        self.save_library(seeded)
        return seeded

    def save_library(self, data: dict[str, Any] | None = None) -> None:
        payload = data if data is not None else self.library
        self.paths.library_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    def _build_ui(self) -> None:
        toolbar = ttk.Frame(self.root)
        toolbar.pack(fill=tk.X, padx=10, pady=(10, 6))

        ttk.Button(toolbar, text="Import JSON", command=self.import_library).pack(side=tk.LEFT)
        ttk.Button(toolbar, text="Export JSON", command=self.export_library).pack(side=tk.LEFT, padx=6)
        ttk.Button(toolbar, text="Save", command=self.save_current).pack(side=tk.LEFT)

        self.status_var = tk.StringVar(value=f"Storage: {self.paths.library_path}")
        ttk.Label(toolbar, textvariable=self.status_var).pack(side=tk.RIGHT)

        notebook = ttk.Notebook(self.root)
        notebook.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        self.prompt_tab = ttk.Frame(notebook)
        self.checkpoint_tab = ttk.Frame(notebook)
        notebook.add(self.prompt_tab, text="Prompts")
        notebook.add(self.checkpoint_tab, text="Checkpoints")

        self._build_prompt_tab()
        self._build_checkpoint_tab()

    def _build_prompt_tab(self) -> None:
        left = ttk.Frame(self.prompt_tab)
        left.pack(side=tk.LEFT, fill=tk.Y, padx=(0, 10))

        ttk.Label(left, text="Prompt categories").pack(anchor="w")
        self.prompt_category_list = tk.Listbox(left, height=10, exportselection=False)
        self.prompt_category_list.pack(fill=tk.X)
        self.prompt_category_list.bind("<<ListboxSelect>>", lambda _: self.refresh_prompts())

        category_controls = ttk.Frame(left)
        category_controls.pack(fill=tk.X, pady=(6, 8))
        self.prompt_category_name = tk.StringVar()
        ttk.Entry(category_controls, textvariable=self.prompt_category_name).pack(fill=tk.X)
        ttk.Button(category_controls, text="Add category", command=self.add_prompt_category).pack(fill=tk.X, pady=(4, 0))
        ttk.Button(category_controls, text="Delete category", command=self.delete_prompt_category).pack(fill=tk.X, pady=(4, 0))

        ttk.Label(left, text="Prompts").pack(anchor="w", pady=(8, 0))
        self.prompt_list = tk.Listbox(left, width=40, exportselection=False)
        self.prompt_list.pack(fill=tk.BOTH, expand=True)
        self.prompt_list.bind("<<ListboxSelect>>", lambda _: self.on_prompt_selected())

        prompt_controls = ttk.Frame(left)
        prompt_controls.pack(fill=tk.X, pady=(6, 0))
        ttk.Button(prompt_controls, text="New prompt", command=self.new_prompt).pack(fill=tk.X)
        ttk.Button(prompt_controls, text="Delete prompt", command=self.delete_prompt).pack(fill=tk.X, pady=(4, 0))
        ttk.Button(prompt_controls, text="Copy body", command=self.copy_prompt_body).pack(fill=tk.X, pady=(4, 0))

        right = ttk.Frame(self.prompt_tab)
        right.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        ttk.Label(right, text="Title").pack(anchor="w")
        self.prompt_title = tk.StringVar()
        ttk.Entry(right, textvariable=self.prompt_title).pack(fill=tk.X)

        ttk.Label(right, text="Body", padding=(0, 8, 0, 0)).pack(anchor="w")
        self.prompt_body = tk.Text(right, wrap=tk.WORD)
        self.prompt_body.pack(fill=tk.BOTH, expand=True)

    def _build_checkpoint_tab(self) -> None:
        left = ttk.Frame(self.checkpoint_tab)
        left.pack(side=tk.LEFT, fill=tk.Y, padx=(0, 10))

        ttk.Label(left, text="Checkpoint categories").pack(anchor="w")
        self.checkpoint_category_list = tk.Listbox(left, height=10, exportselection=False)
        self.checkpoint_category_list.pack(fill=tk.X)
        self.checkpoint_category_list.bind("<<ListboxSelect>>", lambda _: self.refresh_checkpoints())

        category_controls = ttk.Frame(left)
        category_controls.pack(fill=tk.X, pady=(6, 8))
        self.checkpoint_category_name = tk.StringVar()
        ttk.Entry(category_controls, textvariable=self.checkpoint_category_name).pack(fill=tk.X)
        ttk.Button(category_controls, text="Add category", command=self.add_checkpoint_category).pack(fill=tk.X, pady=(4, 0))
        ttk.Button(category_controls, text="Delete category", command=self.delete_checkpoint_category).pack(fill=tk.X, pady=(4, 0))

        ttk.Label(left, text="Checkpoints").pack(anchor="w", pady=(8, 0))
        self.checkpoint_list = tk.Listbox(left, width=40, exportselection=False)
        self.checkpoint_list.pack(fill=tk.BOTH, expand=True)
        self.checkpoint_list.bind("<<ListboxSelect>>", lambda _: self.on_checkpoint_selected())

        checkpoint_controls = ttk.Frame(left)
        checkpoint_controls.pack(fill=tk.X, pady=(6, 0))
        ttk.Button(checkpoint_controls, text="New checkpoint", command=self.new_checkpoint).pack(fill=tk.X)
        ttk.Button(checkpoint_controls, text="Delete checkpoint", command=self.delete_checkpoint).pack(fill=tk.X, pady=(4, 0))
        ttk.Button(checkpoint_controls, text="Copy body", command=self.copy_checkpoint_body).pack(fill=tk.X, pady=(4, 0))

        right = ttk.Frame(self.checkpoint_tab)
        right.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        ttk.Label(right, text="Title").pack(anchor="w")
        self.checkpoint_title = self._extracted_from__build_checkpoint_tab_32(
            right, "Description"
        )
        self.checkpoint_desc = self._extracted_from__build_checkpoint_tab_32(
            right, "Body"
        )
        self.checkpoint_body = tk.Text(right, wrap=tk.WORD)
        self.checkpoint_body.pack(fill=tk.BOTH, expand=True)

    # TODO Rename this here and in `_build_checkpoint_tab`
    def _extracted_from__build_checkpoint_tab_32(self, right, text):
        result = tk.StringVar()
        ttk.Entry(right, textvariable=result).pack(fill=tk.X)

        ttk.Label(right, text=text, padding=(0, 8, 0, 0)).pack(anchor="w")
        return result

    def _selected_category_id(self, kind: str) -> str | None:
        categories = self.library["categories"] if kind == "prompt" else self.library["checkpointCategories"]
        listbox = self.prompt_category_list if kind == "prompt" else self.checkpoint_category_list
        if not listbox.curselection() or not categories:
            return categories[0]["id"] if categories else None
        idx = listbox.curselection()[0]
        return categories[idx]["id"]

    def refresh_all(self) -> None:
        self.refresh_prompt_categories()
        self.refresh_prompts()
        self.refresh_checkpoint_categories()
        self.refresh_checkpoints()

    def refresh_prompt_categories(self) -> None:
        self.prompt_category_list.delete(0, tk.END)
        for cat in self.library["categories"]:
            self.prompt_category_list.insert(tk.END, cat["name"])
        if self.library["categories"]:
            self.prompt_category_list.selection_set(0)

    def refresh_prompts(self) -> None:
        current_category = self._selected_category_id("prompt")
        self.prompt_list.delete(0, tk.END)
        prompts = [p for p in self.library["prompts"] if p["categoryId"] == current_category]
        for p in prompts:
            self.prompt_list.insert(tk.END, p["title"])
        self.selected_prompt_id = prompts[0]["id"] if prompts else None
        if prompts:
            self.prompt_list.selection_set(0)
        self.on_prompt_selected()

    def refresh_checkpoint_categories(self) -> None:
        self.checkpoint_category_list.delete(0, tk.END)
        for cat in self.library["checkpointCategories"]:
            self.checkpoint_category_list.insert(tk.END, cat["name"])
        if self.library["checkpointCategories"]:
            self.checkpoint_category_list.selection_set(0)

    def refresh_checkpoints(self) -> None:
        current_category = self._selected_category_id("checkpoint")
        self.checkpoint_list.delete(0, tk.END)
        checkpoints = [c for c in self.library["checkpoints"] if c["categoryId"] == current_category]
        for c in checkpoints:
            self.checkpoint_list.insert(tk.END, f"{c['title']} ({c['savedAt']})")
        self.selected_checkpoint_id = checkpoints[0]["id"] if checkpoints else None
        if checkpoints:
            self.checkpoint_list.selection_set(0)
        self.on_checkpoint_selected()

    def on_prompt_selected(self) -> None:
        current_category = self._selected_category_id("prompt")
        prompts = [p for p in self.library["prompts"] if p["categoryId"] == current_category]
        idx = self.prompt_list.curselection()[0] if self.prompt_list.curselection() else 0
        item = prompts[idx] if idx < len(prompts) else None
        self.selected_prompt_id = item["id"] if item else None
        self.prompt_title.set(item["title"] if item else "")
        self.prompt_body.delete("1.0", tk.END)
        if item:
            self.prompt_body.insert("1.0", item["body"])

    def on_checkpoint_selected(self) -> None:
        current_category = self._selected_category_id("checkpoint")
        checkpoints = [c for c in self.library["checkpoints"] if c["categoryId"] == current_category]
        idx = self.checkpoint_list.curselection()[0] if self.checkpoint_list.curselection() else 0
        item = checkpoints[idx] if idx < len(checkpoints) else None
        self.selected_checkpoint_id = item["id"] if item else None
        self.checkpoint_title.set(item["title"] if item else "")
        self.checkpoint_desc.set(item["description"] if item else "")
        self.checkpoint_body.delete("1.0", tk.END)
        if item:
            self.checkpoint_body.insert("1.0", item["body"])

    def add_prompt_category(self) -> None:
        name = self.prompt_category_name.get().strip()
        if not name:
            return
        self.library["categories"].append({"id": uid("cat"), "name": name})
        self.prompt_category_name.set("")
        self.refresh_prompt_categories()
        self.save_current()

    def delete_prompt_category(self) -> None:
        category_id = self._selected_category_id("prompt")
        if not category_id:
            return
        if any(p["categoryId"] == category_id for p in self.library["prompts"]):
            messagebox.showerror("Cannot delete", "Delete or move prompts in this category first.")
            return
        self.library["categories"] = [c for c in self.library["categories"] if c["id"] != category_id]
        self.refresh_prompt_categories()
        self.refresh_prompts()
        self.save_current()

    def add_checkpoint_category(self) -> None:
        name = self.checkpoint_category_name.get().strip()
        if not name:
            return
        self.library["checkpointCategories"].append({"id": uid("cpcat"), "name": name})
        self.checkpoint_category_name.set("")
        self.refresh_checkpoint_categories()
        self.save_current()

    def delete_checkpoint_category(self) -> None:
        category_id = self._selected_category_id("checkpoint")
        if not category_id:
            return
        if any(c["categoryId"] == category_id for c in self.library["checkpoints"]):
            messagebox.showerror("Cannot delete", "Delete or move checkpoints in this category first.")
            return
        self.library["checkpointCategories"] = [c for c in self.library["checkpointCategories"] if c["id"] != category_id]
        self.refresh_checkpoint_categories()
        self.refresh_checkpoints()
        self.save_current()

    def new_prompt(self) -> None:
        category_id = self._selected_category_id("prompt")
        if not category_id:
            messagebox.showerror("Missing category", "Create at least one prompt category first.")
            return
        new_item = {"id": uid("p"), "categoryId": category_id, "title": "New prompt", "body": ""}
        self.library["prompts"].append(new_item)
        self.refresh_prompts()
        self.save_current()

    def delete_prompt(self) -> None:
        if not self.selected_prompt_id:
            return
        self.library["prompts"] = [p for p in self.library["prompts"] if p["id"] != self.selected_prompt_id]
        self.refresh_prompts()
        self.save_current()

    def new_checkpoint(self) -> None:
        category_id = self._selected_category_id("checkpoint")
        if not category_id:
            messagebox.showerror("Missing category", "Create at least one checkpoint category first.")
            return
        new_item = {
            "id": uid("cp"),
            "categoryId": category_id,
            "title": "New checkpoint",
            "description": "",
            "body": "",
            "savedAt": est_timestamp(),
        }
        self.library["checkpoints"].append(new_item)
        self.refresh_checkpoints()
        self.save_current()

    def delete_checkpoint(self) -> None:
        if not self.selected_checkpoint_id:
            return
        self.library["checkpoints"] = [c for c in self.library["checkpoints"] if c["id"] != self.selected_checkpoint_id]
        self.refresh_checkpoints()
        self.save_current()

    def _copy_text(self, text: str) -> None:
        self.root.clipboard_clear()
        self.root.clipboard_append(text)
        self.status_var.set("Copied to clipboard")

    def copy_prompt_body(self) -> None:
        if not self.selected_prompt_id:
            return
        if item := next(
            (
                p
                for p in self.library["prompts"]
                if p["id"] == self.selected_prompt_id
            ),
            None,
        ):
            self._copy_text(item["body"])

    def copy_checkpoint_body(self) -> None:
        if not self.selected_checkpoint_id:
            return
        if item := next(
            (
                c
                for c in self.library["checkpoints"]
                if c["id"] == self.selected_checkpoint_id
            ),
            None,
        ):
            self._copy_text(item["body"])

    def save_current(self) -> None:
        if self.selected_prompt_id:
            if item := next(
                (
                    p
                    for p in self.library["prompts"]
                    if p["id"] == self.selected_prompt_id
                ),
                None,
            ):
                item["title"] = self.prompt_title.get().strip() or item["title"]
                item["body"] = self.prompt_body.get("1.0", tk.END).rstrip("\n")

        if self.selected_checkpoint_id:
            if item := next(
                (
                    c
                    for c in self.library["checkpoints"]
                    if c["id"] == self.selected_checkpoint_id
                ),
                None,
            ):
                item["title"] = self.checkpoint_title.get().strip() or item["title"]
                item["description"] = self.checkpoint_desc.get().strip()
                item["body"] = self.checkpoint_body.get("1.0", tk.END).rstrip("\n")
                item["savedAt"] = est_timestamp()

        ok, err = validate_library_shape(self.library)
        if not ok:
            messagebox.showerror("Validation error", err)
            return

        self.save_library()
        self.status_var.set(f"Saved to {self.paths.library_path}")
        self.refresh_all()

    def import_library(self) -> None:
        path = filedialog.askopenfilename(filetypes=[("JSON", "*.json"), ("All files", "*")])
        if not path:
            return
        try:
            parsed = json.loads(Path(path).read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            messagebox.showerror("Import failed", f"Could not parse file:\n{exc}")
            return
        candidate = parsed["data"] if isinstance(parsed, dict) and "data" in parsed else parsed
        ok, err = validate_library_shape(candidate)
        if not ok:
            messagebox.showerror("Import failed", err)
            return
        self.library = candidate
        self.save_library()
        self.refresh_all()
        self.status_var.set(f"Imported {path}")

    def export_library(self) -> None:
        default_name = f"gpt-prompt-library-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
        path = filedialog.asksaveasfilename(defaultextension=".json", initialfile=default_name)
        if not path:
            return
        payload = {
            "meta": {
                "app": "GPT Prompt Manager Desktop",
                "exportedAt": est_timestamp(),
                "version": "1.0.0",
            },
            "data": self.library,
        }
        Path(path).write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        self.status_var.set(f"Exported to {path}")


def main() -> None:
    root = tk.Tk()
    app = PromptManagerApp(root)
    root.protocol("WM_DELETE_WINDOW", lambda: (app.save_current(), root.destroy()))
    root.mainloop()


if __name__ == "__main__":
    main()

# GPT Prompt Manager

A standalone desktop rewrite of the original Tampermonkey userscript, built with Python + Tkinter for Linux desktops.

## What it does

- Manages prompt categories and prompt entries.
- Manages checkpoint categories and checkpoint entries.
- Saves data locally as JSON in:
  - `~/.local/share/gpt_prompt_manager/library.json` (or `$XDG_DATA_HOME/gpt_prompt_manager/library.json`)
- Imports and exports JSON libraries compatible with the userscript data shape.
- Copies prompt/checkpoint bodies to clipboard.

## Run (Linux)

```bash
python3 gpt_prompt_manager.py
```

## Make it executable

```bash
chmod +x gpt_prompt_manager.py
./gpt_prompt_manager.py
```

## Build a single-file executable (optional)

If you want a self-contained executable:

```bash
python3 -m pip install pyinstaller
pyinstaller --onefile --noconsole gpt_prompt_manager.py
```

Then run:

```bash
./dist/gpt_prompt_manager
```

## Legacy script

The original browser userscript is still present in this repo as:

- `GPT_Prompt_Manager.user.js`

# GPT Prompt Manager

TamperMonkey UserScript for managing ChatGPT prompts and checkpoints

## Contents
* Local prompt library manager for ChatGPT, including categories, prompts, and checkpoint storage.
* Exported prompt libraries.
* Browser export backups.

## Usage
1. Install the Tampermonkey browser extension.
2. Open a `.user.js` file in this repo and install it in Tampermonkey.
3. Follow the in-script UI prompts to manage and use prompts/checkpoints.

## Notes
* Data is stored locally in Tampermonkey; there is no sync or network communication unless a script explicitly adds it.
* Exported JSON files are snapshots of your prompt library and can be re-imported.

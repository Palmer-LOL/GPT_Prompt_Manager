# GPT Prompt Manager

Prompt manager for ChatGPT workflows, with both:
- a legacy Tampermonkey userscript interface, and
- a Manifest V3 browser extension dashboard.

## Contents
* Local prompt library manager with prompt/checkpoint categories and entries.
* Browser extension popup for browse/copy workflows.
* Browser extension standalone dashboard (`dashboard.html`) for editing and saving prompts/checkpoints.
* Exported prompt libraries and browser backup artifacts.

## Usage
### Extension
1. Load the `extension/` folder as an unpacked extension.
2. Open the extension popup and click **Open Dashboard**.
3. Manage prompt/checkpoint categories and entries in the dashboard.
4. Use the popup to browse and copy items.

### Userscript (legacy)
1. Install Tampermonkey.
2. Open `GPT_Prompt_Manager.user.js` and install.
3. Use the in-page tabs to manage prompts/checkpoints.

## Notes
* Extension data is stored locally in `chrome.storage.local`.
* Userscript data is stored locally in Tampermonkey storage.
* There is no automatic sync between userscript storage and extension storage.

async function loadSampleData() {
  const response = await fetch(chrome.runtime.getURL('data/sample-prompts.json'));

  if (!response.ok) {
    throw new Error(`Failed to load sample prompts: ${response.status}`);
  }

  return response.json();
}

async function initPopup() {
  try {
    const data = await loadSampleData();
    console.info('Loaded sample prompt data:', data);
  } catch (error) {
    console.error(error);
  }
}

initPopup();

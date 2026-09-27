// Opens the side panel from the toolbar icon, and keeps the API key out of reach of content scripts.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });

// First install: open settings in a tab to pick a provider and connect a key.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.runtime.openOptionsPage();
});

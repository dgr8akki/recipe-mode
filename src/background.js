// Opens the side panel from the toolbar icon.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Guarded because Chrome before 140 refuses setAccessLevel on storage.local, which would kill the
// worker before the listener below registers. Recipe Mode has no content scripts, so nothing is lost.
try {
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })?.catch?.(() => {});
} catch {
  // Chrome < 140: no setAccessLevel on storage.local.
}

// First install: open settings in a tab to pick a provider and connect a key.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.runtime.openOptionsPage();
});

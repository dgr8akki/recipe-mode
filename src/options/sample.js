// "Try a sample recipe": opens the bundled recipe page so the panel has something to read before a key exists.
document.getElementById('sample').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('demo/lemon-drizzle.html') });
});

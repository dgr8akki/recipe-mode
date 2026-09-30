// Show/hide for the key field. A pasted key you cannot see is hard to check; it goes back to hidden
// whenever the form closes, so a saved key is never left on screen.
const input = document.getElementById('api-key');
const button = document.getElementById('reveal');
const form = document.getElementById('key-form');

function reveal(shown) {
  input.type = shown ? 'text' : 'password';
  button.setAttribute('aria-pressed', String(shown));
  button.textContent = shown ? 'Hide' : 'Show';
}

button.addEventListener('click', () => reveal(input.type === 'password'));
new MutationObserver(() => {
  if (form.hidden) reveal(false);
}).observe(form, { attributes: true, attributeFilter: ['hidden'] });

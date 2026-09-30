import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const src = new URL('../src/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', src), 'utf8'));
const background = readFileSync(new URL(manifest.background.service_worker, src), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

describe('manifest', () => {
  it('is Manifest V3 with the package version', () => {
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.version, pkg.version);
  });

  it('references only files that exist', () => {
    const files = [
      manifest.background.service_worker,
      manifest.side_panel.default_path,
      manifest.options_ui.page,
      ...Object.values(manifest.icons),
      ...Object.values(manifest.action.default_icon),
    ];
    for (const file of files) assert.ok(existsSync(new URL(file, src)), `missing ${file}`);
  });

  it('asks only for the permissions it uses', () => {
    assert.deepEqual([...manifest.permissions].sort(), ['scripting', 'sidePanel', 'storage']);
  });

  it('keeps the store description within 132 characters', () => {
    assert.ok(manifest.description.length <= 132, `${manifest.description.length} chars`);
  });

  // storage.local grew setAccessLevel in Chrome 140. Below that a call at the top of the service
  // worker throws before any listener after it registers, and the call also returns a promise
  // that can reject. Only a try block covers both; `?.(` on its own is not accepted as a guard.
  const callsAccessLevelUnguarded = (source) =>
    /setAccessLevel(\?\.)?\(/.test(source.replace(/try\s*\{[\s\S]*?\}\s*(catch|finally)\b/g, ''));

  it('recognises which setAccessLevel calls count as guarded', () => {
    assert.ok(callsAccessLevelUnguarded("chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });"));
    assert.ok(callsAccessLevelUnguarded("chrome.storage.local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });"));
    assert.ok(
      !callsAccessLevelUnguarded(
        "try {\n  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })?.catch?.(() => {});\n} catch {}",
      ),
    );
    assert.ok(!callsAccessLevelUnguarded('try {\n  chrome.storage.local.setAccessLevel({});\n} finally {\n}'));
  });

  it('never calls storage.setAccessLevel outside a try block on a Chrome that lacks it', () => {
    const minimum = Number.parseInt(manifest.minimum_chrome_version, 10);
    if (minimum >= 140) return;
    assert.ok(
      !callsAccessLevelUnguarded(background),
      `unguarded setAccessLevel while minimum_chrome_version is ${minimum}`,
    );
  });
});

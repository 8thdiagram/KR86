import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('the title menu has no redundant control footer or viewport-height spacer', () => {
  const title = read('./TitleExperience.tsx'), css = read('./retro-theme.css');
  assert.doesNotMatch(title, /kr-title-footer|BATTERY BACKUP READY|ENTER &nbsp; CONFIRM/);
  for (const rule of css.matchAll(/\.kr-title-screen\s*\{([^}]+)\}/g)) {
    assert.doesNotMatch(rule[1], /min-height:|overflow:\s*auto/);
  }
});

test('device options are always in the page rather than hidden inside an accordion', () => {
  const tools = read('../components/StandaloneTools.tsx');
  assert.doesNotMatch(tools, /<details|<summary|button-toggle-tools/);
  assert.match(tools, /<h2[^>]*>SAVE &amp; INSTALL<\/h2>/);
  for (const id of ['button-check-update', 'button-apply-update', 'button-export-backup',
    'button-choose-backup', 'checkbox-confirm-replace', 'button-confirm-import', 'button-cancel-import']) {
    assert(tools.includes(`data-testid="${id}"`), `${id} remains available`);
  }
  assert.match(tools, /disabled=\{!confirmed \|\| !!busy\}/);
});

test('only the title menu shares a scroll container with the tools', () => {
  const css = read('./retro-theme.css'), tools = read('../components/StandaloneTools.css');
  const menu = css.match(/\.gm-screen \.gm-slot \.ga-scope:has\(\.kr-title-screen\) > \.kr-app-root \{([^}]+)\}/);
  assert(menu);
  assert.match(menu[1], /display: block/);
  assert.match(menu[1], /overflow-y: auto/);
  assert.doesNotMatch(tools, /overflow[^;{}]*:\s*(auto|scroll)|max-height:|summary::after/);
});

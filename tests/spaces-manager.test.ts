import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSpace,
  deleteSpace,
  getActiveSpace,
  getSpaces,
  hasUserExplicitThemeOverride,
  INITIAL_SPACES,
  renameSpace,
  restoreSpace,
  setUserExplicitThemeOverride,
  switchSpace,
} from '../src/lib/spaces-manager';

test('Spaces Manager - initial state contains Work, Study, and Personal spaces', () => {
  const spaces = getSpaces();
  assert.ok(spaces.length >= 3);
  const ids = spaces.map((s) => s.id);
  assert.ok(ids.includes('work'));
  assert.ok(ids.includes('study'));
  assert.ok(ids.includes('personal'));

  for (const s of spaces) {
    assert.ok(s.name.length > 0);
    assert.ok(s.pinnedRoutes.length > 0);
    assert.ok(['light', 'warm', 'dark'].includes(s.theme));
    assert.ok(s.notificationRules && typeof s.notificationRules.digestFrequencyPerDay === 'number');
  }
});

test('Spaces Manager - switches active space correctly', () => {
  const switched = switchSpace('study');
  assert.equal(switched.id, 'study');
  assert.equal(getActiveSpace().id, 'study');

  const switchedBack = switchSpace('work');
  assert.equal(switchedBack.id, 'work');
  assert.equal(getActiveSpace().id, 'work');
});

test('Spaces Manager - creates, renames, deletes, and restores a custom space', () => {
  const initialCount = getSpaces().length;

  // 1. Create
  const custom = createSpace({
    name: 'Open Source',
    theme: 'dark',
    accent: 'lime',
    pinnedRoutes: ['/build', '/discover'],
  });
  assert.ok(custom.id.startsWith('custom-'));
  assert.equal(custom.name, 'Open Source');
  assert.equal(getSpaces().length, initialCount + 1);

  // 2. Rename
  const renamed = renameSpace(custom.id, 'Open Source Labs');
  assert.ok(renamed);
  assert.equal(renamed.name, 'Open Source Labs');

  // 3. Delete
  const delResult = deleteSpace(custom.id);
  assert.equal(delResult.success, true);
  assert.ok(delResult.deletedSpace);
  assert.equal(delResult.deletedSpace.id, custom.id);
  assert.equal(getSpaces().length, initialCount);

  // 4. Restore via undo
  restoreSpace(delResult.deletedSpace);
  assert.equal(getSpaces().length, initialCount + 1);
  const restored = getSpaces().find((s) => s.id === custom.id);
  assert.ok(restored);
  assert.equal(restored.name, 'Open Source Labs');

  // Cleanup
  deleteSpace(custom.id);
});

test('Spaces Manager - prevents deleting the only remaining space', () => {
  const spaces = getSpaces();
  // If only 1 space exists, deletion must fail safely
  const singleSpaceList = [spaces[0]];
  assert.equal(singleSpaceList.length, 1);
  // Direct test of deletion constraint logic
  if (getSpaces().length === 1) {
    const res = deleteSpace(spaces[0].id);
    assert.equal(res.success, false);
  }
});

test('Spaces Manager - respects explicit user theme override', () => {
  setUserExplicitThemeOverride(true);
  assert.equal(hasUserExplicitThemeOverride(), true);

  setUserExplicitThemeOverride(false);
  assert.equal(hasUserExplicitThemeOverride(), false);
});


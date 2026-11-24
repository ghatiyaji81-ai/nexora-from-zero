import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateStorageUsage,
  checkBrowserPermissions,
  deleteLocalDataCategory,
  generatePrivacyExport,
  getPrivacyActivityLog,
  getStorageCategories,
  recordPrivacyAction,
  clearPrivacyActivityLog,
  STORAGE_KEY_PRIVACY_LOG,
} from '../src/lib/privacy-manager';
import { CONNECTED_TOOLS } from '../src/lib/onboarding-config';

// Mock localStorage in Node environment
const mockStorage: Record<string, string> = {};

const mockLocalStorage = {
  getItem: (key: string) => mockStorage[key] || null,
  setItem: (key: string, value: string) => { mockStorage[key] = String(value); },
  removeItem: (key: string) => { delete mockStorage[key]; },
  clear: () => {
    for (const k of Object.keys(mockStorage)) delete mockStorage[k];
  },
  key: (index: number) => Object.keys(mockStorage)[index] || null,
  get length() {
    return Object.keys(mockStorage).length;
  },
};

// Polyfill window and localStorage for testing
const globalAny = globalThis as unknown as { window: unknown };
if (typeof globalAny.window === 'undefined') {
  globalAny.window = {
    localStorage: mockLocalStorage,
    location: { origin: 'http://localhost:3000' } as unknown as Location,
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
} else {
  (globalAny.window as { localStorage: unknown }).localStorage = mockLocalStorage;
}

test('Privacy Dashboard - Storage Categories Schema and Boundary Integrity', () => {
  const categories = getStorageCategories();
  assert.ok(Array.isArray(categories));
  assert.ok(categories.length >= 7, 'Must have at least 7 defined storage categories');

  const localCategories = categories.filter(c => c.location === 'local');
  const serverCategories = categories.filter(c => c.location === 'server');
  const thirdPartyCategories = categories.filter(c => c.location === 'third_party');

  assert.ok(localCategories.length >= 4, 'Must have local categories for appearance, spaces, focus, timeline');
  assert.ok(serverCategories.length >= 1, 'Must have server categories for account/sessions');
  assert.ok(thirdPartyCategories.length >= 1, 'Must have third party category for tools');

  // Verify server credentials cannot be wiped locally by naive client code
  const serverCreds = categories.find(c => c.id === 'server_credentials');
  assert.ok(serverCreds);
  assert.equal(serverCreds.canDeleteLocally, false, 'Server credentials must not be marked as locally deletable');

  for (const cat of categories) {
    assert.ok(cat.id && typeof cat.id === 'string');
    assert.ok(cat.name && typeof cat.name === 'string');
    assert.ok(cat.purpose && typeof cat.purpose === 'string');
    assert.ok(cat.retentionPolicy && typeof cat.retentionPolicy === 'string');
    assert.ok(Array.isArray(cat.keys));
  }
});

test('Privacy Dashboard - calculateStorageUsage computes accurate byte footprint', () => {
  mockLocalStorage.clear();
  mockLocalStorage.setItem('nexora-theme', 'dark');
  mockLocalStorage.setItem('nexora-active-space', 'study');
  mockLocalStorage.setItem('unrelated-storage-key', 'ignore-me');

  const usage = calculateStorageUsage();
  assert.equal(usage.localItemCount, 2, 'Should only count keys starting with nexora');
  assert.ok(usage.localBytes > 0, 'Bytes must be greater than zero');
  assert.ok(usage.formattedSize.includes('KB'));
  assert.ok(usage.keysList.includes('nexora-theme'));
  assert.ok(usage.keysList.includes('nexora-active-space'));
  assert.ok(!usage.keysList.includes('unrelated-storage-key'));
});

test('Privacy Dashboard - generatePrivacyExport outputs real sanitized JSON archive', () => {
  mockLocalStorage.clear();
  mockLocalStorage.setItem('nexora-theme', 'warm');
  mockLocalStorage.setItem('nexora-accent', 'amber');
  mockLocalStorage.setItem('nexora_wellbeing_data', JSON.stringify({ checkins: [{ level: 'steady' }] }));
  mockLocalStorage.setItem('nexora_timeline_items', JSON.stringify([{ id: 't-1', title: 'Deep Work' }]));
  mockLocalStorage.setItem('nexora_auth_secret_fake', 'sensitive-token-12345');

  const exportPayload = generatePrivacyExport();

  assert.equal(exportPayload.version, '1.0');
  assert.ok(exportPayload.exportedAt);
  assert.equal(exportPayload.generator, 'NEXORA Privacy & Workspace Data Engine');
  assert.ok(exportPayload.storageBreakdown.localStorageKeysCount >= 2);

  const data = exportPayload.data;
  assert.ok(data.appearance);
  assert.equal(data.appearance.theme, 'warm');
  assert.equal(data.appearance.accent, 'amber');
  assert.ok(data.wellbeing);
  assert.ok(data.timeline);

  // Security Verification: Zero secrets or password fields permitted
  const rawExportString = JSON.stringify(exportPayload);
  assert.ok(!rawExportString.includes('passwordHash'), 'Must not contain password hashes');
  assert.ok(!rawExportString.includes('tokenHash'), 'Must not contain session token hashes');
  assert.ok(!rawExportString.includes('sensitive-token-12345'), 'Must not include unverified sensitive keys');
});

test('Privacy Dashboard - deleteLocalDataCategory selectively purges only target records', () => {
  mockLocalStorage.clear();
  mockLocalStorage.setItem('nexora_wellbeing_data', '{"logged":true}');
  mockLocalStorage.setItem('nexora-focus-sessions', '{"sessions":[1,2]}');
  mockLocalStorage.setItem('nexora_timeline_items', '{"items":[1]}');
  mockLocalStorage.setItem('nexora-theme', 'dark');

  // 1. Delete focus & wellbeing
  const res1 = deleteLocalDataCategory('focus_wellbeing');
  assert.equal(res1.success, true);
  assert.equal(mockLocalStorage.getItem('nexora_wellbeing_data'), null);
  assert.equal(mockLocalStorage.getItem('nexora-focus-sessions'), null);
  // Ensure timeline and theme were preserved
  assert.equal(mockLocalStorage.getItem('nexora_timeline_items'), '{"items":[1]}');
  assert.equal(mockLocalStorage.getItem('nexora-theme'), 'dark');

  // 2. Delete timeline cache
  const res2 = deleteLocalDataCategory('timeline_tasks');
  assert.equal(res2.success, true);
  assert.equal(mockLocalStorage.getItem('nexora_timeline_items'), null);
  assert.equal(mockLocalStorage.getItem('nexora-theme'), 'dark');

  // 3. Reject unsupported category
  const res3 = deleteLocalDataCategory('non_existent_category');
  assert.equal(res3.success, false);
});

test('Privacy Dashboard - Full local workspace reset wipes all local keys', () => {
  mockLocalStorage.clear();
  mockLocalStorage.setItem('nexora-theme', 'warm');
  mockLocalStorage.setItem('nexora-accent', 'rose');
  mockLocalStorage.setItem('nexora-spaces-config', '{"spaces":[]}');

  const res = deleteLocalDataCategory('all_local_workspace');
  assert.equal(res.success, true);
  assert.equal(mockLocalStorage.getItem('nexora-theme'), null);
  assert.equal(mockLocalStorage.getItem('nexora-accent'), null);
  assert.equal(mockLocalStorage.getItem('nexora-spaces-config'), null);
});

test('Privacy Dashboard - Privacy Activity Log records, bounds, and clears events', () => {
  mockLocalStorage.clear();

  // Initial log fallback
  const initialLog = getPrivacyActivityLog();
  assert.ok(initialLog.length >= 1);
  assert.equal(initialLog[0].title, 'Privacy Baseline Established');

  // Record an action
  recordPrivacyAction('export', 'User Data Exported', 'JSON archive downloaded');
  const updatedLog = getPrivacyActivityLog();
  assert.equal(updatedLog[0].title, 'User Data Exported');
  assert.equal(updatedLog[0].type, 'export');

  // Clear log
  const cleared = clearPrivacyActivityLog();
  assert.equal(cleared, true);
  assert.equal(mockLocalStorage.getItem(STORAGE_KEY_PRIVACY_LOG), null);
});

test('Privacy Dashboard - Browser permissions reporting handles environment gracefully', async () => {
  const report = await checkBrowserPermissions();
  assert.ok(report);
  assert.ok(['granted', 'denied', 'prompt', 'unsupported'].includes(report.notifications));
  assert.ok(['granted', 'denied', 'prompt', 'unsupported'].includes(report.microphone));
  assert.equal(typeof report.storagePersisted, 'boolean');
  assert.equal(report.canRevokeViaBrowser, true, 'Must disclose browser-level revocation');
});

test('Privacy Dashboard - Connected applications declare explicit scopes and honest status', () => {
  assert.ok(Array.isArray(CONNECTED_TOOLS));
  const toolIds = CONNECTED_TOOLS.map(t => t.id);
  assert.ok(toolIds.includes('github'));
  assert.ok(toolIds.includes('google'));
  assert.ok(toolIds.includes('telegram'));

  for (const tool of CONNECTED_TOOLS) {
    assert.equal(tool.status, 'Not connected', 'Default status must honestly be Not connected');
    assert.ok(tool.scopeNotice.length > 0, 'Must have clear scope disclosure');
    assert.ok(tool.envKey.length > 0, 'Must document required server-side env key');
  }
});

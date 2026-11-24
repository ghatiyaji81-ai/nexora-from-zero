import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONNECTED_TOOLS,
  DEFAULT_ONBOARDING_STATE,
  getOnboardingState,
  ROLE_PRESETS,
  UserRole,
  completeOnboarding,
  resetOnboarding,
  saveOnboardingState,
} from '../src/lib/onboarding-config';

test('Onboarding Config - all three roles (Developer, Student, Creator) exist with required presets', () => {
  const roles: UserRole[] = ['developer', 'student', 'creator'];
  for (const role of roles) {
    const preset = ROLE_PRESETS[role];
    assert.ok(preset, `Role preset ${role} must exist`);
    assert.ok(preset.pinnedRoutes.length > 0, `${role} must configure pinned routes`);
    assert.ok(['light', 'warm', 'dark'].includes(preset.theme), `${role} must configure a valid theme`);
    assert.ok(preset.shortcutsFocus.length > 0, `${role} must have shortcut hints`);
    assert.ok(preset.highlightedModules.length > 0, `${role} must declare highlighted modules`);
  }
});

test('Onboarding Config - connected tools default to honest "Not connected" and require official OAuth/keys', () => {
  assert.equal(CONNECTED_TOOLS.length, 3, 'Must support GitHub, Google, and Telegram');

  for (const tool of CONNECTED_TOOLS) {
    // Crucial requirement: must NEVER claim "Live" when unconfigured
    assert.equal(tool.status, 'Not connected', `${tool.name} must show "Not connected" by default`);
    assert.notEqual(tool.status, 'Live', `${tool.name} must never show "Live"`);
    assert.ok(tool.authType === 'OAuth 2.0' || tool.authType === 'Bot Token');
    assert.ok(tool.scopeNotice.includes('.env.local'), `${tool.name} must reference official credentials`);
  }
});

test('Onboarding Config - saves state, completes onboarding and supports demo mode without signup', () => {
  resetOnboarding();
  const initial = getOnboardingState();
  assert.equal(initial.completed, false);
  assert.equal(initial.isDemoMode, true);

  // Complete as Student with Demo mode
  const completed = completeOnboarding({
    role: 'student',
    isDemoMode: true,
  });

  assert.equal(completed.completed, true);
  assert.equal(completed.selectedRole, 'student');
  assert.equal(completed.isDemoMode, true);
  assert.ok(typeof completed.completedAt === 'number');

  // Verify reload
  const reloaded = getOnboardingState();
  assert.equal(reloaded.completed, true);
  assert.equal(reloaded.selectedRole, 'student');

  // Reset
  const reset = resetOnboarding();
  assert.equal(reset.completed, false);
});


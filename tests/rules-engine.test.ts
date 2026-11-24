import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addRule,
  deleteRule,
  evaluateRulesForTrigger,
  getActivityLogs,
  getRules,
  runMorningRoutineWorkflow,
  runWindDownWorkflow,
  saveRules,
  testRuleDryRun,
  toggleRule,
  DEFAULT_RULES,
  clearActivityLogs,
} from '../src/lib/rules-engine';
import { getActiveSpace } from '../src/lib/spaces-manager';
import { getFocusState, stopFocusSession } from '../src/lib/focus-manager';

test('Rules Engine - default rules exist and have valid triggers and actions', () => {
  saveRules(DEFAULT_RULES);
  const rules = getRules();
  assert.ok(rules.length >= 5);

  const vipRule = rules.find((r) => r.id === 'rule-vip-routing');
  assert.ok(vipRule);
  assert.equal(vipRule?.trigger.type, 'notification_arrived');
  assert.equal(vipRule?.action.type, 'unmute_notifications');

  const digestRule = rules.find((r) => r.id === 'rule-newsletter-digest');
  assert.ok(digestRule);
  assert.equal(digestRule?.trigger.type, 'notification_arrived');
  assert.equal(digestRule?.action.type, 'route_notification_to_digest');
});

test('Rules Engine - toggle rule and delete with persistence', () => {
  const rules = getRules();
  const targetId = rules[0].id;
  const initialEnabled = rules[0].enabled;

  const toggled = toggleRule(targetId);
  assert.equal(toggled?.enabled, !initialEnabled);

  // Restore toggle
  toggleRule(targetId);

  // Add custom rule and delete it
  const created = addRule({
    name: 'Custom Study Alignment',
    description: 'Switch to study space on break',
    enabled: true,
    trigger: { type: 'focus_ended' },
    action: { type: 'switch_space', params: { spaceId: 'study' } },
  });
  assert.ok(created.id.startsWith('rule-'));

  const afterAdd = getRules();
  assert.ok(afterAdd.some((r) => r.id === created.id));

  deleteRule(created.id);
  const afterDelete = getRules();
  assert.ok(!afterDelete.some((r) => r.id === created.id));
});

test('Rules Engine - dry run simulation returns expected outcome without modifying state', () => {
  clearActivityLogs();
  const rules = getRules();
  const ruleToTest = rules.find((r) => r.id === 'rule-focus-align-work');
  assert.ok(ruleToTest);

  const dryRunResult = testRuleDryRun(ruleToTest.id);
  assert.equal(dryRunResult.success, true);
  assert.ok(dryRunResult.message.includes('Dry Run'));
  assert.ok(dryRunResult.message.includes('Switched space to "work"'));

  const logs = getActivityLogs();
  assert.ok(logs.some((l) => l.ruleId === ruleToTest.id && l.isDryRun === true));
});

test('Rules Engine - loop protection blocks execution deeper than max chain depth', () => {
  clearActivityLogs();
  // Trigger evaluation at depth = 4 (exceeds MAX_CHAIN_DEPTH = 3)
  const executed = evaluateRulesForTrigger('focus_started', undefined, 4);
  assert.equal(executed, 0);

  const logs = getActivityLogs();
  assert.ok(logs.some((l) => l.summary.includes('Loop protection triggered')));
});

test('Rules Engine - one-click calm workflows execute strictly in-app', () => {
  stopFocusSession();

  // 1. Morning Routine
  const morning = runMorningRoutineWorkflow();
  assert.equal(morning.success, true);
  const activeSpace = getActiveSpace();
  assert.equal(activeSpace.id, 'work');
  const focusAfterMorning = getFocusState();
  assert.equal(focusAfterMorning.isActive, true);

  // 2. Wind Down
  const windDown = runWindDownWorkflow();
  assert.equal(windDown.success, true);
  const spaceAfterWindDown = getActiveSpace();
  assert.equal(spaceAfterWindDown.id, 'personal');
  const focusAfterWindDown = getFocusState();
  assert.equal(focusAfterWindDown.isActive, false);

  stopFocusSession();
});

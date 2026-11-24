import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultTimelineProvider,
  INITIAL_TIMELINE_ITEMS,
  TimelineCategory,
  TimelineItem,
} from '../src/lib/timeline-data';

describe('Overview Today Strip & Unified Timeline Data Layer', () => {
  it('loads all initial items spanning the required 4 categories', async () => {
    const items = await defaultTimelineProvider.getItems('all');
    assert.ok(items.length >= 7, 'Should load all initial items');

    const categories = new Set(items.map(i => i.category));
    assert.ok(categories.has('unread'), 'Must include unread messages');
    assert.ok(categories.has('task'), 'Must include tasks');
    assert.ok(categories.has('github'), 'Must include GitHub activity');
    assert.ok(categories.has('calendar'), 'Must include calendar events');
  });

  it('guarantees every item is honestly declared with isSample: true', async () => {
    const items = await defaultTimelineProvider.getItems('all');
    for (const item of items) {
      assert.strictEqual(
        item.isSample,
        true,
        `Item ${item.id} must be explicitly flagged with isSample: true`
      );
      assert.ok(
        item.sampleNotice && item.sampleNotice.toLowerCase().includes('sample'),
        `Item ${item.id} must have an honest sampleNotice disclaimer`
      );
    }
  });

  it('filters items correctly by category', async () => {
    const categories: TimelineCategory[] = ['unread', 'task', 'github', 'calendar'];
    for (const cat of categories) {
      const filtered = await defaultTimelineProvider.getItems(cat);
      assert.ok(filtered.length > 0, `Category ${cat} should have items`);
      for (const item of filtered) {
        assert.strictEqual(item.category, cat, `Filtered item category should match ${cat}`);
      }
    }
  });

  it('toggles task completion status optimistically and reverts cleanly', async () => {
    const tasks = await defaultTimelineProvider.getItems('task');
    const target = tasks[0];
    assert.ok(target, 'Should have at least one task');

    const toggled = await defaultTimelineProvider.toggleTask(target.id);
    assert.ok(toggled, 'Task should be toggled');
    assert.strictEqual(toggled.isCompleted, !target.isCompleted, 'Completion state should invert');

    // Toggle back
    const restored = await defaultTimelineProvider.toggleTask(target.id);
    assert.ok(restored, 'Task should be reverted');
    assert.strictEqual(restored.isCompleted, target.isCompleted, 'Completion state should revert');
  });

  it('marks unread items as read', async () => {
    const unreads = await defaultTimelineProvider.getItems('unread');
    const target = unreads[0];
    assert.ok(target, 'Should have at least one unread message');

    const read = await defaultTimelineProvider.markAsRead(target.id);
    assert.ok(read, 'Unread item should be updated');
    assert.strictEqual(read.isRead, true, 'isRead must be true');
  });

  it('fails safely for invalid task/read operations on non-existent items', async () => {
    const nullTask = await defaultTimelineProvider.toggleTask('non-existent-id');
    assert.strictEqual(nullTask, null, 'Non-existent task toggle should return null');

    const nullRead = await defaultTimelineProvider.markAsRead('non-existent-id');
    assert.strictEqual(nullRead, null, 'Non-existent unread mark should return null');
  });

  it('validates timestamps and displays', () => {
    for (const item of INITIAL_TIMELINE_ITEMS) {
      const parsed = Date.parse(item.timestamp);
      assert.ok(!isNaN(parsed), `Item ${item.id} timestamp must be valid ISO date`);
      assert.ok(item.timeDisplay.length > 0, `Item ${item.id} must have formatted timeDisplay`);
      assert.ok(item.actionLabel.length > 0, `Item ${item.id} must have action label`);
      assert.ok(item.actionHref.length > 0, `Item ${item.id} must have action href`);
    }
  });

  it('supports one-click removal and restoration of demo data', async () => {
    const { isDemoDataActive, clearDemoData, restoreDemoData } = await import('../src/lib/timeline-data');
    assert.strictEqual(typeof isDemoDataActive, 'function');
    assert.strictEqual(typeof clearDemoData, 'function');
    assert.strictEqual(typeof restoreDemoData, 'function');
  });
});


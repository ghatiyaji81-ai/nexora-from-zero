import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BentoCardId,
  BENTO_CARDS_META,
  DEFAULT_BENTO_LAYOUT,
  loadBentoLayout,
  reorderCards,
  resetBentoLayout,
  sanitizeBentoLayout,
  saveBentoLayout,
  toggleCardColSpan,
  toggleCardVisibility,
} from '../src/lib/bento-layout';

test('Bento Layout - default layout contains all defined cards', () => {
  const cardIds = Object.keys(BENTO_CARDS_META) as BentoCardId[];
  const defaultIds = DEFAULT_BENTO_LAYOUT.map((item) => item.id);

  assert.equal(defaultIds.length, cardIds.length);
  for (const id of cardIds) {
    assert.ok(defaultIds.includes(id), `Default layout should include ${id}`);
  }
});

test('Bento Layout - status badges are honest and conform to schema', () => {
  for (const [id, meta] of Object.entries(BENTO_CARDS_META)) {
    assert.ok(meta.status.label.length > 0, `${id} should have a non-empty status label`);
    assert.ok(
      ['Live', 'Preview', 'Building'].includes(meta.status.tier),
      `${id} tier should be Live, Preview, or Building`
    );
    // Ensure items with sample or mock data are honestly labelled Preview
    if (id === 'today-strip') {
      assert.equal(meta.status.tier, 'Preview', 'Today strip with sample data must have tier Preview');
      assert.equal(meta.status.label, 'Preview · Sample data', 'Today strip must label Preview · Sample data');
    }
  }
});

test('Bento Layout - sanitization handles corrupted or partial layout arrays', () => {
  // Empty array -> returns all defaults
  const fromEmpty = sanitizeBentoLayout([]);
  assert.equal(fromEmpty.length, DEFAULT_BENTO_LAYOUT.length);

  // Partial array -> retains order of existing, appends missing
  const partial = [{ id: 'quick-actions', colSpan: 2, visible: true }];
  const sanitizedPartial = sanitizeBentoLayout(partial);
  assert.equal(sanitizedPartial[0].id, 'quick-actions');
  assert.equal(sanitizedPartial[0].colSpan, 2);
  assert.equal(sanitizedPartial.length, DEFAULT_BENTO_LAYOUT.length);

  // Invalid entries -> ignored
  const withGarbage = [
    { id: 'non-existent-card', colSpan: 2, visible: true },
    null,
    'random string',
    { id: 'focus-timer', colSpan: 1, visible: false },
  ];
  const sanitizedGarbage = sanitizeBentoLayout(withGarbage);
  assert.equal(sanitizedGarbage[0].id, 'focus-timer');
  assert.equal(sanitizedGarbage[0].visible, false);
  assert.equal(sanitizedGarbage.length, DEFAULT_BENTO_LAYOUT.length);
});

test('Bento Layout - in-memory persistence and reload', () => {
  resetBentoLayout();
  const initial = loadBentoLayout();
  assert.equal(initial.length, DEFAULT_BENTO_LAYOUT.length);

  // Reorder
  const reordered = reorderCards('principle', 'today-strip');
  assert.equal(reordered[0].id, 'principle');

  const reloaded = loadBentoLayout();
  assert.equal(reloaded[0].id, 'principle');

  // Reset
  const resetResult = resetBentoLayout();
  assert.equal(resetResult[0].id, DEFAULT_BENTO_LAYOUT[0].id);
});

test('Bento Layout - toggleCardColSpan flips between 1 and 2', () => {
  resetBentoLayout();
  const initial = loadBentoLayout();
  const targetId = 'focus-timer';
  const initialSpan = initial.find((c) => c.id === targetId)?.colSpan;

  const toggled1 = toggleCardColSpan(targetId);
  const span1 = toggled1.find((c) => c.id === targetId)?.colSpan;
  assert.equal(span1, initialSpan === 1 ? 2 : 1);

  const toggled2 = toggleCardColSpan(targetId);
  const span2 = toggled2.find((c) => c.id === targetId)?.colSpan;
  assert.equal(span2, initialSpan);
});

test('Bento Layout - toggleCardVisibility prevents hiding all cards', () => {
  resetBentoLayout();
  const layout = loadBentoLayout();

  // Hide all cards except the last one
  for (let i = 0; i < layout.length - 1; i++) {
    toggleCardVisibility(layout[i].id);
  }

  const current = loadBentoLayout();
  const visibleCount = current.filter((c) => c.visible).length;
  assert.equal(visibleCount, 1);

  // Attempting to hide the last visible card must be prevented
  const lastVisibleId = current.find((c) => c.visible)?.id as BentoCardId;
  const attempted = toggleCardVisibility(lastVisibleId);
  const stillVisible = attempted.filter((c) => c.visible).length;
  assert.equal(stillVisible, 1, 'At least one card must remain visible');
});


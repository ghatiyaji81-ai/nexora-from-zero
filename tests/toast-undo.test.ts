import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  showToast,
  showUndoToast,
  showMicroFeedback,
  dismissToast,
  triggerUndo,
  getActiveToasts,
} from '../src/lib/toast-manager';
import {
  deleteWithUndo,
  moveWithUndo,
  saveWithFeedback,
  sendWithFeedback,
} from '../src/lib/micro-feedback';

describe('Toast & Undo System', () => {
  it('creates an undo toast with 10-second duration and undo action', () => {
    let undone = false;
    const toastId = showUndoToast('Item deleted', () => {
      undone = true;
    });

    const active = getActiveToasts();
    const found = active.find(t => t.id === toastId);

    assert.ok(found);
    assert.equal(found.type, 'undo');
    assert.equal(found.durationMs, 10000); // 10 seconds duration
    assert.equal(found.message, 'Item deleted');

    // Trigger undo
    triggerUndo(toastId);
    assert.equal(undone, true);

    // After undo, original toast is dismissed
    const remaining = getActiveToasts();
    assert.equal(remaining.some(t => t.id === toastId), false);
  });

  it('creates micro-feedback toast for save and send', async () => {
    let saved = false;
    await saveWithFeedback('Note', () => {
      saved = true;
    });
    assert.equal(saved, true);

    let sent = false;
    await sendWithFeedback('Message', () => {
      sent = true;
    });
    assert.equal(sent, true);

    const active = getActiveToasts();
    const saveToast = active.find(t => t.message.includes('saved'));
    assert.ok(saveToast);
    assert.equal(saveToast.type, 'success');
  });

  it('wraps delete with a 10-second undo callback', () => {
    let deleted = false;
    let restored = false;

    deleteWithUndo(
      'Document',
      () => {
        deleted = true;
      },
      () => {
        restored = true;
      }
    );

    assert.equal(deleted, true);
    assert.equal(restored, false);

    const active = getActiveToasts();
    const deleteToast = active.find(t => t.message.includes('Deleted Document'));
    assert.ok(deleteToast);
    assert.equal(deleteToast.durationMs, 10000);

    triggerUndo(deleteToast.id);
    assert.equal(restored, true);
  });

  it('wraps move with a 10-second undo callback', () => {
    let moved = false;
    let reverted = false;

    moveWithUndo(
      'File',
      'Archive',
      () => {
        moved = true;
      },
      () => {
        reverted = true;
      }
    );

    assert.equal(moved, true);
    assert.equal(reverted, false);

    const active = getActiveToasts();
    const moveToast = active.find(t => t.message.includes('Moved File'));
    assert.ok(moveToast);

    triggerUndo(moveToast.id);
    assert.equal(reverted, true);
  });

  it('dismisses toasts properly', () => {
    const id = showMicroFeedback('Temporary message');
    assert.ok(getActiveToasts().some(t => t.id === id));

    dismissToast(id);
    assert.equal(getActiveToasts().some(t => t.id === id), false);
  });
});


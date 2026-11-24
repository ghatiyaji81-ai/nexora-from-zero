'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  createSpace,
  deleteSpace,
  getActiveSpace,
  getSpaces,
  renameSpace,
  restoreSpace,
  SpaceProfile,
  switchSpace,
} from '@/lib/spaces-manager';
import { showToast } from '@/lib/toast-manager';
import { t } from '@/lib/i18n-strings';

export function SpaceSwitcher() {
  const [spaces, setSpaces] = useState<SpaceProfile[]>(() => getSpaces());
  const [activeSpace, setActiveSpace] = useState<SpaceProfile>(() => getActiveSpace());
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');
  const [editingSpaceId, setEditingSpaceId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);

  const refreshSpaces = () => {
    setSpaces(getSpaces());
    setActiveSpace(getActiveSpace());
  };

  useEffect(() => {
    refreshSpaces();

    const handleSpaceChange = () => refreshSpaces();
    const handleOpenModal = () => setIsOpen(true);

    window.addEventListener('nexora-spaces-change', handleSpaceChange);
    window.addEventListener('nexora-space-change', handleSpaceChange);
    window.addEventListener('nexora-open-space-switcher', handleOpenModal);

    return () => {
      window.removeEventListener('nexora-spaces-change', handleSpaceChange);
      window.removeEventListener('nexora-space-change', handleSpaceChange);
      window.removeEventListener('nexora-open-space-switcher', handleOpenModal);
    };
  }, []);

  // Close dropdown on click outside or ESC
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsCreating(false);
        setEditingSpaceId(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setIsCreating(false);
        setEditingSpaceId(null);
      }
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelectSpace = (id: string) => {
    const switched = switchSpace(id);
    setActiveSpace(switched);
    setIsOpen(false);
    showToast({
      message: `${t('spaces.switchedSuccess')} ${switched.name}`,
      detail: `Theme: ${switched.theme} · Pins updated`,
      type: 'info',
    });
  };

  const handleCreateSpace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSpaceName.trim()) return;

    const created = createSpace({
      name: newSpaceName.trim(),
      theme: activeSpace.theme,
      accent: activeSpace.accent,
      pinnedRoutes: activeSpace.pinnedRoutes,
    });

    setNewSpaceName('');
    setIsCreating(false);
    refreshSpaces();
    handleSelectSpace(created.id);

    showToast({
      message: `${t('spaces.createdSuccess')}: ${created.name}`,
      type: 'success',
    });
  };

  const handleSaveRename = (id: string) => {
    if (!editName.trim()) {
      setEditingSpaceId(null);
      return;
    }
    const updated = renameSpace(id, editName.trim());
    setEditingSpaceId(null);
    setEditName('');
    refreshSpaces();

    if (updated) {
      showToast({
        message: `${t('spaces.renamedSuccess')}: ${updated.name}`,
        type: 'success',
      });
    }
  };

  const handleDeleteSpace = (id: string, name: string) => {
    const result = deleteSpace(id);
    if (!result.success || !result.deletedSpace) {
      showToast({
        message: 'Cannot delete the only remaining space',
        type: 'info',
      });
      return;
    }

    const deleted = result.deletedSpace;
    refreshSpaces();

    showToast({
      message: `${t('spaces.deleteSuccess')}: ${name}`,
      type: 'undo',
      durationMs: 10000,
      undoLabel: t('common.undo'),
      undoAction: () => {
        restoreSpace(deleted);
        refreshSpaces();
        switchSpace(deleted.id);
        showToast({
          message: `Restored space: ${name}`,
          type: 'success',
        });
      },
    });
  };

  return (
    <div className="space-switcher-container" ref={dropdownRef}>
      {/* Switcher Button Trigger */}
      <button
        type="button"
        className="space-switcher-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={`${t('spaces.currentSpace')}: ${activeSpace.name}. Click to switch workspace profile`}
        title={`Switch Space Profile (${activeSpace.name})`}
      >
        <span className="space-icon" aria-hidden="true">{activeSpace.icon}</span>
        <span className="space-name">{activeSpace.name}</span>
        <svg
          className={`space-chevron ${isOpen ? 'is-open' : ''}`}
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Switcher Dropdown */}
      {isOpen && (
        <div className="space-switcher-dropdown" role="menu" aria-label={t('spaces.title')}>
          <div className="space-dropdown-header">
            <span>{t('spaces.title')}</span>
            <small>G then P</small>
          </div>

          <div className="space-items-list" role="group">
            {spaces.map((space) => {
              const isActive = space.id === activeSpace.id;
              const isEditing = editingSpaceId === space.id;

              return (
                <div
                  key={space.id}
                  className={`space-item-row ${isActive ? 'is-active' : ''}`}
                  role="menuitem"
                >
                  {isEditing ? (
                    <div className="space-edit-inline">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRename(space.id);
                          if (e.key === 'Escape') setEditingSpaceId(null);
                        }}
                        autoFocus
                        className="space-edit-input"
                        aria-label="New space name"
                      />
                      <button
                        type="button"
                        className="space-edit-save-btn"
                        onClick={() => handleSaveRename(space.id)}
                      >
                        ✓
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="space-select-action"
                        onClick={() => handleSelectSpace(space.id)}
                        aria-label={`Switch to ${space.name} space`}
                      >
                        <span className="space-row-icon">{space.icon}</span>
                        <span className="space-row-name">{space.name}</span>
                        <span className={`space-row-theme theme-${space.theme}`}>
                          {space.theme}
                        </span>
                        {isActive && <span className="space-active-check">✓</span>}
                      </button>

                      <div className="space-row-controls">
                        <button
                          type="button"
                          className="space-mini-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingSpaceId(space.id);
                            setEditName(space.name);
                          }}
                          aria-label={`Rename ${space.name}`}
                          title="Rename space"
                        >
                          ✎
                        </button>
                        {spaces.length > 1 && (
                          <button
                            type="button"
                            className="space-mini-btn space-delete-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSpace(space.id, space.name);
                            }}
                            aria-label={`Delete ${space.name}`}
                            title="Delete space (with 10s undo)"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Create New Space */}
          {isCreating ? (
            <form onSubmit={handleCreateSpace} className="space-create-form">
              <input
                type="text"
                placeholder="New space name…"
                value={newSpaceName}
                onChange={(e) => setNewSpaceName(e.target.value)}
                autoFocus
                className="space-create-input"
                aria-label="New space name"
              />
              <div className="space-create-actions">
                <button
                  type="button"
                  className="space-cancel-btn"
                  onClick={() => setIsCreating(false)}
                >
                  {t('common.cancel')}
                </button>
                <button type="submit" className="space-submit-btn">
                  {t('common.create')}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              className="space-add-trigger"
              onClick={() => setIsCreating(true)}
            >
              + {t('spaces.createTitle')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}


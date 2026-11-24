'use client';

import React, { useEffect, useState, useId } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

const BentoCustomizeDrawer = dynamic(
  () => import('@/components/bento-customize-drawer'),
  { ssr: false }
);

const CommunicationRelief = dynamic(
  () => import('@/components/communication-relief').then((m) => m.CommunicationRelief),
  { ssr: false, loading: () => <div className="bento-card-skeleton" style={{ minHeight: '180px' }} /> }
);

const WellbeingCard = dynamic(
  () => import('@/components/wellbeing-card').then((m) => m.WellbeingCard),
  { ssr: false, loading: () => <div className="bento-card-skeleton" style={{ minHeight: '180px' }} /> }
);

const RulesEngineCard = dynamic(
  () => import('@/components/rules-engine-card').then((m) => m.RulesEngineCard),
  { ssr: false, loading: () => <div className="bento-card-skeleton" style={{ minHeight: '180px' }} /> }
);
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import {
  BentoCardId,
  BENTO_CARDS_META,
  BentoCardLayoutItem,
  DEFAULT_BENTO_LAYOUT,
  loadBentoLayout,
  reorderCards,
  resetBentoLayout,
  toggleCardColSpan,
  toggleCardVisibility,
} from '@/lib/bento-layout';
import { FocusTimer } from '@/components/focus-timer';
import { TodayStrip } from '@/components/today-strip';
import { showToast } from '@/lib/toast-manager';

interface SortableBentoCardProps {
  item: BentoCardLayoutItem;
  onToggleSpan: (id: BentoCardId) => void;
  onToggleVisibility: (id: BentoCardId) => void;
  isOverlay?: boolean;
  isIdle?: boolean;
}

function BentoCardContent({ id, isIdle = true }: { id: BentoCardId; isIdle?: boolean }) {
  switch (id) {
    case 'today-strip':
      return <TodayStrip />;
    case 'focus-timer':
      return <FocusTimer />;
    case 'principle':
      return (
        <article className="welcome-card bento-inner-card" aria-labelledby="welcome-card-title">
          <div className="welcome-card-topline">
            <span className="card-kicker">THE NEXORA PRINCIPLE</span>
            <span className="principle-mark" aria-hidden="true">N</span>
          </div>
          <h2 id="welcome-card-title">One place.<br />A little more clarity.</h2>
          <p>Start with the work in front of you. The rest of the workspace will take shape around real, useful tools.</p>
          <div className="welcome-card-footer">
            <span className="status-led" />
            <span>Built in the open, one useful piece at a time</span>
          </div>
        </article>
      );
    case 'quick-actions':
      return (
        <div className="bento-quick-actions">
          <div className="quick-action-header">
            <span className="card-kicker">KEYBOARD NAVIGATION</span>
            <span className="quick-action-shortcut-badge">Press ? for shortcuts</span>
          </div>
          <h3 className="quick-action-title">Space Launchers</h3>
          <p className="quick-action-subtitle">Instant space switching with key sequences</p>
          <div className="quick-action-grid">
            <Link href="/connect" className="quick-action-tile">
              <span className="quick-action-keys"><kbd>G</kbd><kbd>C</kbd></span>
              <span className="quick-action-label">Connect</span>
              <span className="quick-action-tier tier-preview">Preview</span>
            </Link>
            <Link href="/think" className="quick-action-tile">
              <span className="quick-action-keys"><kbd>G</kbd><kbd>T</kbd></span>
              <span className="quick-action-label">Think</span>
              <span className="quick-action-tier tier-preview">Preview</span>
            </Link>
            <Link href="/build" className="quick-action-tile">
              <span className="quick-action-keys"><kbd>G</kbd><kbd>B</kbd></span>
              <span className="quick-action-label">Build</span>
              <span className="quick-action-tier tier-preview">Preview</span>
            </Link>
            <Link href="/discover" className="quick-action-tile">
              <span className="quick-action-keys"><kbd>G</kbd><kbd>D</kbd></span>
              <span className="quick-action-label">Discover</span>
              <span className="quick-action-tier tier-preview">Preview</span>
            </Link>
          </div>
          <div className="quick-action-footer">
            <span>Press <kbd className="inline-kbd">Cmd/Ctrl+K</kbd> to open command palette</span>
          </div>
        </div>
      );
    case 'system-health':
      return (
        <div className="bento-system-health">
          <div className="system-health-header">
            <span className="card-kicker">WORKSPACE ARCHITECTURE</span>
            <span className="system-health-count">Local Browser Mode</span>
          </div>
          <h3 className="system-health-title">Ecosystem Readiness</h3>
          <div className="system-health-list">
            <div className="system-health-item">
              <span className="health-dot health-live" aria-hidden="true" />
              <span className="health-name">Foundation & Auth</span>
              <span className="health-badge badge-live">Live</span>
            </div>
            <div className="system-health-item">
              <span className="health-dot health-live" aria-hidden="true" />
              <span className="health-name">Focus Room & Shield</span>
              <span className="health-badge badge-live">Live</span>
            </div>
            <div className="system-health-item">
              <span className="health-dot health-preview" aria-hidden="true" />
              <span className="health-name">Connect & Channels</span>
              <span className="health-badge badge-preview">Preview</span>
            </div>
            <div className="system-health-item">
              <span className="health-dot health-preview" aria-hidden="true" />
              <span className="health-name">Think Intelligence</span>
              <span className="health-badge badge-preview">Preview</span>
            </div>
            <div className="system-health-item">
              <span className="health-dot health-preview" aria-hidden="true" />
              <span className="health-name">Build Workspace</span>
              <span className="health-badge badge-preview">Preview</span>
            </div>
            <div className="system-health-item">
              <span className="health-dot health-preview" aria-hidden="true" />
              <span className="health-name">Discover Engine</span>
              <span className="health-badge badge-preview">Preview</span>
            </div>
          </div>
          <div className="system-health-footer">
            <span>State persisted locally in browser storage</span>
          </div>
        </div>
      );
    case 'communication-relief':
      return isIdle ? <CommunicationRelief /> : <div className="bento-card-skeleton" style={{ minHeight: '180px' }} />;
    case 'wellbeing':
      return isIdle ? <WellbeingCard /> : <div className="bento-card-skeleton" style={{ minHeight: '180px' }} />;
    case 'rules-engine':
      return isIdle ? <RulesEngineCard /> : <div className="bento-card-skeleton" style={{ minHeight: '180px' }} />;
    default:
      return null;
  }
}

function SortableBentoCard({
  item,
  onToggleSpan,
  onToggleVisibility,
  isOverlay = false,
  isIdle = true,
}: SortableBentoCardProps) {
  const meta = BENTO_CARDS_META[item.id] || {
    id: item.id,
    title: item.id,
    category: 'Widget',
    description: '',
    status: { tier: 'Live', label: 'Live' },
    minColSpan: 1,
    maxColSpan: 2,
    isResizable: true,
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition || undefined,
  };

  const isWide = item.colSpan === 2;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bento-card bento-card-${item.id} ${isWide ? 'bento-col-2' : 'bento-col-1'} ${
        isDragging ? 'is-dragging' : ''
      } ${isOverlay ? 'is-overlay' : ''}`}
      data-card-id={item.id}
      aria-label={`${meta.title} card`}
    >
      {/* Card Customization & Drag Header */}
      <div className="bento-card-topbar">
        <div className="bento-card-topbar-left">
          <button
            type="button"
            className="bento-drag-handle"
            aria-label={`Drag to reorder ${meta.title}`}
            title="Click and drag to reorder card (or use Space/Arrow keys)"
            {...attributes}
            {...listeners}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="9" cy="6" r="1.5" />
              <circle cx="15" cy="6" r="1.5" />
              <circle cx="9" cy="12" r="1.5" />
              <circle cx="15" cy="12" r="1.5" />
              <circle cx="9" cy="18" r="1.5" />
              <circle cx="15" cy="18" r="1.5" />
            </svg>
            <span className="bento-drag-label">{meta.title}</span>
          </button>
        </div>

        <div className="bento-card-topbar-right">
          <span
            className={`bento-status-pill tier-${meta.status.tier.toLowerCase()}`}
            title={meta.description}
          >
            {meta.status.label}
          </span>

          {meta.isResizable && (
            <button
              type="button"
              className="bento-control-btn"
              onClick={() => onToggleSpan(item.id)}
              aria-label={isWide ? `Contract ${meta.title} to 1 column` : `Expand ${meta.title} to 2 columns`}
              title={isWide ? 'Contract width' : 'Expand width'}
            >
              {isWide ? (
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="4 14 10 14 10 20" />
                  <polyline points="20 10 14 10 14 4" />
                  <line x1="14" y1="10" x2="21" y2="3" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              ) : (
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              )}
            </button>
          )}

          <button
            type="button"
            className="bento-control-btn"
            onClick={() => onToggleVisibility(item.id)}
            aria-label={`Hide ${meta.title} card`}
            title="Hide card"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Card Main Body */}
      <div className="bento-card-body">
        <BentoCardContent id={item.id} isIdle={isIdle} />
      </div>
    </div>
  );
}

export function BentoGrid() {
  const [layout, setLayout] = useState<BentoCardLayoutItem[]>(() => DEFAULT_BENTO_LAYOUT);
  const [isMounted, setIsMounted] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [activeDragId, setActiveDragId] = useState<BentoCardId | null>(null);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const dndContextId = useId();

  useEffect(() => {
    setIsMounted(true);
    setLayout(loadBentoLayout());

    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let idleHandle: number | null = null;

    // Defer heavy widgets until after first paint
    if (typeof window !== 'undefined') {
      const markIdle = () => setIsIdle(true);
      if ('requestIdleCallback' in window) {
        idleHandle = (window as unknown as { requestIdleCallback: (cb: () => void, opts: { timeout: number }) => number }).requestIdleCallback(markIdle, { timeout: 1200 });
      } else {
        idleTimer = setTimeout(markIdle, 500);
      }
    }

    const handleExternalChange = (e: Event) => {
      const customEvent = e as CustomEvent<BentoCardLayoutItem[]>;
      if (customEvent.detail) {
        setLayout(customEvent.detail);
      }
    };

    window.addEventListener('nexora-bento-layout-change', handleExternalChange);
    return () => {
      window.removeEventListener('nexora-bento-layout-change', handleExternalChange);
      if (idleHandle !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as unknown as { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleHandle);
      }
      if (idleTimer !== null) {
        clearTimeout(idleTimer);
      }
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as BentoCardId);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);

    if (over && active.id !== over.id) {
      const updated = reorderCards(active.id as BentoCardId, over.id as BentoCardId);
      setLayout(updated);
    }
  };

  const handleToggleSpan = (id: BentoCardId) => {
    const updated = toggleCardColSpan(id);
    setLayout(updated);
  };

  const handleToggleVisibility = (id: BentoCardId) => {
    const meta = BENTO_CARDS_META[id];
    const updated = toggleCardVisibility(id);
    setLayout(updated);

    showToast({
      message: `Card hidden: ${meta.title}`,
      detail: 'You can restore it anytime from "Customize Layout".',
      type: 'info',
      undoLabel: 'Undo',
      undoAction: () => {
        const reverted = toggleCardVisibility(id);
        setLayout(reverted);
      },
    });
  };

  const handleReset = () => {
    const updated = resetBentoLayout();
    setLayout(updated);
    showToast({
      message: 'Dashboard layout reset to default',
      type: 'success',
    });
  };

  const visibleCards = layout.filter((item) => item.visible);
  const hiddenCards = layout.filter((item) => !item.visible);

  return (
    <section className="bento-dashboard-section" aria-label="Customizable workspace dashboard">
      {/* Bento Grid Toolbar */}
      <div className="bento-toolbar">
        <div className="bento-toolbar-left">
          <span className="card-kicker">CUSTOMIZABLE WORKSPACE</span>
          <span className="bento-item-count">
            {visibleCards.length} of {layout.length} widgets active
          </span>
        </div>

        <div className="bento-toolbar-right">
          {hiddenCards.length > 0 && (
            <span className="bento-hidden-badge">
              {hiddenCards.length} hidden
            </span>
          )}

          <button
            type="button"
            className="bento-action-button"
            onClick={() => setIsCustomizeOpen(!isCustomizeOpen)}
            aria-expanded={isCustomizeOpen}
            aria-controls="bento-customize-drawer"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            <span>Customize</span>
          </button>

          <button
            type="button"
            className="bento-action-button bento-action-secondary"
            onClick={handleReset}
            title="Reset layout order, sizes, and visibility to factory defaults"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Customize Drawer (Lazy-loaded) */}
      {isCustomizeOpen && (
        <BentoCustomizeDrawer
          layout={layout}
          onToggleVisibility={(id) => {
            const updated = toggleCardVisibility(id);
            setLayout(updated);
          }}
        />
      )}

      {/* Grid Container */}
      {!isMounted || !isIdle ? (
        // Static layout during initial paint to eliminate DnD sensor attachment during TBT window
        <div className="bento-grid">
          {(isMounted ? visibleCards : DEFAULT_BENTO_LAYOUT).map((item) => (
            <div
              key={item.id}
              className={`bento-card bento-card-${item.id} ${
                item.colSpan === 2 ? 'bento-col-2' : 'bento-col-1'
              }`}
            >
              <div className="bento-card-body">
                <BentoCardContent id={item.id} isIdle={isIdle} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <DndContext
          id={dndContextId}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={visibleCards.map((c) => c.id)}
            strategy={rectSortingStrategy}
          >
            <div className="bento-grid">
              {visibleCards.map((item) => (
                <SortableBentoCard
                  key={item.id}
                  item={item}
                  isIdle={isIdle}
                  onToggleSpan={handleToggleSpan}
                  onToggleVisibility={handleToggleVisibility}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeDragId ? (
              <SortableBentoCard
                item={
                  visibleCards.find((c) => c.id === activeDragId) || {
                    id: activeDragId,
                    colSpan: 1,
                    visible: true,
                  }
                }
                onToggleSpan={() => {}}
                onToggleVisibility={() => {}}
                isOverlay
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </section>
  );
}


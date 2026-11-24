/**
 * NEXORA Workspace Status Configuration
 *
 * Honest status declaration for all spaces in the Nexora ecosystem:
 * - Live: fully operational core in browser/local (Focus timer, Overview, Foundation auth)
 * - Preview: interactive local preview with offline fallbacks or simulated providers
 * - Building: planned roadmap features in development
 */

export type WorkspaceTier = 'Live' | 'Preview' | 'Building';

export interface WorkspaceStatusInfo {
  tier: WorkspaceTier;
  statusText: string;
  detail: string;
}

export const WORKSPACE_STATUS: Record<string, WorkspaceStatusInfo> = {
  OVERVIEW: {
    tier: 'Live',
    statusText: 'Live · Browser local',
    detail: 'Core dashboard running offline in browser.',
  },
  'FOCUS ROOM': {
    tier: 'Live',
    statusText: 'Live · Browser local',
    detail: 'Local 25-minute attention timer with in-memory state.',
  },
  FOCUS: {
    tier: 'Live',
    statusText: 'Live · Browser local',
    detail: 'Local 25-minute attention timer with in-memory state.',
  },
  FOUNDATION: {
    tier: 'Live',
    statusText: 'Live · Local auth & session',
    detail: 'Authentication, local session storage, and accounts.',
  },
  CONNECT: {
    tier: 'Preview',
    statusText: 'Preview · Local channels',
    detail: 'Local messaging interface and contact lists.',
  },
  THINK: {
    tier: 'Preview',
    statusText: 'Preview · Intelligence space',
    detail: 'AI workspace with model options or local fallback.',
  },
  SPEAK: {
    tier: 'Preview',
    statusText: 'Preview · Web Speech API',
    detail: 'Browser-native audio recording and transcription.',
  },
  CREATE: {
    tier: 'Preview',
    statusText: 'Preview · Studio canvas',
    detail: 'Local asset drafts and media project workspace.',
  },
  BUILD: {
    tier: 'Preview',
    statusText: 'Preview · Offline workspace',
    detail: 'Local project manifest inspection and test execution mock.',
  },
  DISCOVER: {
    tier: 'Preview',
    statusText: 'Preview · Document search',
    detail: 'Local text search and research citation excerpts.',
  },
  SOCIAL: {
    tier: 'Preview',
    statusText: 'Preview · Activity feed',
    detail: 'Local post feed, expiring stories, and follow controls.',
  },
  PRODUCTIVITY: {
    tier: 'Building',
    statusText: 'Building · Planned milestone',
    detail: 'Tasks and attention-first planning on development roadmap.',
  },
};

export function getWorkspaceStatus(name: string): WorkspaceStatusInfo {
  const key = name.trim().toUpperCase();
  return (
    WORKSPACE_STATUS[key] || {
      tier: 'Preview',
      statusText: 'Preview · Local space',
      detail: 'Workspace preview component.',
    }
  );
}


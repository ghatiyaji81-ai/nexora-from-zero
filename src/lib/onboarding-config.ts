/**
 * NEXORA Onboarding & First-Run Configuration Model (Phase 2, Item 3)
 * Handles role-based setup (Developer / Student / Creator),
 * sidebar pinning, theme & shortcut presets, tool connection disclosures,
 * and demo mode with sample data (zero registration required).
 */

export type UserRole = 'developer' | 'student' | 'creator';

export interface RolePreset {
  id: UserRole;
  label: string;
  kicker: string;
  summary: string;
  description: string;
  pinnedRoutes: string[];
  theme: 'light' | 'warm' | 'dark';
  accent: 'lime' | 'iris' | 'cyan' | 'amber' | 'rose';
  shortcutsFocus: string;
  highlightedModules: string[];
}

export type ConnectedToolId = 'github' | 'google' | 'telegram';

export interface ConnectedToolInfo {
  id: ConnectedToolId;
  name: string;
  status: 'Not connected' | 'Connected';
  authType: 'OAuth 2.0' | 'Bot Token';
  description: string;
  scopeNotice: string;
  envKey: string;
  oauthPath: string;
}

export interface OnboardingState {
  completed: boolean;
  selectedRole: UserRole;
  isDemoMode: boolean;
  connectedTools: Record<ConnectedToolId, boolean>;
  completedAt?: number;
}

export const STORAGE_KEY_ONBOARDING = 'nexora-onboarding-state';
export const STORAGE_KEY_DEMO_MODE = 'nexora-demo-mode';
export const STORAGE_KEY_USER_ROLE = 'nexora-user-role';

export const ROLE_PRESETS: Record<UserRole, RolePreset> = {
  developer: {
    id: 'developer',
    label: 'Developer',
    kicker: 'CODE & SYSTEMS',
    summary: 'Optimized for engineering, Git synchronization, and system intelligence.',
    description: 'Prioritizes the BUILD workspace, reviewed THINK AI proposals, and development terminal.',
    pinnedRoutes: ['/build', '/think', '/connect'],
    theme: 'dark',
    accent: 'cyan',
    shortcutsFocus: 'G then B (Build), G then T (Think), G then C (Connect)',
    highlightedModules: ['BUILD', 'THINK', 'CONNECT'],
  },
  student: {
    id: 'student',
    label: 'Student',
    kicker: 'RESEARCH & STUDY',
    summary: 'Calm reading, distraction shielding, and source-backed academic inquiry.',
    description: 'Prioritizes DISCOVER research citation excerpts, Focus Room 20-20-20 eye comfort, and paper drafting.',
    pinnedRoutes: ['/discover', '/think', '/connect'],
    theme: 'warm',
    accent: 'amber',
    shortcutsFocus: 'G then D (Discover), G then T (Think), Space for Focus',
    highlightedModules: ['DISCOVER', 'THINK', 'CONNECT'],
  },
  creator: {
    id: 'creator',
    label: 'Creator',
    kicker: 'MEDIA & STUDIO',
    summary: 'Visual drafts, voice capture, presentations, and thoughtful publishing.',
    description: 'Prioritizes the CREATE studio canvas, browser-native SPEAK voice capture, and quiet SOCIAL feeds.',
    pinnedRoutes: ['/create', '/speak', '/social'],
    theme: 'light',
    accent: 'rose',
    shortcutsFocus: 'G then C (Create), G then S (Speak), G then O (Social)',
    highlightedModules: ['CREATE', 'SPEAK', 'SOCIAL'],
  },
};

export const CONNECTED_TOOLS: ConnectedToolInfo[] = [
  {
    id: 'github',
    name: 'GitHub',
    status: 'Not connected',
    authType: 'OAuth 2.0',
    description: 'Repository commit feed, pull request review, and issue tracking in your Today timeline.',
    scopeNotice: 'Official GitHub OAuth flow. Requires GITHUB_CLIENT_ID & GITHUB_CLIENT_SECRET in .env.local.',
    envKey: 'GITHUB_CLIENT_ID',
    oauthPath: '/api/connect/github/oauth',
  },
  {
    id: 'google',
    name: 'Google Workspace',
    status: 'Not connected',
    authType: 'OAuth 2.0',
    description: 'Google Calendar events and Drive documents integrated into unified Today strip.',
    scopeNotice: 'Official Google Cloud OAuth 2.0 flow. Requires GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET in .env.local.',
    envKey: 'GOOGLE_CLIENT_ID',
    oauthPath: '/api/connect/google/oauth',
  },
  {
    id: 'telegram',
    name: 'Telegram Messenger',
    status: 'Not connected',
    authType: 'Bot Token',
    description: 'Direct alert forwarding, two-way notifications, and urgent channel messages.',
    scopeNotice: 'Encrypted bot token gateway. Requires TELEGRAM_BOT_TOKEN in .env.local.',
    envKey: 'TELEGRAM_BOT_TOKEN',
    oauthPath: '/api/connect/telegram/bot',
  },
];

export const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  completed: false,
  selectedRole: 'developer',
  isDemoMode: true, // Default to demo mode for instant evaluation without signup
  connectedTools: {
    github: false,
    google: false,
    telegram: false,
  },
};

let inMemoryOnboardingState: OnboardingState | null = null;

export function getOnboardingState(): OnboardingState {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY_ONBOARDING);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          completed: Boolean(parsed.completed),
          selectedRole: ROLE_PRESETS[parsed.selectedRole as UserRole] ? parsed.selectedRole : 'developer',
          isDemoMode: parsed.isDemoMode !== false,
          connectedTools: {
            github: Boolean(parsed.connectedTools?.github),
            google: Boolean(parsed.connectedTools?.google),
            telegram: Boolean(parsed.connectedTools?.telegram),
          },
          completedAt: parsed.completedAt,
        };
      }
    } catch {
      // Fall through to memory/default
    }
  }

  if (inMemoryOnboardingState) {
    return { ...inMemoryOnboardingState };
  }

  return { ...DEFAULT_ONBOARDING_STATE };
}

export function saveOnboardingState(state: Partial<OnboardingState>): OnboardingState {
  const current = getOnboardingState();
  const next: OnboardingState = {
    ...current,
    ...state,
    connectedTools: {
      ...current.connectedTools,
      ...(state.connectedTools || {}),
    },
  };

  inMemoryOnboardingState = { ...next };

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY_ONBOARDING, JSON.stringify(next));
      window.localStorage.setItem(STORAGE_KEY_DEMO_MODE, String(next.isDemoMode));
      window.localStorage.setItem(STORAGE_KEY_USER_ROLE, next.selectedRole);

      window.dispatchEvent(
        new CustomEvent('nexora-onboarding-change', {
          detail: next,
        })
      );
    } catch {
      // Storage unavailable
    }
  }

  return next;
}

export function applyRolePreferences(role: UserRole): void {
  const preset = ROLE_PRESETS[role];
  if (!preset) return;

  if (typeof window !== 'undefined' && window.localStorage) {
    // 1. Sidebar Pins
    try {
      window.localStorage.setItem('nexora-pinned-spaces', JSON.stringify(preset.pinnedRoutes));
      window.dispatchEvent(new CustomEvent('nexora-pins-change'));
    } catch {}

    // 2. Theme & Accent
    try {
      window.localStorage.setItem('nexora-theme', preset.theme);
      window.localStorage.setItem('nexora-accent', preset.accent);
      document.documentElement.dataset.theme = preset.theme;
      document.documentElement.dataset.accent = preset.accent;
      window.dispatchEvent(new CustomEvent('nexora-theme-change', { detail: { theme: preset.theme } }));
    } catch {}
  }
}

export function completeOnboarding(options: {
  role: UserRole;
  isDemoMode: boolean;
  connectedTools?: Partial<Record<ConnectedToolId, boolean>>;
}): OnboardingState {
  applyRolePreferences(options.role);

  const updated = saveOnboardingState({
    completed: true,
    selectedRole: options.role,
    isDemoMode: options.isDemoMode,
    connectedTools: {
      github: Boolean(options.connectedTools?.github),
      google: Boolean(options.connectedTools?.google),
      telegram: Boolean(options.connectedTools?.telegram),
    },
    completedAt: Date.now(),
  });

  return updated;
}

export function resetOnboarding(): OnboardingState {
  return saveOnboardingState({
    completed: false,
    selectedRole: 'developer',
    isDemoMode: true,
    connectedTools: {
      github: false,
      google: false,
      telegram: false,
    },
    completedAt: undefined,
  });
}


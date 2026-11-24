import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';
import { PrivacyDashboard } from '@/components/privacy-dashboard';

export const metadata: Metadata = {
  title: 'Privacy & Data Dashboard',
  description: 'Inspect, export, and control your personal workspace data, permissions, and storage settings.',
};

export default function PrivacyPage() {
  return (
    <AppShell>
      <main className="dashboard privacy-page-main">
        <PrivacyDashboard />
      </main>
    </AppShell>
  );
}

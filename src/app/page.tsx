import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { BentoGrid } from '@/components/bento-grid';
import { PreviewLink } from '@/components/preview-link';
import { productMap } from '@/lib/product-map';
import { getWorkspaceStatus } from '@/lib/workspace-status';

const moduleHrefs: Record<string, string> = {
  FOUNDATION: '/workspace',
  CONNECT: '/connect',
  SOCIAL: '/social',
  THINK: '/think',
  SPEAK: '/speak',
  CREATE: '/create',
  BUILD: '/build',
  DISCOVER: '/discover',
  PRODUCTIVITY: '#roadmap',
};

const moduleActions: Record<string, { label: string; href: string }> = {
  FOUNDATION: { label: 'Open space', href: '/workspace' },
  CONNECT: { label: 'Open Connect', href: '/connect' },
  SOCIAL: { label: 'Open Social', href: '/social' },
  THINK: { label: 'Open Think', href: '/think' },
  SPEAK: { label: 'Open Speak', href: '/speak' },
  CREATE: { label: 'Open Create', href: '/create' },
  BUILD: { label: 'Open Build', href: '/build' },
  DISCOVER: { label: 'Open Discover', href: '/discover' },
  PRODUCTIVITY: { label: 'View roadmap', href: '#roadmap' },
};

export default function HomePage() {
  return (
    <AppShell>
      <main className="dashboard">
        <section className="welcome-row" aria-labelledby="welcome-title">
          <div>
            <p className="eyebrow">YOUR SPACE, IN PROGRESS</p>
            <h1 id="welcome-title">Make room for your next<br className="desktop-break" /> good idea.</h1>
            <p className="welcome-copy">A calmer home for the things you want to think through, make, and get done.</p>
          </div>
          <div className="date-chip" aria-label="NEXORA foundation workspace">
            <span className="date-dot" />
            <span>Foundation workspace</span>
          </div>
        </section>

        {/* Phase 2, Item 2: Customizable Bento-Grid Dashboard */}
        <BentoGrid />

        <section className="map-section" id="roadmap" aria-labelledby="map-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">THE PRODUCT MAP</p>
              <h2 id="map-title">A connected workspace, built with care.</h2>
            </div>
            <span className="map-note">Planned areas are shown for orientation only.</span>
          </div>

          <div className="module-grid">
            {productMap.map((module, index) => {
              const href = moduleHrefs[module.name] || '#roadmap';
              const action = moduleActions[module.name] || { label: 'Open space', href };
              const className = `module-item${module.status === 'In progress' ? ' module-item-active' : ''}`;
              const content = (
                <>
                  <div className="module-item-heading">
                    <span className="module-index">0{index + 1}</span>
                    <span className={`module-state${module.status === 'In progress' ? ' module-state-active' : ''}`}>
                      <span />{module.status}
                    </span>
                  </div>
                  <h3>{module.name}</h3>
                  <p>{module.summary}</p>
                </>
              );
              return (
                <PreviewLink
                  key={module.name}
                  href={href}
                  className={className}
                  data-module={module.name.toLowerCase()}
                  placement="top"
                  preview={{
                    title: module.name,
                    description: module.summary,
                    status: getWorkspaceStatus(module.name).statusText,
                    actionLabel: action.label,
                    actionHref: action.href,
                    variant: module.name.toLowerCase(),
                  }}
                >
                  {content}
                </PreviewLink>
              );
            })}
          </div>
        </section>

        <footer className="dashboard-footer">
          <span>NEXORA <span className="footer-separator">/</span> A new foundation</span>
          <span>Designed for useful work, not more noise.</span>
        </footer>
      </main>
    </AppShell>
  );
}

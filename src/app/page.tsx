import { AppShell } from '@/components/app-shell';
import { FocusTimer } from '@/components/focus-timer';
import { productMap } from '@/lib/product-map';

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

        <section className="workspace-grid" aria-label="Workspace overview">
          <FocusTimer />

          <article className="welcome-card" aria-labelledby="welcome-card-title">
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
        </section>

        <section className="map-section" id="roadmap" aria-labelledby="map-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">THE PRODUCT MAP</p>
              <h2 id="map-title">A connected workspace, built with care.</h2>
            </div>
            <span className="map-note">Planned areas are shown for orientation only.</span>
          </div>

          <div className="module-grid">
            {productMap.map((module, index) => (
              <article className={`module-item${module.status === 'In progress' ? ' module-item-active' : ''}`} key={module.name}>
                <div className="module-item-heading">
                  <span className="module-index">0{index + 1}</span>
                  <span className={`module-state${module.status === 'In progress' ? ' module-state-active' : ''}`}>
                    <span />{module.status}
                  </span>
                </div>
                <h3>{module.name}</h3>
                <p>{module.summary}</p>
              </article>
            ))}
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

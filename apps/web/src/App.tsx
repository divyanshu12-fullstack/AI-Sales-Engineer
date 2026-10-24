import { lazy, Suspense } from 'react';
import { PublicSite } from './features/company/PublicSite.js';

const Dashboard = lazy(async () => {
  try {
    const module = await import('./features/operations/Dashboard.js');
    return { default: module.Dashboard };
  } catch {
    return { default: WorkspaceLoadError };
  }
});
const WorkspaceLoadError = () => (
  <main className="loading-page">
    <h1>We couldn’t load the workspace.</h1>
    <p role="alert">Check your connection, then reload to try again.</p>
    <button className="button button--dark" onClick={() => window.location.reload()}>
      Reload workspace
    </button>
    <p>
      <a className="text-link" href="/">
        Back to the website
      </a>
    </p>
  </main>
);
export const App = () =>
  window.location.pathname.replace(/\/$/, '') === '/admin' ? (
    <Suspense
      fallback={
        <main className="loading-page">
          <p role="status">Loading your workspace…</p>
        </main>
      }
    >
      <Dashboard />
    </Suspense>
  ) : (
    <PublicSite />
  );

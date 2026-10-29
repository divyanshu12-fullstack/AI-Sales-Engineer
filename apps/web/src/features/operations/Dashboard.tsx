import { useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  FileText,
  LayoutDashboard,
  LogOut,
  Phone,
  RefreshCw,
  ShieldCheck,
  CircleAlert,
  LifeBuoy,
  CalendarDays,
} from 'lucide-react';
import { Brand } from '../../components/Brand.js';
import { useOperations } from './use-operations.js';
import { RecordDetails } from './RecordDetails.js';
import { WorkspaceViews } from './WorkspaceViews.js';
import type { Selection, View } from './presentation.js';
import { time } from './presentation.js';
import { SupportWorkspace } from './SupportWorkspace.js';

const views = [
  {
    id: 'overview',
    title: 'Overview',
    icon: LayoutDashboard,
  },
  {
    id: 'calls',
    title: 'Calls',
    icon: Phone,
  },
  {
    id: 'inquiries',
    title: 'Project inquiries',
    icon: FileText,
  },
  {
    id: 'support',
    title: 'Support tickets',
    icon: LifeBuoy,
  },
  {
    id: 'meetings',
    title: 'Meetings',
    icon: CalendarDays,
  },
  {
    id: 'activity',
    title: 'Tools & activity',
    icon: Activity,
  },
  {
    id: 'knowledge',
    title: 'Knowledge status',
    icon: BookOpen,
  },
] as const;
export const Dashboard = () => {
  const state = useOperations();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [view, setView] = useState<View>('overview');
  const [selection, setSelection] = useState<Selection | null>(null);
  const active = views.find((item) => item.id === view) ?? views[0];
  if (!state.signedIn)
    return (
      <div className="login-page">
        <a className="skip-link" href="#sign-in">
          Skip to sign-in
        </a>
        <section className="login-story">
          <Brand />
          <div>
            <p className="eyebrow">THE OPERATIONS WORKSPACE</p>
            <h1>
              A clearer view.
              <br />
              <span>Of every conversation.</span>
            </h1>
            <p>
              From a first question to a confirmed project inquiry. Keep the details, the context
              and the next step in one place.
            </p>
            <div className="login-story-rule" />
            <span className="login-note">AsterByte Solutions / Internal operations</span>
          </div>
          <a href="/" className="text-link">
            <ArrowLeft size={16} /> Back to the website
          </a>
        </section>
        <main className="login-main" id="sign-in">
          <div className="login-form-wrap">
            <span className="login-shield">
              <ShieldCheck size={25} strokeWidth={1.5} />
            </span>
            <p className="eyebrow">AUTHORIZED TEAM ACCESS</p>
            <h2>Welcome back.</h2>
            <p>Sign in to your operations workspace.</p>
            {state.error && (
              <p role="alert" className="workspace-notice workspace-notice--error">
                {state.error}
              </p>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void state.signIn(email, password).finally(() => setPassword(''));
              }}
            >
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                placeholder="you@company.com"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                placeholder="Your password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button className="button button--dark" disabled={!state.ready || state.busy}>
                {state.busy ? 'Signing in…' : 'Sign in'}
                <ArrowUpRight size={18} />
              </button>
            </form>
            <aside className="login-demo-access" aria-label="Demo sign-in credentials">
              <p className="login-demo-access-title">Demo access</p>
              <dl>
                <div>
                  <dt>Email</dt>
                  <dd>
                    <code>admin123@gmail.com</code>
                  </dd>
                </div>
                <div>
                  <dt>Password</dt>
                  <dd>
                    <code>Admin@12345</code>
                  </dd>
                </div>
              </dl>
            </aside>
            <a className="login-mobile-back text-link" href="/">
              <ArrowLeft size={15} /> Back to the website
            </a>
          </div>
        </main>
      </div>
    );
  return (
    <div className="operations-app">
      <a className="skip-link" href="#workspace-main">
        Skip to workspace
      </a>
      <aside className="workspace-sidebar">
        <Brand compact />
        <div className="workspace-label">OPERATIONS</div>
        <nav aria-label="Workspace navigation">
          {views.map(({ id, title, icon: Icon }) => (
            <button
              key={id}
              className={view === id ? 'workspace-nav-active' : ''}
              aria-current={view === id ? 'page' : undefined}
              onClick={() => {
                setView(id);
                setSelection(null);
              }}
            >
              <Icon size={18} strokeWidth={1.7} />
              <span>{title}</span>
              {view === id && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span>
            <ShieldCheck size={16} /> Administrator workspace
          </span>
          <a href="/">
            <ArrowLeft size={15} /> Public website
          </a>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-topbar">
          <span>
            AsterByte Solutions <i>/</i> Operations
          </span>
          <div>
            <span className="admin-label">
              <span className="admin-avatar">AS</span> Administrator
            </span>
            <button
              className="workspace-signout"
              onClick={() => {
                setSelection(null);
                void state.signOut();
              }}
            >
              <LogOut size={16} />
              <span>Sign out</span>
            </button>
          </div>
        </header>
        <main id="workspace-main" className="workspace-main">
          <div className="workspace-heading">
            <div>
              <h1>{active.title}</h1>
            </div>
            <button
              className="workspace-refresh"
              disabled={state.access === 'loading'}
              onClick={state.refresh}
            >
              <RefreshCw size={15} className={state.access === 'loading' ? 'spin' : ''} />
              Refresh
            </button>
          </div>
          <div className="refresh-line">
            <span
              className={`refresh-dot ${state.access === 'stale' ? 'refresh-dot--stale' : ''}`}
            />
            <span>
              {state.updated ? `Last refreshed ${time(state.updated)}` : 'Loading records…'}
            </span>
            <span>·</span>
            <span>Auto-refresh on</span>
          </div>
          {state.error && (
            <div role="alert" className="workspace-notice workspace-notice--error">
              <CircleAlert size={18} />
              <div>
                <strong>
                  {state.access === 'expired'
                    ? 'Session expired'
                    : state.access === 'forbidden'
                      ? 'Access restricted'
                      : 'Update unavailable'}
                </strong>
                <p>{state.error}</p>
              </div>
            </div>
          )}
          {state.data ? (
            <>
              {view === 'support' ? (
                <SupportWorkspace
                  data={state.data.support}
                  onUpdate={state.updateTicket}
                  onRetry={state.retrySupportEmail}
                />
              ) : (
                <WorkspaceViews
                  key={view}
                  view={view}
                  data={state.data}
                  onView={setView}
                  onSelect={setSelection}
                />
              )}
              <RecordDetails
                selection={selection}
                data={state.data}
                onClose={() => setSelection(null)}
                onSelect={setSelection}
                loadDocument={state.loadKnowledge}
              />
            </>
          ) : state.access === 'loading' ? (
            <div className="workspace-loading" role="status">
              <RefreshCw className="spin" size={22} />
              <h2>Loading your workspace…</h2>
              <p>Fetching authorized business records.</p>
            </div>
          ) : (
            <div className="workspace-empty">
              <ShieldCheck size={27} />
              <h2>
                {state.access === 'forbidden'
                  ? 'Administrator access is required.'
                  : state.access === 'expired'
                    ? 'Sign in again to continue.'
                    : 'No snapshot is available yet.'}
              </h2>
              <p>
                {['expired', 'forbidden'].includes(state.access)
                  ? 'No private records are displayed. Use Sign out to return to the sign-in screen.'
                  : 'The next successful refresh will populate this workspace.'}
              </p>
            </div>
          )}
          <footer className="workspace-footer">
            Showing recent records
            <span>Private workspace</span>
          </footer>
        </main>
      </div>
    </div>
  );
};

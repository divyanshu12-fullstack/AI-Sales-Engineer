import type { IntegrationId } from '@asterbyte/contracts';
import { useFoundationStatus } from './features/foundation/use-foundation-status.js';

const integrationNames: Record<IntegrationId, string> = {
  supabase: 'Supabase runtime API & authentication',
  bolna: 'Bolna browser calling',
  llm: 'Language model',
  embeddings: 'Knowledge embeddings',
  calendar: 'Calendar booking',
  resend: 'Transactional email',
  public_callbacks: 'Public HTTPS callbacks',
};

export const App = () => {
  const { state, refresh } = useFoundationStatus();

  return (
    <div className="min-h-screen bg-stone-50 text-slate-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <a className="text-xl font-bold tracking-tight" href="/">
            AsterByte<span className="font-normal text-slate-500"> Solutions</span>
          </a>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-900">
            Database foundation · Live features unavailable
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <section aria-labelledby="page-heading" className="max-w-3xl">
          <p className="mb-4 text-sm font-semibold tracking-widest text-teal-800 uppercase">
            AI consultancy voice platform
          </p>
          <h1
            id="page-heading"
            className="text-4xl leading-tight font-semibold tracking-tight sm:text-5xl"
          >
            A working foundation.
            <br />
            No simulated capabilities.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
            The React application and Express API are the first building blocks. Voice
            consultations, customer support and persistent memory will be added in separate,
            testable milestones.
          </p>
        </section>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.5fr]">
          <section aria-labelledby="runtime-heading" className="panel self-start">
            <p className="eyebrow">Runtime</p>
            <h2 id="runtime-heading" className="mt-2 text-2xl font-semibold">
              {state.status === 'loading'
                ? 'Checking API…'
                : state.status === 'loaded'
                  ? 'API reachable'
                  : 'API unavailable'}
            </h2>
            {state.status === 'loading' && (
              <p role="status" className="mt-4 text-slate-600">
                Checking the backend and integration configuration.
              </p>
            )}
            {state.status === 'error' && (
              <p role="alert" className="mt-4 text-red-800">
                The API could not be reached or returned an unexpected response. Check the server
                and try again.
              </p>
            )}
            {state.status === 'loaded' && (
              <p role="status" className="mt-4 leading-relaxed text-slate-600">
                The API process is healthy. Business integrations are unavailable; configuration
                alone does not establish connectivity or enable a feature.
              </p>
            )}
            <button
              type="button"
              onClick={refresh}
              disabled={state.status === 'loading'}
              className="mt-6 rounded-lg border border-slate-300 px-4 py-2 font-medium hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 disabled:cursor-wait disabled:opacity-50"
            >
              Check again
            </button>
            <div className="mt-8 border-t border-stone-200 pt-6">
              <button
                type="button"
                disabled
                aria-describedby="calling-availability"
                className="rounded-lg bg-slate-200 px-4 py-3 font-medium text-slate-600 disabled:cursor-not-allowed"
              >
                Voice calling unavailable
              </button>
              <p id="calling-availability" className="mt-3 text-sm leading-relaxed text-slate-500">
                Browser calling is planned for a later integration milestone. No microphone access
                is requested here.
              </p>
            </div>
          </section>

          <section aria-labelledby="integrations-heading" className="panel">
            <p className="eyebrow">Integration readiness</p>
            <h2 id="integrations-heading" className="mt-2 text-2xl font-semibold">
              Explicitly unavailable until verified
            </h2>
            <p className="mt-3 leading-relaxed text-slate-600">
              This list reports real backend configuration state, not fabricated business activity.
              Provider adapters and account checks are not implemented yet.
            </p>
            {state.status === 'loaded' ? (
              <ul className="mt-6 divide-y divide-stone-200">
                {state.data.readiness.data.integrations.map((integration) => (
                  <li key={integration.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-medium">{integrationNames[integration.id]}</h3>
                      <span className="rounded bg-stone-100 px-2 py-1 text-xs font-semibold text-slate-600">
                        Unavailable
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {integration.configuration === 'missing'
                        ? 'Missing configuration · Not verified'
                        : 'Configuration present · Not verified'}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-6 rounded-lg bg-stone-50 p-4 text-sm text-slate-500">
                Integration state cannot be reported until the API check succeeds.
              </p>
            )}
          </section>
        </div>

        <footer className="mt-10 text-sm leading-relaxed text-slate-500">
          AsterByte Solutions is a fictional demonstration consultancy. No customer records,
          appointments, emails or calls have been created by this screen.
        </footer>
      </main>
    </div>
  );
};

import { useState } from 'react';
import { useOperations } from './use-operations.js';

const time = (value: string) => new Date(value).toLocaleString();
export const Dashboard = () => {
  const state = useOperations();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <div className="min-h-screen bg-stone-50 text-slate-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <a href="/" className="text-xl font-bold">
            AsterByte Solutions
          </a>
          <span className="text-sm text-teal-800">Operations · Private</span>
          {state.signedIn && (
            <button
              className="rounded border px-3 py-2"
              onClick={() => {
                void state.signOut();
              }}
            >
              Sign out
            </button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <h1 className="text-3xl font-semibold">Incoming conversations & inquiries</h1>
        <p className="text-slate-600">
          Actual stored records only. Imported history is labeled separately. No private customer
          lookup or verified-identity claim is made.
        </p>
        {state.error && (
          <p
            role="alert"
            className="rounded border border-amber-300 bg-amber-50 p-4 text-amber-950"
          >
            {state.error}
          </p>
        )}
        {!state.signedIn ? (
          <section className="panel max-w-lg">
            <h2 className="text-xl font-semibold">Administrator sign-in</h2>
            <p className="mt-2 text-sm text-slate-600">
              Use an existing Supabase Auth account with an active administrator profile. Public
              signup is not available. Ask the project owner to provision access if needed.
            </p>
            <form
              className="mt-5 grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void state.signIn(email, password).finally(() => setPassword(''));
              }}
            >
              <label htmlFor="email">Email</label>
              <input
                id="email"
                className="rounded border bg-white p-2"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <label htmlFor="password">Password</label>
              <input
                id="password"
                className="rounded border bg-white p-2"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                disabled={!state.ready || state.busy}
                className="mt-2 rounded bg-teal-800 px-4 py-2 text-white disabled:opacity-50"
              >
                {state.busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </section>
        ) : !state.data ? (
          <p role="status">Waiting for authorized dashboard data…</p>
        ) : (
          <>
            <p role="status" className="text-sm text-slate-500">
              Last successful refresh: {state.updated}. Updates poll every 3 seconds; this is not a
              live transcript stream.
            </p>
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="panel">
                <h2 className="text-xl font-semibold">Leads / project inquiries</h2>
                {!state.data.inquiries.length && <p className="mt-4">No inquiries recorded.</p>}
                <ul className="divide-y divide-stone-200">
                  {state.data.inquiries.map((inquiry) => (
                    <li className="py-4" key={inquiry.id}>
                      <p className="text-xs text-slate-500">
                        {inquiry.import_batch
                          ? 'Imported history'
                          : 'Incoming · identity unverified'}{' '}
                        · {inquiry.stage} · {time(inquiry.created_at)}
                      </p>
                      <h3 className="mt-1 font-semibold">{inquiry.title}</h3>
                      <p className="mt-2 whitespace-pre-wrap text-sm">{inquiry.requirements}</p>
                      {!inquiry.import_batch && (
                        <dl className="mt-3 text-sm">
                          {Object.entries(inquiry.intake_details)
                            .filter(([key]) =>
                              [
                                'customer_name',
                                'email',
                                'phone',
                                'organization',
                                'budget',
                                'timeline',
                              ].includes(key),
                            )
                            .map(([key, value]) => (
                              <div key={key}>
                                <dt className="inline font-medium">{key}: </dt>
                                <dd className="inline">
                                  {typeof value === 'string' && value ? value : 'Not provided'}
                                </dd>
                              </div>
                            ))}
                        </dl>
                      )}
                      <p className="mt-2 break-all text-xs text-slate-500">{inquiry.code}</p>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="panel">
                <h2 className="text-xl font-semibold">Call activity</h2>
                {!state.data.calls.length && <p className="mt-4">No calls received.</p>}
                <ul className="divide-y divide-stone-200">
                  {state.data.calls.map((call) => (
                    <li className="py-4" key={call.id}>
                      <p className="font-medium">
                        {call.status} ·{' '}
                        {call.record_source === 'imported_history'
                          ? 'Imported history'
                          : 'Bolna provider record'}
                      </p>
                      <p className="text-xs text-slate-500">{time(call.started_at)}</p>
                      <p className="mt-2 text-sm">
                        {call.summary || 'Final summary not available.'}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="panel">
                <h2 className="text-xl font-semibold">Tool results</h2>
                {!state.data.tools.length && <p className="mt-4">No backend tools invoked yet.</p>}
                <ul>
                  {state.data.tools.map((tool) => (
                    <li className="border-b border-stone-100 py-3 text-sm" key={tool.id}>
                      <strong>{tool.tool_name}</strong> · {tool.status}
                      {tool.error_code ? ` · ${tool.error_code}` : ''}
                      <p className="text-xs text-slate-500">
                        {time(tool.created_at)} · {tool.source_ids.length} retrieved passages
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="panel">
                <h2 className="text-xl font-semibold">Business activity</h2>
                <ul>
                  {state.data.events.map((event) => (
                    <li className="border-b border-stone-100 py-3 text-sm" key={event.id}>
                      <p>{event.description}</p>
                      <p className="text-xs text-slate-500">
                        {event.event_type} · {time(event.occurred_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="panel">
                <h2 className="text-xl font-semibold">Bolna extractions</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Unverified provider observations, not matched customer identities. Extractions
                  alone do not create leads.
                </p>
                {!state.data.evidence.length && (
                  <p className="mt-4">No authenticated execution updates stored yet.</p>
                )}
                {state.data.evidence.map((item) => (
                  <div
                    key={item.execution_id}
                    className="mt-4 border-t border-stone-200 pt-3 text-sm"
                  >
                    <p>
                      {item.provider_status} · {item.conversation_duration}s
                    </p>
                    {Object.entries(item.contact_observations).map(([key, value]) => (
                      <p key={key}>
                        {key}: {typeof value === 'string' ? value : 'Not available'}
                      </p>
                    ))}
                  </div>
                ))}
              </section>
              <section className="panel">
                <h2 className="text-xl font-semibold">Knowledge catalog</h2>
                <ul>
                  {state.data.knowledge.map((doc) => (
                    <li className="py-2 text-sm" key={`${doc.document_key}-${doc.version}`}>
                      {doc.document_key} · v{doc.version} · {doc.approval_status}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-slate-500">
                  Catalog approval does not itself prove embedding ingestion or a working Bolna
                  connection.
                </p>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

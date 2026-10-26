import type { RefObject } from 'react';
import { ArrowUpRight, Play, Plus } from 'lucide-react';
import { VoicePanel } from '../voice/VoicePanel.js';
import type { VoiceCall } from '../voice/VoicePanel.js';
import { CustomerJourneys } from './CustomerJourneys.js';
import { pitchVideoUrl, scenarios, voiceStack } from './content.js';

const contents = [
  ['01', 'What we built', '#about-demo'],
  ['02', 'Why we built it', '#why-this-project'],
  ['03', 'Customer workflows', '#customer-journeys'],
  ['04', 'How the voice agent works', '#voice-architecture'],
  ['05', 'Try the demo', '#try-demo'],
  ['06', 'Check the dashboard', '#dashboard-guide'],
];

export const DemoContent = ({
  call,
  panelRef,
}: {
  call: VoiceCall;
  panelRef: RefObject<HTMLDivElement | null>;
}) => (
  <div className="project-guide site-container">
    <aside className="project-guide-sidebar">
      <p>About this project</p>
      <nav aria-label="On this page">
        {contents.map(([number, title, href]) => (
          <a key={href} href={href}>
            <span>{number}</span>
            {title}
          </a>
        ))}
      </nav>
    </aside>

    <article className="project-guide-article">
      <header className="project-introduction" id="about-demo">
        <p className="project-kicker">PROJECT WALKTHROUGH</p>
        <h1>AI sales & customer support representative</h1>
        <p className="project-lead">
          An AI voice agent that helps new customers discuss a software project and returning
          customers get support—without waiting for someone to reply to an email.
        </p>
        <p>
          This project brings a sales and customer-care conversation to the AsterByte Solutions
          website. A customer can explain what they need, ask follow-up questions and decide whether
          they want the team to take it further. The agent listens, uses company and product
          information, and records an enquiry or support ticket when the customer agrees.
        </p>
        <dl className="project-summary">
          <div>
            <dt>Who it serves</dt>
            <dd>New and existing customers of a software consultancy</dd>
          </div>
          <div>
            <dt>What you can try today</dt>
            <dd>Company questions, project enquiries and support tickets</dd>
          </div>
          <div>
            <dt>What we are building towards</dt>
            <dd>A permission-based video-call handoff to the team</dd>
          </div>
        </dl>
        <div className="project-pitch">
          {pitchVideoUrl ? (
            <a
              className="project-pitch-link"
              href={pitchVideoUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Play size={15} /> Watch the pitch <ArrowUpRight size={14} />
            </a>
          ) : (
            <>
              <button className="project-pitch-link" type="button" disabled>
                <Play size={15} /> Pitch video coming soon
              </button>
              <small>
                The video will be added here. You can read the walkthrough and try the agent now.
              </small>
            </>
          )}
        </div>
      </header>

      <section className="project-section" id="why-this-project">
        <h2>Why we built it</h2>
        <p>
          Someone who wants software built usually needs a conversation, not just a contact form.
          They want to know whether an idea is practical, what a first version could include and
          whether the company can help. Sending an email can mean waiting days just to start that
          discussion.
        </p>
        <p>
          For the consultancy, that first conversation is also how a possible enquiry becomes a
          potential business opportunity. The team needs to understand the customer’s problem before
          it can recommend a solution or arrange a useful meeting.
        </p>
        <p>
          Support has the same need for a quick response. When a product stops working, the customer
          should be able to explain the issue, get relevant guidance and have the problem raised
          with the team instead of waiting for an email to be picked up.
        </p>
        <p>
          <strong>Our goal:</strong> give both customers a natural, useful first conversation
          immediately, then bring a person into the process when their expertise is needed. The
          agent does not replace the developers or make commitments on their behalf.
        </p>
      </section>

      <section className="project-section" id="customer-journeys">
        <h2>What happens in a customer conversation?</h2>
        <p>
          The same agent handles both types of call. It follows what the customer is asking for
          instead of forcing everyone through the same sales questions.
        </p>
        <CustomerJourneys />
      </section>

      <section className="project-section" id="voice-architecture">
        <h2>How the voice agent works</h2>
        <p>
          We use <strong>Bolna’s orchestration</strong> to run a{' '}
          <strong>cascading voice agent</strong>. That means listening, deciding what to say and
          speaking are separate stages. Bolna coordinates those stages, the conversation turns and
          calls to our backend tools.
        </p>
        <div className="voice-architecture">
          <p className="architecture-caption">
            Customer speaks → the agent processes the request → customer hears a reply
          </p>
          <ol aria-label="Voice processing stages">
            {voiceStack.map((component, index) => (
              <li key={component.name}>
                <span>
                  {index + 1} / {component.role}
                </span>
                <strong>{component.name}</strong>
                <p>{component.description}</p>
              </li>
            ))}
          </ol>
          <p className="architecture-caption">
            Orchestrated by Bolna. The model can call backend tools before it answers.
          </p>
        </div>
        <div className="table-scroll project-stack">
          <table>
            <caption>What the rest of the application does</caption>
            <thead>
              <tr>
                <th>Component</th>
                <th>Role in the project</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">React website</th>
                <td>Hosts the browser call, this guide and the administrator dashboard.</td>
              </tr>
              <tr>
                <th scope="row">Node.js / Express</th>
                <td>Validates tool requests and controls access to saved business data.</td>
              </tr>
              <tr>
                <th scope="row">Supabase</th>
                <td>
                  Stores enquiries, support tickets, call evidence and the knowledge the agent
                  searches. It also provides administrator sign-in.
                </td>
              </tr>
              <tr>
                <th scope="row">Resend</th>
                <td>
                  Sends support acknowledgements and resolution updates to enabled, registered
                  contacts.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="project-small-note">
          The current agent uses Gemini 3.6 Flash, Sarvam and Deepgram Nova-3. It uses reviewed
          company information and the current conversation; this demo does not give callers
          unrestricted access to private customer history.
        </p>
      </section>

      <section className="project-section" id="try-demo">
        <h2>Try the demo</h2>
        <p>
          Choose one test below, then start a call. You do not need to read the example word for
          word. Use test details, allow microphone access and avoid passwords or sensitive
          information. Calls use the live voice service and can save demo records.
        </p>
        <div className="project-test-list" id="scenarios">
          {scenarios.map((scenario, index) => (
            <details className="project-test" key={scenario.number} open={index === 0}>
              <summary>
                <span>{scenario.number}</span>
                <strong>{scenario.title}</strong>
                <small>{scenario.time}</small>
                <Plus size={16} />
              </summary>
              <div>
                <p>{scenario.intro}</p>
                <blockquote>{scenario.say}</blockquote>
                <ol>
                  {scenario.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <p>
                  <strong>Expected result:</strong> {scenario.result}
                </p>
                <p className="project-test-note">{scenario.note}</p>
              </div>
            </details>
          ))}
        </div>
        <div className="project-call" ref={panelRef}>
          <VoicePanel call={call} />
          <p>
            English is the best-tested starting point. The prompt also supports Hindi/Hinglish;
            recognition quality still needs a human language test.
          </p>
        </div>
      </section>

      <section className="project-section" id="dashboard-guide">
        <h2>Check the results in the dashboard</h2>
        <p>
          The conversation is only one part of the demo. The dashboard lets the team see the
          requirements, reported issues and actual tool outcomes rather than relying on what the
          agent said it did.
        </p>
        <h3>How to sign in</h3>
        <ol>
          <li>
            Open{' '}
            <a className="project-inline-link" href="/admin">
              the admin dashboard
            </a>
            .
          </li>
          <li>
            Use an existing administrator email and password supplied by the project owner.
            Customer/project codes are not login credentials.
          </li>
          <li>
            If you are reviewing the submission and do not have access, ask the owner for reviewer
            credentials. There is no public sign-in bypass.
          </li>
        </ol>
        <a className="project-dashboard-link" href="/admin">
          Open admin dashboard <ArrowUpRight size={16} />
        </a>
        <h3>What to look for after a call</h3>
        <dl className="project-records">
          <div>
            <dt>Project inquiries</dt>
            <dd>The confirmed project requirements and contact details from a new customer.</dd>
          </div>
          <div>
            <dt>Support tickets</dt>
            <dd>
              The issue, status, engineer where assigned and email outcomes. Staff can enter
              resolution notes and mark a runtime ticket resolved.
            </dd>
          </div>
          <div>
            <dt>Calls</dt>
            <dd>
              Start time and duration, followed by the summary and available extracted details once
              Bolna processes the completed call.
            </dd>
          </div>
          <div>
            <dt>Tools & activity</dt>
            <dd>
              Which backend actions succeeded or failed, and which knowledge searches were made.
            </dd>
          </div>
        </dl>
        <p className="project-small-note">
          Records refresh about every three seconds. Requests can appear during a call; summaries
          arrive after processing. The dashboard shows recent records, not a live transcript.
          Accepted email submission is not proof of inbox delivery.
        </p>
      </section>
    </article>
  </div>
);

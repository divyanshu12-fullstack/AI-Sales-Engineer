import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Code2,
  Workflow,
  Layers3,
  Globe2,
  Sparkles,
  Blocks,
  Menu,
  X,
  Check,
  Plus,
  Mic,
} from 'lucide-react';
import { Brand } from '../../components/Brand.js';
import { services, additionalPricing, projects, process, faqs } from './content.js';
import { VoicePanel } from '../voice/VoicePanel.js';
import { formatDuration } from '../voice/format.js';
import { useVoiceCall } from '../voice/use-voice-call.js';
import { DemoContent } from '../demo/DemoContent.js';

const serviceIcons = {
  web: Globe2,
  product: Code2,
  business: Layers3,
  automation: Workflow,
  ai: Sparkles,
  integration: Blocks,
};
export const PublicSite = ({ demo = false }: { demo?: boolean }) => {
  useEffect(() => {
    document.title = demo
      ? 'About the Project | AsterByte Solutions'
      : 'AsterByte Solutions | Websites, CRMs & Custom Software';
  }, [demo]);
  const call = useVoiceCall();
  const [menuOpen, setMenuOpen] = useState(false);
  const [panelVisible, setPanelVisible] = useState(true);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!panel.current || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => setPanelVisible(entry?.isIntersecting ?? true),
      { threshold: 0.15 },
    );
    observer.observe(panel.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, []);
  const nav = demo
    ? [
        ['About the project', '#about-demo'],
        ['Try the agent', '#try-demo'],
        ['Dashboard guide', '#dashboard-guide'],
      ]
    : [
        ['Services', '#services'],
        ['Selected work', '#work'],
        ['Our approach', '#approach'],
        ['FAQs', '#faqs'],
      ];
  return (
    <div className={`public-site${demo ? ' project-documentation' : ''}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="site-container header-inner">
          <Brand />
          <nav className="desktop-nav" aria-label="Main navigation">
            {nav.map(([label, href]) => (
              <a key={href} href={href}>
                {label}
              </a>
            ))}
          </nav>
          <a href={demo ? '/' : '/demo'} className="header-talk">
            {demo ? 'Company website' : 'Project Demo'} <ArrowUpRight size={16} />
          </a>
          <button
            className="menu-toggle icon-button"
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
        {menuOpen && (
          <nav id="mobile-nav" className="mobile-nav site-container" aria-label="Mobile navigation">
            {nav.map(([label, href]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}>
                {label}
                <ArrowUpRight size={16} />
              </a>
            ))}
            <a href={demo ? '/' : '/demo'} onClick={() => setMenuOpen(false)}>
              {demo ? 'Company website' : 'Project Demo'} <ArrowUpRight size={16} />
            </a>
          </nav>
        )}
      </header>
      <main id="main">
        {demo ? (
          <DemoContent call={call} panelRef={panel} />
        ) : (
          <>
            <section className="hero site-container">
              <div className="hero-copy">
                <p className="eyebrow">
                  <span className="small-line" /> SOFTWARE DEVELOPMENT & CONSULTING
                </p>
                <h1>
                  Software that helps <br />
                  <span>your business grow.</span>
                </h1>
                <p className="hero-description">
                  We build websites, CRMs and custom applications for growing businesses. Whether
                  you need to bring in more enquiries, organise your sales or replace a slow manual
                  process, AsterByte Solutions can help you plan and build it.
                </p>
                <div className="hero-actions">
                  <a className="button button--dark" href="#services">
                    Explore our services <ArrowRight size={19} />
                  </a>
                  <a className="text-link" href="#work">
                    Browse client projects <ArrowRight size={17} />
                  </a>
                </div>
                <div className="hero-note">
                  <span className="note-mark">
                    <Check size={14} />
                  </span>
                  <span>Not sure what to build? Tell us how your business works.</span>
                </div>
                <div className="hero-proof">
                  <div>
                    <strong>2019</strong>
                    <span>Building since</span>
                  </div>
                  <div>
                    <strong>50+</strong>
                    <span>Clients served</span>
                  </div>
                  <div>
                    <strong>200+</strong>
                    <span>Service engagements</span>
                  </div>
                </div>
              </div>
              <div className="hero-voice" ref={panel}>
                <VoicePanel call={call} />
                <p className="voice-caption">
                  <span>SPEAK WITH OUR AI REPRESENTATIVE</span>
                  <span>Ask about a project or get product support.</span>
                </p>
              </div>
            </section>
            <section className="belief-strip">
              <div className="site-container">
                <p>
                  Still running your business <br />
                  <strong>across spreadsheets and messages?</strong>
                </p>
                <p>
                  A CRM can keep your follow-ups on track. An appointment system can organise
                  bookings. Connected tools can save your team from entering the same data twice. We
                  build software around the jobs you need to get done.
                </p>
              </div>
            </section>
            <section className="section site-container" id="services">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">OUR SERVICES</p>
                  <h2>
                    What can we help <br />
                    <span>your team do better?</span>
                  </h2>
                </div>
                <p>
                  From a business website to a custom CRM, we handle design, development and
                  testing. Smaller starter projects are listed first.
                </p>
              </div>
              <div className="services-grid">
                {services.map((service, i) => {
                  const Icon = serviceIcons[service.icon];
                  return (
                    <article className="service-item" key={service.name}>
                      <div className="service-top">
                        <span className="service-icon">
                          <Icon size={23} strokeWidth={1.5} />
                        </span>
                        <span className="item-index">0{i + 1}</span>
                      </div>
                      <h3>{service.name}</h3>
                      <p>{service.description}</p>
                      <div className="service-price">
                        <strong>{service.price}</strong>
                        <span>{service.timing}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
              <details className="more-pricing">
                <summary>
                  Specialist support & additional pricing <Plus size={20} />
                </summary>
                <div className="pricing-list">
                  {additionalPricing.map(([name, description, price, timing]) => (
                    <div key={name}>
                      <h3>{name}</h3>
                      <p>{description}</p>
                      <strong>{price}</strong>
                      <span>{timing}</span>
                    </div>
                  ))}
                </div>
              </details>
              <p className="pricing-note">
                Starter estimates in INR, ordered by starting budget. Larger builds are quoted
                separately. Final scope and schedule are agreed in your proposal. Hosting,
                subscriptions, AI usage and applicable taxes are extra unless included.
              </p>
            </section>
            <section className="work-section section" id="work">
              <div className="site-container">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">SELECTED WORK</p>
                    <h2>
                      Software for sales, <br />
                      <span>operations and everyday work.</span>
                    </h2>
                  </div>
                  <p>
                    Three examples of the problems we help businesses solve, from repetitive form
                    filling to managing a sales team. Ordered by the starting budget for a similar,
                    smaller build.
                  </p>
                </div>
                <div className="work-grid">
                  {projects.map((project, i) => (
                    <article className="project-card" key={project.name}>
                      <div
                        className={`project-art project-art--${project.illustration}`}
                        aria-hidden="true"
                      >
                        <span className="art-label">AsterByte Solutions / PROJECT 0{i + 1}</span>
                        <span className="art-word">
                          {project.name}
                          <ArrowUpRight size={34} strokeWidth={1.1} />
                        </span>
                        <div className="art-diagram">
                          <i />
                          <span />
                          <i />
                          <span />
                          <i />
                        </div>
                        <span className="art-bottom">{project.tags[0]}</span>
                      </div>
                      <div className="project-copy">
                        <p className="project-category">{project.category}</p>
                        <h3>{project.headline}</h3>
                        <p className="project-client">
                          {project.name} for {project.client}
                        </p>
                        <p>{project.problem}</p>
                        <p className="project-budget">
                          Similar builds from ₹{project.startingPrice.toLocaleString('en-IN')} ·
                          scope agreed separately
                        </p>
                        <details>
                          <summary>
                            What we built <Plus size={17} />
                          </summary>
                          <dl>
                            <dt>The solution</dt>
                            <dd>{project.solution}</dd>
                            <dt>The outcome</dt>
                            <dd>{project.outcome}</dd>
                          </dl>
                        </details>
                        <div className="project-tags">
                          {project.tags.map((tag) => (
                            <span key={tag}>{tag}</span>
                          ))}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>
            <section className="section site-container approach-section" id="approach">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">HOW WE WORK</p>
                  <h2>
                    From your first enquiry <br />
                    <span>to software your team can use.</span>
                  </h2>
                </div>
                <p>
                  You know what is being built, what it costs and when you will see the next update.
                </p>
              </div>
              <ol className="process-grid">
                {process.map((step, i) => (
                  <li key={step.title}>
                    <span className="step-number">0{i + 1}</span>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </li>
                ))}
              </ol>
              <div className="ownership-note">
                <span>
                  <Code2 size={24} strokeWidth={1.5} />
                </span>
                <div>
                  <h3>You receive the custom source code</h3>
                  <p>
                    Your team gets the code, setup instructions and a handover session. Third-party
                    components keep their own licenses.
                  </p>
                </div>
                <a className="text-link" href="#faqs">
                  The details <ArrowDownIcon />
                </a>
              </div>
            </section>
            <section className="faq-section section" id="faqs">
              <div className="site-container faq-grid">
                <div>
                  <p className="eyebrow">BEFORE WE START</p>
                  <h2>
                    Questions about <br />
                    <span>working with us.</span>
                  </h2>
                  <p>
                    Here is how pricing, ownership and support work before you commit to a project.
                  </p>
                </div>
                <div className="faq-list">
                  {faqs.map((faq) => (
                    <details key={faq.question}>
                      <summary>
                        {faq.question}
                        <Plus size={19} />
                      </summary>
                      <p>{faq.answer}</p>
                    </details>
                  ))}
                </div>
              </div>
            </section>
            <section className="closing-section site-container">
              <p className="eyebrow">A SMALLER PROJECT IS A GOOD PLACE TO START</p>
              <h2>
                Fix the process that is <br />
                <span>holding your team back.</span>
              </h2>
              <p>
                A customer-facing website, a sales CRM or one automated task can be the first step.
                You do not need to rebuild everything at once.
              </p>
            </section>
          </>
        )}
      </main>
      <footer className="site-footer">
        <div className="site-container">
          {!demo && (
            <div className="footer-top">
              <Brand />
              <p>
                Websites, CRMs and custom software. <br />
                Built for growing businesses.
              </p>
              <a href="#main" className="text-link">
                Back to top ↑
              </a>
            </div>
          )}
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} AsterByte Solutions</span>
            <p id="site-disclosure">
              AsterByte Solutions is a fictional demonstration consultancy.
            </p>
            <a href="/admin">
              Administrator access <ArrowUpRight size={13} />
            </a>
            <a href="/privacy">Privacy policy</a>
          </div>
        </div>
      </footer>
      {!panelVisible &&
        (!demo || ['connected', 'connecting', 'permission'].includes(call.phase)) && (
          <a
            className={`floating-talk ${call.phase === 'connected' ? 'floating-talk--active' : ''}`}
            href="#conversation"
          >
            <Mic size={18} />
            <span>
              {call.phase === 'connected'
                ? `Return to call · ${formatDuration(call.elapsed)}`
                : ['connecting', 'permission'].includes(call.phase)
                  ? 'Return to your call'
                  : demo
                    ? 'Try the voice agent'
                    : 'Talk to our AI representative'}
            </span>
            <ArrowUpRight size={17} />
          </a>
        )}
    </div>
  );
};
const ArrowDownIcon = () => <ArrowRight size={17} className="rotate-45" />;

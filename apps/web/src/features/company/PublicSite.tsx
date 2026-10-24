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

const serviceIcons = {
  web: Globe2,
  product: Code2,
  business: Layers3,
  automation: Workflow,
  ai: Sparkles,
  integration: Blocks,
};
export const PublicSite = () => {
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
  const nav = [
    ['Services', '#services'],
    ['Selected work', '#work'],
    ['Our approach', '#approach'],
    ['FAQs', '#faqs'],
  ];
  return (
    <div className="public-site">
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
          <a href="#conversation" className="header-talk">
            Let’s talk <ArrowUpRight size={16} />
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
            <a href="#conversation" onClick={() => setMenuOpen(false)}>
              Talk to our AI representative <Mic size={16} />
            </a>
          </nav>
        )}
      </header>
      <main id="main">
        <section className="hero site-container">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="small-line" /> A PRACTICAL SOFTWARE PARTNER
            </p>
            <h1>
              Your next chapter.
              <br />
              <span>Built in software.</span>
            </h1>
            <p className="hero-description">
              From a better website to the tools that run your business. We turn everyday challenges
              into thoughtful software for startups and growing teams.
            </p>
            <div className="hero-actions">
              <a className="button button--dark" href="#conversation">
                Talk through your idea <ArrowUpRight size={19} />
              </a>
              <a className="text-link" href="#work">
                See what we’ve built <ArrowRight size={17} />
              </a>
            </div>
            <div className="hero-note">
              <span className="note-mark">
                <Check size={14} />
              </span>
              <span>Start with the problem. We’ll help shape the solution.</span>
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
              <span>01 / START WITH A CONVERSATION</span>
              <span>A little clarity goes a long way.</span>
            </p>
          </div>
        </section>
        <section className="belief-strip">
          <div className="site-container">
            <p>
              Not more technology.
              <br />
              <strong>The right technology.</strong>
            </p>
            <p>
              A useful first release. Clear scope. Software your team can actually work with. That’s
              where we start—and how we keep things moving.
            </p>
          </div>
        </section>
        <section className="section site-container" id="services">
          <div className="section-heading">
            <div>
              <p className="eyebrow">WHAT WE CAN BUILD TOGETHER</p>
              <h2>
                Built around your business.
                <br />
                <span>Not the other way around.</span>
              </h2>
            </div>
            <p>
              One team for the website, the workflows and the connections in between. Start small,
              then build on what works.
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
            Indicative first-release budgets in INR. Final scope and schedule are agreed in your
            proposal. Hosting, subscriptions, AI usage and applicable taxes are extra unless
            included.
          </p>
        </section>
        <section className="work-section section" id="work">
          <div className="site-container">
            <div className="section-heading">
              <div>
                <p className="eyebrow">SELECTED WORK</p>
                <h2>
                  Real workflows.
                  <br />
                  <span>Considered solutions.</span>
                </h2>
              </div>
              <p>
                A few ways we’ve connected people, processes and technology. Different businesses.
                The same thoughtful approach.
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
                    <details>
                      <summary>
                        Inside the project <Plus size={17} />
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
              <p className="eyebrow">FROM FIRST CONVERSATION TO HANDOVER</p>
              <h2>
                A clear path.
                <br />
                <span>No unnecessary complexity.</span>
              </h2>
            </div>
            <p>You stay involved at the moments that matter. We make the next step clear.</p>
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
              <h3>Your custom code. Your next move.</h3>
              <p>
                Source code, setup instructions and a proper handover—not a black box. Third-party
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
              <p className="eyebrow">A FEW GOOD QUESTIONS</p>
              <h2>
                Good partnerships
                <br />
                <span>start with clarity.</span>
              </h2>
              <p>
                Scope, ownership and what happens after launch. Here’s the straightforward version.
              </p>
              <a href="#conversation" className="text-link">
                Have another question? Let’s talk <ArrowUpRight size={17} />
              </a>
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
          <p className="eyebrow">YOUR IDEA DOESN’T NEED TO BE PERFECT YET.</p>
          <h2>
            Let’s find the useful
            <br />
            <span>first step.</span>
          </h2>
          <a href="#conversation" className="button button--dark">
            Start a conversation <ArrowUpRight size={19} />
          </a>
          <p>A browser, a microphone, and a problem worth solving.</p>
        </section>
      </main>
      <footer className="site-footer">
        <div className="site-container">
          <div className="footer-top">
            <Brand />
            <p>
              Thoughtful software.
              <br />
              Practical outcomes.
            </p>
            <a href="#main" className="text-link">
              Back to top ↑
            </a>
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} AsterByte Solutions</span>
            <p id="site-disclosure">
              AsterByte Solutions is a fictional demonstration consultancy.
            </p>
            <a href="/admin">
              Administrator access <ArrowUpRight size={13} />
            </a>
          </div>
        </div>
      </footer>
      {!panelVisible && (
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
                : 'Talk to our AI representative'}
          </span>
          <ArrowUpRight size={17} />
        </a>
      )}
    </div>
  );
};
const ArrowDownIcon = () => <ArrowRight size={17} className="rotate-45" />;

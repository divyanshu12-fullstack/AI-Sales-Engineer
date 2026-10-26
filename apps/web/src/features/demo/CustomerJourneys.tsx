import { useRef, useState } from 'react';
import { customerJourneys } from './content.js';

export const CustomerJourneys = () => {
  const [selected, setSelected] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const journey = customerJourneys[selected] ?? customerJourneys[0];
  return (
    <>
      <div className="journey-tabs" role="tablist" aria-label="Customer workflows">
        {customerJourneys.map((item, index) => (
          <button
            key={item.id}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`journey-tab-${item.id}`}
            aria-controls={`journey-panel-${item.id}`}
            aria-selected={selected === index}
            tabIndex={selected === index ? 0 : -1}
            onClick={() => setSelected(index)}
            onKeyDown={(event) => {
              const next =
                event.key === 'ArrowRight'
                  ? (index + 1) % customerJourneys.length
                  : event.key === 'ArrowLeft'
                    ? (index + customerJourneys.length - 1) % customerJourneys.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? customerJourneys.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              setSelected(next);
              tabs.current[next]?.focus();
            }}
          >
            {item.tab}
          </button>
        ))}
      </div>
      <div
        className="journey-panel"
        role="tabpanel"
        tabIndex={0}
        id={`journey-panel-${journey.id}`}
        aria-labelledby={`journey-tab-${journey.id}`}
      >
        <h3>{journey.title}</h3>
        <p>{journey.introduction}</p>
        <blockquote>
          <span>Example customer request</span>
          {journey.example}
        </blockquote>
        <ol className="journey-steps">
          {journey.steps.map((step, index) => (
            <li key={step.title}>
              <span aria-hidden="true">{index + 1}</span>
              <div>
                <h4>{step.title}</h4>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="journey-result">
          <h4>What the team receives today</h4>
          <p>{journey.outcome}</p>
        </div>
        <div className="project-planned">
          <strong>Video-call handoff · planned</strong>
          <p>{journey.next}</p>
        </div>
      </div>
    </>
  );
};

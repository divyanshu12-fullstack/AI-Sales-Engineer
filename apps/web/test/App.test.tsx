import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { useVoiceCall } from '../src/features/voice/use-voice-call.js';
import { projects, services } from '../src/features/company/content.js';
afterEach(() => window.history.replaceState({}, '', '/'));
vi.mock('../src/features/voice/use-voice-call.js');
const start = vi.fn();
vi.mocked(useVoiceCall).mockReturnValue({
  phase: 'idle',
  muted: false,
  level: 0,
  error: '',
  connectedAt: null,
  endedAt: null,
  ready: true,
  elapsed: 0,
  start,
  end: vi.fn(),
  toggleMute: vi.fn(),
  reload: vi.fn(),
});
describe('public consultancy website', () => {
  it('renders approved public company content without internal diagnostics or a named agent', () => {
    const { container } = render(<App />);
    expect(
      screen.getByRole('heading', { name: /Software that helps your business grow/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('₹15,000–25,000')).toBeInTheDocument();
    expect(screen.getByText('DispatchPro for SwiftRoute Logistics')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(
      /Anjali|not connected|API reachable|integration readiness/i,
    );
    expect(
      screen.getByText('AsterByte Solutions is a fictional demonstration consultancy.'),
    ).toBeInTheDocument();
  });
  it('shows exactly three projects including the CRM, ordered by comparable starting budget', () => {
    const { container } = render(<App />);
    expect(container.querySelectorAll('.project-card')).toHaveLength(3);
    expect(projects.map((project) => project.name)).toEqual([
      'FormPilot',
      'LeadBridge',
      'DispatchPro',
    ]);
    expect(projects.map((project) => project.startingPrice)).toEqual([15000, 70000, 80000]);
    const budgets = services.map((service) => service.startingPrice);
    expect(budgets).toEqual([...budgets].sort((a, b) => a - b));
    expect(screen.getByText('LeadBridge for BrightPath Services')).toBeInTheDocument();
  });
  it('uses navigation buttons for services and work rather than repeating call invitations', () => {
    const { container } = render(<App />);
    expect(screen.getByRole('link', { name: 'Project Demo' })).toHaveAttribute('href', '/demo');
    expect(screen.getByRole('link', { name: 'Explore our services' })).toHaveAttribute(
      'href',
      '#services',
    );
    expect(screen.getByRole('link', { name: 'Browse client projects' })).toHaveAttribute(
      'href',
      '#work',
    );
    expect(screen.getAllByRole('button', { name: 'Start a conversation' })).toHaveLength(1);
    expect(container.querySelectorAll('a[href="#conversation"]')).toHaveLength(0);
    expect(container).not.toHaveTextContent('Not more technology.');
  });
  it('opens the demo guide directly with three scenarios and only one voice panel', () => {
    window.history.replaceState({}, '', '/demo');
    const { container } = render(<App />);
    expect(
      screen.getByRole('heading', { name: 'AI sales & customer support representative' }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('.project-test')).toHaveLength(3);
    expect(container.querySelectorAll('.voice-panel')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Pitch video coming soon' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Open admin dashboard' })).toHaveAttribute(
      'href',
      '/admin',
    );
    expect(
      screen.getByText(/Customer\/project codes are not login credentials/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Consultant matching, automatic meeting booking and proposal emails are planned/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/fictional contact with email sending disabled/)).toBeInTheDocument();
    expect(
      screen.getAllByText('AsterByte Solutions is a fictional demonstration consultancy.'),
    ).toHaveLength(1);
  });
  it('explains immediate customer response and the actual cascading voice stack, not a second marketing hero', () => {
    window.history.replaceState({}, '', '/demo');
    const { container } = render(<App />);
    expect(container.querySelector('.demo-hero')).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent('The work gets recorded.');
    expect(screen.getByText(/Sending an email can mean waiting days/)).toBeInTheDocument();
    expect(container).toHaveTextContent('Bolna’s orchestration');
    for (const name of ['Gemini 3.6 Flash', 'Deepgram Nova-3', 'Sarvam']) {
      expect(
        within(screen.getByRole('list', { name: 'Voice processing stages' })).getByText(name),
      ).toBeInTheDocument();
    }
    expect(screen.getByRole('navigation', { name: 'On this page' })).toBeInTheDocument();
  });
  it('switches between sales and support walkthroughs with keyboard access without starting a call', async () => {
    window.history.replaceState({}, '', '/demo');
    start.mockClear();
    const user = userEvent.setup();
    render(<App />);
    const sales = screen.getByRole('tab', { name: 'New customer' });
    const support = screen.getByRole('tab', { name: 'Returning customer' });
    expect(sales).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Ask permission to take it further');
    sales.focus();
    await user.keyboard('{ArrowRight}');
    expect(support).toHaveFocus();
    expect(support).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('production identity verification');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Automatic support-call scheduling');
    await user.keyboard('{Home}');
    expect(sales).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Automatic scheduling is planned');
    await user.tab();
    expect(screen.getByRole('tabpanel')).toHaveFocus();
    expect(start).not.toHaveBeenCalled();
  });
  it('opens and closes the mobile navigation with semantic controls', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByRole('navigation', { name: 'Mobile navigation' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('navigation', { name: 'Mobile navigation' })).not.toBeInTheDocument();
  });
  it('requires deliberate consent before starting and does not start on render', async () => {
    start.mockClear();
    const user = userEvent.setup();
    render(<App />);
    const button = screen.getByRole('button', { name: 'Start a conversation' });
    expect(button).toBeDisabled();
    expect(start).not.toHaveBeenCalled();
    await user.click(screen.getByRole('checkbox', { name: /I agree to microphone/ }));
    await user.click(button);
    expect(start).toHaveBeenCalledWith(true);
  });
  it('exposes policy details without booking, email or contact-form controls', async () => {
    render(<App />);
    await userEvent.setup().click(screen.getByText('Will I own the source code?'));
    expect(screen.getByText(/Your custom code is handed over/)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Book|Send email|Submit/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Administrator access/ })).toHaveAttribute(
      'href',
      '/admin',
    );
  });
});

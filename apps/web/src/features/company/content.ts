// Public presentation only. Curated from approved v1.1 knowledge Markdown; never import company-data.json.
export const services = [
  {
    name: 'Business websites',
    category: 'Web',
    description:
      'A clear, responsive home for your business. Up to five pages and an inquiry form.',
    price: '₹15,000–35,000',
    timing: '1–2 weeks',
    icon: 'web',
  },
  {
    name: 'Full-stack products',
    category: 'Product',
    description:
      'Turn your first release into working software, with sign-in, roles and up to three core workflows.',
    price: '₹80,000–2,00,000',
    timing: '4–8 weeks',
    icon: 'product',
  },
  {
    name: 'CRMs & business tools',
    category: 'Operations',
    description:
      'Bring leads, tasks, permissions and everyday reporting into one useful application.',
    price: '₹70,000–1,80,000',
    timing: '4–8 weeks',
    icon: 'business',
  },
  {
    name: 'Workflow automation',
    category: 'Automation',
    description:
      'Less copying between tools. One well-defined workflow connecting up to two existing systems.',
    price: '₹15,000–50,000',
    timing: '1–3 weeks',
    icon: 'automation',
  },
  {
    name: 'Practical AI',
    category: 'AI',
    description:
      'An assistant or document-search pilot built around one approved knowledge collection and one channel.',
    price: '₹35,000–1,00,000',
    timing: '2–5 weeks',
    icon: 'ai',
  },
  {
    name: 'API integrations',
    category: 'Integrations',
    description:
      'Connect one documented API to an agreed workflow, with clear handling when something fails.',
    price: '₹10,000–35,000',
    timing: '1–2 weeks',
    icon: 'integration',
  },
] as const;
export const additionalPricing = [
  [
    'Content-managed website',
    'Up to 12 pages, editable content and basic analytics',
    '₹35,000–75,000',
    '2–4 weeks',
  ],
  [
    'Dedicated full-stack developer',
    'Up to 160 working hours per month; capacity agreed ahead',
    '₹75,000–1,25,000/month',
    'Availability confirmed',
  ],
  [
    'Technical consultation',
    'Architecture, feasibility or workflow review',
    '₹1,000–2,000/hour',
    'Scheduled separately',
  ],
  [
    'Optional maintenance',
    'Up to 5 hours/month of proactive monitoring and small improvements',
    '₹5,000–12,000/month',
    'Monthly plan',
  ],
];
export const projects = [
  {
    name: 'DispatchPro',
    category: 'Logistics · Business application',
    client: 'SwiftRoute Logistics',
    illustration: 'dispatch',
    headline: 'One delivery. One shared record.',
    problem:
      'Delivery requests, courier assignments and status updates were scattered across manual processes.',
    solution:
      'A multi-role logistics application with consistent pricing, courier assignment, tracking and OTP delivery confirmation.',
    outcome:
      'Customers, couriers and administrators work from a shared delivery record, with clearer operational handoffs.',
    tags: ['Web application', 'Workflow design', 'Integrations'],
  },
  {
    name: 'FormPilot',
    category: 'Automation · Browser extension',
    client: 'NextStep Career Services',
    illustration: 'forms',
    headline: 'Repeat the process. Not the typing.',
    problem: 'Candidates repeatedly entered the same details into placement and application forms.',
    solution:
      'A browser extension matches supported fields to a saved profile and reusable corrections, with AI-assisted drafts for review.',
    outcome:
      'Less repeated entry, reusable corrections and a clear review step for answers that need personal judgment.',
    tags: ['Automation', 'Chrome extension', 'Human review'],
  },
  {
    name: 'Draftly',
    category: 'AI · Editorial workflow',
    client: 'Blueframe Digital',
    illustration: 'editorial',
    headline: 'AI-assisted content. Human-approved.',
    problem:
      'A marketing team needed a repeatable way to turn briefs into content while preserving brand rules.',
    solution:
      'A coordinated research, writing and brand-checking workflow where editors inspect, edit, reject or retry drafts.',
    outcome:
      'Consistent review steps and clearer handoffs, with human approval before publication.',
    tags: ['AI workflows', 'Content tools', 'Review interface'],
  },
] as const;
export const process = [
  {
    title: 'Understand what matters.',
    body: 'We start with your people, your current process and the problem worth solving. A complete specification is not required.',
  },
  {
    title: 'Shape the first release.',
    body: 'Agree the essential workflows, scope, assumptions and acceptance criteria. Your proposal confirms the price and schedule.',
  },
  {
    title: 'Build it together.',
    body: 'Review designs and working demonstrations at agreed milestones. Test the real workflows before acceptance.',
  },
  {
    title: 'Hand over. Stay supported.',
    body: 'Receive your custom source code, setup instructions and a walkthrough. Qualifying development bugs are fixed free for the product’s lifetime.',
  },
];
export const faqs = [
  {
    question: 'Do I need a technical specification to get started?',
    answer:
      'No. Start with the business problem, who uses the process and what you want to improve. We help define the smallest useful first release, including the workflows, budget and constraints that matter.',
  },
  {
    question: 'Will I own the source code?',
    answer:
      'Client-specific custom code belongs to you under the project terms and is handed over after agreed payments are complete. Pre-existing reusable tools and third-party components keep their own ownership and licenses. You also receive agreed setup instructions, documentation and a handover session.',
  },
  {
    question: 'How many revisions are included?',
    answer:
      'Websites include two consolidated revision rounds and up to six hours of small refinements within 90 days of handover. Business apps, MVPs and AI pilots include three rounds and up to twelve refinement hours within 90 days. Revisions stay within the agreed scope; new features are estimated separately. Bug fixes do not consume these allowances.',
  },
  {
    question: 'What does “lifetime development bug fixes” mean?',
    answer:
      'We correct reproducible defects in our delivered custom code that fail the written acceptance criteria in the supported environment, free for the lifetime of that delivered product. No maintenance subscription is required. New features, changed requirements, third-party changes, provider outages and infrastructure charges are excluded. Lifetime coverage does not mean immediate or 24/7 staffing.',
  },
  {
    question: 'Are these fixed prices and delivery promises?',
    answer:
      'The prices are indicative first-release budgets in INR, not binding quotations. Final scope, dependencies, schedule and payment terms are confirmed in your proposal. Hosting, domains, subscriptions, AI usage and applicable taxes are extra unless included. Build time begins after scope approval, initial payment and required content or access.',
  },
  {
    question: 'What happens when I start a voice conversation?',
    answer:
      'You speak with our AI representative in your browser. Ask about services or explain a project idea. If you choose to leave a project inquiry, the representative should confirm your requirements and contact details before saving them. A conversation is not a booking or a delivery commitment. Please do not share passwords, OTPs or sensitive records.',
  },
];

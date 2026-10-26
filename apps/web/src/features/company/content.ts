// Public presentation only; never import company-data.json.
// Focused starter estimates sit within the approved broader service ranges, not historical project costs.
export const services = (
  [
    {
      name: 'Business websites',
      category: 'Web',
      description:
        'Help customers find your business, understand your services and send an enquiry. Includes up to five responsive pages.',
      price: '₹15,000–25,000',
      startingPrice: 15000,
      timing: '1–2 weeks',
      icon: 'web',
    },
    {
      name: 'Custom web applications',
      category: 'Product',
      description:
        'Launch a first version of your product with user accounts, an admin area and the essential features your customers need.',
      price: '₹80,000–1,50,000',
      startingPrice: 80000,
      timing: '4–8 weeks',
      icon: 'product',
    },
    {
      name: 'CRMs & business tools',
      category: 'Operations',
      description:
        'Keep customer enquiries, sales follow-ups and team tasks in one place instead of scattered spreadsheets and messages.',
      price: '₹70,000–1,20,000',
      startingPrice: 70000,
      timing: '4–8 weeks',
      icon: 'business',
    },
    {
      name: 'Workflow automation',
      category: 'Automation',
      description:
        'Stop entering the same information twice. Automatically move records, update reports or route requests between two tools.',
      price: '₹15,000–30,000',
      startingPrice: 15000,
      timing: '1–3 weeks',
      icon: 'automation',
    },
    {
      name: 'AI assistants & search',
      category: 'AI',
      description:
        'Help customers get answers or help staff find information in your documents. Start with one use case and a reviewed knowledge base.',
      price: '₹35,000–60,000',
      startingPrice: 35000,
      timing: '2–5 weeks',
      icon: 'ai',
    },
    {
      name: 'API integrations',
      category: 'Integrations',
      description:
        'Connect your website or business software to an existing service so information reaches the team that needs it.',
      price: '₹10,000–20,000',
      startingPrice: 10000,
      timing: '1–2 weeks',
      icon: 'integration',
    },
  ] as const
).toSorted((a, b) => a.startingPrice - b.startingPrice);
export const additionalPricing = [
  [
    'Content-managed website',
    'Up to 12 pages, editable content and basic analytics',
    '₹35,000–55,000',
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
    name: 'FormPilot',
    category: 'Form automation',
    client: 'NextStep Career Services',
    illustration: 'forms',
    startingPrice: 15000,
    headline: 'Fill application forms without starting from scratch.',
    problem: 'Candidates were typing the same personal details into every application form.',
    solution:
      'A browser extension fills supported fields from a saved profile and remembers corrections. Candidates review personal answers before submitting.',
    outcome: 'Routine details can be reused, while candidates stay in control of what they submit.',
    tags: ['Browser extension', 'Saved profiles', 'Form filling'],
  },
  {
    name: 'LeadBridge',
    category: 'CRM & sales management',
    client: 'BrightPath Services',
    illustration: 'crm',
    startingPrice: 70000,
    headline: 'Know who owns each lead and what happens next.',
    problem:
      'A sales team needed one place to manage enquiries, follow-ups and progress towards a sale.',
    solution:
      'A custom CRM with lead ownership, follow-up tasks, conversation notes and a shared sales pipeline.',
    outcome:
      'Sales staff can see their next actions. Managers can review the pipeline without collecting separate updates.',
    tags: ['Lead tracking', 'Follow-up tasks', 'Sales reports'],
  },
  {
    name: 'DispatchPro',
    category: 'Logistics · Business application',
    client: 'SwiftRoute Logistics',
    illustration: 'dispatch',
    startingPrice: 80000,
    headline: 'Manage deliveries from booking to doorstep.',
    problem:
      'Delivery requests, courier assignments and status updates were scattered across manual processes.',
    solution:
      'One application for customers, couriers and operations staff, with delivery quotes, courier assignments, tracking and OTP confirmation.',
    outcome:
      'Customers can follow deliveries, couriers know their assignments and operations staff can manage exceptions in one system.',
    tags: ['Web application', 'Workflow design', 'Integrations'],
  },
].sort((a, b) => a.startingPrice - b.startingPrice);
export const process = [
  {
    title: 'Tell us what needs to improve',
    body: 'Show us how your team works today, where time is being lost and what you want to change. You do not need a technical brief.',
  },
  {
    title: 'Agree on the work and budget',
    body: 'We suggest an approach, explain the trade-offs and put the features, cost and delivery plan in a proposal for your approval.',
  },
  {
    title: 'Review the software as we build',
    body: 'You see working versions at agreed stages, give feedback and test the tasks your team will actually use.',
  },
  {
    title: 'Launch with help from our team',
    body: 'We hand over your custom source code, setup instructions and a walkthrough. Qualifying bugs in the delivered code are covered for the product’s lifetime.',
  },
];
export const faqs = [
  {
    question: 'Do I need a technical specification to get started?',
    answer:
      'No. Tell us what your business does, what is not working and who will use the software. We will help you work out the features, budget and next steps.',
  },
  {
    question: 'Will I own the source code?',
    answer:
      'Yes. Your custom code is handed over after the agreed payments are complete, with setup instructions and a walkthrough. Existing reusable tools and third-party components keep their own licences.',
  },
  {
    question: 'How many revisions are included?',
    answer:
      'Websites include two feedback rounds, plus up to six hours of small changes within 90 days of handover. Business apps and AI pilots include three rounds and up to twelve hours. These cover changes within the agreed scope; new features are quoted separately. Bug fixes do not use up your revision allowance.',
  },
  {
    question: 'What does “lifetime development bug fixes” mean?',
    answer:
      'If our delivered code does not do what the written scope says it should, we fix qualifying bugs for the lifetime of that product. You do not need a maintenance subscription for this. New features, third-party changes, hosting costs and provider outages are separate. This is not a promise of instant or 24/7 support.',
  },
  {
    question: 'Are these fixed prices and delivery promises?',
    answer:
      'These are estimates for smaller starter projects, not fixed quotes. More features or complex integrations can cost more. We confirm the scope, price and schedule in a proposal before work starts. Hosting, domains, subscriptions, AI usage and taxes are extra unless included.',
  },
  {
    question: 'What happens when I start a voice conversation?',
    answer:
      'You speak with our AI representative in your browser. Ask about our services, explain an idea or report a product issue. It confirms your details before saving a request. Speaking to the representative does not book a meeting or commit you to a project. Please do not share passwords, OTPs or sensitive records.',
  },
];

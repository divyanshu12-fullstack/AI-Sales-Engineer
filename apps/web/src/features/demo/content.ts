// Add the owner's published HTTPS pitch-video URL here when it is ready. No invented video link.
export const pitchVideoUrl: string = '';

// Read-only verified against the existing Bolna agent. Updating this copy does not change the agent.
export const voiceStack = [
  {
    name: 'Deepgram Nova-3',
    role: 'Speech to text',
    description: 'Turns the customer’s speech into text.',
  },
  {
    name: 'Gemini 3.6 Flash',
    role: 'Language model',
    description: 'Understands the request, decides what to ask and uses the available tools.',
  },
  {
    name: 'Sarvam',
    role: 'Text to speech',
    description: 'Turns the agent’s response back into spoken audio.',
  },
];

export const customerJourneys = [
  {
    id: 'sales',
    tab: 'New customer',
    title: 'Help a prospective customer work out what to build',
    introduction:
      'A customer may know what is slowing their business down without knowing which software they need. The agent starts with that problem—not a list of technical questions.',
    example:
      '“We get enquiries on WhatsApp, but our sales team keeps missing follow-ups. Could you build something to help?”',
    steps: [
      {
        title: 'Listen to the requirement',
        body: 'Ask how the business works, who would use the software and what is going wrong. Use details already shared instead of making the customer repeat them.',
      },
      {
        title: 'Suggest a practical solution',
        body: 'Use the company’s services, product knowledge and indicative pricing to discuss a realistic first version—for example, a CRM with lead owners and follow-up reminders.',
      },
      {
        title: 'Understand whether the project is a good fit',
        body: 'Clarify the important features, expected timing and budget where useful. The aim is to understand a potential project, not to pressure someone into leaving their details.',
      },
      {
        title: 'Ask permission to take it further',
        body: 'If the customer wants to continue, confirm the requirements and contact details, then save a project enquiry for the team. A general question does not need to become a lead.',
      },
      {
        title: 'Offer a real consultation slot',
        body: 'With permission, check the team’s actual availability and offer only real times. The customer chooses a slot; the agent reserves it and sends a confirmation link to the email on the enquiry.',
      },
    ],
    outcome:
      'The team receives a project enquiry and, when the customer agrees, a reserved consultation slot. The meeting stays “confirmation pending” until the customer confirms through the emailed link.',
    next: 'Email confirmation is implemented. Google Calendar event creation and a Google Meet link are planned as the next integration; the demo does not claim either exists yet.',
  },
  {
    id: 'support',
    tab: 'Returning customer',
    title: 'Help an existing customer report a problem and get support',
    introduction:
      'A customer whose software is not working needs someone to understand the issue now. The agent can hear the problem, check product guidance and get a useful report to the team.',
    example:
      '“Our appointment list is empty and the receptionist cannot see today’s bookings. It was working yesterday.”',
    steps: [
      {
        title: 'Understand what has gone wrong',
        body: 'Listen to the symptoms and ask only useful follow-up questions: what happens, when it started and whether it is stopping the team from working.',
      },
      {
        title: 'Find the relevant product',
        body: 'Match the demo project and customer codes so the report is recorded against the right project. These codes allow demo issue intake; they are not production identity verification.',
      },
      {
        title: 'Offer relevant guidance or record the issue',
        body: 'Check the reviewed product documentation when guidance is useful. If the customer wants the issue raised, save a support ticket with the details they have already given.',
      },
      {
        title: 'Keep the customer informed',
        body: 'The team can review the ticket and record a resolution in the dashboard. Acknowledgement and resolution emails go to the registered contact when email sending is enabled.',
      },
    ],
    outcome:
      'The customer has a recorded support request rather than an unanswered message. Staff receive the issue details and can track the investigation and resolution.',
    next: 'For issues that need a discussion with the team, a consent-based video-call handoff is part of the intended workflow. Automatic support-call scheduling and access to private conversation history are not implemented in this demo.',
  },
] as const;

export const scenarios = [
  {
    number: '01',
    title: 'Bring a new project idea',
    time: 'About 3–5 minutes',
    intro: 'You run a business and want better software, but you do not have a technical brief.',
    say: 'I run a small service business. Our enquiries come through WhatsApp and we keep missing follow-ups. I want a simple CRM for three people.',
    steps: [
      'Start a call and describe the problem in your own words. Let the representative ask about the details it needs.',
      'Ask what a first version could include. You can mention a budget, team size or target date if you have one.',
      'Ask it to save your enquiry. Give a test name and an email or phone you are comfortable using, then confirm the details.',
      'If you want a consultation, choose one of the real slots offered. A confirmation link is emailed; the dashboard remains pending until you confirm it.',
    ],
    result:
      'The project inquiry appears under Project inquiries. An agreed consultation appears under Meetings as pending confirmation until the customer confirms the email link. After the call is processed, Calls shows its summary and available extracted details.',
    note: 'Use an email inbox you control if you choose to test email confirmation. Google Calendar event creation and Google Meet links are not implemented yet.',
  },
  {
    number: '02',
    title: 'Report a problem with a product',
    time: 'About 3–5 minutes',
    intro: 'You are an existing customer whose appointment system has stopped showing bookings.',
    say: 'Our ClinicFlow appointment list is empty, so the receptionist cannot see today’s bookings. It started this morning. Please raise a support ticket.',
    steps: [
      'Start a new call and describe the issue. Use demo project code 2001 and customer code 1001 when asked.',
      'Answer any useful follow-up questions. Explain what you can see and how it affects your team; you do not need to diagnose the cause.',
      'Ask it to record the issue if you have not already. After it confirms the save and offers more help, say “No, thanks.”',
    ],
    result:
      'A real demo ticket appears in Support tickets with the issue details and assigned engineer, when available. An administrator can record a resolution and inspect the email outcome.',
    note: 'The published demo codes use a fictional contact with email sending disabled. To test acknowledgement and resolution emails, ask the project owner for an inbox-enabled demo account. Codes allow demo issue intake, not access to private customer history.',
  },
  {
    number: '03',
    title: 'Ask before you decide',
    time: 'About 1–2 minutes',
    intro:
      'You just want to know whether the consultancy can help. No lead form or support codes needed.',
    say: 'What does your CRM help a sales team do? Can you explain the follow-up process without technical terms?',
    steps: [
      'Start a call and ask about services, previous work or a supported product.',
      'Ask a follow-up question, or ask it to explain something more simply.',
      'End the conversation when you have your answer. You do not have to leave contact details or create a ticket.',
    ],
    result:
      'The representative answers from the company knowledge base. The dashboard can show the call and any knowledge searches. A general question should not become an unwanted sales enquiry.',
    note: 'Try English first. The prompt also supports Hindi/Hinglish, but recognition quality still needs a human language test.',
  },
];

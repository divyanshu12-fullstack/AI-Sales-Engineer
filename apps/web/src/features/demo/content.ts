// Read-only verified against the existing Bolna agent. Updating this copy does not change the agent.
export const voiceStack = [
  {
    name: 'Sarvam Saaras v4',
    role: 'Speech to text',
    description: 'Turns the customer’s speech into text.',
  },
  {
    name: 'Gemini 3.6 Flash',
    role: 'Language model',
    description: 'Understands the request, decides what to ask and uses the available tools.',
  },
  {
    name: 'Sarvam Bulbul v3',
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
    details:
      'The reservation starts as confirmation pending. After the customer confirms through the emailed link, the app creates the Google Calendar event and Meet link, then sends a follow-up email with the meeting details.',
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
    details:
      'Support tickets can be created and reviewed in the dashboard. The demo does not schedule support calls or expose private customer history; the published project and customer codes are only for scoped demo ticket intake.',
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
      'If you want a consultation, choose one of the available slots. Open the confirmation email and confirm the reservation; the app then creates the Calendar event and Meet link and sends a follow-up email with the details.',
    ],
    result:
      'The project enquiry appears under Project inquiries. The meeting first appears as pending confirmation; after confirmation, it is marked confirmed and its Google Calendar event and Meet link are emailed to the attendee. Calls shows the summary and available extracted details after processing.',
    note: 'Use an inbox you control to receive the reservation link and the later Calendar/Meet details. Email submission being accepted does not guarantee delivery to the inbox.',
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
    note: 'English/Hinglish is the default. The caller can explicitly ask to continue in Marathi, Bengali, Telugu, or Kannada. The voice agent does not automatically switch languages.',
  },
  {
    number: '04',
    title: 'Continue in another language',
    time: 'About 2–3 minutes',
    intro:
      'The call begins in English/Hinglish. The representative changes language only after the caller explicitly asks.',
    say: 'Please speak in Marathi. मला एका छोट्या CRM बद्दल माहिती हवी आहे.',
    steps: [
      'Start a call and request Marathi, Bengali, Telugu, or Kannada. You can ask in English or use a phrase such as “দয়া করে বাংলায় বলুন”, “దయచేసి తెలుగులో మాట్లాడండి”, or “ದಯವಿಟ್ಟು ಕನ್ನಡದಲ್ಲಿ ಮಾತನಾಡಿ”.',
      'Ask a company or product question in that language. You can keep familiar software terms, names, dates and numbers as they are.',
      'To change language again, explicitly ask. A stray English word or code-mixed sentence does not request a language change.',
    ],
    result:
      'Sarvam Saaras v4 transcribes and Sarvam Bulbul v3 speaks English and the four requested Indian languages. The same Shubh voice is used across them, and the existing enquiry, support and consultation tools remain available.',
    note: 'There is no language selector. An explicit caller request is required for each language change.',
  },
];

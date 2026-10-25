export const supportTools = (origin, token) => {
  const field = (description) => ({ type: 'string', description });
  const define = (name, description, path, properties, required) => ({
    definition: {
      name,
      key: 'custom_task',
      description,
      parameters: { type: 'object', properties, required },
      pre_call_message: 'Let me check that.',
    },
    configuration: {
      url: `${origin}/api/bolna/tools/${path}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      api_token: `Bearer ${token}`,
      param: Object.fromEntries(Object.keys(properties).map((key) => [key, `%(${key})s`])),
    },
  });
  return [
    define(
      'lookup_support_project',
      'Use only for support on an existing delivered project. Ask for its four-digit project code after understanding intent. If the result asks for a customer code, collect that four-digit code and retry. Phone context is checked server-side only when genuine runtime execution metadata exists. Never ask for verification email/OTP. Result is demo intake scope, NOT verified identity or general private database access. Retain support_token internally.',
      'lookup-support-project',
      {
        project_code: field(
          'Four-digit project code from the caller, e.g. spoken digits normalized without spaces. Do not guess.',
        ),
        customer_code: field(
          'Four-digit customer code if already supplied or requested by a prior lookup result; otherwise empty string.',
        ),
        execution_id: field(
          'Actual Bolna runtime execution UUID only if available in trusted call context; otherwise empty string. Never collect it from the caller or invent one.',
        ),
      },
      ['project_code', 'customer_code', 'execution_id'],
    ),
    define(
      'create_support_ticket',
      'Save the caller-confirmed support issue using support_token returned by lookup_support_project. Include relevant details naturally collected; do NOT request technical logs or a questionnaire. Use one submission_key and reuse identical data on retry. This creates a real ticket and queues its registered-contact acknowledgement email; never claim email success unless email_status is accepted. Never use for a new sales inquiry. The caller cannot choose email recipients or mark an issue resolved.',
      'create-support-ticket',
      {
        support_token: field(
          'Exact opaque token from the successful support lookup. Never speak it.',
        ),
        submission_key: field(
          'Unique 8-120 character letters/digits/underscore/hyphen key for this request; retain and reuse on retry.',
        ),
        confirmed: {
          type: 'string',
          enum: ['yes'],
          description: 'yes after the caller requests or agrees to raising this described issue.',
        },
        title: field('Concise natural issue title, at least 3 characters.'),
        description: field(
          'Faithful issue notes from everything relevant the caller described, at least 10 characters. Do not invent missing details or ask the caller to write a summary.',
        ),
      },
      ['support_token', 'submission_key', 'confirmed', 'title', 'description'],
    ),
  ];
};

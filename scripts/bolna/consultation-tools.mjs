const field = (description) => ({ type: 'string', description });
const define = (origin, token, name, description, path, properties, required) => ({
  definition: {
    name,
    key: 'custom_task',
    description,
    parameters: { type: 'object', properties, required },
    pre_call_message: 'Let me check the diary.',
  },
  configuration: {
    url: `${origin}/api/bolna/tools/${path}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    api_token: `Bearer ${token}`,
    param: Object.fromEntries(Object.keys(properties).map((key) => [key, `%(${key})s`])),
  },
});

export const consultationTools = (origin, token) => [
  define(
    origin,
    token,
    'check_consultation_availability',
    'Use only for a new-customer consultation after the caller has described their requirement. Returns real 30-minute video-consultation slots in India time (Mon-Sat, 11:00-17:30 IST) with the matching consultant. Offer only the returned slots; never invent or adjust a time. Empty slots mean no availability in the next 14 days. Do not call this for support issues.',
    'check-consultation-availability',
    {
      topic: field(
        'Concise summary of the caller’s project or problem used to match the right consultant, at least 5 characters. Never include secrets.',
      ),
      preferred_date: field(
        'Optional date the caller prefers in YYYY-MM-DD (Asia/Kolkata), otherwise empty string. Do not guess a date.',
      ),
      preferred_period: {
        type: 'string',
        enum: ['any', 'morning', 'afternoon'],
        description: 'Caller’s preferred part of the day, or any if they do not mind.',
      },
    },
    ['topic', 'preferred_date', 'preferred_period'],
  ),
  define(
    origin,
    token,
    'schedule_consultation',
    'Reserve one exact slot returned by check_consultation_availability, only after the caller chooses it and explicitly agrees. Pass the exact start_at, consultant_id and topic from that result. The project inquiry must already be saved with create_project_inquiry. This reserves the slot and queues a real confirmation email; the meeting stays pending until the customer confirms through the emailed link. If result is email_required, ask for the best email and retry. If result is slot_unavailable, offer only its returned alternatives. Never claim the meeting is confirmed or that a calendar invite/video link exists. Report email_status honestly: accepted means the email provider accepted it, queued means not sent yet, failed means not sent. Reuse the same submission_key for retries of the same chosen slot.',
    'schedule-consultation',
    {
      submission_key: field(
        'Unique 8-120 character letters/digits/underscore/hyphen key for this reservation; retain and reuse it on retry of the same slot.',
      ),
      inquiry_reference: field(
        'Exact inquiry reference returned by create_project_inquiry, e.g. INQ-…',
      ),
      consultant_id: field(
        'Exact consultant_id returned with the chosen availability slot. Never speak it.',
      ),
      start_at: field(
        'Exact ISO start_at returned with the chosen availability slot. Do not alter it.',
      ),
      topic: field(
        'The same concise requirement topic used for availability, at least 5 characters.',
      ),
      confirmed: {
        type: 'string',
        enum: ['yes'],
        description:
          'yes only after the caller explicitly chooses this slot and agrees to the consultation.',
      },
      email: field(
        'Caller-provided email address for the confirmation link, or empty string if the saved inquiry already has one. Never invent an address.',
      ),
      notes: field(
        'Optional short context for the consultant, or empty string. Do not include sensitive data.',
      ),
    },
    [
      'submission_key',
      'inquiry_reference',
      'consultant_id',
      'start_at',
      'topic',
      'confirmed',
      'email',
      'notes',
    ],
  ),
];

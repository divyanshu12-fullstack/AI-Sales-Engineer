const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const privacyPage = (contactEmail?: string): string => {
  const contact = contactEmail
    ? `<a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a>`
    : '[ADD CONTACT EMAIL]';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="How AsterByte Solutions handles consultation, voice demo, and Google Calendar information." />
    <meta name="theme-color" content="#ffffff" />
    <link rel="canonical" href="https://asterbyte.divyanshu.engineer/privacy" />
    <link rel="stylesheet" href="/privacy.css" />
    <title>Privacy Policy — AsterByte Solutions</title>
  </head>
  <body>
    <main class="privacy-page">
      <a class="privacy-back" href="/">AsterByte Solutions</a>
      <article>
        <h1>Privacy Policy</h1>
        <p class="privacy-updated">Last updated: October 29, 2026</p>
        <p>This policy explains what information this website handles, why it is used, and how to ask for deletion. The site is a software demonstration. Please do not submit passwords, payment information, or other sensitive information through a consultation or voice call.</p>

        <section>
          <h2>1. Who operates the site</h2>
          <p>This demonstration site is operated under the name AsterByte Solutions by the project owner. For privacy questions or deletion requests, contact ${contact}.</p>
        </section>
        <section>
          <h2>2. Information we handle</h2>
          <p><strong>Consultations:</strong> If you request a consultation, the application handles your name, email address, selected time, consultation subject, booking reference, and booking status. If the appointment is confirmed, its time and contact details are used to create the calendar invitation.</p>
          <p><strong>Voice demo:</strong> If you choose to start a voice call, your browser sends call audio to the configured voice service so it can conduct the conversation. The application may receive and store the resulting transcript, summary, call duration, and details extracted from the conversation. When a recording is available, an authenticated administrator can request playback in the dashboard; the application streams it from Bolna on demand and does not store the audio recording in its own database. Voice providers may process or retain audio and conversation data under their own service settings and terms.</p>
          <p><strong>Service operation:</strong> The site and its hosting or service providers may process basic technical information needed to deliver the website, protect it from abuse, authenticate administrators, and troubleshoot failures.</p>
        </section>
        <section>
          <h2>3. Google Calendar data</h2>
          <p>When enabled, the consultation integration connects to the project owner’s Google Calendar after a customer confirms a booking. It requests the <code>https://www.googleapis.com/auth/calendar.events</code> permission to create a consultation event and request a Google Meet link. It does not request Google FreeBusy permission, list the owner’s calendar, or read unrelated calendar events.</p>
          <p>To create the event, the application sends Google the consultation title, consultant name and booking reference, start and end times, time zone, and attendee email address. Google returns the event identifier, event link, Meet link, and conference status. If a network retry occurs after an event may already have been created, the application may look up that same event by its identifier; it does not search for or retrieve unrelated events.</p>
          <p>The event identifier, event link, Meet link, and sync status are saved with the booking in the application database. When the integration is configured, its Google OAuth refresh token is kept in server-side application settings, and the short-lived access token is held by the server while needed. These credentials are not sent to the visitor’s browser.</p>
          <p>Google Calendar data is used only to schedule the requested consultation, deliver the calendar invitation and Meet details, and support that booking. The Calendar data is not sold, used for advertising, or used for unrelated profiling. Google Calendar data is not provided to the voice agent. The application’s use and transfer of information received from Google APIs complies with the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including its Limited Use requirements.</p>
          <p>Google processes and stores the calendar event under the Google account’s settings and Google’s terms. The intended attendee may receive a calendar invitation, and people with access to that event under the account’s sharing settings may see its details.</p>
        </section>
        <section>
          <h2>4. How information is used</h2>
          <p>Information is used to respond to a request, reserve and confirm a consultation, send booking messages, create its calendar event when configured, operate the voice demo, and maintain the security and reliability of the service. A consultant may use the details needed to handle the consultation. Conversation information is used to process and review the demo interaction.</p>
        </section>
        <section>
          <h2>5. Service providers and sharing</h2>
          <p>We do not sell personal information. Information is shared only as needed to operate the features you use. The application uses Supabase for its database and administrator authentication, Microsoft Azure for hosting, Resend for transactional email, and Bolna for voice calls. The configured voice pipeline may also process call audio or conversation content through its speech and language providers, currently documented as Deepgram, Gemini, and Sarvam.</p>
          <p>Google receives the information needed to create the requested calendar event. A consultation attendee receives the calendar invitation and follow-up details. Service providers process information to provide their services and may handle it under their own privacy notices and service terms.</p>
        </section>
        <section>
          <h2>6. Retention and deletion</h2>
          <p>Application booking records, call transcripts, summaries, and extracted details are retained until you ask us to delete them; the application does not currently run a scheduled deletion process for these records. To request deletion, contact ${contact} and include enough information for us to locate the relevant booking or call. Do not send passwords or other sensitive information.</p>
          <p>For a booking deletion request, we will remove the corresponding application records and the matching Google Calendar event created for that booking. We will also submit deletion requests for related voice data to Bolna and the configured speech or language providers where their available controls or support processes permit. Provider-side deletion may be subject to each provider’s process and policies.</p>
        </section>
        <section>
          <h2>7. Cookies, analytics, and advertising</h2>
          <p>The application does not intentionally use advertising cookies or a separate analytics service. Hosting, authentication, or voice providers may use limited technical storage needed to provide, secure, or maintain their services.</p>
        </section>
        <section>
          <h2>8. Security</h2>
          <p>Connections to the site and its configured providers use HTTPS. Google OAuth credentials are kept in server-side settings and are not exposed to the website frontend. No online service can guarantee absolute security, so please avoid sharing information that is not needed for a demo or consultation.</p>
        </section>
        <section>
          <h2>9. Changes and contact</h2>
          <p>This notice may be updated when the application or its providers change. The date at the top shows when this text was last reviewed. For questions or deletion requests, contact ${contact}.</p>
        </section>
      </article>
    </main>
  </body>
</html>`;
};

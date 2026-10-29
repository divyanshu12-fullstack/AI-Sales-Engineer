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
    : '[your email]';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Privacy policy for AsterByte Solutions consultations and Google Calendar integration." />
    <meta name="theme-color" content="#20372f" />
    <link rel="canonical" href="https://asterbyte.divyanshu.engineer/privacy" />
    <link rel="stylesheet" href="/privacy.css" />
    <title>Privacy Policy | AsterByte Solutions</title>
  </head>
  <body>
    <main class="privacy-page">
      <a class="privacy-back" href="/">← AsterByte Solutions</a>
      <article>
        <p class="privacy-eyebrow">ASTERBYTE SOLUTIONS</p>
        <h1>Privacy Policy</h1>
        <p class="privacy-updated">Last updated: October 29, 2026</p>

        <section>
          <h2>What we collect</h2>
          <p>When you book a consultation, we collect your name, email address, and the meeting time you choose.</p>
        </section>
        <section>
          <h2>How we use it</h2>
          <p>We use this only to schedule and confirm your meeting, send you confirmation emails, and create a calendar event (including a Google Meet link) for it.</p>
        </section>
        <section>
          <h2>Google user data</h2>
          <p>Our app connects to the owner’s Google Calendar only to create and manage consultation events. It does not read, store, or share any other calendar data, and the use of information received from Google APIs follows the Google API Services User Data Policy, including its Limited Use requirements.</p>
        </section>
        <section>
          <h2>Sharing</h2>
          <p>We do not sell your data. It is shared only with the consultant handling your meeting and with the service providers needed to run the site (hosting, database, email).</p>
        </section>
        <section>
          <h2>Retention and deletion</h2>
          <p>You can ask us to delete your booking data at any time by emailing ${contact}.</p>
        </section>
        <section>
          <h2>Contact</h2>
          <p>${contact}</p>
        </section>
      </article>
    </main>
  </body>
</html>`;
};

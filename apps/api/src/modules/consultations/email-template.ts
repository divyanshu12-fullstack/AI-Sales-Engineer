const escapeHtml = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const meetingEmailTemplate = ({
  reference,
  title,
  consultantName,
  displayTime,
  durationMinutes,
  timezone,
  confirmUrl,
  expiresOn,
}: {
  reference: string;
  title: string;
  consultantName: string;
  displayTime: string;
  durationMinutes: number;
  timezone: string;
  confirmUrl: string;
  expiresOn: string;
}) => {
  const subject = `Confirm your consultation · ${displayTime}`;
  const text = `Please confirm your consultation\n\n${title}\n\nWith ${consultantName}\n${displayTime}\n${durationMinutes} minutes · ${timezone}\nReference: ${reference}\n\nYour slot is reserved. Confirm it here:\n${confirmUrl}\n\nThis link is valid until ${expiresOn}. If you do not confirm, the team will see that confirmation is still pending.\n\nAsterByte Solutions`;
  // Self-contained HTML: no remote fonts, images, pixels or scripts. The confirm control is a plain link.
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:24px 12px;background:#f6f7f3;color:#25362d;font-family:Arial,Helvetica,sans-serif"><table role="presentation" style="width:100%;max-width:580px;margin:0 auto;border-collapse:collapse"><tr><td style="padding:8px 8px 24px;font-size:17px;font-weight:bold">AsterByte Solutions</td></tr><tr><td style="padding:30px 26px;background:#ffffff;border:1px solid #e1e6dc;border-top:4px solid #32654f"><p style="margin:0 0 12px;color:#526b5c;font-size:12px">PROJECT CONSULTATION</p><h1 style="margin:0 0 18px;font-size:24px;line-height:1.35">Please confirm your consultation</h1><p style="margin:0 0 22px;font-size:15px;line-height:1.7">Your slot is reserved. Confirm so our team knows to expect you.</p><p style="margin:0;color:#61715f;font-size:12px">WHEN</p><p style="margin:6px 0 22px;font-size:17px;font-weight:bold;line-height:1.5">${escapeHtml(displayTime)}</p><h2 style="margin:0 0 6px;font-size:17px;line-height:1.5">${escapeHtml(title)}</h2><p style="margin:0 0 22px;font-size:14px;line-height:1.7">With ${escapeHtml(consultantName)} · ${durationMinutes} minutes · ${escapeHtml(timezone)}</p><p style="margin:0 0 24px"><a href="${escapeHtml(confirmUrl)}" style="display:inline-block;padding:13px 22px;background:#32654f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;border-radius:4px">Confirm this consultation</a></p><p style="margin:0 0 12px;font-size:12px;line-height:1.7;color:#61715f">If the button does not work, open this link:<br><span style="overflow-wrap:anywhere">${escapeHtml(confirmUrl)}</span></p><hr style="border:0;border-top:1px solid #e1e6dc;margin:24px 0"><p style="margin:0;font-size:13px;line-height:1.8;color:#52634e">Reference: ${escapeHtml(reference)}<br>This link is valid until ${escapeHtml(expiresOn)}. The slot stays reserved while confirmation is pending.</p></td></tr><tr><td style="padding:20px 8px;font-size:12px;line-height:1.7;color:#64725e">AsterByte Solutions · This is a service email about your consultation request.</td></tr></table></body></html>`;
  return { subject, text, html };
};

export const meetingCalendarEmailTemplate = ({
  reference,
  title,
  consultantName,
  displayTime,
  durationMinutes,
  timezone,
  calendarUrl,
  meetUrl,
}: {
  reference: string;
  title: string;
  consultantName: string;
  displayTime: string;
  durationMinutes: number;
  timezone: string;
  calendarUrl: string;
  meetUrl: string;
}) => {
  const subject = `Your consultation is confirmed · ${displayTime}`;
  const text = `Your consultation is confirmed\n\n${title}\nWith ${consultantName}\n${displayTime}\n${durationMinutes} minutes · ${timezone}\nReference: ${reference}\n\nJoin on Google Meet: ${meetUrl}\nView your Google Calendar event: ${calendarUrl}\n\nAsterByte Solutions`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:24px 12px;background:#f6f7f3;color:#25362d;font-family:Arial,Helvetica,sans-serif"><table role="presentation" style="width:100%;max-width:580px;margin:0 auto;border-collapse:collapse"><tr><td style="padding:8px 8px 24px;font-size:17px;font-weight:bold">AsterByte Solutions</td></tr><tr><td style="padding:30px 26px;background:#ffffff;border:1px solid #e1e6dc;border-top:4px solid #32654f"><p style="margin:0 0 12px;color:#526b5c;font-size:12px">CONSULTATION CONFIRMED</p><h1 style="margin:0 0 18px;font-size:24px;line-height:1.35">Your consultation is confirmed</h1><p style="margin:0 0 22px;font-size:15px;line-height:1.7">Google Calendar confirmed your event and Google Meet link.</p><p style="margin:0 0 6px;color:#61715f;font-size:12px">WHEN</p><p style="margin:0 0 18px;font-size:17px;font-weight:bold;line-height:1.5">${escapeHtml(displayTime)}</p><h2 style="margin:0 0 6px;font-size:17px;line-height:1.5">${escapeHtml(title)}</h2><p style="margin:0 0 22px;font-size:14px;line-height:1.7">With ${escapeHtml(consultantName)} · ${durationMinutes} minutes · ${escapeHtml(timezone)}</p><p style="margin:0 0 14px"><a href="${escapeHtml(meetUrl)}" style="display:inline-block;padding:13px 22px;background:#32654f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;border-radius:4px">Join Google Meet</a></p><p style="margin:0 0 22px;font-size:14px;line-height:1.7">If the button does not work, open: <a href="${escapeHtml(meetUrl)}">${escapeHtml(meetUrl)}</a></p><p style="margin:0 0 24px;font-size:14px"><a href="${escapeHtml(calendarUrl)}">View the Google Calendar event</a></p><hr style="border:0;border-top:1px solid #e1e6dc;margin:24px 0"><p style="margin:0;font-size:13px;line-height:1.8;color:#52634e">Reference: ${escapeHtml(reference)}</p></td></tr><tr><td style="padding:18px 8px;color:#718071;font-size:12px">AsterByte Solutions</td></tr></table></body></html>`;
  return { subject, text, html };
};

const escapeText = (text: string) => escapeHtml(text);

export const meetingConfirmationPage = ({
  outcome,
  details,
  actionUrl,
  token,
}: {
  outcome: 'pending' | 'confirmed' | 'expired' | 'unavailable' | 'invalid';
  details?: {
    reference: string;
    title: string;
    time: string;
    consultantName: string;
    durationMinutes: number;
    timezone: string;
    expiresOn?: string;
  };
  actionUrl?: string;
  token?: string;
}) => {
  const heading = {
    pending: 'Confirm your consultation',
    confirmed: 'Your consultation is confirmed',
    expired: 'This confirmation link has expired',
    unavailable: 'This consultation is no longer available',
    invalid: 'This confirmation link is not valid',
  }[outcome];
  const message = {
    pending:
      'Your slot is reserved. Confirm it so our team knows to expect you. If you do not confirm, the dashboard will keep showing that confirmation is pending.',
    confirmed:
      'Thank you. The team can now see your confirmed consultation. You can close this page.',
    expired:
      'The reservation window for this link has passed. Please contact the team if you still need a consultation.',
    unavailable:
      'This meeting was cancelled or is no longer accepting confirmation. Please contact the team if you need another time.',
    invalid:
      'This link is incomplete or was not recognised. Please use the link from your confirmation email.',
  }[outcome];
  const detailRows = details
    ? `<dl style="margin:0 0 24px;display:grid;grid-template-columns:120px 1fr;gap:8px 14px;font-size:14px;line-height:1.6"><dt style="font-weight:bold;color:#52634e">When</dt><dd style="margin:0">${escapeText(details.time)}</dd><dt style="font-weight:bold;color:#52634e">Consultation</dt><dd style="margin:0">${escapeText(details.title)}</dd><dt style="font-weight:bold;color:#52634e">With</dt><dd style="margin:0">${escapeText(details.consultantName)}</dd><dt style="font-weight:bold;color:#52634e">Duration</dt><dd style="margin:0">${details.durationMinutes} minutes · ${escapeText(details.timezone)}</dd><dt style="font-weight:bold;color:#52634e">Reference</dt><dd style="margin:0">${escapeText(details.reference)}</dd></dl>`
    : '';
  const action =
    outcome === 'pending' && actionUrl && token
      ? `<form method="post" action="${escapeText(actionUrl)}"><input type="hidden" name="token" value="${escapeText(token)}"><button type="submit" style="display:inline-block;padding:13px 22px;background:#32654f;color:#ffffff;border:0;font-size:15px;font-weight:bold;border-radius:4px;cursor:pointer">Confirm this consultation</button></form>`
      : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeText(heading)} · AsterByte Solutions</title></head><body style="margin:0;padding:24px 12px;background:#f6f7f3;color:#25362d;font-family:Arial,Helvetica,sans-serif"><main style="max-width:560px;margin:32px auto;padding:30px 26px;background:#ffffff;border:1px solid #e1e6dc;border-top:4px solid #32654f"><p style="margin:0 0 18px;font-size:16px;font-weight:bold">AsterByte Solutions</p><h1 style="margin:0 0 16px;font-size:25px;line-height:1.35">${escapeText(heading)}</h1><p style="margin:0 0 22px;font-size:15px;line-height:1.75">${escapeText(message)}</p>${detailRows}${action}</main></body></html>`;
};

const escapeHtml = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
export const supportEmailTemplate = ({
  reference,
  title,
  description,
  resolution,
}: {
  reference: string;
  title: string;
  description: string;
  resolution?: string;
}) => {
  const resolved = resolution !== undefined;
  const heading = resolved
    ? 'An update on your support request'
    : 'We’ve received your support request';
  const introduction = resolved
    ? 'Our team has marked your request as resolved.'
    : 'Your issue has been recorded and passed to the team for review.';
  const next = resolved
    ? 'If the issue continues, quote your reference in your next support conversation.'
    : 'We’ll review it as quickly as possible and keep you informed. This acknowledgement does not mean the issue has been fixed.';
  const content = resolved ? resolution : description;
  const subject = `${resolved ? 'Resolution update' : 'Support request received'} · ${reference}`;
  const text = `${heading}\n\n${introduction}\n\nReference: ${reference}\n${title}\n\n${resolved ? 'Resolution' : 'Issue details'}\n${content}\n\n${next}\n\nAsterByte Solutions`;
  // Self-contained, small HTML with a plain-text alternative: no remote fonts, images, pixels or scripts.
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:24px 12px;background:#f6f7f3;color:#25362d;font-family:Arial,Helvetica,sans-serif"><table role="presentation" style="width:100%;max-width:580px;margin:0 auto;border-collapse:collapse"><tr><td style="padding:8px 8px 24px;font-size:17px;font-weight:bold">AsterByte Solutions</td></tr><tr><td style="padding:30px 26px;background:#ffffff;border:1px solid #e1e6dc;border-top:4px solid #32654f"><p style="margin:0 0 12px;color:#526b5c;font-size:12px">SUPPORT UPDATE</p><h1 style="margin:0 0 18px;font-size:24px;line-height:1.35">${heading}</h1><p style="margin:0 0 22px;font-size:15px;line-height:1.7">${introduction}</p><p style="margin:0;color:#61715f;font-size:12px">REFERENCE</p><p style="margin:6px 0 22px;font-family:monospace;font-size:15px">${escapeHtml(reference)}</p><h2 style="margin:0 0 14px;font-size:17px;line-height:1.5">${escapeHtml(title)}</h2><p style="margin:0 0 8px;font-size:12px;font-weight:bold;color:#61715f">${resolved ? 'RESOLUTION' : 'ISSUE DETAILS'}</p><div style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.8">${escapeHtml(content)}</div><hr style="border:0;border-top:1px solid #e1e6dc;margin:24px 0"><p style="margin:0;font-size:13px;line-height:1.8;color:#52634e">${next}</p></td></tr><tr><td style="padding:20px 8px;font-size:12px;line-height:1.7;color:#64725e">AsterByte Solutions · This is a service update about your support request.</td></tr></table></body></html>`;
  return { subject, text, html };
};

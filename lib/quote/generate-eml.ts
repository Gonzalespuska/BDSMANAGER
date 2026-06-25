"use client";

/**
 * Vygeneruje .eml súbor (RFC 822 multipart MIME) so správou + PDF prílohou.
 *
 * Keď user otvorí stiahnutý .eml na macOS / Windows / Linux → spustí sa
 * Mail.app / Outlook / Thunderbird s **predvyplneným**:
 *   - To (adresát)
 *   - Subject
 *   - Body (HTML + plain text)
 *   - Attachment (PDF)
 *
 * User len klikne SEND, nemusí nič dopisovať ani priložovať súbor.
 */
export interface EmlInput {
  from_email: string;
  from_name: string;
  to_email: string;
  to_name?: string;
  subject: string;
  body_text: string;
  body_html?: string;
  attachment: {
    filename: string;
    content_base64: string;
    mime_type: string;
  };
}

export function generateEml(input: EmlInput): Blob {
  const boundary = `----=_BDSManager_${Math.random()
    .toString(36)
    .slice(2)}_${Date.now()}`;

  const toHeader = input.to_name
    ? `"${input.to_name}" <${input.to_email}>`
    : input.to_email;

  const fromHeader = `"${input.from_name}" <${input.from_email}>`;

  // Helper: base64 encode UTF-8 string for header
  const encodeHeader = (s: string): string => {
    // ak má diakritiku, použij RFC2047 encoded-word
    if (/^[\x20-\x7E]*$/.test(s)) return s;
    const utf8 = new TextEncoder().encode(s);
    let bin = "";
    utf8.forEach((b) => (bin += String.fromCharCode(b)));
    return `=?UTF-8?B?${btoa(bin)}?=`;
  };

  const subjectEncoded = encodeHeader(input.subject);

  const date = new Date().toUTCString();
  const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@bdsmanager.local>`;

  // Plain text base64
  const textBase64 = btoa(
    String.fromCharCode(...new TextEncoder().encode(input.body_text)),
  );

  // HTML base64
  const htmlBase64 = input.body_html
    ? btoa(String.fromCharCode(...new TextEncoder().encode(input.body_html)))
    : null;

  let body = "";
  body += `From: ${fromHeader}\r\n`;
  body += `To: ${toHeader}\r\n`;
  body += `Subject: ${subjectEncoded}\r\n`;
  body += `Date: ${date}\r\n`;
  body += `Message-ID: ${messageId}\r\n`;
  body += `MIME-Version: 1.0\r\n`;
  body += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n`;
  body += `\r\n`;
  body += `This is a multi-part message in MIME format.\r\n`;

  // Inner: alternative (text + html)
  if (htmlBase64) {
    const altBoundary = `${boundary}_alt`;
    body += `--${boundary}\r\n`;
    body += `Content-Type: multipart/alternative; boundary="${altBoundary}"\r\n\r\n`;

    body += `--${altBoundary}\r\n`;
    body += `Content-Type: text/plain; charset="UTF-8"\r\n`;
    body += `Content-Transfer-Encoding: base64\r\n\r\n`;
    body += chunk76(textBase64) + `\r\n`;

    body += `--${altBoundary}\r\n`;
    body += `Content-Type: text/html; charset="UTF-8"\r\n`;
    body += `Content-Transfer-Encoding: base64\r\n\r\n`;
    body += chunk76(htmlBase64) + `\r\n`;

    body += `--${altBoundary}--\r\n`;
  } else {
    body += `--${boundary}\r\n`;
    body += `Content-Type: text/plain; charset="UTF-8"\r\n`;
    body += `Content-Transfer-Encoding: base64\r\n\r\n`;
    body += chunk76(textBase64) + `\r\n`;
  }

  // Attachment
  body += `--${boundary}\r\n`;
  body += `Content-Type: ${input.attachment.mime_type}; name="${input.attachment.filename}"\r\n`;
  body += `Content-Transfer-Encoding: base64\r\n`;
  body += `Content-Disposition: attachment; filename="${input.attachment.filename}"\r\n\r\n`;
  body += chunk76(input.attachment.content_base64) + `\r\n`;

  body += `--${boundary}--\r\n`;

  return new Blob([body], { type: "message/rfc822" });
}

/** RFC 2045: base64 content lines max 76 chars */
function chunk76(s: string): string {
  return (s.match(/.{1,76}/g) ?? []).join("\r\n");
}

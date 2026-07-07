/**
 * Zdielaný HTML email builder — pouziva /api/quote/send + /api/quote/resend
 * + prípadné budúce email endpointy.
 *
 * Splitne body na text + signaturu ("S pozdravom") a signaturu obalí do
 * brandového bloku s EPOXIDOVO.SK PNG logom (hosted na /epoxidovo-logo.png).
 */

/** HTML escape — bezpečné vloženie user contentu do HTML. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Konvertuje plain-text body na HTML email s brandovanou signatúrou.
 *
 * Rozdelí body na 2 časti:
 *   1) Text nad "S pozdravom," — normálne odstavce
 *   2) Signatúra (od "S pozdravom" nižšie) — obalíme do brand kartičky
 *      s EPOXIDOVO.SK obrázkom
 *
 * @param text Plain text body (agent-writable)
 * @param agentEmail Fallback email ak signatura v texte nema
 */
export function buildHtmlFromPlainText(
  text: string,
  agentEmail: string,
): string {
  const idx = text.indexOf("S pozdravom");
  const bodyPart = idx >= 0 ? text.slice(0, idx).trim() : text;
  const sigPart = idx >= 0 ? text.slice(idx).trim() : "";

  const bodyHtml = bodyPart
    .split(/\n\n+/)
    .map(
      (p) =>
        `<p style="margin: 0 0 14px 0; line-height: 1.6;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("\n");

  const sigLines = sigPart
    .split("\n")
    .filter((l) => l.trim() && !l.trim().match(/^S pozdravom,?$/i));
  const [maybeName, ...rest] = sigLines;
  const agentName = maybeName || "";
  const phoneLine = rest.find((l) => /^\+?\d/.test(l.trim()));
  const emailLine =
    rest.find((l) => l.includes("@")) || agentEmail || "info@epoxidovo.sk";
  const wwwLine =
    rest.find((l) => /^www\./i.test(l.trim())) || "www.epoxidovo.sk";

  return `<!DOCTYPE html>
<html lang="sk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EPOXIDOVO.SK</title>
</head>
<body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; background: #f8fafc;">
<div style="max-width: 640px; margin: 0 auto; background: #fff; padding: 32px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">

<!-- Body text -->
<div style="font-size: 15px; color: #1e293b;">
${bodyHtml}
</div>

<!-- Signature — brand block s EPOXIDOVO.SK logom -->
<div style="margin-top: 32px; padding-top: 20px; border-top: 2px solid #e2e8f0;">
  <div style="font-size: 15px; margin-bottom: 12px;">S pozdravom,</div>
  <div style="margin-bottom: 12px;"><img src="https://app.najcrm.sk/epoxidovo-logo.png" alt="EPOXIDOVO.SK" width="180" height="66" style="display: block; width: 180px; height: 66px; border: 0;"></div>
  <div style="font-size: 15px; font-weight: 700; color: #0f172a;">${escapeHtml(agentName)}</div>
  ${phoneLine ? `<div style="font-size: 14px; color: #475569; margin-top: 4px; font-variant-numeric: tabular-nums;">${escapeHtml(phoneLine.trim())}</div>` : ""}
  <div style="font-size: 14px; margin-top: 4px;"><a href="mailto:${escapeHtml(emailLine.trim())}" style="color: #0284c7; text-decoration: none;">${escapeHtml(emailLine.trim())}</a></div>
  <div style="font-size: 14px; margin-top: 2px;"><a href="https://${escapeHtml(wwwLine.replace(/^www\./, "").trim())}" style="color: #0284c7; text-decoration: none;">${escapeHtml(wwwLine.trim())}</a></div>
</div>

</div>
</body>
</html>`;
}

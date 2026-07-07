import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * DEV: GET /api/dev/test-email?secret=X&who=leo|info&to=email
 * Pošle test email cez Resend so značkovou signatúrou aby si videl
 * ako to vyzerá pre rôznych obchodákov.
 *
 * ODSTRÁNIŤ po testovaní!
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  const who = url.searchParams.get("who") || "leo";
  const to = url.searchParams.get("to") || "gonzalespuska@gmail.com";

  if (secret !== "test-signature-2026") {
    return NextResponse.json({ ok: false, error: "bad_secret" }, { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ ok: false, error: "no_resend_key" }, { status: 500 });
  }

  const agents = {
    leo: {
      name: "Leo Hrisenko",
      phone: "+421 948 143 981",
      email: "obchod@epoxidovo.sk",
    },
    info: {
      name: "Tristan Vitáz",
      phone: "+421 950 890 098",
      email: "info@epoxidovo.sk",
    },
  } as const;
  const agent = agents[who as keyof typeof agents];
  if (!agent) {
    return NextResponse.json({ ok: false, error: "unknown_who" }, { status: 400 });
  }

  const bodyText = `Dobrý deň prajeme,

Toto je testovacia cenová ponuka aby si videl ako vyzerá HTML podpis odosielaný z CRM.

V ostrom emaili by tu bol text ohľadom cenovej ponuky a v prílohe PDF.

V prípade akýchkoľvek otázok ma neváhajte kontaktovať.

S pozdravom,
${agent.name}
${agent.phone}
EPOXIDOVO s. r. o.
${agent.email}
www.epoxidovo.sk`;

  const htmlBody = buildHtml(bodyText, agent.email);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${agent.name} (EPOXIDOVO) <noreply@najcrm.sk>`,
      to,
      reply_to: agent.email,
      subject: `TEST · Ako vyzerá signature od ${agent.name}`,
      text: bodyText,
      html: htmlBody,
    }),
  });
  const json = await res.json();
  return NextResponse.json({ ok: res.ok, status: res.status, resend: json });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtml(text: string, agentEmail: string): string {
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
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e293b;background:#f8fafc;"><div style="max-width:640px;margin:0 auto;background:#fff;padding:32px;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08);"><div style="font-size:15px;color:#1e293b;">${bodyHtml}</div><div style="margin-top:32px;padding-top:20px;border-top:2px solid #e2e8f0;"><div style="font-size:15px;margin-bottom:12px;">S pozdravom,</div><div style="font-family:'Impact','Helvetica Neue',sans-serif;font-weight:900;font-size:32px;letter-spacing:1px;background:linear-gradient(90deg,#38bdf8 0%,#0ea5e9 50%,#0284c7 100%);-webkit-background-clip:text;background-clip:text;color:transparent;margin-bottom:4px;line-height:1;">EPOXIDOVO.SK</div><div style="height:3px;width:60px;background:linear-gradient(90deg,#38bdf8,#0284c7);border-radius:2px;margin-bottom:16px;"></div><div style="font-size:15px;font-weight:700;color:#0f172a;">${escapeHtml(agentName)}</div>${phoneLine ? `<div style="font-size:14px;color:#475569;margin-top:4px;font-variant-numeric:tabular-nums;">${escapeHtml(phoneLine.trim())}</div>` : ""}<div style="font-size:14px;margin-top:4px;"><a href="mailto:${escapeHtml(emailLine.trim())}" style="color:#0284c7;text-decoration:none;">${escapeHtml(emailLine.trim())}</a></div><div style="font-size:14px;margin-top:2px;"><a href="https://${escapeHtml(wwwLine.replace(/^www\./, "").trim())}" style="color:#0284c7;text-decoration:none;">${escapeHtml(wwwLine.trim())}</a></div></div><div style="margin-top:24px;font-size:11px;color:#94a3b8;text-align:center;">📎 (TEST — PDF by tu bolo v prílohe)</div></div></body></html>`;
}

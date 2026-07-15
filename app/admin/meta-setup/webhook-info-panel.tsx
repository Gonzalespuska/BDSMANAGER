"use client";

import * as React from "react";
import { Copy, ExternalLink, Loader2, Radio } from "lucide-react";

/**
 * WebhookInfoPanel — po meta-token forme. Zobrazí callback URL + verify
 * token ktoré admin paste do Meta App Dashboard pre real-time webhook
 * (namiesto 5-min pollingu).
 */
export function WebhookInfoPanel() {
  const [info, setInfo] = React.useState<{
    callback_url: string;
    verify_token: string;
    verify_token_set: boolean;
  } | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/admin/meta-webhook-info")
      .then((r) => r.json())
      .then((j: { ok?: boolean } & typeof info) => {
        if (j.ok) setInfo(j);
      })
      .catch(() => {});
  }, []);

  function copy(text: string, tag: string) {
    navigator.clipboard.writeText(text);
    setCopied(tag);
    setTimeout(() => setCopied(null), 1500);
  }

  if (!info) {
    return (
      <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4 flex items-center gap-2 text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm font-bold">Načítavam webhook info…</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 border-violet-300 bg-violet-50/50 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Radio className="w-5 h-5 text-violet-700 shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="font-black text-violet-900 text-sm">
            Real-time webhook (voliteľné)
          </div>
          <p className="text-xs text-violet-800 mt-0.5 leading-relaxed">
            Meta môže Push-nuť nový lead ihneď po odoslaní formu (0-sec
            gap namiesto 5-min pollingu). Setup: developers.facebook.com/apps →
            Epoxidovo → Webhooks → Page → Add subscription.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Row
          label="Callback URL"
          value={info.callback_url}
          copied={copied === "url"}
          onCopy={() => copy(info.callback_url, "url")}
        />
        <Row
          label="Verify Token"
          value={info.verify_token}
          copied={copied === "token"}
          onCopy={() => copy(info.verify_token, "token")}
          mono
        />
        <Row
          label="Subscription field"
          value="leadgen"
          copied={copied === "field"}
          onCopy={() => copy("leadgen", "field")}
          mono
        />
      </div>

      <a
        href="https://developers.facebook.com/apps/1022011550326345/webhooks/"
        target="_blank"
        rel="noopener"
        className="inline-flex items-center gap-1.5 text-xs font-black text-violet-700 hover:text-violet-900 hover:underline"
      >
        <ExternalLink className="w-3 h-3" />
        Otvor Meta App Dashboard → Webhooks
      </a>
    </div>
  );
}

function Row({
  label,
  value,
  copied,
  onCopy,
  mono,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg bg-white border border-violet-200 p-2 flex items-center gap-2">
      <div className="text-[9px] uppercase tracking-wider font-black text-violet-700 w-24 shrink-0">
        {label}
      </div>
      <div
        className={
          "flex-1 min-w-0 text-xs truncate " +
          (mono ? "font-mono" : "font-semibold")
        }
      >
        {value || <span className="italic text-slate-400">not set</span>}
      </div>
      {value && (
        <button
          type="button"
          onClick={onCopy}
          className={
            "shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-black transition-colors " +
            (copied
              ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
              : "bg-violet-100 hover:bg-violet-200 text-violet-800 border border-violet-300")
          }
        >
          {copied ? "✓ Skopírované" : (
            <>
              <Copy className="w-2.5 h-2.5" />
              Copy
            </>
          )}
        </button>
      )}
    </div>
  );
}

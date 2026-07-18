"use client";

import * as React from "react";

/**
 * Global error boundary — chytá aj chyby v rootových layout-och (napr. AppShell).
 * Vyžaduje si vlastný <html>/<body> lebo layout sa nevykreslí.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[GLOBAL ERROR]:", error);
  }, [error]);

  return (
    <html lang="sk">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#fef2f2" }}>
        <div
          style={{
            maxWidth: 720,
            margin: "40px auto",
            padding: 24,
            background: "white",
            border: "2px solid #fca5a5",
            borderRadius: 16,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 900,
              color: "#7f1d1d",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            ⚠ Chyba (globálne)
          </h1>
          <div
            style={{
              marginTop: 12,
              padding: 12,
              background: "#0f172a",
              color: "#f1f5f9",
              fontFamily: "ui-monospace, monospace",
              fontSize: 13,
              borderRadius: 8,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {error.message || "(bez message)"}
          </div>
          {error.digest && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#64748b", fontFamily: "ui-monospace, monospace" }}>
              Digest: {error.digest}
            </div>
          )}
          {error.stack && (
            <details style={{ marginTop: 12, fontSize: 11 }}>
              <summary style={{ cursor: "pointer", fontWeight: 900, color: "#7f1d1d" }}>
                Stack trace (klikni pre rozbalenie)
              </summary>
              <pre
                style={{
                  marginTop: 8,
                  padding: 8,
                  background: "#0f172a",
                  color: "#f1f5f9",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 11,
                  borderRadius: 6,
                  overflowX: "auto",
                  maxHeight: 400,
                }}
              >
                {error.stack}
              </pre>
            </details>
          )}
          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: "8px 14px",
                background: "#dc2626",
                color: "white",
                border: 0,
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Skúsiť znova
            </button>
            <a
              href="/"
              style={{
                padding: "8px 14px",
                background: "white",
                color: "#7f1d1d",
                border: "1px solid #fca5a5",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 900,
                textDecoration: "none",
              }}
            >
              Domov
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}

"use client";

/**
 * The last-resort boundary: used only when the *root layout itself* throws, which
 * is why it has to render its own `<html>` and `<body>` and cannot depend on
 * `app/globals.css` having loaded. Hence the inline styles — a stylesheet that
 * failed to load is exactly the situation this page exists for.
 *
 * Everything here is deliberately dependency-free: no fonts, no analytics, no
 * component imports.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
          background: "#FBF7F0",
          color: "#2B1F17",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <main id="main" style={{ maxWidth: "30rem" }}>
          <p
            style={{
              fontSize: "0.7rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#8A7361",
              margin: "0 0 1rem",
            }}
          >
            CafeCaption
          </p>

          <h1
            style={{
              fontSize: "1.5rem",
              lineHeight: 1.2,
              margin: "0 0 0.75rem",
              fontWeight: 600,
            }}
          >
            The page could not start.
          </h1>

          <p style={{ fontSize: "0.9rem", lineHeight: 1.6, color: "#6B5847", margin: "0 0 1.5rem" }}>
            This is our fault, not yours. Nothing you saved is affected. Try
            reloading, and if it keeps happening the site needs a look from us.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: "44px",
              padding: "0 1.25rem",
              borderRadius: "999px",
              border: "1px solid #2B1F17",
              background: "#2B1F17",
              color: "#FBF7F0",
              fontSize: "0.85rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>

          {error.digest ? (
            <p style={{ marginTop: "1.5rem", fontSize: "0.7rem", color: "#8A7361" }}>
              Reference: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}

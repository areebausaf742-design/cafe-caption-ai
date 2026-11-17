"use client";

import { QRCodeSVG } from "qrcode.react";

/**
 * The QR the demo page shows for itself.
 *
 * `qrcode.react` renders with hooks, so this lives in a client component — the
 * page around it stays a server component and ships no JavaScript of its own.
 */
export default function DemoQr({
  url,
  size = 168,
}: {
  url: string;
  size?: number;
}) {
  return (
    <div className="inline-flex rounded-xl bg-cream-50 p-2.5 shadow-[0_12px_28px_-20px_rgba(36,24,18,0.55)]">
      <QRCodeSVG
        value={url}
        size={size}
        level="M"
        marginSize={2}
        bgColor="#FFFBF5"
        fgColor="#241812"
        title="QR code linking to this demo menu"
      />
    </div>
  );
}

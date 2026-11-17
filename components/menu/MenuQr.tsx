"use client";

import { QRCodeSVG } from "qrcode.react";

/**
 * A QR code for a menu URL — the demo page, a live menu, or the editor's
 * "print this" card.
 *
 * `qrcode.react` renders with hooks, so this lives in a client component — the
 * pages around it stay server components and ship no JavaScript of their own.
 */
export default function MenuQr({
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
        title="QR code linking to this menu"
      />
    </div>
  );
}

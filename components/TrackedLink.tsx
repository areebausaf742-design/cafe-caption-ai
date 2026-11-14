"use client";

import type {
  AnchorHTMLAttributes,
  MouseEventHandler,
  ReactNode,
} from "react";

import { track } from "@/lib/analytics";

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & {
  /** Where the link sits, e.g. "header", "hero", "packages", "footer". */
  location: string;
  /** What was clicked, e.g. "whatsapp", "booking", "package:launch-kit". */
  label: string;
  children: ReactNode;
};

/**
 * A plain <a> that reports a `cta_click` event. Kept as a client component so
 * server components (page, header, footer) can stay server-rendered.
 */
export default function TrackedLink({
  location,
  label,
  children,
  onClick,
  ...rest
}: Props) {
  const handleClick: MouseEventHandler<HTMLAnchorElement> = (event) => {
    track({ name: "cta_click", props: { location, label } });
    onClick?.(event);
  };

  return (
    <a {...rest} onClick={handleClick}>
      {children}
    </a>
  );
}

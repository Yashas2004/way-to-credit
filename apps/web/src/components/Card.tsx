import type { HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Only for content that's genuinely floating (rare) — the default has none, per "hairline rows over shadowed cards." */
  elevated?: boolean;
}

export function Card({ elevated = false, className = "", children, ...rest }: CardProps) {
  return (
    <div
      className={`rounded-md border border-slate/20 bg-white p-4 ${elevated ? "shadow-elevated" : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

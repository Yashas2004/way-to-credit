import type { HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Only for content that's genuinely floating (rare); cards otherwise take the soft `card` shadow. */
  elevated?: boolean;
}

export function Card({ elevated = false, className = "", children, ...rest }: CardProps) {
  return (
    <div
      className={`rounded-md bg-white p-5 ${elevated ? "shadow-elevated" : "shadow-card"} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

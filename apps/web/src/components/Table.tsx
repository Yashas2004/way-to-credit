import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

/**
 * Always wrapped in a bounded `overflow-x-auto` container with a
 * `min-width` on the table itself, so a narrow viewport scrolls
 * horizontally instead of illegibly crushing columns — the one responsive
 * rule this component needs regardless of what ends up inside it later.
 * The table sits in a raised white card (the `card` shadow and radius) with
 * hairline row dividers; cells line up with the card's padding.
 */
export function Table({ className = "", children, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-md bg-white shadow-card">
      <table className={`w-full min-w-[640px] border-collapse text-body ${className}`} {...rest}>
        {children}
      </table>
    </div>
  );
}

export function TableHead({
  className = "",
  children,
  ...rest
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={`border-b border-muted/15 ${className}`} {...rest}>
      {children}
    </thead>
  );
}

export function TableBody({
  className = "",
  children,
  ...rest
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={className} {...rest}>
      {children}
    </tbody>
  );
}

export function TableRow({
  className = "",
  children,
  ...rest
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={`border-b border-muted/10 last:border-0 ${className}`} {...rest}>
      {children}
    </tr>
  );
}

export function TableHeaderCell({
  className = "",
  children,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 text-left text-h3 font-semibold text-muted ${className}`}
      {...rest}
    >
      {children}
    </th>
  );
}

export function TableCell({
  className = "",
  children,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={`px-4 py-2 text-ink ${className}`} {...rest}>
      {children}
    </td>
  );
}

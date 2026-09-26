import type { InputProps } from "./Input";
import { Input } from "./Input";

export interface IntegerInputProps extends Omit<InputProps, "value" | "onChange" | "type"> {
  value: string;
  /** Called only with values that are a (possibly partial) integer — never a decimal, exponent, or stray character. */
  onValueChange: (value: string) => void;
  /** @default false */
  allowNegative?: boolean;
}

/**
 * Whole numbers only. A plain `type="number"` input accepts `1.5`, `1e2`,
 * and `-` mid-edit, and `Number("1e1")` is a valid integer, so values like
 * that slipped through as silently-reinterpreted numbers. This is a text
 * input that simply refuses any change — typed or pasted — that isn't
 * digits (with an optional leading minus), so an invalid value never
 * reaches component state at all. The server validates independently.
 */
export function IntegerInput({
  value,
  onValueChange,
  allowNegative = false,
  ...rest
}: IntegerInputProps) {
  const pattern = allowNegative ? /^-?\d*$/ : /^\d*$/;

  return (
    <Input
      {...rest}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value}
      onChange={(e) => {
        if (pattern.test(e.target.value)) {
          onValueChange(e.target.value);
        }
      }}
    />
  );
}

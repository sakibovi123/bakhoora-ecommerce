"use client";

interface QuantityStepperProps {
  value: number;
  max: number;
  onChange: (value: number) => void;
  size?: "sm" | "md";
}

export function QuantityStepper({ value, max, onChange, size = "md" }: QuantityStepperProps) {
  const cell = size === "sm" ? "size-8 text-sm" : "size-11";

  return (
    <div className="inline-flex items-center border border-line">
      <button
        type="button"
        className={`${cell} grid place-items-center transition-colors hover:bg-paper-2 disabled:opacity-30`}
        onClick={() => onChange(value - 1)}
        aria-label="Decrease quantity"
      >
        −
      </button>
      <span className={`${cell} grid place-items-center tabular-nums`} aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={`${cell} grid place-items-center transition-colors hover:bg-paper-2 disabled:opacity-30`}
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}

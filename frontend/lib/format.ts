const bdt = new Intl.NumberFormat("en-BD", {
  style: "currency",
  currency: "BDT",
  maximumFractionDigits: 0,
});

/** Prices are whole taka — decimals only add noise at this price point. */
export function formatPrice(amount: number): string {
  // Intl gives "BDT 1,450"; local convention is "৳1,450" with no gap.
  return bdt.format(amount).replace(/BDT\s*/, "৳");
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-BD").format(value);
}

export function orderNumber(seed: number): string {
  return `BKH-${String(seed).padStart(6, "0")}`;
}

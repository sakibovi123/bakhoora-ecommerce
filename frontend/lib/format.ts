const grouped = new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 });

/**
 * Prices are whole units — decimals only add noise at this price point.
 *
 * The symbol is a parameter because the shop can change its currency from the
 * admin panel. Intl's own currency formatting is not used: it renders "BDT
 * 1,450" for taka, while local convention is "৳1,450" with no gap, and it has
 * no way to honour a symbol the operator typed in themselves.
 */
export function formatPrice(amount: number, symbol = "৳"): string {
  return `${symbol}${grouped.format(amount)}`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-BD").format(value);
}

export function orderNumber(seed: number): string {
  return `BKH-${String(seed).padStart(6, "0")}`;
}

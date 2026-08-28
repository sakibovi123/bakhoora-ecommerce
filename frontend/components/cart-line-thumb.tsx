import { Bottle } from "@/components/bottle";
import { bottleShape, toneFor } from "@/lib/catalog";
import type { CartLine } from "@/lib/types";

/**
 * The thumbnail for one cart line, in the drawer, the cart page and the
 * checkout summary alike. Each of those used to reach into `line.product` for a
 * tone and a category; the line carries a snapshot now, and the photograph — if
 * the product had one when it was added — beats the drawn silhouette.
 */
export function CartLineThumb({ line, className = "" }: { line: CartLine; className?: string }) {
  if (line.image) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img src={line.image} alt={line.name} className={`bg-paper-2 object-cover ${className}`} />
    );
  }
  return (
    <Bottle
      tone={toneFor(line.productSlug)}
      shape={bottleShape(line.categorySlug)}
      className={className}
    />
  );
}

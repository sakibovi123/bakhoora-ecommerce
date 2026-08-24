import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <section className="shell py-32 text-center md:py-48">
      <p className="label text-muted">404</p>
      <h1 className="display-lg mt-8">This one evaporated.</h1>
      <p className="mx-auto mt-7 max-w-sm leading-relaxed text-muted">
        The page you were after is not here. The shelf, however, is still full.
      </p>
      <div className="mt-11 flex justify-center gap-4">
        <ButtonLink href="/shop">Browse fragrances</ButtonLink>
        <ButtonLink href="/" tone="outline">
          Home
        </ButtonLink>
      </div>
    </section>
  );
}

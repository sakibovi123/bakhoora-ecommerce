interface SectionLabelProps {
  index?: string;
  children: React.ReactNode;
  tone?: "ink" | "paper";
}

/** The `01 / The house` marker that sets the vertical rhythm of every section. */
export function SectionLabel({ index, children, tone = "ink" }: SectionLabelProps) {
  const muted = tone === "ink" ? "text-muted" : "text-paper/55";
  return (
    <p className={`label flex items-center gap-3 ${muted}`}>
      {index ? (
        <>
          <span className={tone === "ink" ? "text-accent" : "text-accent-soft"}>{index}</span>
          <span aria-hidden className="h-px w-8 bg-current opacity-40" />
        </>
      ) : null}
      <span>{children}</span>
    </p>
  );
}

"use client";

import type { ElementType } from "react";

import { useInView } from "@/lib/use-in-view";

/**
 * A headline that exhales into place: each word rises out of a blur, one
 * after another, the way smoke settles into a shape. The words stay real text
 * (the aria-label carries the whole line for screen readers).
 */
export function SmokeText({
  text,
  as: Tag = "h2",
  className = "",
  delay = 0,
}: {
  text: string;
  as?: ElementType;
  className?: string;
  /** Milliseconds before the first word starts. */
  delay?: number;
}) {
  const [ref, inView] = useInView<HTMLElement>();
  const words = text.split(" ");

  return (
    <Tag ref={ref} aria-label={text} className={`${inView ? "is-in" : ""} ${className}`}>
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          aria-hidden
          className="smoke-word"
          style={{ "--i": index, "--d": `${delay}ms` } as React.CSSProperties}
        >
          {word}
          {index < words.length - 1 ? " " : null}
        </span>
      ))}
    </Tag>
  );
}

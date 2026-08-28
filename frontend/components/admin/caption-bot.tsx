"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Dropdown } from "@/components/admin/dropdown";
import {
  IconCheck,
  IconClose,
  IconCopy,
  IconSend,
  IconSparkle,
  IconSpinner,
} from "@/components/admin/icons";
import { useToast } from "@/components/admin/toast";
import { Button } from "@/components/admin/ui";
import { ApiError, adminApi } from "@/lib/admin/client";
import type { CaptionMessage, CaptionPlatform, CaptionProduct } from "@/lib/admin/types";
import { useAuth } from "@/lib/auth";

const PLATFORMS: { value: CaptionPlatform; label: string }[] = [
  { value: "reel", label: "Reel" },
  { value: "facebook", label: "Facebook post" },
  { value: "instagram", label: "Instagram post" },
  { value: "whatsapp", label: "WhatsApp broadcast" },
];

const OPENERS: Record<CaptionPlatform, string> = {
  reel: "Write a reel caption. The video shows the bottle being poured.",
  facebook: "Write a Facebook post announcing this is back in stock.",
  instagram: "Write an Instagram caption for a flat-lay photo of this.",
  whatsapp: "Write a short WhatsApp broadcast about this.",
};

/**
 * The caption assistant, floating bottom-right on every admin page.
 *
 * It talks to our own API, never to OpenRouter — the key stays on the server,
 * because anything the browser holds is readable by whoever opens the network
 * tab. The button hides itself entirely when the key is not configured rather
 * than offering something that will fail on the first message.
 */
export function CaptionBot() {
  const { token } = useAuth();
  const { notify } = useToast();

  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<CaptionPlatform>("reel");
  const [productId, setProductId] = useState("");
  const [products, setProducts] = useState<CaptionProduct[]>([]);
  const [messages, setMessages] = useState<CaptionMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  // Which reply was just copied, so its own button can say so. A toast alone
  // is easy to miss when your eyes are on the button you just pressed.
  const [copied, setCopied] = useState<number | null>(null);

  const thread = useRef<HTMLDivElement>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clearing the timer on unmount keeps it from setting state on a panel that
  // has already closed.
  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!token) return;
    let live = true;
    adminApi
      .captionStatus(token)
      .then((status) => live && setAvailable(status.configured))
      .catch(() => live && setAvailable(false));
    return () => {
      live = false;
    };
  }, [token]);

  // Products are only needed once the panel is opened — no reason to fetch the
  // catalogue on every admin page load for a button most visits never press.
  useEffect(() => {
    if (!open || !token || products.length) return;
    adminApi
      .captionProducts(token)
      .then(setProducts)
      .catch(() => setProducts([]));
  }, [open, token, products.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || !token || busy) return;

      const next: CaptionMessage[] = [...messages, { role: "user", content }];
      setMessages(next);
      setDraft("");
      setBusy(true);
      try {
        const reply = await adminApi.caption(token, {
          messages: next,
          platform,
          product_id: productId || null,
        });
        setMessages([...next, { role: "assistant", content: reply.content }]);
      } catch (cause) {
        // The user's message stays in the thread so they can retry without
        // retyping it; the failure is reported rather than silently dropped.
        notify(
          cause instanceof ApiError ? cause.message : "The assistant did not answer.",
          "error",
        );
      } finally {
        setBusy(false);
      }
    },
    [messages, token, platform, productId, busy, notify],
  );

  async function copy(text: string, index: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(index);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard access can be refused outright (insecure origin, permission),
      // and that is worth a toast — the silent button would look like nothing
      // happened at all.
      notify("Could not copy — select the text instead.", "error");
    }
  }

  if (!token || !available) return null;

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          // No visible text any more, so the control carries its own name for
          // a screen reader, and a title for anyone hovering it.
          aria-label="Open the caption assistant"
          title="Caption assistant"
          className="fixed bottom-5 right-5 z-70 grid size-14 place-items-center rounded-full bg-ink text-paper shadow-lg transition-colors hover:bg-ink-2"
        >
          <IconSparkle className="size-6" />
        </button>
      ) : null}

      {open ? (
        <div
          role="dialog"
          aria-label="Caption assistant"
          className="fixed bottom-5 right-5 z-70 flex max-h-[min(38rem,calc(100dvh-2.5rem))] w-[min(26rem,calc(100vw-2.5rem))] flex-col border border-line bg-paper shadow-2xl"
        >
          <header className="flex items-center justify-between gap-3 border-b border-line bg-paper-2 px-4 py-3">
            <span className="label flex items-center gap-2">
              <IconSparkle className="text-[var(--color-green)]" />
              Caption assistant
            </span>
            <div className="flex items-center gap-1">
              {messages.length ? (
                <button
                  type="button"
                  onClick={() => {
                    setMessages([]);
                    // Indices are the key, so a stale one would light up an
                    // unrelated reply in the next thread.
                    setCopied(null);
                  }}
                  className="label px-2 py-1 text-muted hover:text-ink"
                >
                  Clear
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="p-1 text-muted hover:text-ink"
              >
                <IconClose />
              </button>
            </div>
          </header>

          <div className="grid grid-cols-2 gap-2 border-b border-line px-4 py-3">
            <Dropdown
              value={platform}
              onChange={(value) => setPlatform(value as CaptionPlatform)}
              aria-label="Platform"
              options={PLATFORMS}
            />
            <Dropdown
              value={productId}
              onChange={setProductId}
              placeholder="No product"
              aria-label="Product"
              options={[
                { value: "", label: "No product" },
                ...products.map((item) => ({ value: item.id, label: item.label })),
              ]}
            />
          </div>

          <div ref={thread} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-muted">
                  Pick a product and I will write from its real name, sizes and prices. Ask for
                  changes and I will rewrite.
                </p>
                <button
                  type="button"
                  onClick={() => void send(OPENERS[platform])}
                  className="w-full border border-line px-3 py-2.5 text-left text-sm transition-colors hover:border-ink"
                >
                  {OPENERS[platform]}
                </button>
              </div>
            ) : null}

            {messages.map((message, index) => (
              <div
                key={index}
                className={message.role === "user" ? "flex justify-end" : "space-y-2"}
              >
                {message.role === "user" ? (
                  <p className="max-w-[85%] bg-ink px-3 py-2 text-sm text-paper">
                    {message.content}
                  </p>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap border border-line bg-paper-2 px-3 py-2.5 text-sm leading-relaxed">
                      {message.content}
                    </p>
                    <button
                      type="button"
                      onClick={() => void copy(message.content, index)}
                      aria-live="polite"
                      className={`label flex items-center gap-1.5 transition-colors ${
                        copied === index
                          ? "text-[var(--color-green)]"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      {copied === index ? <IconCheck /> : <IconCopy />}
                      {copied === index ? "Copied" : "Copy"}
                    </button>
                  </>
                )}
              </div>
            ))}

            {busy ? (
              <p className="label flex items-center gap-2 text-muted">
                <IconSpinner className="animate-spin" />
                Writing…
              </p>
            ) : null}
          </div>

          <form
            className="flex items-end gap-2 border-t border-line px-4 py-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
          >
            <textarea
              rows={2}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends, shift+enter breaks the line — what every chat
                // box does, and retyping a caption request is tedious.
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(draft);
                }
              }}
              placeholder="Ask for a caption, or say what to change…"
              className="min-h-11 flex-1 resize-none border border-line bg-paper px-3 py-2.5 text-sm focus:border-ink focus:outline-none"
            />
            <Button type="submit" disabled={busy || !draft.trim()} aria-label="Send">
              {busy ? <IconSpinner className="animate-spin" /> : <IconSend />}
            </Button>
          </form>
        </div>
      ) : null}
    </>
  );
}

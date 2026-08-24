"use client";

import { useRef, useState, type DragEvent } from "react";

import { useConfirm } from "@/components/admin/dialog";
import { IconAlert, IconCheck, IconImage, IconSpinner, IconTrash } from "@/components/admin/icons";
import { useToast } from "@/components/admin/toast";
import { Button, Pill } from "@/components/admin/ui";
import { ApiError, adminApi, mediaUrl } from "@/lib/admin/client";
import { useAuth } from "@/lib/auth";
import { ACCEPTED_IMAGE_TYPES, MAX_PRODUCT_IMAGES, type Product } from "@/lib/admin/types";

/**
 * Up to four images per product, one of them primary.
 *
 * The limit and the primary rule are enforced by the API; everything here is so
 * the operator sees the state before they hit it — remaining slots on the drop
 * zone, the picker disabled at four, and no way to un-set a primary (you pick a
 * different one instead, which is the only transition the API allows).
 */
export function ImageManager({ product, onDone }: { product: Product; onDone: () => void }) {
  const { token } = useAuth();
  const { notify } = useToast();
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const used = product.images.length;
  const free = MAX_PRODUCT_IMAGES - used;
  const full = free <= 0;

  async function send(files: File[]) {
    if (!token || files.length === 0) return;
    if (files.length > free) {
      notify(
        `Only ${free} slot${free === 1 ? "" : "s"} left — you picked ${files.length}.`,
        "error",
      );
      return;
    }
    setBusy(true);
    try {
      await adminApi.uploadImages(token, product.id, files);
      notify(`${files.length} image${files.length === 1 ? "" : "s"} uploaded`);
      onDone();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : "Upload failed", "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (full || busy) return;
    void send(Array.from(event.dataTransfer.files));
  }

  async function makePrimary(imageId: string) {
    if (!token) return;
    setPending(imageId);
    try {
      await adminApi.updateImage(token, imageId, { is_primary: true });
      notify("Primary image set");
      onDone();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : "Could not set the primary", "error");
    } finally {
      setPending(null);
    }
  }

  async function remove(imageId: string) {
    if (!token) return;
    const sure = await confirm({
      title: "Remove this image?",
      body: "The file is deleted from storage as well.",
      confirmLabel: "Remove image",
      tone: "danger",
    });
    if (!sure) return;
    setPending(imageId);
    try {
      await adminApi.deleteImage(token, imageId);
      notify("Image removed");
      onDone();
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : "Could not remove", "error");
    } finally {
      setPending(null);
    }
  }

  return (
    <div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {product.images.map((image) => {
          const working = pending === image.id;
          return (
            <figure
              key={image.id}
              className={`relative border transition-colors ${
                image.is_primary
                  ? "border-[var(--color-green)] ring-1 ring-[var(--color-green)]"
                  : "border-line"
              }`}
            >
              {/* Operator-supplied and uploaded URLs both land here, so a plain
                  <img> avoids next/image's host allowlist rejecting them. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mediaUrl(image.url)}
                alt={image.alt_text ?? product.name}
                className="aspect-square w-full bg-paper-2 object-cover"
              />

              {image.is_primary ? (
                <span className="absolute left-2 top-2">
                  <Pill tone="bg-[var(--color-green-deep)] text-paper" dot="bg-paper">
                    Primary
                  </Pill>
                </span>
              ) : null}

              <figcaption className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
                {image.is_primary ? (
                  <span className="label flex items-center gap-1.5 text-[var(--color-green)]">
                    <IconCheck className="size-3.5" />
                    Shown first
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => makePrimary(image.id)}
                    className="label flex items-center gap-1.5 text-muted hover:text-ink disabled:opacity-40"
                  >
                    {working ? <IconSpinner className="size-3.5" /> : null}
                    Make primary
                  </button>
                )}
                <button
                  type="button"
                  disabled={working}
                  onClick={() => remove(image.id)}
                  aria-label="Remove this image"
                  className="label flex items-center gap-1.5 text-accent hover:underline disabled:opacity-40"
                >
                  <IconTrash className="size-3.5" />
                </button>
              </figcaption>
            </figure>
          );
        })}

        {/* Empty slots, so four is visible rather than merely enforced. */}
        {Array.from({ length: Math.max(free, 0) }).map((_, index) => (
          <div
            key={`slot-${index}`}
            className="flex aspect-square items-center justify-center border border-dashed border-line text-muted/50"
          >
            <IconImage className="size-6" />
          </div>
        ))}
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!full && !busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`m-4 mt-0 border border-dashed p-6 text-center transition-colors ${
          dragging
            ? "border-[var(--color-amber)] bg-[var(--color-amber-soft)]"
            : "border-line bg-paper"
        } ${full ? "opacity-60" : ""}`}
      >
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPTED_IMAGE_TYPES}
          className="sr-only"
          disabled={full || busy}
          onChange={(event) => void send(Array.from(event.target.files ?? []))}
        />

        {full ? (
          <p className="flex items-center justify-center gap-2 text-sm text-muted">
            <IconAlert className="text-accent" />
            All {MAX_PRODUCT_IMAGES} slots are used. Remove one to upload another.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted">
              Drop images here, or pick several at once.
            </p>
            <Button
              tone="ghost"
              className="mt-3"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {busy ? <IconSpinner /> : <IconImage />}
              {busy ? "Uploading…" : "Choose images"}
            </Button>
            <p className="mt-3 text-xs text-muted">
              {free} of {MAX_PRODUCT_IMAGES} slot{free === 1 ? "" : "s"} free · JPEG, PNG,
              WebP, GIF, AVIF or HEIC · up to 5MB each
            </p>
          </>
        )}
      </div>
    </div>
  );
}

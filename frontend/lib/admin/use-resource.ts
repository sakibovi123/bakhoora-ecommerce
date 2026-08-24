"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/admin/client";
import { useAuth } from "@/lib/auth";

interface Resource<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Load something from the admin API for the signed-in token.
 *
 * A 401 mid-session means the token died (expired, or the account was disabled
 * from another seat) — bounce to login rather than showing a broken page.
 */
export function useResource<T>(
  loader: (token: string) => Promise<T>,
  deps: readonly unknown[],
): Resource<T> {
  const { token, expire } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const latest = useRef(0);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (!token) return;
    const run = ++latest.current;
    setLoading(true);

    loader(token)
      .then((result) => {
        if (latest.current !== run) return;
        setData(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (latest.current !== run) return;
        if (cause instanceof ApiError && cause.status === 401) {
          expire();
          return;
        }
        setError(cause instanceof Error ? cause.message : "Something went wrong");
      })
      .finally(() => {
        if (latest.current === run) setLoading(false);
      });
    // `loader` is re-created every render by callers; deps are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, nonce, ...deps]);

  return { data, error, loading, reload };
}

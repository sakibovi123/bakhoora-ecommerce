"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { adminApi } from "@/lib/admin/client";
import type { Me, MenuAction, MenuKey } from "@/lib/admin/types";

/**
 * One session for the whole app.
 *
 * The storefront and the admin panel are the same Next build talking to the
 * same API, so they share a token: sign in once and, if your role allows it,
 * /admin is simply open. What the panel checks is `isStaff`, never the presence
 * of a token.
 */

const TOKEN_KEY = "bakhoora.auth.token.v1";

interface AuthValue {
  token: string | null;
  user: Me | null;
  /** False until a stored token has been checked against the API. */
  ready: boolean;
  /** May open the admin panel at all. */
  isStaff: boolean;
  /**
   * Whether the signed-in role holds a menu permission.
   *
   * Cosmetics only — it decides what the panel draws. Every admin route on the
   * API carries the same check, so hiding a menu is not what protects it.
   */
  can: (menu: MenuKey, action?: MenuAction) => boolean;
  signIn: (email: string, password: string) => Promise<Me>;
  signUp: (input: {
    email: string;
    password: string;
    full_name: string;
    phone?: string;
  }) => Promise<Me>;
  signOut: () => void;
  /** Sign out and bounce to a login page — for a 401 raised mid-page. */
  expire: () => void;
  /** Re-read the profile, e.g. after an admin changed this account's role. */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

function readToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode — the session just won't survive a reload */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;

    const stored = readToken();
    if (!stored) {
      setReady(true);
      return;
    }
    adminApi
      .me(stored)
      .then((profile) => {
        setToken(stored);
        setUser(profile);
      })
      // Expired, or the account was disabled from another seat.
      .catch(() => writeToken(null))
      .finally(() => setReady(true));
  }, []);

  const establish = useCallback(async (access: string) => {
    const profile = await adminApi.me(access);
    writeToken(access);
    setToken(access);
    setUser(profile);
    return profile;
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const pair = await adminApi.login(email, password);
      return establish(pair.access_token);
    },
    [establish],
  );

  const signUp = useCallback(
    async (input: { email: string; password: string; full_name: string; phone?: string }) => {
      await adminApi.register(input);
      const pair = await adminApi.login(input.email, input.password);
      return establish(pair.access_token);
    },
    [establish],
  );

  const signOut = useCallback(() => {
    writeToken(null);
    setToken(null);
    setUser(null);
  }, []);

  const expire = useCallback(() => {
    signOut();
    const target = pathname.startsWith("/admin") ? "/admin/login" : "/account/login";
    router.replace(`${target}?next=${encodeURIComponent(pathname)}`);
  }, [pathname, router, signOut]);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setUser(await adminApi.me(token));
    } catch {
      signOut();
    }
  }, [token, signOut]);

  const can = useCallback(
    (menu: MenuKey, action: MenuAction = "view") =>
      Boolean(user?.permissions?.[menu]?.includes(action)),
    [user],
  );

  const value = useMemo(
    () => ({
      token,
      user,
      ready,
      isStaff: Boolean(user?.role.is_staff),
      can,
      signIn,
      signUp,
      signOut,
      expire,
      refresh,
    }),
    [token, user, ready, can, signIn, signUp, signOut, expire, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

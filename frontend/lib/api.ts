/**
 * Typed client for the FastAPI backend.
 *
 * The storefront renders entirely from `lib/catalog.ts`, so the design works with no
 * server running. Set NEXT_PUBLIC_API_URL and these functions take over — the shapes
 * below match the schemas in BUILD_GUIDE.md exactly.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export const apiConfigured = BASE_URL.length > 0;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  if (!apiConfigured) {
    throw new ApiError("NEXT_PUBLIC_API_URL is not set", 0, "not_configured");
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(
      error?.message ?? `Request failed with ${response.status}`,
      response.status,
      error?.code,
    );
  }

  return payload as T;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface ApiUser {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: "customer" | "admin";
}

export interface ApiPage<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export const api = {
  register: (body: { email: string; password: string; full_name: string; phone?: string }) =>
    request<ApiUser>("/auth/register", { method: "POST", body: JSON.stringify(body) }),

  login: (body: { email: string; password: string }) =>
    request<TokenPair>("/auth/login", { method: "POST", body: JSON.stringify(body) }),

  me: (token: string) => request<ApiUser>("/auth/me", {}, token),

  products: (query = "") => request<ApiPage<unknown>>(`/products${query}`),

  product: (slug: string) => request<unknown>(`/products/${slug}`),

  addToCart: (token: string, body: { variant_id: string; quantity: number }) =>
    request<unknown>("/cart/items", { method: "POST", body: JSON.stringify(body) }, token),

  checkout: (token: string, body: unknown) =>
    request<unknown>("/orders/checkout", { method: "POST", body: JSON.stringify(body) }, token),

  orders: (token: string) => request<ApiPage<unknown>>("/orders", {}, token),
};

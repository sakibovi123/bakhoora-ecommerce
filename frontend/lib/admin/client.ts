import type {
  AdminUser,
  Category,
  CustomerDetail,
  Dashboard,
  Me,
  Menu,
  MenuKey,
  Order,
  OrderListItem,
  OrderStatus,
  Page,
  PaymentStatus,
  Product,
  ProductInput,
  RoleDetail,
  Variant,
} from "@/lib/admin/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * Resolve an image URL for an <img src>.
 *
 * Uploads are stored as a path (`/media/products/x.jpg`) rather than an
 * absolute URL, so the database stays portable between environments — which
 * means the client is the one that has to know the API's origin. Images added
 * by pasting a link are already absolute and pass through untouched.
 */
export function mediaUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (/^(https?:)?\/\//.test(url) || url.startsWith("data:")) return url;
  const origin = BASE_URL.replace(/\/api\/v1\/?$/, "");
  return `${origin}${url.startsWith("/") ? "" : "/"}${url}`;
}

export const apiConfigured = BASE_URL.length > 0;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** FastAPI's own 422 body is `{detail: [{loc, msg}]}`; ours is `{error: {...}}`. */
function messageFrom(payload: unknown, status: number): { message: string; code?: string } {
  const body = payload as
    | { error?: { message?: string; code?: string } }
    | { detail?: unknown }
    | null;

  if (body && "error" in body && body.error?.message) {
    return { message: body.error.message, code: body.error.code };
  }
  if (body && "detail" in body) {
    const { detail } = body;
    if (typeof detail === "string") return { message: detail, code: "invalid" };
    if (Array.isArray(detail)) {
      const lines = detail
        .map((entry) => {
          const item = entry as { loc?: unknown[]; msg?: string };
          const field = Array.isArray(item.loc) ? item.loc.slice(1).join(".") : "";
          return field ? `${field}: ${item.msg}` : (item.msg ?? "");
        })
        .filter(Boolean);
      if (lines.length) return { message: lines.join("\n"), code: "invalid" };
    }
  }
  return { message: `Request failed with ${status}` };
}

async function call<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  if (!apiConfigured) {
    throw new ApiError(
      "NEXT_PUBLIC_API_URL is not set, so the panel has no backend to talk to.",
      0,
      "not_configured",
    );
  }

  let response: Response;
  try {
    const isForm = init.body instanceof FormData;
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        // Setting it by hand on a FormData body would omit the multipart
        // boundary and the server could not parse the request.
        ...(isForm ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError("Could not reach the API. Is the server running?", 0, "network");
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const { message, code } = messageFrom(payload, response.status);
    throw new ApiError(message, response.status, code, payload);
  }
  return payload as T;
}

const body = (value: unknown) => JSON.stringify(value);

function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

export interface ProductQuery {
  page?: number;
  size?: number;
  search?: string | null;
  category?: string | null;
  low_stock?: boolean;
  active?: boolean | null;
  sort?: "newest" | "oldest" | "name" | "price_asc" | "price_desc";
}

export interface OrderQuery {
  page?: number;
  size?: number;
  status?: OrderStatus | null;
  search?: string | null;
}

export interface UserQuery {
  page?: number;
  size?: number;
  search?: string | null;
  /** Role slug. */
  role?: string | null;
  /** Only accounts that may open the panel. */
  staff?: boolean | null;
  is_active?: boolean | null;
}

export interface ManualOrderInput {
  items: { variant_id: string; quantity: number }[];
  shipping_address: Record<string, unknown>;
  user_id?: string | null;
  payment_method: string;
  status?: string | null;
  payment_status?: string | null;
  shipping_fee?: string | null;
  discount_total?: string | null;
  customer_note?: string | null;
  admin_note?: string | null;
}

export interface RoleInput {
  name: string;
  description?: string | null;
  is_staff?: boolean;
  permissions?: { menu: MenuKey; can_view: boolean; can_manage: boolean }[];
}

export const adminApi = {
  // --- auth ---
  login: (email: string, password: string) =>
    call<{ access_token: string; refresh_token: string }>("/auth/login", null, {
      method: "POST",
      body: body({ email, password }),
    }),

  me: (token: string) => call<Me>("/auth/me", token),

  register: (input: { email: string; password: string; full_name: string; phone?: string }) =>
    call<AdminUser>("/auth/register", null, { method: "POST", body: body(input) }),

  // --- dashboard ---
  dashboard: (token: string, days = 14) =>
    call<Dashboard>(`/admin/dashboard${query({ days })}`, token),

  // --- products ---
  products: (token: string, params: ProductQuery = {}) =>
    call<Page<Product>>(`/admin/products${query({ ...params })}`, token),

  product: (token: string, id: string) => call<Product>(`/admin/products/${id}`, token),

  createProduct: (token: string, input: ProductInput) =>
    call<Product>("/products", token, { method: "POST", body: body(input) }),

  updateProduct: (token: string, id: string, input: Partial<ProductInput>) =>
    call<Product>(`/products/${id}`, token, { method: "PATCH", body: body(input) }),

  deleteProduct: (token: string, id: string) =>
    call<void>(`/products/${id}`, token, { method: "DELETE" }),

  addVariant: (token: string, productId: string, input: Record<string, unknown>) =>
    call<Product>(`/products/${productId}/variants`, token, {
      method: "POST",
      body: body(input),
    }),

  updateVariant: (token: string, variantId: string, input: Record<string, unknown>) =>
    call<Variant>(`/products/variants/${variantId}`, token, {
      method: "PATCH",
      body: body(input),
    }),

  deleteVariant: (token: string, variantId: string) =>
    call<void>(`/products/variants/${variantId}`, token, { method: "DELETE" }),

  addImage: (token: string, productId: string, input: Record<string, unknown>) =>
    call<Product>(`/products/${productId}/images`, token, { method: "POST", body: body(input) }),

  uploadImages: (token: string, productId: string, files: File[]) => {
    const form = new FormData();
    for (const file of files) form.append("files", file);
    // No Content-Type header: the browser has to set the multipart boundary.
    return call<Product>(`/products/${productId}/images/upload`, token, {
      method: "POST",
      body: form,
    });
  },

  updateImage: (
    token: string,
    imageId: string,
    input: { is_primary?: boolean; alt_text?: string | null; position?: number },
  ) => call<Product>(`/products/images/${imageId}`, token, { method: "PATCH", body: body(input) }),

  deleteImage: (token: string, imageId: string) =>
    call<void>(`/products/images/${imageId}`, token, { method: "DELETE" }),

  setStock: (token: string, lines: { variant_id: string; stock_quantity: number }[]) =>
    call<{ variant_id: string; sku: string; stock_quantity: number }[]>("/admin/stock", token, {
      method: "PATCH",
      body: body({ lines }),
    }),

  // --- categories ---
  categories: (token: string) => call<Category[]>("/admin/categories", token),

  createCategory: (token: string, input: Record<string, unknown>) =>
    call<Category>("/categories", token, { method: "POST", body: body(input) }),

  updateCategory: (token: string, id: string, input: Record<string, unknown>) =>
    call<Category>(`/categories/${id}`, token, { method: "PATCH", body: body(input) }),

  deleteCategory: (token: string, id: string) =>
    call<void>(`/categories/${id}`, token, { method: "DELETE" }),

  reorderCategories: (token: string, items: { id: string; position: number }[]) =>
    call<Category[]>("/admin/categories/reorder", token, {
      method: "PATCH",
      body: body({ items }),
    }),

  // --- orders ---
  orders: (token: string, params: OrderQuery = {}) =>
    call<Page<OrderListItem>>(`/admin/orders${query({ ...params })}`, token),

  order: (token: string, id: string) => call<Order>(`/admin/orders/${id}`, token),

  updateOrder: (
    token: string,
    id: string,
    input: { status?: OrderStatus; payment_status?: PaymentStatus; admin_note?: string },
  ) => call<Order>(`/admin/orders/${id}`, token, { method: "PATCH", body: body(input) }),

  paymentMethods: () =>
    call<{ name: string; label: string; requires_prepayment: boolean }[]>(
      "/orders/payment-methods",
      null,
    ),

  createOrder: (token: string, input: ManualOrderInput) =>
    call<Order>("/admin/orders", token, { method: "POST", body: body(input) }),

  // --- customers ---
  users: (token: string, params: UserQuery = {}) =>
    call<Page<AdminUser>>(`/admin/users${query({ ...params })}`, token),

  user: (token: string, id: string) => call<CustomerDetail>(`/admin/users/${id}`, token),

  updateUser: (token: string, id: string, input: { is_active?: boolean; role_id?: string }) =>
    call<AdminUser>(`/admin/users/${id}`, token, { method: "PATCH", body: body(input) }),

  // --- the signed-in customer's own records ---
  myOrders: (token: string, page = 1) =>
    call<Page<OrderListItem>>(`/orders${query({ page, size: 20 })}`, token),

  updateProfile: (token: string, input: { full_name?: string; phone?: string | null }) =>
    call<AdminUser>("/users/me", token, { method: "PATCH", body: body(input) }),

  changePassword: (token: string, current_password: string, new_password: string) =>
    call<{ message: string }>("/users/me/password", token, {
      method: "POST",
      body: body({ current_password, new_password }),
    }),

  // --- roles and access ---
  menus: (token: string) => call<Menu[]>("/admin/menus", token),

  roles: (token: string) => call<RoleDetail[]>("/admin/roles", token),

  createRole: (token: string, input: RoleInput) =>
    call<RoleDetail>("/admin/roles", token, { method: "POST", body: body(input) }),

  updateRole: (token: string, id: string, input: Partial<RoleInput>) =>
    call<RoleDetail>(`/admin/roles/${id}`, token, { method: "PATCH", body: body(input) }),

  deleteRole: (token: string, id: string) =>
    call<void>(`/admin/roles/${id}`, token, { method: "DELETE" }),
};

/**
 * Shapes returned by the FastAPI admin API.
 *
 * Money arrives as a decimal *string* (`"2070.00"`) so nothing is lost to
 * floating point on the way here — parse it only to format it.
 */

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

export type PaymentStatus = "unpaid" | "pending" | "paid" | "failed" | "refunded";

/** Menu keys, mirroring MENUS in app/utils/menus.py. */
export type MenuKey =
  | "dashboard"
  | "reports"
  | "orders"
  | "products"
  | "categories"
  | "customers"
  | "roles";

export type MenuAction = "view" | "manage";

/** What a role may do, keyed by menu. Absent menu = no access at all. */
export type PermissionMap = Partial<Record<MenuKey, MenuAction[]>>;

export interface Menu {
  key: MenuKey;
  label: string;
  description: string;
}

export interface Permission {
  menu: MenuKey;
  can_view: boolean;
  can_manage: boolean;
}

/** The summary every user payload carries. */
export interface Role {
  id: string;
  name: string;
  slug: string;
  is_staff: boolean;
  is_system: boolean;
}

export interface RoleDetail extends Role {
  description: string | null;
  permissions: Permission[];
  user_count: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
}

/** `/auth/me` — the profile plus what this account may reach. */
export interface Me extends AdminUser {
  permissions: PermissionMap;
}

export interface Variant {
  id: string;
  size_ml: number;
  name: string;
  sku: string;
  price: string;
  compare_at_price: string | null;
  stock_quantity: number;
  is_active: boolean;
  in_stock: boolean;
}

export interface ProductImage {
  id: string;
  url: string;
  alt_text: string | null;
  position: number;
  is_primary: boolean;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  position: number;
  is_active: boolean;
  parent_id: string | null;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  brand: string | null;
  is_active: boolean;
  is_featured: boolean;
  category_id: string | null;
  category: Category | null;
  variants: Variant[];
  images: ProductImage[];
  price_from: string | null;
  price_to: string | null;
  in_stock: boolean;
  primary_image: string | null;
}

export interface OrderListItem {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  total: string;
  currency: string;
  created_at: string;
}

export interface OrderItem {
  id: string;
  variant_id: string | null;
  product_name: string;
  variant_name: string;
  sku: string;
  image_url: string | null;
  unit_price: string;
  quantity: number;
  line_total: string;
}

export interface Payment {
  id: string;
  provider: string;
  reference: string | null;
  amount: string;
  currency: string;
  status: PaymentStatus;
  created_at: string;
}

export interface Order {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: string;
  currency: string;
  subtotal: string;
  shipping_fee: string;
  discount_total: string;
  total: string;
  recipient_name: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  district: string | null;
  postal_code: string | null;
  country: string;
  customer_note: string | null;
  created_at: string;
  items: OrderItem[];
  payments: Payment[];
}

export interface DashboardCounters {
  total_orders: number;
  pending_orders: number;
  revenue: string;
  low_stock_variants: number;
  total_customers: number;
  active_products: number;
  currency: string;
}

export interface RevenuePoint {
  day: string;
  orders: number;
  revenue: string;
}

export interface TopProduct {
  product_id: string | null;
  product_name: string;
  units: number;
  revenue: string;
}

export interface LowStockVariant {
  variant_id: string;
  product_id: string;
  product_name: string;
  product_slug: string;
  size_ml: number;
  sku: string;
  stock_quantity: number;
}

export interface Dashboard {
  counters: DashboardCounters;
  revenue_series: RevenuePoint[];
  top_products: TopProduct[];
  recent_orders: OrderListItem[];
  low_stock: LowStockVariant[];
}

/* ------------------------------------------------------------- sales reports */

export type Granularity = "daily" | "monthly";

/** One day, or one month, of trading. */
export interface SalesBucket {
  /** ISO date: the day itself, or the first of the month. */
  period: string;
  /** Formatted by the API so every client renders the same month names. */
  label: string;
  orders: number;
  units: number;
  gross_sales: string;
  discount: string;
  shipping: string;
  net_revenue: string;
  cancelled_orders: number;
  cancelled_value: string;
  average_order_value: string;
}

export interface SalesSummary {
  orders: number;
  units: number;
  gross_sales: string;
  discount: string;
  shipping: string;
  net_revenue: string;
  cancelled_orders: number;
  cancelled_value: string;
  average_order_value: string;
  previous_net_revenue: string;
  /** null when the preceding window sold nothing — growth from zero has no %. */
  change_pct: number | null;
  best_period: string | null;
  best_period_revenue: string;
}

/** The range sliced by one dimension — order status, or payment method. */
export interface ReportBreakdown {
  key: string;
  label: string;
  orders: number;
  revenue: string;
}

export interface ReportProduct {
  product_id: string | null;
  product_name: string;
  units: number;
  revenue: string;
}

export interface SalesReport {
  granularity: Granularity;
  start_date: string;
  end_date: string;
  /** The zone whose midnight divides one bucket from the next. */
  timezone: string;
  currency: string;
  summary: SalesSummary;
  buckets: SalesBucket[];
  top_products: ReportProduct[];
  status_breakdown: ReportBreakdown[];
  payment_breakdown: ReportBreakdown[];
}

export interface CustomerDetail {
  user: AdminUser;
  order_count: number;
  lifetime_value: string;
  currency: string;
  last_order_at: string | null;
  orders: OrderListItem[];
}

export interface VariantInput {
  size_ml: number;
  price: string;
  compare_at_price?: string | null;
  stock_quantity: number;
  is_active: boolean;
  sku?: string | null;
}

export interface ProductInput {
  name: string;
  short_description: string | null;
  description: string | null;
  brand: string | null;
  is_active: boolean;
  is_featured: boolean;
  category_id: string | null;
  slug?: string | null;
  variants: VariantInput[];
  images: { url: string; alt_text: string | null; position: number; is_primary: boolean }[];
}

/** Sizes every product must carry. Mirrors DEFAULT_VARIANT_SIZES_ML on the API. */
export const STANDARD_SIZES_ML = [6, 10, 15, 30] as const;

/** Mirrors MAX_PRODUCT_IMAGES on the API. */
export const MAX_PRODUCT_IMAGES = 4;

/** What the file picker offers. The API sniffs the bytes regardless. */
export const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic";

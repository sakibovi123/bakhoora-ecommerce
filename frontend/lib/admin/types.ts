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

/** `partial` is an order carrying a due — some money in, the rest owed. */
export type PaymentStatus =
  | "unpaid"
  | "pending"
  | "partial"
  | "paid"
  | "failed"
  | "refunded";

/** Menu keys, mirroring MENUS in app/utils/menus.py. */
export type MenuKey =
  | "dashboard"
  | "reports"
  | "orders"
  | "products"
  | "categories"
  | "customers"
  | "roles"
  | "expenses"
  | "settings";

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
  recipient_name: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  total: string;
  amount_paid: string;
  amount_due: string;
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
  /** Collected so far, and what is still owed. The API does the subtraction. */
  amount_paid: string;
  amount_due: string;
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
  expenses: string;
  net_profit: string;
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
  expenses: string;
  net_profit: string;
  previous_expenses: string;
  previous_net_profit: string;
  /** null unless the preceding window was itself profitable — a percentage
      across a loss-to-profit sign flip means nothing. */
  net_profit_change_pct: number | null;
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

/** Spend in one category. Counts entries, not orders. */
export interface ExpenseBreakdown {
  key: string;
  label: string;
  entries: number;
  amount: string;
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
  expense_breakdown: ExpenseBreakdown[];
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


/** The shop's own settings. One row behind /admin/settings. */
export type AdvanceMode = "none" | "flat" | "delivery";

export interface ShopSettings {
  site_title: string;
  tagline: string | null;
  currency_code: string;
  currency_symbol: string;
  /** Decimal as a JSON string, like every other money field the API sends. */
  delivery_charge: string;
  free_delivery_threshold: string | null;
  advance_mode: AdvanceMode;
  advance_amount: string;
  logo_url: string | null;
  favicon_url: string | null;
}

export interface ShopSettingsInput {
  site_title?: string;
  tagline?: string | null;
  currency_code?: string;
  currency_symbol?: string;
  delivery_charge?: string;
  free_delivery_threshold?: string;
  clear_free_delivery_threshold?: boolean;
  advance_mode?: AdvanceMode;
  advance_amount?: string;
}


/* ------------------------------------------------------------------ expenses */

export interface ExpenseCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  position: number;
  is_active: boolean;
}

export interface Expense {
  id: string;
  /** ISO date. The day the money left, not the day the row was typed in. */
  spent_on: string;
  amount: string;
  description: string;
  note: string | null;
  category: ExpenseCategory;
}

export interface ExpenseInput {
  spent_on?: string;
  amount?: string;
  description?: string;
  note?: string | null;
  category_id?: string;
}

export interface ExpenseQuery {
  page?: number;
  size?: number;
  search?: string | null;
  category_id?: string | null;
  start?: string | null;
  end?: string | null;
  sort?: "newest" | "oldest" | "amount_desc" | "amount_asc";
}

/** A page of expenses, plus the total across the whole filtered range. */
export interface ExpensePage {
  items: Expense[];
  total: number;
  page: number;
  size: number;
  pages: number;
  total_spent: string;
}


/* ----------------------------------------------------------- caption assistant */

export type CaptionPlatform = "reel" | "facebook" | "instagram" | "whatsapp";

export interface CaptionMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CaptionReply {
  content: string;
  model: string;
}

export interface CaptionProduct {
  id: string;
  label: string;
}

export interface CaptionStatus {
  /** False when OPENROUTER_API_KEY is unset — the panel hides the button. */
  configured: boolean;
  model: string;
}

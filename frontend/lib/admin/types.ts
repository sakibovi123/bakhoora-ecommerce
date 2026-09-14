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
  | "combos"
  | "customers"
  | "roles"
  | "expenses"
  | "pricing"
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

/** One bottle inside a combo line. Carries no money — the line above does. */
export interface OrderItemComponent {
  id: string;
  variant_id: string | null;
  product_name: string;
  variant_name: string;
  sku: string;
  quantity: number;
}

export interface OrderItem {
  id: string;
  variant_id: string | null;
  /** Set on a combo line. Everything shown is already snapshotted on the line. */
  combo_id: string | null;
  product_name: string;
  variant_name: string;
  sku: string;
  image_url: string | null;
  unit_price: string;
  quantity: number;
  line_total: string;
  /** Empty on a single bottle; what went in the box on a combo. */
  components: OrderItemComponent[];
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
  /** Of `expenses`, the part billed but not yet paid. Not subtracted again —
      net profit already counts the full cost. */
  outstanding: string;
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
  outstanding: string;
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
/* ------------------------------------------------------------------ combos */

/**
 * A bundle of whole perfumes sold at one flat price.
 *
 * A combo stores which perfumes are in it and what each bottle size costs —
 * nothing else. Availability, how many could be assembled, and what the same
 * bottles cost separately are all worked out by the API from live stock, which
 * is why none of them can be written back.
 */
export interface Combo {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  /** Campaign grouping, e.g. "Everyday / Fresh". */
  use_case: string | null;
  /** e.g. "Best: Hot/humid weather." */
  occasion: string | null;
  image_url: string | null;
  position: number;
  is_active: boolean;
  is_featured: boolean;
  products: ComboProduct[];
  sizes: ComboSize[];
  /** At least one size option can be sold right now. */
  is_available: boolean;
  price_from: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ComboProduct {
  product_id: string;
  name: string;
  slug: string;
  brand: string | null;
  image_url: string | null;
  position: number;
  is_active: boolean;
}

/** One buyable option: the whole bundle at one bottle size. */
export interface ComboSize {
  id: string;
  size_ml: number;
  sku: string;
  price: string;
  is_active: boolean;
  /** Derived, e.g. "5 × 6ml". */
  label: string;
  components: ComboComponent[];
  /** How many of the bundle could be made up from stock on hand. */
  max_sets: number;
  is_available: boolean;
  /** What the same bottles cost bought one by one. Null if one is missing. */
  components_total: string | null;
  savings: string | null;
}

/** One bottle of one size option — where the stock actually lives. */
export interface ComboComponent {
  product_id: string;
  product_name: string;
  variant_id: string | null;
  sku: string | null;
  price: string | null;
  stock_quantity: number;
  is_available: boolean;
  /** Why it cannot be counted, in words fit to print. Null when it can. */
  reason: string | null;
}

/** What goes up to the API. Sizes and products replace those lists wholesale. */
export interface ComboInput {
  name: string;
  slug?: string;
  tagline?: string | null;
  description?: string | null;
  use_case?: string | null;
  occasion?: string | null;
  image_url?: string | null;
  position?: number;
  is_active?: boolean;
  is_featured?: boolean;
  products?: string[];
  sizes?: ComboSizeInput[];
}

export interface ComboSizeInput {
  size_ml: number;
  price: string;
  is_active: boolean;
  sku?: string;
}

/** One perfume, and how much of the campaign leans on it. */
export interface CoverageRow {
  product_id: string;
  product_name: string;
  brand: string | null;
  times_included: number;
  coverage_pct: number;
  combo_names: string[];
  lowest_stock: number | null;
}

export interface StockCoverage {
  total_combos: number;
  /** Perfumes carried by at least one combo, busiest first. */
  rows: CoverageRow[];
  /** In the catalogue, in no combo at all. */
  uncovered: CoverageRow[];
}

/** Mirrors MIN_COMBO_PRODUCTS / MAX_COMBO_PRODUCTS on the API. */
export const MIN_COMBO_PRODUCTS = 2;
export const MAX_COMBO_PRODUCTS = 12;

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


/* ------------------------------------------------------------------- pricing */
//
// Everything here carries `cost_price` — what the shop pays its suppliers — and
// is served only from admin-guarded routes. It is deliberately NOT part of
// `Variant`, which is what the storefront receives.

/** One size as the pricing sheet shows it. */
export interface PriceSheetRow {
  variant_id: string;
  product_id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  variant_name: string;
  sku: string;
  size_ml: number;
  /** Null when nobody has recorded what this costs to buy. */
  cost_price: string | null;
  price: string;
  stock_quantity: number;
  is_active: boolean;
  /** Null unless cost is known — an unpriced bottle has an unknown margin. */
  profit: string | null;
  margin_pct: string | null;
  /** Set when this size already sits in an undecided review. */
  pending_reference: string | null;
}

export interface PriceReviewLine {
  id: string;
  variant_id: string | null;
  product_name: string;
  variant_name: string;
  sku: string;
  size_ml: number;
  from_cost: string | null;
  from_price: string;
  to_cost: string | null;
  to_price: string;
  from_profit: string | null;
  to_profit: string | null;
  to_margin_pct: string | null;
  /** Approving would sell this below what it costs. Shown, not refused. */
  below_cost: boolean;
  /** Present on a single review, absent in the queue listing. */
  current_cost?: string | null;
  current_price?: string | null;
  /** Somebody moved this price after the sheet was drawn up. */
  drifted?: boolean;
}

export type PriceReviewStatus = "pending" | "approved" | "rejected";

export interface PriceReview {
  id: string;
  reference: string;
  status: PriceReviewStatus;
  note: string | null;
  review_note: string | null;
  proposed_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  lines: PriceReviewLine[];
  line_count: number;
}

/** What approving actually did. `skipped` names sizes deleted meanwhile. */
export interface PriceReviewApplied {
  review: PriceReview;
  updated: number;
  skipped: string[];
}

export interface PriceReviewPage {
  items: PriceReview[];
  total: number;
  page: number;
  size: number;
  pages: number;
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
  /** ISO date. The day the bill is dated, not the day the row was typed in. */
  spent_on: string;
  /** The full cost of the bill, paid or not. This is what the report charges. */
  amount: string;
  /** How much has actually been handed over. Equals `amount` when settled. */
  amount_paid: string;
  /** `amount` minus `amount_paid`, floored at zero. Computed by the API so the
      panel never arrives at a different due than the report did. */
  amount_due: string;
  description: string;
  note: string | null;
  supplier: string | null;
  /** The supplier's own number for the bill, as written on it. */
  reference: string | null;
  /** The photographed bill this was read off, or null if typed in by hand. */
  receipt_url: string | null;
  category: ExpenseCategory;
}

export interface ExpenseInput {
  spent_on?: string;
  amount?: string;
  /** Omit to mean "paid in full". Send "0" to mean nothing has been paid. */
  amount_paid?: string | null;
  description?: string;
  note?: string | null;
  supplier?: string | null;
  reference?: string | null;
  receipt_url?: string | null;
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
  /** Of `total_spent`, what is still owed to suppliers across the same range. */
  total_outstanding: string;
}

/** One row read off a photographed bill. Kept for the note, not stored. */
export interface ReceiptLine {
  description: string;
  quantity: string | null;
  unit_price: string | null;
  amount: string | null;
}

/**
 * What the reader made of a photograph. Nothing here has been saved.
 *
 * Every figure is nullable on purpose: a bill whose total could not be read
 * comes back with the rest filled in and that one field blank, so the operator
 * types one number rather than starting again. Treat it as a filled-in form.
 */
export interface ReceiptDraft {
  receipt_url: string;
  supplier: string | null;
  reference: string | null;
  spent_on: string | null;
  amount: string | null;
  amount_paid: string | null;
  description: string | null;
  note: string | null;
  category_id: string | null;
  lines: ReceiptLine[];
  confidence: "high" | "medium" | "low";
  /** Anything the reader was unsure of, in words the operator can act on. */
  warnings: string[];
  model: string;
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

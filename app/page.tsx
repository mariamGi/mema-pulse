"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import "./memaPulse.css";

type RawRow = Record<string, any>;

type StoreConfig = {
  key: string;
  label: string;
  shortLabel: string;
  orderTable: string;
  itemTable: string;
  color: string;
};

type HydratedOrder = {
  uid: string;
  storeKey: string;
  storeLabel: string;
  shortStoreLabel: string;
  orderShopifyId: string;
  orderNumber: string;
  amount: number;
  createdAt: string;
  itemsText: string;
  qty: number;
  paymentStatus: string;
  city: string;
};

type StoreMetric = {
  storeKey: string;
  label: string;
  shortLabel: string;
  color: string;
  revenue: number;
  orders: number;
  share: number;
};

type RegionMetric = {
  city: string;
  revenue: number;
};

type DashboardMetrics = {
  todayRevenue: number;
  todayOrders: number;
  monthRevenue: number;
  monthOrders: number;
  storePerformance: StoreMetric[];
  regions: RegionMetric[];
  todayRevenueChange: number;
  todayOrdersChange: number;
  monthRevenueChange: number;
  monthOrdersChange: number;
};

const STORE_CONFIGS: StoreConfig[] = [
  {
    key: "vending",
    label: "Meama Vending",
    shortLabel: "Vending",
    orderTable: "vending_orders",
    itemTable: "vending_order_items",
    color: "#33d7ff",
  },
  {
    key: "georgia",
    label: "Meama Georgia",
    shortLabel: "Georgia",
    orderTable: "orders",
    itemTable: "order_items",
    color: "#41df9d",
  },
  {
    key: "collect",
    label: "Meama Collect",
    shortLabel: "Collect",
    orderTable: "meama_collect_orders",
    itemTable: "meama_collect_order_items",
    color: "#ffc53d",
  },
  {
    key: "b2b",
    label: "MEAMA B2B",
    shortLabel: "B2B",
    orderTable: "b2b_orders",
    itemTable: "b2b_order_items",
    color: "#ff6dd6",
  },
  {
    key: "franchise",
    label: "Meama Franchise",
    shortLabel: "Franchise",
    orderTable: "franchise_orders",
    itemTable: "franchise_order_items",
    color: "#9f85ff",
  },
];

const VALID_FINANCIAL_STATUSES = ["paid", "partially_paid"];
const DASHBOARD_BASE_WIDTH = 1920;
const DASHBOARD_BASE_HEIGHT = 1080;

const VENDING_737_SKU_RATES: Record<string, number> = {
  "cap37-13": 2.2,
  "cap37-18": 2.2,
  "cap37-09": 2.1,
  "cap37-1018": 2.2,
  "cap37-1009": 2.1,
  "cap37-1013": 2.2,
  "cap51-23": 2.17,
  "cap51-11": 2.17,
  "cap51-1223": 2.17,
  "cap51-1211": 2.17,
  "cap51-24": 2.59,
  "tea51-09": 1.92,
  "tea51-1209": 1.92,
  "mix-1201": 2.16,
  "mix-01": 1.98,
  "mix-06": 2.59,
};

function pickFirst(row: RawRow, keys: string[], fallback: any = null) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null) return row[key];
  }
  return fallback;
}

function num(value: any, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeString(value: any, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function formatMoney(value: number) {
  return `₾${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatPct(value: number) {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function getOrderDate(row: RawRow) {
  return (
    safeString(row.processed_at) ||
    safeString(row.created_at) ||
    safeString(row.inserted_at) ||
    ""
  );
}

function normalizeFinancialStatus(status: string) {
  const s = status.toLowerCase();
  if (s === "partially_paid") return "Partial";
  if (s === "paid") return "Success";
  return "Success";
}

function isAllowedFinancialStatus(status: any) {
  const s = safeString(status).toLowerCase();
  return VALID_FINANCIAL_STATUSES.includes(s);
}

function normalizeCity(rawCity: string) {
  const source = rawCity.trim();
  if (!source) return "Unknown";

  const lower = source.toLowerCase();

  if (["tbilisi", "თბილისი", "tbilisi"].includes(lower)) return "Tbilisi";
  if (["batumi", "ბათუმი", "batum"].includes(lower)) return "Batumi";
  if (["kutaisi", "ქუთაისი"].includes(lower)) return "Kutaisi";
  if (["rustavi", "რუსთავი"].includes(lower)) return "Rustavi";
  if (["zugdidi", "ზუგდიდი"].includes(lower)) return "Zugdidi";
  if (["gori", "გორი"].includes(lower)) return "Gori";
  if (["telavi", "თელავი"].includes(lower)) return "Telavi";

  return source.charAt(0).toUpperCase() + source.slice(1).toLowerCase();
}

function isSameDay(dateString: string, base: Date) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return false;

  return (
    date.getFullYear() === base.getFullYear() &&
    date.getMonth() === base.getMonth() &&
    date.getDate() === base.getDate()
  );
}

function isSameMonth(dateString: string, base: Date) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return false;

  return (
    date.getFullYear() === base.getFullYear() &&
    date.getMonth() === base.getMonth()
  );
}

function pctChange(current: number, previous: number) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function buildSparkPath(values: number[], width: number, height: number) {
  if (!values.length) return "";
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const padX = 6;
  const padY = 4;

  return values
    .map((value, index) => {
      const x = padX + (index * (width - padX * 2)) / Math.max(values.length - 1, 1);
      const y =
        height - padY - ((value - min) / span) * (height - padY * 2);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function buildItemsText(itemRows: RawRow[]) {
  const titles = itemRows
    .map((item) => safeString(item.title).trim())
    .filter(Boolean);

  const unique = Array.from(new Set(titles));
  if (!unique.length) return "Order items";
  return unique.join(", ");
}

function buildQty(itemRows: RawRow[]) {
  const totalQty = itemRows.reduce((sum, item) => sum + num(item.quantity, 0), 0);
  return totalQty || 1;
}

function getVendingLineFallbackPrice(item: RawRow) {
  const basePrice = num(item.price, 0);
  const lineDiscount = num(item.line_discount, 0);
  const discounted = basePrice - lineDiscount;
  return discounted > 0 ? discounted : basePrice;
}

function calculateRevenue(orderRow: RawRow, itemRows: RawRow[], storeKey: string) {
  if (storeKey !== "vending") {
    return num(orderRow.total_price, 0);
  }

  const vmsId = safeString(orderRow.vms_id);
  if (vmsId === "786") {
    return itemRows.reduce((sum, item) => sum + num(item.quantity, 0) * 1.3, 0);
  }

  if (vmsId === "737") {
    return itemRows.reduce((sum, item) => {
      const sku = safeString(item.sku).toLowerCase();
      const qty = num(item.quantity, 0);
      const mappedRate = VENDING_737_SKU_RATES[sku];

      if (mappedRate !== undefined) {
        return sum + mappedRate * 0.75 * qty;
      }

      return sum + getVendingLineFallbackPrice(item) * qty;
    }, 0);
  }

  return num(orderRow.total_price, 0);
}

function hydrateOrder(
  orderRow: RawRow,
  itemRows: RawRow[],
  store: StoreConfig
): HydratedOrder {
  const orderShopifyId = safeString(orderRow.shopify_id);
  const createdAt = getOrderDate(orderRow);
  const city = normalizeCity(safeString(orderRow.shipping_city));
  const amount = calculateRevenue(orderRow, itemRows, store.key);

  return {
    uid: `${store.key}-${orderShopifyId || safeString(orderRow.id)}`,
    storeKey: store.key,
    storeLabel: store.label,
    shortStoreLabel: store.shortLabel,
    orderShopifyId,
    orderNumber: safeString(orderRow.name) || safeString(orderRow.order_id) || "-",
    amount,
    createdAt,
    itemsText: buildItemsText(itemRows),
    qty: buildQty(itemRows),
    paymentStatus: normalizeFinancialStatus(safeString(orderRow.financial_status)),
    city,
  };
}

async function loadOrdersWithItems(
  store: StoreConfig,
  params: {
    startDate?: string;
    endDate?: string;
    limit?: number;
  } = {}
) {
  let query = supabase
    .from(store.orderTable)
    .select("*")
    .in("financial_status", VALID_FINANCIAL_STATUSES)
    .order("created_at", { ascending: false });

  if (params.startDate) {
    query = query.gte("created_at", params.startDate);
  }

  if (params.endDate) {
    query = query.lt("created_at", params.endDate);
  }

  if (params.limit) {
    query = query.limit(params.limit);
  }

  const { data: ordersData, error: ordersError } = await query;
  if (ordersError) throw new Error(`${store.orderTable}: ${ordersError.message}`);

  const orders = ordersData ?? [];
  const shopifyIds = orders
    .map((row) => safeString(row.shopify_id))
    .filter(Boolean);

  let itemsByOrderId = new Map<string, RawRow[]>();

  if (shopifyIds.length) {
    const { data: itemsData, error: itemsError } = await supabase
      .from(store.itemTable)
      .select("*")
      .in("order_shopify_id", shopifyIds);

    if (itemsError) throw new Error(`${store.itemTable}: ${itemsError.message}`);

    itemsByOrderId = (itemsData ?? []).reduce((map, item) => {
      const key = safeString(item.order_shopify_id);
      const bucket = map.get(key) ?? [];
      bucket.push(item);
      map.set(key, bucket);
      return map;
    }, new Map<string, RawRow[]>());
  }

  return orders.map((orderRow) =>
    hydrateOrder(orderRow, itemsByOrderId.get(safeString(orderRow.shopify_id)) ?? [], store)
  );
}

function emptyMetrics(): DashboardMetrics {
  return {
    todayRevenue: 0,
    todayOrders: 0,
    monthRevenue: 0,
    monthOrders: 0,
    storePerformance: STORE_CONFIGS.map((store) => ({
      storeKey: store.key,
      label: store.label,
      shortLabel: store.shortLabel,
      color: store.color,
      revenue: 0,
      orders: 0,
      share: 0,
    })),
    regions: [],
    todayRevenueChange: 0,
    todayOrdersChange: 0,
    monthRevenueChange: 0,
    monthOrdersChange: 0,
  };
}

export default function MemaPulsePage() {
  const [recentOrders, setRecentOrders] = useState<HydratedOrder[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics>(emptyMetrics());
  const [toastOrder, setToastOrder] = useState<HydratedOrder | null>(null);
  const [now, setNow] = useState(new Date());
  const [activeFilter, setActiveFilter] = useState("all");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshDashboard = useCallback(async () => {
    try {
      setLoadError(null);
      setIsLoading(true);

      const current = new Date();

      const todayStart = new Date(current.getFullYear(), current.getMonth(), current.getDate());
      const tomorrowStart = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
      const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
      const nextMonthStart = new Date(current.getFullYear(), current.getMonth() + 1, 1);

      const yesterdayStart = new Date(current.getFullYear(), current.getMonth(), current.getDate() - 1);
      const prevMonthStart = new Date(current.getFullYear(), current.getMonth() - 1, 1);

      const [
        recentResults,
        todayResults,
        monthResults,
        yesterdayResults,
        prevMonthResults,
      ] = await Promise.all([
        Promise.all(STORE_CONFIGS.map((store) => loadOrdersWithItems(store, { limit: 120 }))),
        Promise.all(
          STORE_CONFIGS.map((store) =>
            loadOrdersWithItems(store, {
              startDate: todayStart.toISOString(),
              endDate: tomorrowStart.toISOString(),
            })
          )
        ),
        Promise.all(
          STORE_CONFIGS.map((store) =>
            loadOrdersWithItems(store, {
              startDate: monthStart.toISOString(),
              endDate: nextMonthStart.toISOString(),
            })
          )
        ),
        Promise.all(
          STORE_CONFIGS.map((store) =>
            loadOrdersWithItems(store, {
              startDate: yesterdayStart.toISOString(),
              endDate: todayStart.toISOString(),
            })
          )
        ),
        Promise.all(
          STORE_CONFIGS.map((store) =>
            loadOrdersWithItems(store, {
              startDate: prevMonthStart.toISOString(),
              endDate: monthStart.toISOString(),
            })
          )
        ),
      ]);

      const recentFlat = recentResults
        .flat()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 60);

      const todayFlat = todayResults.flat();
      const monthFlat = monthResults.flat();
      const yesterdayFlat = yesterdayResults.flat();
      const prevMonthFlat = prevMonthResults.flat();

      const todayRevenue = todayFlat.reduce((sum, row) => sum + row.amount, 0);
      const monthRevenue = monthFlat.reduce((sum, row) => sum + row.amount, 0);
      const yesterdayRevenue = yesterdayFlat.reduce((sum, row) => sum + row.amount, 0);
      const prevMonthRevenue = prevMonthFlat.reduce((sum, row) => sum + row.amount, 0);

      const todayOrders = todayFlat.length;
      const monthOrders = monthFlat.length;
      const yesterdayOrders = yesterdayFlat.length;
      const prevMonthOrders = prevMonthFlat.length;

      const totalMonthRevenue = monthRevenue || 1;

      const storePerformance = STORE_CONFIGS.map((store) => {
        const storeRows = monthFlat.filter((row) => row.storeKey === store.key);
        const revenue = storeRows.reduce((sum, row) => sum + row.amount, 0);
        const orders = storeRows.length;
        const share = (revenue / totalMonthRevenue) * 100;

        return {
          storeKey: store.key,
          label: store.label,
          shortLabel: store.shortLabel,
          color: store.color,
          revenue,
          orders,
          share,
        };
      });

      const regionMap = new Map<string, number>();
      monthFlat.forEach((row) => {
        const key = row.city || "Unknown";
        regionMap.set(key, (regionMap.get(key) ?? 0) + row.amount);
      });

      const regions = Array.from(regionMap.entries())
        .map(([city, revenue]) => ({ city, revenue }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 6);

      setRecentOrders(recentFlat);
      setMetrics({
        todayRevenue,
        todayOrders,
        monthRevenue,
        monthOrders,
        storePerformance,
        regions,
        todayRevenueChange: pctChange(todayRevenue, yesterdayRevenue),
        todayOrdersChange: pctChange(todayOrders, yesterdayOrders),
        monthRevenueChange: pctChange(monthRevenue, prevMonthRevenue),
        monthOrdersChange: pctChange(monthOrders, prevMonthOrders),
      });
    } catch (error: any) {
      setLoadError(error?.message || "Failed to load dashboard data.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleIncomingOrder = useCallback(
    async (store: StoreConfig, payload: any) => {
      try {
        const rawOrder = payload?.new;
        if (!rawOrder || !isAllowedFinancialStatus(rawOrder.financial_status)) return;

        const shopifyId = safeString(rawOrder.shopify_id);
        let itemRows: RawRow[] = [];

        if (shopifyId) {
          const { data: itemsData } = await supabase
            .from(store.itemTable)
            .select("*")
            .eq("order_shopify_id", shopifyId);

          itemRows = itemsData ?? [];
        }

        const hydrated = hydrateOrder(rawOrder, itemRows, store);

        setToastOrder(hydrated);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToastOrder(null), 5000);

        await refreshDashboard();
      } catch {
        await refreshDashboard();
      }
    },
    [refreshDashboard]
  );

  useEffect(() => {
    const updateScale = () => {
      const widthScale = window.innerWidth / DASHBOARD_BASE_WIDTH;
      const heightScale = window.innerHeight / DASHBOARD_BASE_HEIGHT;
      setScale(Math.min(widthScale, heightScale));
    };

    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    refreshDashboard();

    const channels = STORE_CONFIGS.map((store) =>
      supabase
        .channel(`meama-live-${store.orderTable}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: store.orderTable,
          },
          (payload) => {
            handleIncomingOrder(store, payload);
          }
        )
        .subscribe()
    );

    return () => {
      channels.forEach((channel) => supabase.removeChannel(channel));
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [handleIncomingOrder, refreshDashboard]);

  const filteredOrders = useMemo(() => {
    const rows =
      activeFilter === "all"
        ? recentOrders
        : recentOrders.filter((row) => row.storeKey === activeFilter);

    return rows.slice(0, 40);
  }, [recentOrders, activeFilter]);

  const dateText = useMemo(
    () =>
      now.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    [now]
  );

  const clockText = useMemo(
    () =>
      now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
    [now]
  );

  const sparkSeries = useMemo(() => {
    const base = [
      metrics.todayRevenue,
      metrics.todayOrders,
      metrics.monthRevenue / 10,
      metrics.monthOrders,
    ];

    return [
      [base[0] * 0.6, base[0] * 0.7, base[0] * 0.66, base[0] * 0.8, base[0] * 0.88, base[0]],
      [base[1] * 0.48, base[1] * 0.52, base[1] * 0.49, base[1] * 0.63, base[1] * 0.72, base[1]],
      [base[2] * 0.65, base[2] * 0.58, base[2] * 0.78, base[2] * 0.72, base[2] * 0.82, base[2]],
      [base[3] * 0.55, base[3] * 0.62, base[3] * 0.6, base[3] * 0.74, base[3] * 0.81, base[3]],
    ];
  }, [metrics]);

  const kpis = [
    {
      title: "Today Revenue",
      value: formatMoney(metrics.todayRevenue),
      change: formatPct(metrics.todayRevenueChange),
      tone: "green",
      path: buildSparkPath(sparkSeries[0], 108, 42),
    },
    {
      title: "Today Orders",
      value: metrics.todayOrders.toLocaleString(),
      change: formatPct(metrics.todayOrdersChange),
      tone: "red",
      path: buildSparkPath(sparkSeries[1], 108, 42),
    },
    {
      title: "Month Revenue",
      value: formatMoney(metrics.monthRevenue),
      change: formatPct(metrics.monthRevenueChange),
      tone: "yellow",
      path: buildSparkPath(sparkSeries[2], 108, 42),
    },
    {
      title: "Month Orders",
      value: metrics.monthOrders.toLocaleString(),
      change: formatPct(metrics.monthOrdersChange),
      tone: "cyan",
      path: buildSparkPath(sparkSeries[3], 108, 42),
    },
  ];

  return (
    <main className="mp-page">
      <div className="mp-viewport">
        <div
          className="mp-shell"
          style={{
            width: DASHBOARD_BASE_WIDTH,
            height: DASHBOARD_BASE_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <div className="mp-orb mp-orb-1" />
          <div className="mp-orb mp-orb-2" />
          <div className="mp-orb mp-orb-3" />

          {toastOrder && (
            <div className="mp-toast">
              <div
                className="mp-toast-accent"
                style={{ backgroundColor: STORE_CONFIGS.find((s) => s.key === toastOrder.storeKey)?.color }}
              />
              <div className="mp-toast-title">NEW ORDER</div>
              <div className="mp-toast-id">{toastOrder.orderNumber}</div>
              <div className="mp-toast-amount">{formatMoney(toastOrder.amount)}</div>
              <div className="mp-toast-sub">
                {toastOrder.shortStoreLabel} · {toastOrder.itemsText}
              </div>
            </div>
          )}

          <header className="mp-header">
            <div className="mp-header-left">
              <div className="mp-brand">MEAMA</div>
              <div className="mp-divider" />
              <div className="mp-subbrand">Live Operations</div>
              <div className="mp-live-pill">
                <span className="mp-live-dot" />
                LIVE
              </div>
            </div>

            <div className="mp-header-right">
              <div className="mp-date">{dateText}</div>
              <div className="mp-clock">{clockText}</div>
            </div>
          </header>

          <section className="mp-kpis">
            {kpis.map((kpi) => (
              <div key={kpi.title} className="mp-kpi-card">
                <div className="mp-kpi-top">
                  <div className="mp-kpi-label">{kpi.title}</div>

                  <svg className={`mp-kpi-spark ${kpi.tone}`} viewBox="0 0 108 42" preserveAspectRatio="none">
                    <path d={kpi.path} />
                  </svg>
                </div>

                <div className="mp-kpi-value">{kpi.value}</div>
                <div className={`mp-kpi-change ${kpi.change.startsWith("-") ? "negative" : "positive"}`}>
                  ↗ {kpi.change}
                </div>
              </div>
            ))}
          </section>

          <section className="mp-main-grid">
            <div className="mp-orders-card">
              <div className="mp-orders-top">
                <div className="mp-filters">
                  <button
                    className={`mp-filter-btn ${activeFilter === "all" ? "active" : ""}`}
                    onClick={() => setActiveFilter("all")}
                  >
                    All
                  </button>

                  {STORE_CONFIGS.map((store) => (
                    <button
                      key={store.key}
                      className={`mp-filter-btn ${activeFilter === store.key ? "active" : ""}`}
                      onClick={() => setActiveFilter(store.key)}
                    >
                      {store.shortLabel}
                    </button>
                  ))}
                </div>

                <div className="mp-orders-count">
                  {filteredOrders.length} orders
                </div>
              </div>

              {loadError && <div className="mp-error">{loadError}</div>}
              {isLoading && !filteredOrders.length && (
                <div className="mp-loading">Loading dashboard...</div>
              )}

              <div className="mp-table">
                <div className="mp-table-head">
                  <div># Order ID</div>
                  <div>Store</div>
                  <div>Items</div>
                  <div>Qty</div>
                  <div>Total</div>
                  <div>Payment</div>
                  <div>Time</div>
                </div>

                <div className="mp-table-body">
                  {filteredOrders.map((order) => (
                    <div key={order.uid} className="mp-table-row">
                      <div className="mp-order-id">{order.orderNumber}</div>

                      <div className="mp-store-cell">
                        <span
                          className="mp-store-dot"
                          style={{
                            backgroundColor: STORE_CONFIGS.find((s) => s.key === order.storeKey)?.color,
                          }}
                        />
                        {order.shortStoreLabel}
                      </div>

                      <div className="mp-items" title={order.itemsText}>
                        {order.itemsText}
                      </div>

                      <div className="mp-qty">{order.qty} items</div>

                      <div className="mp-total">{formatMoney(order.amount)}</div>

                      <div>
                        <span
                          className={`mp-payment-badge ${
                            order.paymentStatus === "Partial" ? "partial" : "success"
                          }`}
                        >
                          {order.paymentStatus}
                        </span>
                      </div>

                      <div className="mp-time">
                        {order.createdAt
                          ? new Date(order.createdAt).toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            })
                          : "-"}
                      </div>
                    </div>
                  ))}

                  {!filteredOrders.length && !isLoading && !loadError && (
                    <div className="mp-empty">No orders found.</div>
                  )}
                </div>
              </div>
            </div>

            <aside className="mp-side">
              <div className="mp-side-card">
                <div className="mp-side-title">STORE PERFORMANCE</div>

                <div className="mp-side-list">
                  {metrics.storePerformance.map((row) => (
                    <div key={row.storeKey} className="mp-side-item">
                      <div className="mp-side-head">
                        <div className="mp-side-left">
                          <span
                            className="mp-side-square"
                            style={{ backgroundColor: row.color }}
                          />
                          <span className="mp-side-name">{row.shortLabel}</span>
                        </div>

                        <div className="mp-side-value">{formatMoney(row.revenue)}</div>
                      </div>

                      <div className="mp-side-meta">
                        {row.orders} orders &nbsp;&nbsp; avg{" "}
                        {row.orders ? formatMoney(row.revenue / row.orders) : "₾0"} &nbsp;&nbsp;
                        {row.share.toFixed(1)}%
                      </div>

                      <div className="mp-progress">
                        <div
                          className="mp-progress-fill"
                          style={{
                            width: `${Math.max(row.share, 6)}%`,
                            backgroundColor: row.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mp-side-card">
                <div className="mp-side-title">REGIONS BY REVENUE</div>

                <div className="mp-side-list compact">
                  {metrics.regions.map((region) => (
                    <div key={region.city} className="mp-region-row">
                      <div className="mp-region-name">{region.city}</div>
                      <div className="mp-region-value">{formatMoney(region.revenue)}</div>
                    </div>
                  ))}

                  {!metrics.regions.length && (
                    <div className="mp-empty-side">No regional sales yet.</div>
                  )}
                </div>
              </div>
            </aside>
          </section>
        </div>
      </div>
    </main>
  );
}
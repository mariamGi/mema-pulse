
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import "./memaPulse.css";

type RawRow = Record<string, unknown>;

type StoreConfig = {
  key: string;
  label: string;
  shortLabel: string;
  orderTable: string;
  itemTable: string;
  color: string;
};

type OrderRow = {
  id: string;
  storeKey: string;
  storeLabel: string;
  shortStoreLabel: string;
  orderNumber: string;
  amount: number;
  itemsText: string;
  qty: number;
  paymentStatus: "Success" | "Partial";
  timeText: string;
  sortDate: string;
  city: string;
};

type StorePerformanceRow = {
  storeKey: string;
  shortLabel: string;
  revenue: number;
  orders: number;
  avg: number;
  share: number;
  color: string;
};

type RegionRow = {
  city: string;
  revenue: number;
};

type DashboardState = {
  todayRevenue: number;
  todayOrders: number;
  mtdRevenue: number;
  mtdOrders: number;
  todayRevenueChange: number;
  todayOrdersChange: number;
  mtdRevenueChange: number;
  mtdOrdersChange: number;
  storePerformance: StorePerformanceRow[];
  regions: RegionRow[];
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
    color: "#49e3a8",
  },
  {
    key: "collect",
    label: "Meama Collect",
    shortLabel: "Collect",
    orderTable: "meama_collect_orders",
    itemTable: "meama_collect_order_items",
    color: "#ffc83d",
  },
  {
    key: "b2b",
    label: "MEAMA B2B",
    shortLabel: "B2B",
    orderTable: "b2b_orders",
    itemTable: "b2b_order_items",
    color: "#ff73d2",
  },
  {
    key: "franchise",
    label: "Meama Franchise",
    shortLabel: "Franchise",
    orderTable: "franchise_orders",
    itemTable: "franchise_order_items",
    color: "#9f8bff",
  },
];

const VALID_STATUSES = new Set(["paid", "partially_paid"]);
const DASHBOARD_BASE_WIDTH = 1920;
const DASHBOARD_BASE_HEIGHT = 1080;

const ORDER_SELECT = [
  "id",
  "shopify_id",
  "name",
  "created_at",
  "processed_at",
  "financial_status",
  "total_price",
  "shipping_city",
  "vms_id",
].join(",");

const ITEM_SELECT = [
  "order_shopify_id",
  "title",
  "quantity",
  "sku",
  "price",
  "line_discount",
].join(",");

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

function safeString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeFinancialStatus(value: unknown): string {
  return safeString(value).trim().toLowerCase();
}

function isValidFinancialStatus(value: unknown): boolean {
  return VALID_STATUSES.has(normalizeFinancialStatus(value));
}

function formatMoney(value: number): string {
  return `₾${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function pctChange(current: number, previous: number): number {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function normalizeCity(value: string): string {
  const source = value.trim();
  if (!source) return "Unknown";

  const lower = source.toLowerCase();

  if (lower === "tbilisi" || source === "თბილისი") return "Tbilisi";
  if (lower === "batumi" || source === "ბათუმი") return "Batumi";
  if (lower === "kutaisi" || source === "ქუთაისი") return "Kutaisi";
  if (lower === "rustavi" || source === "რუსთავი") return "Rustavi";
  if (lower === "zugdidi" || source === "ზუგდიდი") return "Zugdidi";

  return source.charAt(0).toUpperCase() + source.slice(1).toLowerCase();
}

function getEffectiveDate(row: RawRow): string {
  return safeString(row.processed_at) || safeString(row.created_at) || "";
}

function formatTime(dateString: string): string {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getPaymentBadge(value: unknown): "Success" | "Partial" {
  return normalizeFinancialStatus(value) === "partially_paid" ? "Partial" : "Success";
}

function buildItemsText(items: RawRow[]): string {
  const titles = items.map((item) => safeString(item.title).trim()).filter(Boolean);
  const uniqueTitles = Array.from(new Set(titles));
  return uniqueTitles.length ? uniqueTitles.join(", ") : "Order items";
}

function buildQty(items: RawRow[]): number {
  const qty = items.reduce((sum, item) => sum + toNumber(item.quantity, 0), 0);
  return qty || 1;
}

function getLineFallbackPrice(item: RawRow): number {
  const price = toNumber(item.price, 0);
  const lineDiscount = toNumber(item.line_discount, 0);
  const discounted = price - lineDiscount;
  return discounted > 0 ? discounted : price;
}

function calculateOrderRevenue(orderRow: RawRow, itemRows: RawRow[], storeKey: string): number {
  if (storeKey !== "vending") {
    return toNumber(orderRow.total_price, 0);
  }

  const vmsId = safeString(orderRow.vms_id);

  if (vmsId === "786") {
    return itemRows.reduce((sum, item) => sum + toNumber(item.quantity, 0) * 1.3, 0);
  }

  if (vmsId === "737") {
    return itemRows.reduce((sum, item) => {
      const sku = safeString(item.sku).toLowerCase();
      const qty = toNumber(item.quantity, 0);
      const mappedRate = VENDING_737_SKU_RATES[sku];

      if (mappedRate !== undefined) {
        return sum + mappedRate * 0.75 * qty;
      }

      return sum + getLineFallbackPrice(item) * qty;
    }, 0);
  }

  return toNumber(orderRow.total_price, 0);
}

function buildSparkline(values: number[], width = 120, height = 44): string {
  if (!values.length) return "";

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const padX = 6;
  const padY = 4;

  return values
    .map((value, index) => {
      const x = padX + (index * (width - padX * 2)) / Math.max(values.length - 1, 1);
      const y = height - padY - ((value - min) / range) * (height - padY * 2);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function emptyDashboard(): DashboardState {
  return {
    todayRevenue: 0,
    todayOrders: 0,
    mtdRevenue: 0,
    mtdOrders: 0,
    todayRevenueChange: 0,
    todayOrdersChange: 0,
    mtdRevenueChange: 0,
    mtdOrdersChange: 0,
    storePerformance: STORE_CONFIGS.map((store) => ({
      storeKey: store.key,
      shortLabel: store.shortLabel,
      revenue: 0,
      orders: 0,
      avg: 0,
      share: 0,
      color: store.color,
    })),
    regions: [],
  };
}

async function fetchOrdersByRange(
  store: StoreConfig,
  fromIso: string,
  toIso: string
): Promise<RawRow[]> {
  const { data, error } = await supabase
    .from(store.orderTable)
    .select(ORDER_SELECT)
    .gte("processed_at", fromIso)
    .lt("processed_at", toIso);

  if (error) {
    throw new Error(`${store.orderTable}: ${error.message}`);
  }

  return (data ?? []).filter((row) => isValidFinancialStatus(row.financial_status));
}

async function fetchRecentOrders(store: StoreConfig, limit = 40): Promise<RawRow[]> {
  const { data, error } = await supabase
    .from(store.orderTable)
    .select(ORDER_SELECT)
    .in("financial_status", ["paid", "partially_paid"])
    .order("processed_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`${store.orderTable}: ${error.message}`);
  }

  return data ?? [];
}

async function fetchItemsMap(
  store: StoreConfig,
  orderShopifyIds: string[]
): Promise<Map<string, RawRow[]>> {
  if (!orderShopifyIds.length) return new Map<string, RawRow[]>();

  const { data, error } = await supabase
    .from(store.itemTable)
    .select(ITEM_SELECT)
    .in("order_shopify_id", orderShopifyIds);

  if (error) {
    throw new Error(`${store.itemTable}: ${error.message}`);
  }

  return (data ?? []).reduce((map, item) => {
    const key = safeString(item.order_shopify_id);
    const bucket = map.get(key) ?? [];
    bucket.push(item);
    map.set(key, bucket);
    return map;
  }, new Map<string, RawRow[]>());
}

function hydrateOrder(store: StoreConfig, row: RawRow, items: RawRow[]): OrderRow {
  const effectiveDate = getEffectiveDate(row);

  return {
    id: `${store.key}-${safeString(row.shopify_id) || safeString(row.id)}`,
    storeKey: store.key,
    storeLabel: store.label,
    shortStoreLabel: store.shortLabel,
    orderNumber: safeString(row.name) || safeString(row.id) || "-",
    amount: calculateOrderRevenue(row, items, store.key),
    itemsText: buildItemsText(items),
    qty: buildQty(items),
    paymentStatus: getPaymentBadge(row.financial_status),
    timeText: formatTime(effectiveDate),
    sortDate: effectiveDate,
    city: normalizeCity(safeString(row.shipping_city)),
  };
}

export default function MemaPulsePage() {
  const [dashboard, setDashboard] = useState<DashboardState>(emptyDashboard());
  const [recentOrders, setRecentOrders] = useState<OrderRow[]>([]);
  const [toastOrder, setToastOrder] = useState<OrderRow | null>(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [scale, setScale] = useState(1);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshDashboard = useCallback(async () => {
    setLoadError(null);
    setIsLoading(true);

    try {
      const current = new Date();

      const todayStart = new Date(current.getFullYear(), current.getMonth(), current.getDate());
      const tomorrowStart = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
      const yesterdayStart = new Date(current.getFullYear(), current.getMonth(), current.getDate() - 1);

      const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
      const nextMonthStart = new Date(current.getFullYear(), current.getMonth() + 1, 1);
      const prevMonthStart = new Date(current.getFullYear(), current.getMonth() - 1, 1);

      const [recentByStore, todayByStore, yesterdayByStore, monthByStore, prevMonthByStore] =
        await Promise.all([
          Promise.all(STORE_CONFIGS.map((store) => fetchRecentOrders(store, 40))),
          Promise.all(
            STORE_CONFIGS.map((store) =>
              fetchOrdersByRange(store, todayStart.toISOString(), tomorrowStart.toISOString())
            )
          ),
          Promise.all(
            STORE_CONFIGS.map((store) =>
              fetchOrdersByRange(store, yesterdayStart.toISOString(), todayStart.toISOString())
            )
          ),
          Promise.all(
            STORE_CONFIGS.map((store) =>
              fetchOrdersByRange(store, monthStart.toISOString(), nextMonthStart.toISOString())
            )
          ),
          Promise.all(
            STORE_CONFIGS.map((store) =>
              fetchOrdersByRange(store, prevMonthStart.toISOString(), monthStart.toISOString())
            )
          ),
        ]);

      const hydratedRecentLists = await Promise.all(
        STORE_CONFIGS.map(async (store, index) => {
          const rows = recentByStore[index];
          const ids = rows.map((row) => safeString(row.shopify_id)).filter(Boolean);
          const itemsMap = await fetchItemsMap(store, ids);

          return rows.map((row) =>
            hydrateOrder(store, row, itemsMap.get(safeString(row.shopify_id)) ?? [])
          );
        })
      );

      const flatRecent = hydratedRecentLists
        .flat()
        .sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime())
        .slice(0, 50);

      async function computeMetricsByStore(rowsByStoreGrouped: RawRow[][]) {
        let revenue = 0;
        let orders = 0;

        const storeRevenueMap = new Map<string, number>();
        const storeOrderMap = new Map<string, number>();
        const regionRevenueMap = new Map<string, number>();

        for (let i = 0; i < STORE_CONFIGS.length; i += 1) {
          const store = STORE_CONFIGS[i];
          const rows = rowsByStoreGrouped[i];
          orders += rows.length;

          const overrideIds =
            store.key === "vending"
              ? rows
                  .filter((row) => {
                    const vmsId = safeString(row.vms_id);
                    return vmsId === "786" || vmsId === "737";
                  })
                  .map((row) => safeString(row.shopify_id))
                  .filter(Boolean)
              : [];

          const overrideItemsMap =
            store.key === "vending" && overrideIds.length
              ? await fetchItemsMap(store, overrideIds)
              : new Map<string, RawRow[]>();

          let storeRevenue = 0;

          rows.forEach((row) => {
            const shopifyId = safeString(row.shopify_id);

            const rowRevenue =
              store.key === "vending" &&
              (safeString(row.vms_id) === "786" || safeString(row.vms_id) === "737")
                ? calculateOrderRevenue(row, overrideItemsMap.get(shopifyId) ?? [], store.key)
                : toNumber(row.total_price, 0);

            storeRevenue += rowRevenue;
            revenue += rowRevenue;

            const city = normalizeCity(safeString(row.shipping_city));
            regionRevenueMap.set(city, (regionRevenueMap.get(city) ?? 0) + rowRevenue);
          });

          storeRevenueMap.set(store.key, storeRevenue);
          storeOrderMap.set(store.key, rows.length);
        }

        return {
          revenue,
          orders,
          storeRevenueMap,
          storeOrderMap,
          regionRevenueMap,
        };
      }

      const todayMetrics = await computeMetricsByStore(todayByStore);
      const yesterdayMetrics = await computeMetricsByStore(yesterdayByStore);
      const monthMetrics = await computeMetricsByStore(monthByStore);
      const prevMonthMetrics = await computeMetricsByStore(prevMonthByStore);

      const storePerformance: StorePerformanceRow[] = STORE_CONFIGS.map((store) => {
        const revenue = monthMetrics.storeRevenueMap.get(store.key) ?? 0;
        const orders = monthMetrics.storeOrderMap.get(store.key) ?? 0;
        const avg = orders ? revenue / orders : 0;
        const share = monthMetrics.revenue ? (revenue / monthMetrics.revenue) * 100 : 0;

        return {
          storeKey: store.key,
          shortLabel: store.shortLabel,
          revenue,
          orders,
          avg,
          share,
          color: store.color,
        };
      });

      const regions: RegionRow[] = Array.from(monthMetrics.regionRevenueMap.entries())
        .map(([city, revenue]) => ({ city, revenue }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 6);

      setDashboard({
        todayRevenue: todayMetrics.revenue,
        todayOrders: todayMetrics.orders,
        mtdRevenue: monthMetrics.revenue,
        mtdOrders: monthMetrics.orders,
        todayRevenueChange: pctChange(todayMetrics.revenue, yesterdayMetrics.revenue),
        todayOrdersChange: pctChange(todayMetrics.orders, yesterdayMetrics.orders),
        mtdRevenueChange: pctChange(monthMetrics.revenue, prevMonthMetrics.revenue),
        mtdOrdersChange: pctChange(monthMetrics.orders, prevMonthMetrics.orders),
        storePerformance,
        regions,
      });

      setRecentOrders(flatRecent);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load dashboard data.";
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleIncomingOrder = useCallback(
    async (store: StoreConfig, payload: { new?: RawRow }) => {
      const row = payload?.new;
      if (!row || !isValidFinancialStatus(row.financial_status)) return;

      try {
        const orderShopifyId = safeString(row.shopify_id);
        const itemsMap = await fetchItemsMap(store, orderShopifyId ? [orderShopifyId] : []);
        const hydrated = hydrateOrder(store, row, itemsMap.get(orderShopifyId) ?? []);

        setToastOrder(hydrated);

        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => {
          setToastOrder(null);
        }, 5000);

        await refreshDashboard();
      } catch {
        await refreshDashboard();
      }
    },
    [refreshDashboard]
  );

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

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
    void refreshDashboard();

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
            void handleIncomingOrder(store, payload as { new?: RawRow });
          }
        )
        .subscribe()
    );

    return () => {
      channels.forEach((channel) => {
        void supabase.removeChannel(channel);
      });

      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [handleIncomingOrder, refreshDashboard]);

  const filteredOrders = useMemo(() => {
    const rows =
      activeFilter === "all"
        ? recentOrders
        : recentOrders.filter((row) => row.storeKey === activeFilter);

    return rows.slice(0, 50);
  }, [recentOrders, activeFilter]);

  const dateText = useMemo(() => {
    return now.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [now]);

  const clockText = useMemo(() => {
    return now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }, [now]);

  const sparkSeries = useMemo(() => {
    const baseTodayRevenue = dashboard.todayRevenue || 1;
    const baseTodayOrders = dashboard.todayOrders || 1;
    const baseMtdRevenue = dashboard.mtdRevenue || 1;
    const baseMtdOrders = dashboard.mtdOrders || 1;

    return [
      [
        baseTodayRevenue * 0.62,
        baseTodayRevenue * 0.55,
        baseTodayRevenue * 0.68,
        baseTodayRevenue * 0.76,
        baseTodayRevenue * 0.89,
        baseTodayRevenue,
      ],
      [
        baseTodayOrders * 0.54,
        baseTodayOrders * 0.54,
        baseTodayOrders * 0.54,
        baseTodayOrders * 0.71,
        baseTodayOrders * 0.84,
        baseTodayOrders,
      ],
      [
        baseMtdRevenue * 0.7,
        baseMtdRevenue * 0.58,
        baseMtdRevenue * 0.65,
        baseMtdRevenue * 0.73,
        baseMtdRevenue * 0.86,
        baseMtdRevenue,
      ],
      [
        baseMtdOrders * 0.58,
        baseMtdOrders * 0.58,
        baseMtdOrders * 0.7,
        baseMtdOrders * 0.78,
        baseMtdOrders * 0.88,
        baseMtdOrders,
      ],
    ];
  }, [dashboard]);

  const kpis = [
    {
      title: "Today Revenue",
      value: formatMoney(dashboard.todayRevenue),
      change: formatPercent(dashboard.todayRevenueChange),
      tone: "green",
      path: buildSparkline(sparkSeries[0]),
    },
    {
      title: "Today Orders",
      value: dashboard.todayOrders.toLocaleString(),
      change: formatPercent(dashboard.todayOrdersChange),
      tone: "red",
      path: buildSparkline(sparkSeries[1]),
    },
    {
      title: "MTD Revenue",
      value: formatMoney(dashboard.mtdRevenue),
      change: formatPercent(dashboard.mtdRevenueChange),
      tone: "yellow",
      path: buildSparkline(sparkSeries[2]),
    },
    {
      title: "MTD Orders",
      value: dashboard.mtdOrders.toLocaleString(),
      change: formatPercent(dashboard.mtdOrdersChange),
      tone: "cyan",
      path: buildSparkline(sparkSeries[3]),
    },
  ] as const;

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
                style={{
                  backgroundColor:
                    STORE_CONFIGS.find((store) => store.key === toastOrder.storeKey)?.color ||
                    "#33d7ff",
                }}
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

                  <svg
                    className={`mp-kpi-spark ${kpi.tone}`}
                    viewBox="0 0 120 44"
                    preserveAspectRatio="none"
                  >
                    <path d={kpi.path} />
                  </svg>
                </div>

                <div className="mp-kpi-value">{kpi.value}</div>
                <div
                  className={`mp-kpi-change ${
                    kpi.change.startsWith("-") ? "negative" : "positive"
                  }`}
                >
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

                <div className="mp-orders-count">{filteredOrders.length} orders</div>
              </div>

              {loadError && <div className="mp-error">{loadError}</div>}

              <div className="mp-table">
                <div className="mp-table-head">
                  <div># ORDER ID</div>
                  <div>STORE</div>
                  <div>ITEMS</div>
                  <div>QTY</div>
                  <div>TOTAL</div>
                  <div>PAYMENT</div>
                  <div>TIME</div>
                </div>

                <div className="mp-table-body">
                  {filteredOrders.map((order) => (
                    <div key={order.id} className="mp-table-row">
                      <div className="mp-order-id">{order.orderNumber}</div>

                      <div className="mp-store-cell">
                        <span
                          className="mp-store-dot"
                          style={{
                            backgroundColor:
                              STORE_CONFIGS.find((store) => store.key === order.storeKey)?.color ||
                              "#33d7ff",
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

                      <div className="mp-time">{order.timeText}</div>
                    </div>
                  ))}

                  {!filteredOrders.length && !isLoading && !loadError && (
                    <div className="mp-empty">No orders found.</div>
                  )}

                  {isLoading && !filteredOrders.length && (
                    <div className="mp-empty">Loading dashboard...</div>
                  )}
                </div>
              </div>
            </div>

            <aside className="mp-side">
              <div className="mp-side-card mp-side-performance">
                <div className="mp-side-title">STORE PERFORMANCE</div>

                <div className="mp-side-list performance">
                  {dashboard.storePerformance.map((row) => (
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
                        {row.orders} orders &nbsp; avg {formatMoney(row.avg)} &nbsp;{" "}
                        {row.share.toFixed(1)}%
                      </div>

                      <div className="mp-progress">
                        <div
                          className="mp-progress-fill"
                          style={{
                            width: `${Math.max(row.share, row.orders ? 8 : 0)}%`,
                            backgroundColor: row.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mp-side-card mp-side-regions">
                <div className="mp-side-title">REGIONS BY REVENUE</div>

                <div className="mp-side-list compact">
                  {dashboard.regions.map((region) => (
                    <div key={region.city} className="mp-region-row">
                      <div className="mp-region-name">{region.city}</div>
                      <div className="mp-region-value">{formatMoney(region.revenue)}</div>
                    </div>
                  ))}

                  {!dashboard.regions.length && (
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
```

---

# `app/mema-pulse/memaPulse.css`

```css
:root {
  --bg-1: #06111d;
  --bg-2: #081521;
  --panel: #0c1825;
  --panel-2: #0f1d2d;
  --stroke: rgba(120, 165, 215, 0.12);
  --stroke-soft: rgba(255, 255, 255, 0.05);
  --text: #f4fbff;
  --muted: #8aa2ba;
  --muted-2: #677f97;
  --green: #26e6a6;
  --red: #ff7d7d;
  --yellow: #ffc53d;
  --cyan: #2ee6ff;
  --shadow-lg: 0 24px 70px rgba(0, 0, 0, 0.35);
  --shadow-md: 0 12px 32px rgba(0, 0, 0, 0.22);
}

* {
  box-sizing: border-box;
}

html,
body {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
  background: linear-gradient(180deg, #06111d 0%, #081521 100%);
  color: var(--text);
  font-family: Inter, Arial, Helvetica, sans-serif;
}

body {
  letter-spacing: -0.01em;
}

.mp-page {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background:
    radial-gradient(circle at 15% -10%, rgba(46, 230, 255, 0.08), transparent 22%),
    radial-gradient(circle at 85% 0%, rgba(38, 230, 166, 0.05), transparent 18%),
    linear-gradient(180deg, #06111d 0%, #081521 55%, #06111d 100%);
}

.mp-viewport {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.mp-shell {
  position: absolute;
  top: 0;
  left: 0;
  padding: 88px 18px 18px;
  display: grid;
  grid-template-rows: 46px 138px 1fr;
  gap: 16px;
  overflow: hidden;
  background:
    radial-gradient(circle at 20% 0%, rgba(34, 211, 238, 0.05), transparent 20%),
    radial-gradient(circle at 90% 10%, rgba(52, 211, 153, 0.05), transparent 18%),
    linear-gradient(180deg, #06111d 0%, #081521 100%);
}

.mp-orb {
  position: absolute;
  border-radius: 999px;
  filter: blur(90px);
  opacity: 0.18;
  pointer-events: none;
}

.mp-orb-1 {
  width: 260px;
  height: 260px;
  top: -60px;
  left: -40px;
  background: rgba(46, 230, 255, 0.3);
}

.mp-orb-2 {
  width: 240px;
  height: 240px;
  right: 160px;
  top: 40px;
  background: rgba(38, 230, 166, 0.22);
}

.mp-orb-3 {
  width: 320px;
  height: 320px;
  left: 45%;
  top: -80px;
  background: rgba(70, 145, 255, 0.12);
}

.mp-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 2;
}

.mp-header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.mp-brand {
  font-size: 34px;
  line-height: 1;
  font-weight: 900;
  color: #ffffff;
}

.mp-divider {
  width: 1px;
  height: 22px;
  background: rgba(255, 255, 255, 0.14);
}

.mp-subbrand {
  font-size: 17px;
  font-weight: 600;
  color: #9cb4ca;
}

.mp-live-pill {
  height: 34px;
  padding: 0 14px;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(8, 64, 43, 0.95);
  border: 1px solid rgba(38, 230, 166, 0.22);
  color: #dffff5;
  font-size: 14px;
  font-weight: 700;
}

.mp-live-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--green);
  box-shadow: 0 0 10px rgba(38, 230, 166, 0.85);
}

.mp-header-right {
  display: flex;
  align-items: baseline;
  gap: 18px;
}

.mp-date {
  color: var(--muted);
  font-size: 15px;
  font-weight: 500;
}

.mp-clock {
  font-size: 42px;
  line-height: 1;
  font-weight: 800;
  letter-spacing: 0.1em;
}

.mp-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  z-index: 2;
}

.mp-kpi-card {
  min-height: 138px;
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(12, 24, 37, 0.98), rgba(9, 21, 33, 0.98));
  border: 1px solid var(--stroke);
  box-shadow: var(--shadow-md);
  padding: 18px 18px 16px;
  position: relative;
  overflow: hidden;
}

.mp-kpi-card::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.015), transparent);
  pointer-events: none;
}

.mp-kpi-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.mp-kpi-label {
  font-size: 14px;
  font-weight: 600;
  color: #8ea6bd;
}

.mp-kpi-value {
  margin-top: 24px;
  font-size: 52px;
  line-height: 1;
  font-weight: 850;
  color: #ffffff;
}

.mp-kpi-change {
  margin-top: 16px;
  font-size: 16px;
  font-weight: 700;
}

.mp-kpi-change.positive {
  color: var(--green);
}

.mp-kpi-change.negative {
  color: var(--red);
}

.mp-kpi-spark {
  width: 138px;
  height: 46px;
  fill: none;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.mp-kpi-spark path {
  fill: none;
}

.mp-kpi-spark.green path {
  stroke: #26e6a6;
}

.mp-kpi-spark.red path {
  stroke: #ff7d7d;
}

.mp-kpi-spark.yellow path {
  stroke: #ffc53d;
}

.mp-kpi-spark.cyan path {
  stroke: #2ee6ff;
}

.mp-main-grid {
  display: grid;
  grid-template-columns: 1fr 410px;
  gap: 16px;
  min-height: 0;
  z-index: 2;
}

.mp-orders-card,
.mp-side-card {
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(12, 24, 37, 0.98), rgba(9, 21, 33, 0.98));
  border: 1px solid var(--stroke);
  box-shadow: var(--shadow-md);
}

.mp-orders-card {
  min-height: 0;
  display: grid;
  grid-template-rows: auto auto 1fr;
  gap: 10px;
  padding: 14px 18px 0;
  overflow: hidden;
}

.mp-orders-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
}

.mp-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.mp-filter-btn {
  height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #6f879e;
  font-size: 14px;
  cursor: pointer;
}

.mp-filter-btn.active {
  color: #ffffff;
  border-bottom: 2px solid #ffffff;
  border-radius: 0;
  height: 32px;
  font-weight: 700;
}

.mp-orders-count {
  color: #6f879e;
  font-size: 14px;
}

.mp-error {
  font-size: 14px;
  color: #ffb7b7;
  background: rgba(255, 107, 107, 0.08);
  border: 1px solid rgba(255, 107, 107, 0.18);
  border-radius: 10px;
  padding: 10px 12px;
}

.mp-table {
  min-height: 0;
  display: grid;
  grid-template-rows: auto 1fr;
  overflow: hidden;
  border-top: 1px solid var(--stroke-soft);
}

.mp-table-head,
.mp-table-row {
  display: grid;
  grid-template-columns: 1fr 1.05fr 3fr 0.85fr 1fr 1fr 0.8fr;
  gap: 14px;
  align-items: center;
}

.mp-table-head {
  padding: 14px 0;
  color: #637b92;
  font-size: 12px;
  text-transform: uppercase;
}

.mp-table-body {
  min-height: 0;
  overflow: auto;
  padding-right: 6px;
}

.mp-table-body::-webkit-scrollbar {
  width: 10px;
}

.mp-table-body::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 999px;
}

.mp-table-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 999px;
}

.mp-table-row {
  min-height: 62px;
  border-top: 1px solid rgba(255, 255, 255, 0.03);
  color: #dce9f5;
  font-size: 15px;
}

.mp-order-id {
  color: #9db7d1;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.mp-store-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #ffffff;
}

.mp-store-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.mp-items {
  color: #9db4ca;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mp-qty {
  color: #9bb1c8;
}

.mp-total {
  color: #ffffff;
  font-weight: 800;
}

.mp-time {
  color: #9bb1c8;
}

.mp-payment-badge {
  height: 28px;
  min-width: 84px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 700;
}

.mp-payment-badge.success {
  color: #dffff4;
  background: rgba(0, 160, 100, 0.65);
  border: 1px solid rgba(38, 230, 166, 0.2);
}

.mp-payment-badge.partial {
  color: #fff0ca;
  background: rgba(157, 98, 0, 0.62);
  border: 1px solid rgba(255, 191, 60, 0.18);
}

.mp-empty {
  padding: 18px;
  color: #8ba2b8;
  font-size: 15px;
}

.mp-side {
  display: grid;
  grid-template-rows: 1fr 250px;
  gap: 12px;
  min-height: 0;
}

.mp-side-card {
  padding: 16px 16px 14px;
  overflow: hidden;
}

.mp-side-performance,
.mp-side-regions {
  display: flex;
  flex-direction: column;
}

.mp-side-title {
  font-size: 18px;
  font-weight: 800;
  color: #d7e6f4;
  letter-spacing: 0.04em;
  margin-bottom: 14px;
}

.mp-side-list.performance {
  display: grid;
  grid-template-rows: repeat(5, 1fr);
  gap: 18px;
  flex: 1;
}

.mp-side-list.compact {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.mp-side-item {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
}

.mp-side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.mp-side-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mp-side-square {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.mp-side-name {
  font-size: 18px;
  font-weight: 750;
  color: #ffffff;
}

.mp-side-value {
  font-size: 28px;
  line-height: 1;
  font-weight: 850;
  color: #ffffff;
}

.mp-side-meta {
  color: #6f879d;
  font-size: 14px;
}

.mp-progress {
  height: 4px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  overflow: hidden;
}

.mp-progress-fill {
  height: 100%;
  border-radius: 999px;
}

.mp-region-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  color: #dce7f1;
  font-size: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  padding-top: 12px;
}

.mp-region-row:first-child {
  border-top: none;
  padding-top: 0;
}

.mp-region-name {
  color: #9db3c7;
}

.mp-region-value {
  color: #ffffff;
  font-weight: 800;
}

.mp-empty-side {
  color: #8ca2b8;
  font-size: 15px;
}

.mp-toast {
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  min-width: 640px;
  max-width: 820px;
  border-radius: 16px;
  background: rgba(18, 28, 40, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.09);
  box-shadow: var(--shadow-lg);
  padding: 16px 24px;
  z-index: 30;
  display: grid;
  grid-template-columns: 6px 1fr auto;
  grid-template-rows: auto auto;
  column-gap: 18px;
  row-gap: 6px;
  animation: mpDrop 0.28s ease;
}

.mp-toast-accent {
  grid-row: 1 / span 2;
  width: 6px;
  border-radius: 999px;
}

.mp-toast-title {
  grid-column: 2;
  color: #ffffff;
  font-size: 16px;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.mp-toast-id {
  grid-column: 2;
  color: #dbe8f3;
  font-size: 30px;
  font-weight: 850;
}

.mp-toast-amount {
  grid-column: 3;
  grid-row: 1 / span 2;
  align-self: center;
  color: #ffffff;
  font-size: 38px;
  font-weight: 900;
}

.mp-toast-sub {
  grid-column: 2 / span 2;
  color: #7e95aa;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@keyframes mpDrop {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-14px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
                        ]

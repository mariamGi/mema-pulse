"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import "./memaPulse.css";

type StoreConfig = {
  key: string;
  label: string;
  shortLabel: string;
  table: string;
  color: string;
};

type RawRow = Record<string, any>;

type LiveOrder = {
  uid: string;
  storeKey: string;
  storeLabel: string;
  shortStoreLabel: string;
  orderNumber: string;
  amount: number;
  createdAt: string;
  itemsText: string;
  qty: number;
  paymentStatus: string;
  fulfillmentStatus: string;
};

const STORE_CONFIGS: StoreConfig[] = [
  {
    key: "vending",
    label: "Meama Vending",
    shortLabel: "Vending",
    table: "vending_orders",
    color: "#31d7ff",
  },
  {
    key: "georgia",
    label: "Meama Georgia",
    shortLabel: "Georgia",
    table: "orders",
    color: "#3ddc97",
  },
  {
    key: "collect",
    label: "Meama Collect",
    shortLabel: "Collect",
    table: "meama_collect_orders",
    color: "#ffbf3c",
  },
  {
    key: "b2b",
    label: "MEAMA B2B",
    shortLabel: "B2B",
    table: "b2b_orders",
    color: "#f26ac9",
  },
  {
    key: "franchise",
    label: "Meama Franchise",
    shortLabel: "Franchise",
    table: "franchise_orders",
    color: "#9d82ff",
  },
];

const DASHBOARD_BASE_WIDTH = 1920;
const DASHBOARD_BASE_HEIGHT = 1080;

function pickFirst(row: RawRow, keys: string[], fallback: any = null) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null) return row[key];
  }
  return fallback;
}

function toAmount(row: RawRow) {
  const raw = pickFirst(
    row,
    [
      "total_price",
      "total_amount",
      "amount",
      "final_amount",
      "total",
      "subtotal_price",
      "current_total_price",
    ],
    0
  );

  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function toOrderNumber(row: RawRow) {
  const raw = pickFirst(
    row,
    [
      "name",
      "order_name",
      "order_number",
      "display_name",
      "shopify_order_name",
      "shopify_name",
      "id",
    ],
    ""
  );

  return String(raw ?? "");
}

function toCreatedAt(row: RawRow) {
  const raw = pickFirst(
    row,
    [
      "created_at",
      "createdAt",
      "processed_at",
      "shopify_created_at",
      "ordered_at",
      "date",
    ],
    ""
  );

  return String(raw ?? "");
}

function toItemsText(row: RawRow) {
  const direct = pickFirst(row, [
    "products",
    "items",
    "product_title",
    "item_title",
    "line_items_text",
    "summary",
  ]);

  if (direct) return String(direct);

  const customer = pickFirst(row, ["customer_name", "customer", "company_name"]);
  if (customer) return String(customer);

  return "Order items";
}

function toQty(row: RawRow) {
  const raw = pickFirst(
    row,
    ["total_quantity", "quantity", "qty", "item_count", "line_items_count"],
    1
  );
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function toPaymentStatus(row: RawRow) {
  const raw = pickFirst(
    row,
    ["payment_status", "financial_status", "payment", "status"],
    "success"
  );
  return String(raw ?? "success");
}

function toFulfillmentStatus(row: RawRow) {
  const raw = pickFirst(
    row,
    ["fulfillment_status", "fulfillment", "delivery_status"],
    "fulfilled"
  );
  return String(raw ?? "fulfilled");
}

function normalizeOrder(row: RawRow, store: StoreConfig): LiveOrder {
  const orderNumber = toOrderNumber(row);
  const createdAt = toCreatedAt(row);
  const amount = toAmount(row);
  const rowId = pickFirst(
    row,
    ["id", "order_id", "shopify_order_id"],
    orderNumber || crypto.randomUUID()
  );

  return {
    uid: `${store.key}-${String(rowId)}`,
    storeKey: store.key,
    storeLabel: store.label,
    shortStoreLabel: store.shortLabel,
    orderNumber,
    amount,
    createdAt,
    itemsText: toItemsText(row),
    qty: toQty(row),
    paymentStatus: toPaymentStatus(row),
    fulfillmentStatus: toFulfillmentStatus(row),
  };
}

function isSameMonth(dateString: string, now: Date) {
  const date = new Date(dateString);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
}

function isSameDay(dateString: string, now: Date) {
  const date = new Date(dateString);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function formatMoney(value: number) {
  return `₾${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function getStoreColor(storeKey: string) {
  return STORE_CONFIGS.find((s) => s.key === storeKey)?.color ?? "#31d7ff";
}

function getStoreIcon(storeKey: string) {
  switch (storeKey) {
    case "vending":
      return "VE";
    case "georgia":
      return "GE";
    case "collect":
      return "CL";
    case "b2b":
      return "B2";
    case "franchise":
      return "FR";
    default:
      return "OR";
  }
}

function normalizePaymentStatus(status: string) {
  const s = status.toLowerCase();
  if (s.includes("paid") || s.includes("success")) return "Success";
  if (s.includes("pending")) return "Pending";
  if (s.includes("fail") || s.includes("cancel")) return "Failed";
  return "Success";
}

function normalizeFulfillmentStatus(status: string) {
  const s = status.toLowerCase();
  if (s.includes("fulfilled")) return "Fulfilled";
  if (s.includes("partial")) return "Partial";
  if (s.includes("unfulfilled") || s.includes("pending")) return "Pending";
  return "Fulfilled";
}

function buildChartPath(values: number[], width: number, height: number, padding = 18) {
  if (!values.length) return "";
  const max = Math.max(...values, 1);
  const min = 0;
  const span = Math.max(max - min, 1);

  return values
    .map((value, index) => {
      const x =
        padding + (index * (width - padding * 2)) / Math.max(values.length - 1, 1);
      const y =
        height - padding - ((value - min) / span) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

export default function MemaPulsePage() {
  const [orders, setOrders] = useState<LiveOrder[]>([]);
  const [toastOrder, setToastOrder] = useState<LiveOrder | null>(null);
  const [now, setNow] = useState(new Date());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [scale, setScale] = useState(1);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    loadInitialData();

    const channels = STORE_CONFIGS.map((store) => {
      return supabase
        .channel(`mema-pulse-${store.table}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: store.table },
          (payload) => {
            const liveOrder = normalizeOrder(payload.new as RawRow, store);

            setOrders((prev) =>
              [liveOrder, ...prev].sort(
                (a, b) =>
                  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              )
            );

            setToastOrder(liveOrder);
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
            toastTimerRef.current = setTimeout(() => setToastOrder(null), 5000);
          }
        )
        .subscribe();
    });

    return () => {
      channels.forEach((channel) => supabase.removeChannel(channel));
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  async function loadInitialData() {
    try {
      setLoadError(null);

      const responses = await Promise.all(
        STORE_CONFIGS.map(async (store) => {
          const { data, error } = await supabase
            .from(store.table)
            .select("*")
            .order("created_at", { ascending: false })
            .limit(150);

          if (error) throw new Error(`${store.table}: ${error.message}`);
          return (data ?? []).map((row) => normalizeOrder(row, store));
        })
      );

      const merged = responses
        .flat()
        .filter((row) => row.createdAt)
        .sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

      setOrders(merged);
    } catch (error: any) {
      setLoadError(error?.message || "Failed to load dashboard data.");
    }
  }

  const filteredOrders = useMemo(() => {
    if (activeFilter === "all") return orders.slice(0, 31);
    return orders.filter((o) => o.storeKey === activeFilter).slice(0, 31);
  }, [orders, activeFilter]);

  const todayOrdersData = useMemo(() => {
    return orders.filter((order) => isSameDay(order.createdAt, now));
  }, [orders, now]);

  const monthOrdersData = useMemo(() => {
    return orders.filter((order) => isSameMonth(order.createdAt, now));
  }, [orders, now]);

  const orderRevenue = useMemo(
    () => todayOrdersData.reduce((sum, order) => sum + order.amount, 0),
    [todayOrdersData]
  );

  const totalOrders = todayOrdersData.length;
  const avgOrderValue = totalOrders ? orderRevenue / totalOrders : 0;
  const monthRevenue = monthOrdersData.reduce((sum, order) => sum + order.amount, 0);

  const monthComparison = useMemo(() => {
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthOrders = orders.filter((order) => isSameMonth(order.createdAt, previousMonth));
    const prevRevenue = prevMonthOrders.reduce((sum, order) => sum + order.amount, 0);
    const prevTotal = prevMonthOrders.length;
    const prevAov = prevTotal ? prevRevenue / prevTotal : 0;

    function pct(current: number, previous: number) {
      if (!previous) return current ? 100 : 0;
      return ((current - previous) / previous) * 100;
    }

    return {
      revenuePct: pct(orderRevenue, prevRevenue),
      aovPct: pct(avgOrderValue, prevAov),
      ordersPct: pct(totalOrders, prevTotal),
      monthRevenuePct: pct(monthRevenue, prevRevenue),
    };
  }, [orders, now, orderRevenue, avgOrderValue, totalOrders, monthRevenue]);

  const hourlyData = useMemo(() => {
    const startHour = 7;
    const endHour = 22;
    const points: { hour: number; value: number }[] = [];

    for (let hour = startHour; hour <= endHour; hour++) {
      const hourSum = todayOrdersData
        .filter((order) => new Date(order.createdAt).getHours() === hour)
        .reduce((sum, order) => sum + order.amount, 0);

      points.push({ hour, value: hourSum });
    }

    return points;
  }, [todayOrdersData]);

  const chartValues = hourlyData.map((p) => p.value);
  const chartPath = buildChartPath(chartValues, 1120, 320);
  const hourlyTotal = chartValues.reduce((a, b) => a + b, 0);

  const storeShare = useMemo(() => {
    const totals = STORE_CONFIGS.map((store) => {
      const revenue = todayOrdersData
        .filter((order) => order.storeKey === store.key)
        .reduce((sum, order) => sum + order.amount, 0);

      return {
        ...store,
        revenue,
      };
    });

    const totalRevenue = totals.reduce((sum, item) => sum + item.revenue, 0);

    return {
      totalRevenue,
      rows: totals.map((item) => ({
        ...item,
        percent: totalRevenue ? (item.revenue / totalRevenue) * 100 : 0,
      })),
    };
  }, [todayOrdersData]);

  const donutGradient = useMemo(() => {
    const rows = storeShare.rows;
    const total = rows.reduce((sum, row) => sum + row.percent, 0) || 100;
    let cursor = 0;

    const segments = rows.map((row) => {
      const start = (cursor / total) * 100;
      cursor += row.percent;
      const end = (cursor / total) * 100;
      return `${row.color} ${start}% ${end}%`;
    });

    return `conic-gradient(${segments.join(", ")})`;
  }, [storeShare]);

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

  const dateText = useMemo(
    () =>
      now.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    [now]
  );

  return (
    <main className="dashboard-page pulse-page-alt">
      <div className="dashboard-viewport">
        <div
          className="dashboard-shell pulse-shell-alt"
          style={{
            width: DASHBOARD_BASE_WIDTH,
            height: DASHBOARD_BASE_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <div className="pulse-bg-orb pulse-bg-orb-1" />
          <div className="pulse-bg-orb pulse-bg-orb-2" />
          <div className="pulse-bg-orb pulse-bg-orb-3" />

          {toastOrder && (
            <div className="pulse-toast-alt">
              <div
                className="pulse-toast-alt-accent"
                style={{ background: getStoreColor(toastOrder.storeKey) }}
              />
              <div className="pulse-toast-alt-icon">
                {getStoreIcon(toastOrder.storeKey)}
              </div>

              <div className="pulse-toast-alt-content">
                <div className="pulse-toast-alt-title">
                  New Order #{toastOrder.orderNumber}
                </div>
                <div className="pulse-toast-alt-subtitle">
                  {toastOrder.storeLabel} — {toastOrder.itemsText}
                </div>
              </div>

              <div className="pulse-toast-alt-amount">{formatMoney(toastOrder.amount)}</div>
            </div>
          )}

          <header className="pulse-header-alt">
            <div className="pulse-header-alt-left">
              <div className="pulse-brand-alt">MEMA</div>
              <div className="pulse-divider-alt" />
              <div className="pulse-subbrand-alt">Live Operations</div>

              <div className="pulse-live-pill-alt">
                <span className="pulse-live-pill-dot-alt" />
                LIVE
              </div>
            </div>

            <div className="pulse-header-alt-right">
              <div className="pulse-date-alt">{dateText}</div>
              <div className="pulse-clock-alt">{clockText}</div>
            </div>
          </header>

          <section className="pulse-kpis-alt">
            <div className="pulse-kpi-alt">
              <div className="pulse-kpi-alt-top">
                <div className="pulse-kpi-alt-label">Order Revenue</div>
                <div className="pulse-kpi-spark pulse-kpi-spark-green" />
              </div>
              <div className="pulse-kpi-alt-value">{formatMoney(orderRevenue)}</div>
              <div className={`pulse-kpi-alt-change ${monthComparison.revenuePct >= 0 ? "positive" : "negative"}`}>
                {monthComparison.revenuePct >= 0 ? "↗" : "↘"} {Math.abs(monthComparison.revenuePct).toFixed(1)}%
                <span> From last month</span>
              </div>
            </div>

            <div className="pulse-kpi-alt">
              <div className="pulse-kpi-alt-top">
                <div className="pulse-kpi-alt-label">Avg Order Value</div>
                <div className="pulse-kpi-spark pulse-kpi-spark-yellow" />
              </div>
              <div className="pulse-kpi-alt-value">{formatMoney(avgOrderValue)}</div>
              <div className={`pulse-kpi-alt-change ${monthComparison.aovPct >= 0 ? "positive" : "negative"}`}>
                {monthComparison.aovPct >= 0 ? "↗" : "↘"} {Math.abs(monthComparison.aovPct).toFixed(1)}%
                <span> From last month</span>
              </div>
            </div>

            <div className="pulse-kpi-alt">
              <div className="pulse-kpi-alt-top">
                <div className="pulse-kpi-alt-label">Total Orders</div>
                <div className="pulse-kpi-spark pulse-kpi-spark-red" />
              </div>
              <div className="pulse-kpi-alt-value">{totalOrders.toLocaleString()}</div>
              <div className={`pulse-kpi-alt-change ${monthComparison.ordersPct >= 0 ? "positive" : "negative"}`}>
                {monthComparison.ordersPct >= 0 ? "↗" : "↘"} {Math.abs(monthComparison.ordersPct).toFixed(1)}%
                <span> From last month</span>
              </div>
            </div>

            <div className="pulse-kpi-alt">
              <div className="pulse-kpi-alt-top">
                <div className="pulse-kpi-alt-label">Month Revenue</div>
                <div className="pulse-kpi-spark pulse-kpi-spark-cyan" />
              </div>
              <div className="pulse-kpi-alt-value">{formatMoney(monthRevenue)}</div>
              <div className={`pulse-kpi-alt-change ${monthComparison.monthRevenuePct >= 0 ? "positive" : "negative"}`}>
                {monthComparison.monthRevenuePct >= 0 ? "↗" : "↘"} {Math.abs(monthComparison.monthRevenuePct).toFixed(1)}%
                <span> From last month</span>
              </div>
            </div>
          </section>

          {loadError && <div className="pulse-error-alt">{loadError}</div>}

          <section className="pulse-upper-grid-alt">
            <section className="pulse-chart-card-alt">
              <div className="pulse-card-head-alt">
                <div className="pulse-card-title-alt">Hourly Revenue</div>
                <div className="pulse-card-meta-alt">Today · 07:00–22:00</div>
              </div>

              <div className="pulse-chart-wrap-alt">
                <div className="pulse-chart-grid-alt">
                  {[1500, 1200, 855, 511, 168].map((label) => (
                    <div className="pulse-chart-grid-row-alt" key={label}>
                      <span>{label >= 1000 ? `${(label / 1000).toFixed(1)}k` : label}</span>
                    </div>
                  ))}
                </div>

                <svg className="pulse-chart-svg-alt" viewBox="0 0 1120 320" preserveAspectRatio="none">
                  {chartPath && (
                    <>
                      <path
                        d={`${chartPath} L 1102 302 L 18 302 Z`}
                        fill="rgba(46,230,255,0.10)"
                      />
                      <path
                        d={chartPath}
                        fill="none"
                        stroke="#2ee6ff"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {hourlyData.map((point, index) => {
                        const max = Math.max(...chartValues, 1);
                        const x = 18 + (index * (1120 - 36)) / Math.max(hourlyData.length - 1, 1);
                        const y = 320 - 18 - (point.value / max) * (320 - 36);
                        const isPeak = point.value === max && point.value > 0;
                        return isPeak ? (
                          <g key={point.hour}>
                            <circle cx={x} cy={y} r="8" fill="#0c1724" stroke="#2ee6ff" strokeWidth="4" />
                          </g>
                        ) : null;
                      })}
                    </>
                  )}
                </svg>

                <div className="pulse-chart-total-alt">
                  <div>Total</div>
                  <strong>{formatMoney(hourlyTotal)}</strong>
                </div>
              </div>

              <div className="pulse-chart-hours-alt">
                {hourlyData.map((point) => (
                  <span key={point.hour}>{point.hour}:00</span>
                ))}
              </div>
            </section>

            <aside className="pulse-share-card-alt">
              <div className="pulse-card-head-alt">
                <div className="pulse-card-title-alt">Store Share</div>
                <div className="pulse-card-meta-alt">Today</div>
              </div>

              <div className="pulse-share-content-alt">
                <div className="pulse-donut-wrap-alt">
                  <div
                    className="pulse-donut-alt"
                    style={{ backgroundImage: donutGradient }}
                  >
                    <div className="pulse-donut-inner-alt">
                      <span>Total</span>
                      <strong>{formatMoney(storeShare.totalRevenue)}</strong>
                    </div>
                  </div>
                </div>

                <div className="pulse-share-legend-alt">
                  {storeShare.rows.map((row) => (
                    <div className="pulse-share-row-alt" key={row.key}>
                      <div className="pulse-share-left-alt">
                        <span
                          className="pulse-share-dot-alt"
                          style={{ background: row.color }}
                        />
                        <span>{row.shortLabel}</span>
                      </div>
                      <div className="pulse-share-right-alt">
                        <span>{formatMoney(row.revenue)}</span>
                        <strong>{row.percent.toFixed(1)}%</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </section>

          <section className="pulse-orders-card-alt">
            <div className="pulse-orders-headbar-alt">
              <div className="pulse-card-title-alt">Order List</div>

              <div className="pulse-filters-alt">
                {["all", "vending", "georgia", "collect", "b2b", "franchise"].map((filter) => (
                  <button
                    key={filter}
                    className={`pulse-filter-btn-alt ${activeFilter === filter ? "active" : ""}`}
                    onClick={() => setActiveFilter(filter)}
                  >
                    {filter === "all"
                      ? "All"
                      : STORE_CONFIGS.find((s) => s.key === filter)?.shortLabel ?? filter}
                  </button>
                ))}
                <span className="pulse-count-alt">{filteredOrders.length} orders</span>
              </div>
            </div>

            <div className="pulse-order-table-alt">
              <div className="pulse-order-table-head-alt">
                <div># Order ID</div>
                <div>Store</div>
                <div>Items</div>
                <div>Qty</div>
                <div>Total</div>
                <div>Payment</div>
                <div>Fulfilment</div>
              </div>

              <div className="pulse-order-table-body-alt">
                {filteredOrders.map((order) => {
                  const payment = normalizePaymentStatus(order.paymentStatus);
                  const fulfillment = normalizeFulfillmentStatus(order.fulfillmentStatus);

                  return (
                    <div className="pulse-order-table-row-alt" key={order.uid}>
                      <div className="order-id-alt">{order.orderNumber}</div>

                      <div className="order-store-alt">
                        <span
                          className="order-store-dot-alt"
                          style={{ background: getStoreColor(order.storeKey) }}
                        />
                        {order.shortStoreLabel}
                      </div>

                      <div className="order-items-alt">{order.itemsText}</div>

                      <div className="order-qty-alt">{order.qty}</div>

                      <div className="order-total-alt">{formatMoney(order.amount)}</div>

                      <div>
                        <span
                          className={`status-chip-alt ${
                            payment === "Pending"
                              ? "pending"
                              : payment === "Failed"
                              ? "failed"
                              : "success"
                          }`}
                        >
                          {payment}
                        </span>
                      </div>

                      <div>
                        <span
                          className={`status-chip-alt ${
                            fulfillment === "Pending" ? "pending" : "fulfilled"
                          }`}
                        >
                          {fulfillment}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import "./memaPulse.css";

type StoreConfig = {
  key: string;
  label: string;
  table: string;
};

type RawRow = Record<string, any>;

type LiveOrder = {
  uid: string;
  storeKey: string;
  storeLabel: string;
  orderNumber: string;
  amount: number;
  createdAt: string;
  itemsText: string;
};

const STORE_CONFIGS: StoreConfig[] = [
  { key: "georgia", label: "Meama Georgia", table: "orders" },
  { key: "collect", label: "Meama Collect", table: "meama_collect_orders" },
  { key: "franchise", label: "Meama Franchise", table: "franchise_orders" },
  { key: "vending", label: "Meama Vending", table: "vending_orders" },
  { key: "b2b", label: "MEAMA B2B", table: "b2b_orders" },
];

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
    orderNumber,
    amount,
    createdAt,
    itemsText: toItemsText(row),
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

function getStoreIcon(storeKey: string) {
  switch (storeKey) {
    case "vending":
      return "☕";
    case "georgia":
      return "🏪";
    case "collect":
      return "📦";
    case "b2b":
      return "🏢";
    case "franchise":
      return "🔑";
    default:
      return "🛍️";
  }
}

export default function MemaPulsePage() {
  const [orders, setOrders] = useState<LiveOrder[]>([]);
  const [monthRevenue, setMonthRevenue] = useState(0);
  const [monthOrders, setMonthOrders] = useState(0);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [todayOrders, setTodayOrders] = useState(0);
  const [toastOrder, setToastOrder] = useState<LiveOrder | null>(null);
  const [now, setNow] = useState(new Date());
  const [loadError, setLoadError] = useState<string | null>(null);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          {
            event: "INSERT",
            schema: "public",
            table: store.table,
          },
          (payload) => {
            const liveOrder = normalizeOrder(payload.new as RawRow, store);

            setOrders((prev) => [liveOrder, ...prev].slice(0, 50));

            if (isSameMonth(liveOrder.createdAt, new Date())) {
              setMonthRevenue((prev) => prev + liveOrder.amount);
              setMonthOrders((prev) => prev + 1);
            }

            if (isSameDay(liveOrder.createdAt, new Date())) {
              setTodayRevenue((prev) => prev + liveOrder.amount);
              setTodayOrders((prev) => prev + 1);
            }

            setToastOrder(liveOrder);

            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
            toastTimerRef.current = setTimeout(() => {
              setToastOrder(null);
            }, 5000);
          }
        )
        .subscribe();
    });

    return () => {
      channels.forEach((channel) => {
        supabase.removeChannel(channel);
      });

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
            .limit(100);

          if (error) {
            throw new Error(`${store.table}: ${error.message}`);
          }

          const normalized = (data ?? []).map((row) => normalizeOrder(row, store));
          return normalized;
        })
      );

      const merged = responses
        .flat()
        .filter((row) => row.createdAt)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const currentDate = new Date();

      let nextMonthRevenue = 0;
      let nextMonthOrders = 0;
      let nextTodayRevenue = 0;
      let nextTodayOrders = 0;

      for (const order of merged) {
        if (isSameMonth(order.createdAt, currentDate)) {
          nextMonthRevenue += order.amount;
          nextMonthOrders += 1;
        }

        if (isSameDay(order.createdAt, currentDate)) {
          nextTodayRevenue += order.amount;
          nextTodayOrders += 1;
        }
      }

      setOrders(merged.slice(0, 50));
      setMonthRevenue(nextMonthRevenue);
      setMonthOrders(nextMonthOrders);
      setTodayRevenue(nextTodayRevenue);
      setTodayOrders(nextTodayOrders);
    } catch (error: any) {
      setLoadError(error?.message || "Failed to load dashboard data.");
    }
  }

  const clockText = useMemo(() => {
    return now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  }, [now]);

  const dateText = useMemo(() => {
    return now.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [now]);

  return (
    <main className="pulse-page">
      <div className="pulse-bg-orb pulse-bg-orb-1" />
      <div className="pulse-bg-orb pulse-bg-orb-2" />
      <div className="pulse-bg-orb pulse-bg-orb-3" />

      <div className="pulse-shell">
        {toastOrder && (
          <div className={`pulse-toast pulse-toast-${toastOrder.storeKey}`}>
            <div className={`pulse-toast-icon pulse-toast-icon-${toastOrder.storeKey}`}>
              {getStoreIcon(toastOrder.storeKey)}
            </div>

            <div className="pulse-toast-content">
              <div className="pulse-toast-title">
                New Order {toastOrder.orderNumber ? `#${toastOrder.orderNumber}` : ""}
              </div>
              <div className="pulse-toast-subtitle">
                {toastOrder.storeLabel} • {toastOrder.itemsText}
              </div>
            </div>

            <div className="pulse-toast-amount">{formatMoney(toastOrder.amount)}</div>
          </div>
        )}

        <header className="pulse-topbar">
          <div className="pulse-topbar-left">
            <div className="pulse-eyebrow">LIVE OPERATIONS</div>

            <div className="pulse-brand-row">
              <div className="pulse-brand">MEMA</div>
              <div className="pulse-brand-sub">PULSE</div>

              <div className="pulse-live-chip">
                <span className="pulse-live-dot" />
                <span>LIVE</span>
              </div>
            </div>
          </div>

          <div className="pulse-topbar-right">
            <div className="pulse-date">{dateText}</div>
            <div className="pulse-clock">{clockText}</div>
          </div>
        </header>

        <section className="pulse-kpi-grid">
          <div className="pulse-kpi-card pulse-kpi-card-cyan">
            <div className="pulse-kpi-label">TODAY REVENUE</div>
            <div className="pulse-kpi-value">{formatMoney(todayRevenue)}</div>
            <div className="pulse-kpi-sub">დღის შემოსავალი</div>
          </div>

          <div className="pulse-kpi-card pulse-kpi-card-purple">
            <div className="pulse-kpi-label">TODAY ORDERS</div>
            <div className="pulse-kpi-value">{todayOrders.toLocaleString()}</div>
            <div className="pulse-kpi-sub">დღის შეკვეთები</div>
          </div>

          <div className="pulse-kpi-card pulse-kpi-card-orange">
            <div className="pulse-kpi-label">MONTH REVENUE</div>
            <div className="pulse-kpi-value">{formatMoney(monthRevenue)}</div>
            <div className="pulse-kpi-sub">თვის შემოსავალი</div>
          </div>

          <div className="pulse-kpi-card pulse-kpi-card-pink">
            <div className="pulse-kpi-label">MONTH ORDERS</div>
            <div className="pulse-kpi-value">{monthOrders.toLocaleString()}</div>
            <div className="pulse-kpi-sub">თვის შეკვეთები</div>
          </div>
        </section>

        <section className="pulse-main-grid">
          <section className="pulse-orders-panel">
            <div className="pulse-panel-header">
              <div className="pulse-panel-title-wrap">
                <div className="pulse-panel-icon">📋</div>
                <div>
                  <div className="pulse-panel-title">Live Orders</div>
                  <div className="pulse-panel-subtitle">Real-time feed across all stores</div>
                </div>
              </div>

              <div className="pulse-panel-badge">25 recent</div>
            </div>

            {loadError && <div className="pulse-error">{loadError}</div>}

            <div className="pulse-orders-table">
              <div className="pulse-orders-head">
                <div>Store</div>
                <div>Order ID</div>
                <div>Items</div>
                <div>Amount</div>
                <div>Time</div>
              </div>

              <div className="pulse-orders-body">
                {orders.length === 0 ? (
                  <div className="pulse-empty">No orders loaded yet.</div>
                ) : (
                  orders.map((order) => (
                    <div className="pulse-order-row" key={order.uid}>
                      <div className={`pulse-store pulse-store-${order.storeKey}`}>
                        <span className="pulse-store-dot" />
                        <span>{order.storeLabel}</span>
                      </div>

                      <div className="pulse-order-number">
                        {order.orderNumber ? `#${order.orderNumber}` : "-"}
                      </div>

                      <div className="pulse-items-text">{order.itemsText}</div>

                      <div className="pulse-amount">{formatMoney(order.amount)}</div>

                      <div className="pulse-time">
                        {order.createdAt
                          ? new Date(order.createdAt).toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                              hour12: true,
                            })
                          : "-"}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <aside className="pulse-side-panel">
            <div className="pulse-side-card">
              <div className="pulse-side-title">Store Performance</div>

              <div className="pulse-store-rank pulse-rank-vending">
                <div className="pulse-rank-left">
                  <div className="pulse-rank-icon pulse-rank-icon-vending">☕</div>
                  <div>
                    <div className="pulse-rank-name">Meama Vending</div>
                    <div className="pulse-rank-meta">Live active store feed</div>
                  </div>
                </div>
                <div className="pulse-rank-amount">●</div>
              </div>

              <div className="pulse-store-rank pulse-rank-georgia">
                <div className="pulse-rank-left">
                  <div className="pulse-rank-icon pulse-rank-icon-georgia">🏪</div>
                  <div>
                    <div className="pulse-rank-name">Meama Georgia</div>
                    <div className="pulse-rank-meta">Live active store feed</div>
                  </div>
                </div>
                <div className="pulse-rank-amount">●</div>
              </div>

              <div className="pulse-store-rank pulse-rank-collect">
                <div className="pulse-rank-left">
                  <div className="pulse-rank-icon pulse-rank-icon-collect">📦</div>
                  <div>
                    <div className="pulse-rank-name">Meama Collect</div>
                    <div className="pulse-rank-meta">Live active store feed</div>
                  </div>
                </div>
                <div className="pulse-rank-amount">●</div>
              </div>

              <div className="pulse-store-rank pulse-rank-b2b">
                <div className="pulse-rank-left">
                  <div className="pulse-rank-icon pulse-rank-icon-b2b">🏢</div>
                  <div>
                    <div className="pulse-rank-name">MEAMA B2B</div>
                    <div className="pulse-rank-meta">Live active store feed</div>
                  </div>
                </div>
                <div className="pulse-rank-amount">●</div>
              </div>

              <div className="pulse-store-rank pulse-rank-franchise">
                <div className="pulse-rank-left">
                  <div className="pulse-rank-icon pulse-rank-icon-franchise">🔑</div>
                  <div>
                    <div className="pulse-rank-name">Meama Franchise</div>
                    <div className="pulse-rank-meta">Live active store feed</div>
                  </div>
                </div>
                <div className="pulse-rank-amount">●</div>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
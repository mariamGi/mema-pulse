"use client";

import { useEffect, useMemo, useState } from "react";
import "./memaPulse.css";

type StoreKey = "vending" | "georgia" | "collect" | "b2b" | "franchise";

type OrderRow = {
  id: string;
  storeKey: StoreKey;
  shortStoreLabel: string;
  orderNumber: string;
  amount: number;
  itemsText: string;
  qty: number;
  paymentStatus: "Success" | "Partial";
  timeText: string;
};

type StorePerformanceRow = {
  storeKey: StoreKey;
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

const STORE_COLORS: Record<StoreKey, string> = {
  vending: "#33d7ff",
  georgia: "#49e3a8",
  collect: "#ffc83d",
  b2b: "#ff73d2",
  franchise: "#9f8bff",
};

const MOCK_ORDERS: OrderRow[] = [
  {
    id: "1",
    storeKey: "franchise",
    shortStoreLabel: "Franchise",
    orderNumber: "#200043",
    amount: 49,
    itemsText: "Lavazza Dek, Illy Classico",
    qty: 7,
    paymentStatus: "Success",
    timeText: "03:42",
  },
  {
    id: "2",
    storeKey: "georgia",
    shortStoreLabel: "Georgia",
    orderNumber: "#200042",
    amount: 80,
    itemsText: "Lavazza Crema e Aroma, Lavazza Oro, Illy Classico",
    qty: 11,
    paymentStatus: "Success",
    timeText: "03:39",
  },
  {
    id: "3",
    storeKey: "vending",
    shortStoreLabel: "Vending",
    orderNumber: "#200041",
    amount: 57,
    itemsText: "Nespresso Ristretto, Meama Premium",
    qty: 5,
    paymentStatus: "Partial",
    timeText: "03:33",
  },
];

const MOCK_STORE_PERFORMANCE: StorePerformanceRow[] = [
  {
    storeKey: "vending",
    shortLabel: "Vending",
    revenue: 4449,
    orders: 126,
    avg: 35.3,
    share: 22,
    color: STORE_COLORS.vending,
  },
  {
    storeKey: "georgia",
    shortLabel: "Georgia",
    revenue: 4272,
    orders: 81,
    avg: 52.7,
    share: 21.1,
    color: STORE_COLORS.georgia,
  },
  {
    storeKey: "collect",
    shortLabel: "Collect",
    revenue: 3653,
    orders: 142,
    avg: 25.7,
    share: 18,
    color: STORE_COLORS.collect,
  },
  {
    storeKey: "b2b",
    shortLabel: "B2B",
    revenue: 4097,
    orders: 69,
    avg: 59.4,
    share: 20.2,
    color: STORE_COLORS.b2b,
  },
  {
    storeKey: "franchise",
    shortLabel: "Franchise",
    revenue: 3770,
    orders: 77,
    avg: 49,
    share: 18.6,
    color: STORE_COLORS.franchise,
  },
];

const MOCK_REGIONS: RegionRow[] = [
  { city: "Tbilisi", revenue: 12340 },
  { city: "Batumi", revenue: 6820 },
  { city: "Kutaisi", revenue: 4110 },
  { city: "Rustavi", revenue: 2390 },
];

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

export default function MemaPulsePage() {
  const [activeFilter, setActiveFilter] = useState<StoreKey | "all">("all");
  const [now, setNow] = useState(new Date());
  const [toastVisible, setToastVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const filteredOrders = useMemo(() => {
    if (activeFilter === "all") return MOCK_ORDERS;
    return MOCK_ORDERS.filter((row) => row.storeKey === activeFilter);
  }, [activeFilter]);

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

  const kpis = [
    {
      title: "Today Revenue",
      value: formatMoney(29696),
      change: formatPercent(23.5),
      tone: "green",
      path: buildSparkline([18, 17, 19, 16, 18, 20, 19, 22, 21, 26]),
    },
    {
      title: "Today Orders",
      value: "645",
      change: formatPercent(16.1),
      tone: "red",
      path: buildSparkline([10, 10, 10, 10, 15, 14, 18, 19, 16, 22]),
    },
    {
      title: "MTD Revenue",
      value: formatMoney(382229),
      change: formatPercent(19.5),
      tone: "yellow",
      path: buildSparkline([22, 18, 24, 20, 19, 18, 20, 17, 18, 14]),
    },
    {
      title: "MTD Orders",
      value: "11,943",
      change: formatPercent(11.2),
      tone: "cyan",
      path: buildSparkline([18, 18, 19, 22, 21, 20, 22, 21, 23, 24]),
    },
  ] as const;

  return (
    <main className="mp-page">
      <div className="mp-viewport">
        <div className="mp-shell">
          <div className="mp-orb mp-orb-1" />
          <div className="mp-orb mp-orb-2" />
          <div className="mp-orb mp-orb-3" />

          {toastVisible && (
            <div className="mp-toast" onClick={() => setToastVisible(false)}>
              <div
                className="mp-toast-accent"
                style={{ backgroundColor: STORE_COLORS.franchise }}
              />
              <div className="mp-toast-title">NEW ORDER</div>
              <div className="mp-toast-id">#200043</div>
              <div className="mp-toast-amount">{formatMoney(49)}</div>
              <div className="mp-toast-sub">Franchise · Lavazza Dek, Illy Classico</div>
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
                <div className="mp-kpi-change positive">↗ {kpi.change}</div>
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

                  <button
                    className={`mp-filter-btn ${activeFilter === "vending" ? "active" : ""}`}
                    onClick={() => setActiveFilter("vending")}
                  >
                    Vending
                  </button>

                  <button
                    className={`mp-filter-btn ${activeFilter === "georgia" ? "active" : ""}`}
                    onClick={() => setActiveFilter("georgia")}
                  >
                    Georgia
                  </button>

                  <button
                    className={`mp-filter-btn ${activeFilter === "collect" ? "active" : ""}`}
                    onClick={() => setActiveFilter("collect")}
                  >
                    Collect
                  </button>

                  <button
                    className={`mp-filter-btn ${activeFilter === "b2b" ? "active" : ""}`}
                    onClick={() => setActiveFilter("b2b")}
                  >
                    B2B
                  </button>

                  <button
                    className={`mp-filter-btn ${activeFilter === "franchise" ? "active" : ""}`}
                    onClick={() => setActiveFilter("franchise")}
                  >
                    Franchise
                  </button>
                </div>

                <div className="mp-orders-count">{filteredOrders.length} orders</div>
              </div>

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
                          style={{ backgroundColor: STORE_COLORS[order.storeKey] }}
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
                </div>
              </div>
            </div>

            <aside className="mp-side">
              <div className="mp-side-card mp-side-performance">
                <div className="mp-side-title">STORE PERFORMANCE</div>

                <div className="mp-side-list performance">
                  {MOCK_STORE_PERFORMANCE.map((row) => (
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
                            width: `${row.share}%`,
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
                  {MOCK_REGIONS.map((region) => (
                    <div key={region.city} className="mp-region-row">
                      <div className="mp-region-name">{region.city}</div>
                      <div className="mp-region-value">{formatMoney(region.revenue)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </section>
        </div>
      </div>
    </main>
  );
}
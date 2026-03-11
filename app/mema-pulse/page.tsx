"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type StoreId = "vending" | "georgia" | "collect" | "b2b" | "franchise";

type Store = {
  id: StoreId;
  name: string;
  color: string;
  short: string;
};

type ProductItem = {
  name: string;
  qty: number;
};

type Order = {
  id: string;
  store: Store;
  items: ProductItem[];
  itemCount: number;
  total: number;
  time: string;
  date: string;
  ts: number;
  status: "Success" | "Partial";
};

type StoreStats = {
  revenue: number;
  orders: number;
};

type StatsMap = Record<StoreId, StoreStats>;

type RegionStat = {
  city: string;
  revenue: number;
};

const STORES: Store[] = [
  { id: "vending", name: "Meama Vending", color: "#22D3EE", short: "Vending" },
  { id: "georgia", name: "Meama Georgia", color: "#34D399", short: "Georgia" },
  { id: "collect", name: "Meama Collect", color: "#FBBF24", short: "Collect" },
  { id: "b2b", name: "MEAMA B2B", color: "#F472B6", short: "B2B" },
  { id: "franchise", name: "Meama Franchise", color: "#A78BFA", short: "Franchise" },
];

const PRODUCTS = [
  "Lavazza Crema e Aroma",
  "Borbone Red",
  "Borbone Blue",
  "Illy Classico",
  "Nespresso Ristretto",
  "Kimbo Napoli",
  "Lavazza Oro",
  "Borbone Gold",
  "Illy Forte",
  "Nespresso Roma",
  "Kimbo Extra",
  "Lavazza Dek",
  "Meama Classic Blend",
  "Meama Premium",
  "Meama Decaf",
];

const REGIONS = ["Tbilisi", "Batumi", "Kutaisi", "Rustavi", "Gori", "Zugdidi"];

const rand = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const genSparkline = (n = 20, min = 10, max = 50): number[] => {
  const pts: number[] = [];
  let v = rand(min, max);
  for (let i = 0; i < n; i += 1) {
    v = Math.max(min, Math.min(max, v + rand(-5, 5)));
    pts.push(v);
  }
  return pts;
};

function formatMoney(value: number): string {
  return `₾${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

const Sparkline = ({
  data,
  color,
  w = 128,
  h = 50,
}: {
  data: number[];
  color: string;
  w?: number;
  h?: number;
}) => {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = w / Math.max(data.length - 1, 1);

  const points = data
    .map((v, i) => `${i * step},${h - ((v - min) / range) * (h - 6) - 3}`)
    .join(" ");

  const areaPoints = `${points} ${w},${h} 0,${h}`;
  const gradientId = `sg-${color.replace("#", "")}-${w}-${h}`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.26" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradientId})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const genOrder = (id: number): Order => {
  const store = pick(STORES);
  const count = rand(1, 4);
  const items = Array.from({ length: count }, () => ({
    name: pick(PRODUCTS),
    qty: rand(1, 5),
  }));
  const total = items.reduce((sum, item) => sum + item.qty * rand(5, 18), 0);

  return {
    id: `${200000 + id}`,
    store,
    items,
    itemCount: items.reduce((sum, item) => sum + item.qty, 0),
    total,
    time: new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    date: new Date().toLocaleDateString("en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    ts: Date.now(),
    status: Math.random() > 0.18 ? "Success" : "Partial",
  };
};

const Badge = ({
  text,
  type,
}: {
  text: string;
  type: "Success" | "Partial";
}) => {
  const styles =
    type === "Success"
      ? { bg: "#085E46", color: "#44E0A3", border: "#0B7C5C" }
      : { bg: "#5D3A08", color: "#F3C256", border: "#8B5E13" };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "9px 16px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 800,
        background: styles.bg,
        color: styles.color,
        border: `1px solid ${styles.border}`,
        minWidth: 98,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
};

const NotificationToast = ({
  order,
  onDone,
}: {
  order: Order;
  onDone: () => void;
}) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const fadeTimer = setTimeout(() => setVisible(false), 3800);
    const removeTimer = setTimeout(onDone, 4300);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [onDone]);

  return (
    <div
      style={{
        position: "fixed",
        top: 10,
        left: "50%",
        transform: `translateX(-50%) translateY(${visible ? "0" : "-12px"})`,
        opacity: visible ? 1 : 0,
        transition: "all 0.28s ease",
        width: "calc(50vw - 34px)",
        minWidth: 760,
        maxWidth: 1030,
        background: "#161B22",
        border: "1px solid #2A3140",
        borderLeft: `4px solid ${order.store.color}`,
        borderRadius: 10,
        padding: "16px 20px",
        zIndex: 999,
        display: "flex",
        alignItems: "center",
        gap: 16,
        boxShadow: "0 22px 55px rgba(0,0,0,0.38)",
      }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 10,
          background: `${order.store.color}20`,
          display: "grid",
          placeItems: "center",
          color: order.store.color,
          fontSize: 18,
          flexShrink: 0,
        }}
      >
        🔔
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: "#F0F6FC",
            fontSize: 13,
            fontWeight: 900,
            letterSpacing: 0.7,
            marginBottom: 5,
          }}
        >
          NEW ORDER
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 14,
          }}
        >
          <span
            style={{
              color: "#F0F6FC",
              fontSize: 28,
              fontWeight: 900,
              fontFamily: "monospace",
              lineHeight: 1,
            }}
          >
            #{order.id}
          </span>

          <span
            style={{
              color: "#F0F6FC",
              fontSize: 30,
              fontWeight: 900,
              fontFamily: "monospace",
              lineHeight: 1,
            }}
          >
            ₾{order.total.toFixed(0)}
          </span>
        </div>

        <div
          style={{
            color: "#8B949E",
            fontSize: 13,
            marginTop: 6,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {order.store.short} · {order.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}
        </div>
      </div>
    </div>
  );
};

export default function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [notifications, setNotifications] = useState<Order[]>([]);
  const [stats, setStats] = useState<StatsMap>({
    vending: { revenue: 0, orders: 0 },
    georgia: { revenue: 0, orders: 0 },
    collect: { revenue: 0, orders: 0 },
    b2b: { revenue: 0, orders: 0 },
    franchise: { revenue: 0, orders: 0 },
  });

  const [regionStats, setRegionStats] = useState<RegionStat[]>([]);
  const [todayRevenue, setTodayRevenue] = useState<number>(0);
  const [todayOrders, setTodayOrders] = useState<number>(0);
  const [mtdRevenue, setMtdRevenue] = useState<number>(0);
  const [mtdOrders, setMtdOrders] = useState<number>(0);
  const [time, setTime] = useState<Date>(new Date());
  const [filter, setFilter] = useState<string>("All");

  const [spark] = useState(() => ({
    revenue: genSparkline(20, 20, 60),
    orders: genSparkline(20, 15, 45),
    mtdRevenue: genSparkline(20, 25, 70),
    mtdOrders: genSparkline(20, 18, 55),
  }));

  const counterRef = useRef(0);

  useEffect(() => {
    const initialStats: StatsMap = {
      vending: { revenue: 7881, orders: 181 },
      georgia: { revenue: 8563, orders: 149 },
      collect: { revenue: 8726, orders: 214 },
      b2b: { revenue: 8690, orders: 144 },
      franchise: { revenue: 7801, orders: 141 },
    };

    const initialRegions: RegionStat[] = [
      { city: "Tbilisi", revenue: 12340 },
      { city: "Batumi", revenue: 7680 },
      { city: "Kutaisi", revenue: 5458 },
      { city: "Rustavi", revenue: 2910 },
    ];

    setStats(initialStats);
    setRegionStats(initialRegions);

    const dayRevenueTotal = Object.values(initialStats).reduce((sum, item) => sum + item.revenue, 0);
    const dayOrdersTotal = Object.values(initialStats).reduce((sum, item) => sum + item.orders, 0);

    setTodayRevenue(dayRevenueTotal);
    setTodayOrders(dayOrdersTotal);
    setMtdRevenue(403649);
    setMtdOrders(12277);

    const seedOrders: Order[] = [];
    for (let i = 0; i < 30; i += 1) {
      seedOrders.push(genOrder(i));
    }

    setOrders(seedOrders);
    counterRef.current = 30;
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      counterRef.current += 1;
      const order = genOrder(counterRef.current);
      const amount = order.total;

      setOrders((prev) => [order, ...prev].slice(0, 80));
      setNotifications((prev) => [order, ...prev].slice(0, 1));

      setTodayRevenue((prev) => prev + amount);
      setTodayOrders((prev) => prev + 1);
      setMtdRevenue((prev) => prev + amount);
      setMtdOrders((prev) => prev + 1);

      setStats((prev) => ({
        ...prev,
        [order.store.id]: {
          revenue: prev[order.store.id].revenue + amount,
          orders: prev[order.store.id].orders + 1,
        },
      }));

      setRegionStats((prev) => {
        const region = pick(REGIONS);
        const found = prev.find((r) => r.city === region);

        if (!found) return [...prev, { city: region, revenue: amount }];

        return prev.map((r) =>
          r.city === region ? { ...r, revenue: r.revenue + amount } : r
        );
      });
    }, rand(5000, 8000));

    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const filteredOrders = useMemo(() => {
    if (filter === "All") return orders;
    return orders.filter((order) => order.store.short === filter);
  }, [orders, filter]);

  const colors = {
    bg: "#0D1117",
    card: "#161B22",
    border: "#21262D",
    t1: "#F0F6FC",
    t2: "#C9D1D9",
    t3: "#8B949E",
    t4: "#484F58",
    green: "#34D399",
  };

  const storePerformanceRows = STORES.map((store) => {
    const current = stats[store.id];
    const avg = current.orders > 0 ? current.revenue / current.orders : 0;
    const share = todayRevenue > 0 ? (current.revenue / todayRevenue) * 100 : 0;

    return {
      ...store,
      revenue: current.revenue,
      orders: current.orders,
      avg,
      share,
    };
  });

  const sortedRegions = [...regionStats].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: colors.bg,
        color: colors.t1,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {notifications.map((notification) => (
        <NotificationToast
          key={`${notification.id}-${notification.ts}`}
          order={notification}
          onDone={() => removeNotification(notification.id)}
        />
      ))}

      <div style={{ padding: "12px 18px 16px", paddingTop: 86 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span
              style={{
                fontSize: 42,
                fontWeight: 900,
                color: colors.t1,
                letterSpacing: -0.8,
                lineHeight: 1,
              }}
            >
              MEAMA
            </span>
            <span style={{ color: colors.t4, fontSize: 16 }}>|</span>
            <span style={{ color: colors.t3, fontSize: 18, fontWeight: 600 }}>Live Operations</span>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginLeft: 4,
                background: "#06251C",
                border: "1px solid #065F46",
                padding: "6px 13px",
                borderRadius: 7,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: colors.green,
                }}
              />
              <span style={{ color: colors.green, fontSize: 12, fontWeight: 800 }}>LIVE</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ color: colors.t3, fontSize: 15 }}>
              {time.toLocaleDateString("en-US", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>

            <span
              style={{
                color: colors.t1,
                fontSize: 32,
                fontWeight: 800,
                fontFamily: "monospace",
                letterSpacing: 1,
                lineHeight: 1,
              }}
            >
              {time.toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12,
            marginBottom: 14,
          }}
        >
          {[
            {
              label: "Today Revenue",
              value: formatMoney(todayRevenue),
              pct: "23.5%",
              delta: `+₾${rand(300, 900)}`,
              sparkData: spark.revenue,
              sparkColor: "#34D399",
            },
            {
              label: "Today Orders",
              value: todayOrders.toLocaleString(),
              pct: "16.1%",
              delta: `+${rand(9, 24)}`,
              sparkData: spark.orders,
              sparkColor: "#F87171",
            },
            {
              label: "MTD Revenue",
              value: formatMoney(mtdRevenue),
              pct: "19.5%",
              delta: `+₾${rand(2000, 8000)}`,
              sparkData: spark.mtdRevenue,
              sparkColor: "#FBBF24",
            },
            {
              label: "MTD Orders",
              value: mtdOrders.toLocaleString(),
              pct: "11.2%",
              delta: `+${rand(70, 220)}`,
              sparkData: spark.mtdOrders,
              sparkColor: "#22D3EE",
            },
          ].map((kpi, index) => (
            <div
              key={index}
              style={{
                background: colors.card,
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                padding: "16px 20px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                minHeight: 136,
                overflow: "hidden",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    color: colors.t3,
                    fontSize: 14,
                    fontWeight: 700,
                    marginBottom: 10,
                    letterSpacing: 0.2,
                  }}
                >
                  {kpi.label}
                </div>

                <div
                  style={{
                    color: colors.t1,
                    fontSize: 36,
                    fontWeight: 900,
                    fontFamily: "monospace",
                    letterSpacing: -0.8,
                    lineHeight: 1.02,
                  }}
                >
                  {kpi.value}
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      color: colors.green,
                      fontSize: 13,
                      fontWeight: 800,
                    }}
                  >
                    ↗ {kpi.pct}
                  </span>
                  <span style={{ color: colors.t4, fontSize: 11, fontWeight: 600 }}>
                    ({kpi.delta})
                  </span>
                </div>
              </div>

              <div style={{ marginTop: 0, marginLeft: 14, flexShrink: 0 }}>
                <Sparkline data={kpi.sparkData} color={kpi.sparkColor} w={128} h={50} />
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12,
            alignItems: "start",
          }}
        >
          <div
            style={{
              gridColumn: "1 / span 3",
              background: colors.card,
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              height: "calc(100vh - 284px)",
              minHeight: 520,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                borderBottom: `1px solid ${colors.border}`,
                padding: "0 18px",
                minHeight: 54,
              }}
            >
              {["All", ...STORES.map((store) => store.short)].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilter(tab)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "14px 14px",
                    color: filter === tab ? colors.t1 : colors.t4,
                    fontSize: 14,
                    fontWeight: filter === tab ? 800 : 600,
                    borderBottom:
                      filter === tab ? `2px solid ${colors.t1}` : "2px solid transparent",
                    transition: "all 0.15s",
                  }}
                >
                  {tab}
                </button>
              ))}
              <div style={{ flex: 1 }} />
              <span style={{ color: colors.t4, fontSize: 12, fontWeight: 600 }}>
                {filteredOrders.length} orders
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "96px 110px minmax(320px, 1fr) 92px 104px 118px 76px",
                padding: "12px 18px",
                borderBottom: `1px solid ${colors.border}`,
                color: colors.t4,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.35,
              }}
            >
              <div># Order ID</div>
              <div>Store</div>
              <div>Items</div>
              <div style={{ textAlign: "center" }}>Qty</div>
              <div style={{ textAlign: "right" }}>Total</div>
              <div style={{ textAlign: "center" }}>Payment</div>
              <div style={{ textAlign: "center" }}>Time</div>
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
              {filteredOrders.map((order, index) => (
                <div
                  key={`${order.id}-${order.ts}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "96px 110px minmax(320px, 1fr) 92px 104px 118px 76px",
                    padding: "14px 18px",
                    borderBottom: `1px solid ${colors.border}33`,
                    alignItems: "center",
                    background: index === 0 ? `${order.store.color}07` : "transparent",
                    transition: "background 0.35s",
                    minHeight: 58,
                  }}
                >
                  <div
                    style={{
                      color: colors.t3,
                      fontFamily: "monospace",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {order.id}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: order.store.color,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ color: colors.t2, fontSize: 13, fontWeight: 600 }}>
                      {order.store.short}
                    </span>
                  </div>

                  <div
                    style={{
                      color: colors.t2,
                      fontSize: 13,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      paddingRight: 10,
                    }}
                  >
                    {order.items.map((item) => item.name).join(", ")}
                  </div>

                  <div
                    style={{
                      color: colors.t3,
                      fontSize: 13,
                      fontWeight: 600,
                      textAlign: "center",
                    }}
                  >
                    {order.itemCount} items
                  </div>

                  <div
                    style={{
                      color: colors.t1,
                      fontWeight: 800,
                      fontSize: 14,
                      fontFamily: "monospace",
                      textAlign: "right",
                    }}
                  >
                    ₾{order.total.toFixed(0)}
                  </div>

                  <div style={{ textAlign: "center", display: "flex", justifyContent: "center" }}>
                    <Badge text={order.status} type={order.status} />
                  </div>

                  <div
                    style={{
                      textAlign: "center",
                      color: colors.t2,
                      fontSize: 13,
                      fontFamily: "monospace",
                      fontWeight: 600,
                    }}
                  >
                    {order.time}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              gridColumn: "4",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              minWidth: 0,
            }}
          >
            <div
              style={{
                background: colors.card,
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                padding: 16,
              }}
            >
              <div
                style={{
                  color: colors.t2,
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: 0.65,
                  marginBottom: 16,
                  textTransform: "uppercase",
                }}
              >
                Store Performance
              </div>

              {storePerformanceRows.map((store) => (
                <div key={store.id} style={{ marginBottom: 18 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 6,
                      gap: 10,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 2,
                          background: store.color,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          color: colors.t2,
                          fontSize: 13,
                          fontWeight: 700,
                        }}
                      >
                        {store.short}
                      </span>
                    </div>

                    <span
                      style={{
                        color: colors.t1,
                        fontSize: 15,
                        fontWeight: 900,
                        fontFamily: "monospace",
                        whiteSpace: "nowrap",
                      }}
                    >
                      ₾{store.revenue.toLocaleString("en-US", {
                        maximumFractionDigits: 0,
                      })}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      marginBottom: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ color: colors.t4, fontSize: 11, fontWeight: 600 }}>
                      {store.orders} orders
                    </span>
                    <span style={{ color: colors.t4, fontSize: 11, fontWeight: 600 }}>
                      avg ₾{store.avg.toFixed(1)}
                    </span>
                    <span style={{ color: colors.t4, fontSize: 11, fontWeight: 600 }}>
                      {store.share.toFixed(1)}%
                    </span>
                  </div>

                  <div style={{ height: 4, borderRadius: 999, background: colors.border }}>
                    <div
                      style={{
                        height: "100%",
                        borderRadius: 999,
                        background: store.color,
                        width: `${store.share}%`,
                        transition: "width 0.8s ease",
                        opacity: 0.95,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                background: colors.card,
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                padding: 16,
              }}
            >
              <div
                style={{
                  color: colors.t2,
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: 0.65,
                  marginBottom: 14,
                  textTransform: "uppercase",
                }}
              >
                Regions by Revenue
              </div>

              {sortedRegions.map((region, index) => (
                <div
                  key={region.city}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 0",
                    borderBottom:
                      index < sortedRegions.length - 1
                        ? `1px solid ${colors.border}33`
                        : "none",
                    gap: 12,
                  }}
                >
                  <span style={{ color: colors.t3, fontSize: 13, fontWeight: 600 }}>
                    {region.city}
                  </span>
                  <span
                    style={{
                      color: colors.t2,
                      fontSize: 14,
                      fontWeight: 800,
                      fontFamily: "monospace",
                      whiteSpace: "nowrap",
                    }}
                  >
                    ₾{region.revenue.toLocaleString("en-US", {
                      maximumFractionDigits: 0,
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
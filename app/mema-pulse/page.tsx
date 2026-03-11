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
  region: string;
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
  w = 150,
  h = 60,
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
    .map((v, i) => `${i * step},${h - ((v - min) / range) * (h - 8) - 4}`)
    .join(" ");

  const areaPoints = `${points} ${w},${h} 0,${h}`;
  const gradientId = `sg-${color.replace("#", "")}-${w}-${h}`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradientId})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const genOrder = (id: number): Order => {
  const store = pick(STORES);
  const count = rand(1, 4);
  const region = pick(REGIONS);
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
    region,
  };
};

const PaymentTag = ({
  type,
}: {
  type: "Success" | "Partial";
}) => {
  const isSuccess = type === "Success";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 108,
        height: 36,
        padding: "0 16px",
        borderRadius: 10,
        background: isSuccess ? "rgba(9, 122, 93, 0.92)" : "rgba(125, 82, 7, 0.92)",
        border: `1px solid ${isSuccess ? "#15956E" : "#B57A11"}`,
        color: isSuccess ? "#8BFFD5" : "#FFD16A",
        fontSize: 14,
        fontWeight: 900,
        lineHeight: 1,
        whiteSpace: "nowrap",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      {type}
    </div>
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
        top: 14,
        left: 20,
        transform: `translateY(${visible ? "0" : "-12px"})`,
        opacity: visible ? 1 : 0,
        transition: "all 0.28s ease",
        width: "calc(75% - 26px)", // KPI 3 ბოქსის არეს ემთხვევა
        minWidth: 980,
        maxWidth: 1320,
        minHeight: 112, // უფრო ქვემოთ ჩამოდის
        background:
          "linear-gradient(90deg, rgba(7,56,67,0.98) 0%, rgba(12,73,84,0.96) 100%)",
        border: "1px solid #10E7DD",
        borderRadius: 18,
        padding: "26px 26px",
        zIndex: 999,
        display: "flex",
        alignItems: "center",
        gap: 20,
        boxShadow: "0 22px 58px rgba(0,0,0,0.42)",
      }}
    >
      <div
        style={{
          width: 58,
          height: 58,
          borderRadius: 16,
          background: "rgba(5, 211, 192, 0.18)",
          display: "grid",
          placeItems: "center",
          color: "#4CFFF0",
          fontSize: 24,
          flexShrink: 0,
        }}
      >
        🔔
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: "#E8FFFD",
            fontSize: 24,
            fontWeight: 900,
            marginBottom: 8,
            lineHeight: 1.08,
          }}
        >
          New Order #{order.id}
        </div>

        <div
          style={{
            color: "rgba(232,255,253,0.84)",
            fontSize: 17,
            fontWeight: 700,
            lineHeight: 1.3,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontWeight: 900, color: "#FFFFFF", fontSize: 19 }}>
            {order.store.short}
          </span>
          {" • "}
          <span style={{ color: "#BDFBF2" }}>{order.region}</span>
          {" • "}
          {order.items.map((i) => `${i.name} x${i.qty}`).join(", ")}
        </div>
      </div>

      <div
        style={{
          color: "#19F0CF",
          fontSize: 40,
          fontWeight: 900,
          fontFamily: "monospace",
          whiteSpace: "nowrap",
          lineHeight: 1,
        }}
      >
        ₾{order.total.toFixed(2)}
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
      { city: "Gori", revenue: 748 },
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
        const found = prev.find((r) => r.city === order.region);

        if (!found) return [...prev, { city: order.region, revenue: amount }];

        return prev.map((r) =>
          r.city === order.region ? { ...r, revenue: r.revenue + amount } : r
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
    bg: "#0A1018",
    card: "#131A23",
    border: "#232B36",
    t1: "#F3F7FC",
    t2: "#D7DFE9",
    t3: "#8E9BAB",
    t4: "#566171",
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

  const sortedRegions = [...regionStats].sort((a, b) => b.revenue - a.revenue).slice(0, 6);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: colors.bg,
        color: colors.t1,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        overflow: "hidden",
      }}
    >
      <style>{`
        * {
          box-sizing: border-box;
        }

        html, body {
          margin: 0;
          padding: 0;
          overflow: hidden;
          background: ${colors.bg};
        }

        .hide-scrollbar {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        .hide-scrollbar::-webkit-scrollbar {
          width: 0;
          height: 0;
          display: none;
        }
      `}</style>

      {notifications.map((notification) => (
        <NotificationToast
          key={`${notification.id}-${notification.ts}`}
          order={notification}
          onDone={() => removeNotification(notification.id)}
        />
      ))}

      <div style={{ padding: "14px 20px 18px", paddingTop: 96, height: "100vh", overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span
              style={{
                fontSize: 52,
                fontWeight: 900,
                color: colors.t1,
                letterSpacing: -1.1,
                lineHeight: 1,
              }}
            >
              MEAMA
            </span>

            <span style={{ color: colors.t4, fontSize: 20 }}>|</span>

            <span style={{ color: colors.t3, fontSize: 24, fontWeight: 600 }}>Live Operations</span>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                marginLeft: 6,
                background: "#062B1F",
                border: "1px solid #0B7A57",
                padding: "7px 14px",
                borderRadius: 8,
              }}
            >
              <div
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: colors.green,
                }}
              />
              <span style={{ color: colors.green, fontSize: 13, fontWeight: 900 }}>LIVE</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ color: colors.t3, fontSize: 20 }}>
              {time.toLocaleDateString("en-US", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>

            <span
              style={{
                color: colors.t1,
                fontSize: 42,
                fontWeight: 900,
                fontFamily: "monospace",
                letterSpacing: 0.8,
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
            marginBottom: 12,
          }}
        >
          {[
            {
              label: "Today Revenue",
              value: formatMoney(todayRevenue),
              pct: "23.5%",
              delta: `+₾${rand(300, 900)}`,
              sparkData: spark.revenue,
              sparkColor: "#24E3B0",
            },
            {
              label: "Today Orders",
              value: todayOrders.toLocaleString(),
              pct: "16.1%",
              delta: `+${rand(9, 24)}`,
              sparkData: spark.orders,
              sparkColor: "#FF6B74",
            },
            {
              label: "MTD Revenue",
              value: formatMoney(mtdRevenue),
              pct: "19.5%",
              delta: `+₾${rand(2000, 8000)}`,
              sparkData: spark.mtdRevenue,
              sparkColor: "#FFC928",
            },
            {
              label: "MTD Orders",
              value: mtdOrders.toLocaleString(),
              pct: "11.2%",
              delta: `+${rand(70, 220)}`,
              sparkData: spark.mtdOrders,
              sparkColor: "#2DD9FF",
            },
          ].map((kpi, index) => (
            <div
              key={index}
              style={{
                background: colors.card,
                border: `1px solid ${colors.border}`,
                borderRadius: 10,
                padding: "18px 18px 16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                minHeight: 146,
                overflow: "hidden",
              }}
            >
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div
                  style={{
                    color: colors.t2,
                    fontSize: 18,
                    fontWeight: 700,
                    marginBottom: 10,
                    lineHeight: 1.1,
                  }}
                >
                  {kpi.label}
                </div>

                <div
                  style={{
                    color: colors.t1,
                    fontSize: 52,
                    fontWeight: 900,
                    fontFamily: "monospace",
                    letterSpacing: -1.2,
                    lineHeight: 0.95,
                  }}
                >
                  {kpi.value}
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      color: "#31F0AA",
                      fontSize: 18,
                      fontWeight: 900,
                    }}
                  >
                    ↗ {kpi.pct}
                  </span>
                  <span
                    style={{
                      color: colors.t4,
                      fontSize: 14,
                      fontWeight: 700,
                    }}
                  >
                    ({kpi.delta})
                  </span>
                </div>
              </div>

              <div style={{ marginLeft: 12, flexShrink: 0, paddingTop: 4 }}>
                <Sparkline data={kpi.sparkData} color={kpi.sparkColor} w={150} h={60} />
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12,
            alignItems: "stretch",
            height: "calc(100vh - 302px)",
            minHeight: 500,
          }}
        >
          <div
            style={{
              gridColumn: "1 / span 3",
              background: colors.card,
              border: `1px solid ${colors.border}`,
              borderRadius: 10,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                borderBottom: `1px solid ${colors.border}`,
                padding: "0 18px",
                minHeight: 60,
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
                    padding: "16px 15px",
                    color: filter === tab ? colors.t1 : colors.t4,
                    fontSize: 16,
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
              <span style={{ color: colors.t4, fontSize: 13, fontWeight: 700 }}>
                {filteredOrders.length} orders
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "112px 150px minmax(260px, 1.18fr) 130px 92px 128px 146px 108px",
                padding: "12px 18px",
                borderBottom: `1px solid ${colors.border}`,
                color: colors.t4,
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: 0.35,
              }}
            >
              <div># Order ID</div>
              <div>Store</div>
              <div>Items</div>
              <div>Location</div>
              <div style={{ textAlign: "center" }}>Qty</div>
              <div style={{ textAlign: "right" }}>Total</div>
              <div style={{ textAlign: "center" }}>Payment</div>
              <div style={{ textAlign: "right" }}>Time</div>
            </div>

            <div className="hide-scrollbar" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              {filteredOrders.map((order, index) => (
                <div
                  key={`${order.id}-${order.ts}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns:  "112px 150px minmax(260px, 1.18fr) 130px 92px 128px 146px 108px",
                    padding: "16px 18px",
                    borderBottom: `1px solid ${colors.border}33`,
                    alignItems: "center",
                    background:
                      index === 0
                        ? "linear-gradient(90deg, rgba(39,52,73,0.32) 0%, rgba(25,30,38,0.04) 100%)"
                        : "transparent",
                    minHeight: 62,
                  }}
                >
                  <div
                    style={{
                      color: "#B7C4D4",
                      fontFamily: "monospace",
                      fontSize: 18,
                      fontWeight: 700,
                    }}
                  >
                    {order.id}
                  </div>
<div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
  <div
    style={{
      width: 9,
      height: 9,
      borderRadius: "50%",
      background: order.store.color,
      flexShrink: 0,
    }}
  />
  <span
    style={{
      color: order.store.color,
      fontSize: 16,
      fontWeight: 900,
      whiteSpace: "nowrap",
    }}
  >
    {order.store.short}
  </span>
</div>

                  <div
                    style={{
                      color: "#D3DCE6",
                      fontSize: 16,
                      fontWeight: 700,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      paddingRight: 8,
                    }}
                  >
                    {order.items.map((item) => `${item.name} x${item.qty}`).join(", ")}
                  </div>

                  <div
                    style={{
                      color: colors.t3,
                      fontSize: 15,
                      fontWeight: 700,
                    }}
                  >
                    {order.region}
                  </div>

                  <div
                    style={{
                      color: colors.t2,
                      fontSize: 16,
                      fontWeight: 800,
                      textAlign: "center",
                    }}
                  >
                    {order.itemCount}
                  </div>

                  <div
                    style={{
                      color: colors.t1,
                      fontWeight: 900,
                      fontSize: 19,
                      fontFamily: "monospace",
                      textAlign: "right",
                      whiteSpace: "nowrap",
                      paddingRight: 8,
                    }}
                  >
                    ₾{order.total.toFixed(0)}
                  </div>

                  <div style={{ display: "flex", justifyContent: "center",paddingLeft: 4  }}>
                    <PaymentTag type={order.status} />
                  </div>

                  <div
                    style={{
                      textAlign: "right",
                      color: "#EEF4FF",
                      fontSize: 15,
                      fontFamily: "monospace",
                      fontWeight: 800,
                      whiteSpace: "nowrap",
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
              display: "grid",
              gridTemplateRows: "1fr 0.82fr",
              gap: 12,
              minHeight: 0,
            }}
          >
            <div
              style={{
                background: colors.card,
                border: `1px solid ${colors.border}`,
                borderRadius: 10,
                padding: 18,
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-start",
                minHeight: 0,
              }}
            >
              <div
                style={{
                  color: colors.t1,
                  fontSize: 18,
                  fontWeight: 900,
                  letterSpacing: 0.5,
                  marginBottom: 18,
                  textTransform: "uppercase",
                }}
              >
                Store Performance
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {storePerformanceRows.map((store) => (
                  <div key={store.id}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        gap: 12,
                        alignItems: "start",
                        marginBottom: 8,
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
                          <div
                            style={{
                              width: 9,
                              height: 9,
                              borderRadius: 2,
                              background: store.color,
                              flexShrink: 0,
                            }}
                          />
                          <span
                            style={{
                              color: colors.t1,
                              fontSize: 18,
                              fontWeight: 800,
                              lineHeight: 1.1,
                            }}
                          >
                            {store.short}
                          </span>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            gap: 12,
                            flexWrap: "wrap",
                            color: colors.t3,
                            fontSize: 13,
                            fontWeight: 700,
                          }}
                        >
                          <span>{store.orders} orders</span>
                          <span>avg ₾{store.avg.toFixed(1)}</span>
                          <span>{store.share.toFixed(1)}%</span>
                        </div>
                      </div>

                      <div
                        style={{
                          color: colors.t1,
                          fontSize: 22,
                          fontWeight: 900,
                          fontFamily: "monospace",
                          whiteSpace: "nowrap",
                          lineHeight: 1,
                        }}
                      >
                        ₾{store.revenue.toLocaleString("en-US", {
                          maximumFractionDigits: 0,
                        })}
                      </div>
                    </div>

                    <div
                      style={{
                        height: 4,
                        borderRadius: 999,
                        background: "#27303A",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          borderRadius: 999,
                          background: store.color,
                          width: `${Math.max(store.share, 8)}%`,
                          transition: "width 0.8s ease",
                          opacity: 0.95,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                background: colors.card,
                border: `1px solid ${colors.border}`,
                borderRadius: 10,
                padding: 18,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
              }}
            >
              <div
                style={{
                  color: colors.t1,
                  fontSize: 18,
                  fontWeight: 900,
                  letterSpacing: 0.5,
                  marginBottom: 16,
                  textTransform: "uppercase",
                }}
              >
                Regions by Revenue
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {sortedRegions.map((region, index) => (
                  <div
                    key={region.city}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      alignItems: "center",
                      gap: 12,
                      paddingBottom: 10,
                      borderBottom:
                        index < sortedRegions.length - 1
                          ? `1px solid ${colors.border}33`
                          : "none",
                    }}
                  >
                    <span
                      style={{
                        color: "#D5DFEA",
                        fontSize: 17,
                        fontWeight: 700,
                      }}
                    >
                      {region.city}
                    </span>

                    <span
                      style={{
                        color: colors.t1,
                        fontSize: 20,
                        fontWeight: 900,
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
    </div>
  );
}
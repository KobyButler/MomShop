"use client";
import { useEffect, useState } from "react";
import { api } from "@/app/lib/api";
import Link from "next/link";
import { motion } from "framer-motion";
import { Badge, statusVariant } from "@/components/ui/badge";

const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.07 } }
};
const item = {
    hidden: { opacity: 0, y: 16 },
    show:  { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.32, 0.72, 0, 1] as [number,number,number,number] } }
};

function fmt(cents: number) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents ?? 0) / 100);
}

function KpiCard({ label, value, sub, icon, color }: {
    label: string; value: string | number; sub?: string;
    icon: React.ReactNode; color: string;
}) {
    return (
        <motion.div variants={item}
            className="bg-white rounded-2xl p-5 ring-1 ring-black/5 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-300 cursor-default"
        >
            <div className="flex items-start justify-between mb-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
                    {icon}
                </div>
            </div>
            <p className="text-2xl font-bold text-slate-900 leading-none">{value}</p>
            {sub && <p className="text-xs text-slate-400 mt-1.5">{sub}</p>}
        </motion.div>
    );
}

function SkeletonKpi() {
    return (
        <div className="bg-white rounded-2xl p-5 ring-1 ring-black/5 shadow-card animate-pulse">
            <div className="flex items-start justify-between mb-3">
                <div className="h-3 w-20 bg-slate-200 rounded" />
                <div className="w-9 h-9 bg-slate-100 rounded-xl" />
            </div>
            <div className="h-7 w-28 bg-slate-200 rounded" />
        </div>
    );
}

export default function Dashboard() {
    const [fin, setFin] = useState<any>(null);
    const [unfulfilledOrders, setUnfulfilledOrders] = useState<any[]>([]);
    const [recentOrders, setRecentOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            api("/finance/summary"),
            api("/orders?status=UNFULFILLED&limit=100"),
            api("/orders?limit=6")
        ]).then(([finData, unfulfilled, recent]) => {
            setFin(finData);
            const uArr = Array.isArray(unfulfilled) ? unfulfilled : (unfulfilled?.data ?? []);
            const rArr = Array.isArray(recent) ? recent : (recent?.data ?? []);
            setUnfulfilledOrders(uArr);
            setRecentOrders(rArr.slice(0, 6));
        }).catch(console.error).finally(() => setLoading(false));
    }, []);

    return (
        <div className="space-y-8">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                className="flex items-end justify-between"
            >
                <div>
                    <h1 className="page-title">Dashboard</h1>
                    <p className="page-subtitle">Here's what's happening with your print shop today.</p>
                </div>
                <div className="flex gap-2.5">
                    <Link href="/admin/orders">
                        <motion.button
                            whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }}
                            className="px-4 py-2 rounded-xl text-sm font-medium text-slate-700 bg-white ring-1 ring-black/8 shadow-sm hover:shadow-md hover:text-brand-600 transition-all duration-200"
                        >
                            All Orders
                        </motion.button>
                    </Link>
                    <Link href="/admin/shops">
                        <motion.button
                            whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }}
                            className="btn-shine px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-200"
                            style={{ background: "linear-gradient(135deg,#8b5cf6 0%,#7c3aed 100%)", boxShadow: "0 4px 16px rgba(124,58,237,0.35)" }}
                        >
                            + Create Shop
                        </motion.button>
                    </Link>
                </div>
            </motion.div>

            {/* KPI Row */}
            <motion.div
                variants={container} initial="hidden" animate="show"
                className="grid grid-cols-2 lg:grid-cols-4 gap-4"
            >
                {loading ? (
                    [1,2,3,4].map(i => <SkeletonKpi key={i} />)
                ) : (
                    <>
                        <KpiCard
                            label="Total Revenue"
                            value={fmt(fin?.grossCents ?? 0)}
                            sub="All time gross"
                            color="bg-violet-100"
                            icon={<svg className="w-4 h-4 text-violet-600" fill="currentColor" viewBox="0 0 20 20"><path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"/><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd"/></svg>}
                        />
                        <KpiCard
                            label="Net Profit"
                            value={fmt(fin?.netCents ?? 0)}
                            sub="After costs"
                            color="bg-emerald-100"
                            icon={<svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd"/></svg>}
                        />
                        <KpiCard
                            label="Unfulfilled"
                            value={unfulfilledOrders.length}
                            sub="Need action"
                            color={unfulfilledOrders.length > 0 ? "bg-amber-100" : "bg-slate-100"}
                            icon={<svg className={`w-4 h-4 ${unfulfilledOrders.length > 0 ? "text-amber-600" : "text-slate-400"}`} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd"/></svg>}
                        />
                        <KpiCard
                            label="Total Orders"
                            value={fin?.orders ?? 0}
                            sub="All time"
                            color="bg-blue-100"
                            icon={<svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/><path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd"/></svg>}
                        />
                    </>
                )}
            </motion.div>

            {/* Main grid */}
            <div className="grid lg:grid-cols-3 gap-6">
                {/* Recent Orders */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                    className="lg:col-span-2 bg-white rounded-2xl ring-1 ring-black/5 shadow-card overflow-hidden"
                >
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                        <h3 className="text-sm font-bold text-slate-900">Recent Orders</h3>
                        <Link href="/admin/orders">
                            <span className="text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors">
                                View all →
                            </span>
                        </Link>
                    </div>
                    {loading ? (
                        <div className="p-5 space-y-4">
                            {[1,2,3,4].map(i => (
                                <div key={i} className="animate-pulse flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-slate-100 rounded-full" />
                                        <div className="space-y-1.5">
                                            <div className="h-3 w-28 bg-slate-200 rounded" />
                                            <div className="h-2.5 w-36 bg-slate-100 rounded" />
                                        </div>
                                    </div>
                                    <div className="h-5 w-20 bg-slate-100 rounded-full" />
                                </div>
                            ))}
                        </div>
                    ) : recentOrders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-slate-300">
                            <svg className="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                            </svg>
                            <p className="text-sm text-slate-400 font-medium">No orders yet</p>
                            <p className="text-xs text-slate-300 mt-0.5">Orders will appear here once customers start buying</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-50">
                            {recentOrders.map((order, idx) => (
                                <motion.div
                                    key={order.id}
                                    initial={{ opacity: 0, x: -8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.25 + idx * 0.04, duration: 0.3 }}
                                    className="flex items-center justify-between px-5 py-3.5 hover:bg-violet-50/30 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                                            <span className="text-xs font-bold text-brand-600">
                                                {(order.customerName ?? "?")[0].toUpperCase()}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-slate-800">{order.customerName}</p>
                                            <p className="text-xs text-slate-400 mt-0.5">{order.customerEmail}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-slate-300 hidden sm:block">
                                            {new Date(order.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                        </span>
                                        <Badge variant={statusVariant(order.status)} size="sm">
                                            {order.status.charAt(0) + order.status.slice(1).toLowerCase()}
                                        </Badge>
                                        <span className="text-sm font-bold text-slate-900 tabular-nums w-20 text-right">{fmt(order.totalCents)}</span>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </motion.div>

                {/* Right column */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                    className="space-y-4"
                >
                    {/* Alert */}
                    {!loading && unfulfilledOrders.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4">
                            <div className="flex gap-3">
                                <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                                    <svg className="w-4.5 h-4.5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-amber-900">Action needed</p>
                                    <p className="text-xs text-amber-700 mt-0.5">
                                        {unfulfilledOrders.length} unfulfilled order{unfulfilledOrders.length !== 1 ? "s" : ""}
                                    </p>
                                    <Link href="/admin/orders">
                                        <span className="text-xs font-semibold text-amber-700 underline underline-offset-2 mt-1 inline-block hover:text-amber-900 transition-colors">
                                            Review now →
                                        </span>
                                    </Link>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Quick Links */}
                    <div className="bg-white rounded-2xl ring-1 ring-black/5 shadow-card overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100">
                            <h3 className="text-sm font-bold text-slate-900">Quick Actions</h3>
                        </div>
                        <div className="p-2">
                            {[
                                { href: "/admin/shops",     label: "Create a group shop",      icon: "🏪", sub: "Set up a new storefront" },
                                { href: "/admin/products",  label: "Manage products",           icon: "📦", sub: "Add or edit items"        },
                                { href: "/admin/orders",    label: "View open orders",          icon: "⏳", sub: "Fulfill pending orders"   },
                                { href: "/admin/analytics", label: "Analytics",                 icon: "📊", sub: "Revenue & trends"         },
                                { href: "/admin/discounts", label: "Create a discount",         icon: "🏷️", sub: "Promo codes & sales"      },
                            ].map((a, idx) => (
                                <Link key={a.href} href={a.href}>
                                    <motion.div
                                        whileHover={{ x: 2 }}
                                        transition={{ duration: 0.15 }}
                                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-brand-50/60 transition-colors group cursor-pointer"
                                    >
                                        <span className="text-xl w-8 text-center">{a.icon}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-slate-700 group-hover:text-brand-700 transition-colors">{a.label}</p>
                                            <p className="text-xs text-slate-400">{a.sub}</p>
                                        </div>
                                        <svg className="w-3.5 h-3.5 text-slate-300 group-hover:text-brand-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                        </svg>
                                    </motion.div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}

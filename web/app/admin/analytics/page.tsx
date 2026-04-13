"use client";
import { useEffect, useState } from "react";
import { api } from "@/app/lib/api";
import { motion } from "framer-motion";

type Series = { date: string; orders: number; grossCents: number };
type TopProduct = { sku: string; name: string; qty: number; salesCents: number };

const fmt = (cents: number) =>
    new Intl.NumberFormat("en-US", { style:"currency", currency:"USD" }).format(cents / 100);

function BarChart({ data, getValue, getLabel, color }: {
    data: any[]; getValue:(d:any)=>number; getLabel:(d:any)=>string; color:string;
}) {
    const max = Math.max(1, ...data.map(getValue));
    return (
        <div className="flex items-end gap-0.5 h-28">
            {data.map((d, i) => {
                const pct = (getValue(d) / max) * 100;
                return (
                    <motion.div key={i} className="flex-1 flex flex-col items-center group relative"
                        title={`${getLabel(d)}: ${getValue(d)}`}
                        initial={{ scaleY:0, originY:"bottom" }} animate={{ scaleY:1 }} transition={{ delay:i*0.015, duration:0.4, ease:[0.32,0.72,0,1] }}
                    >
                        <div className={`w-full rounded-sm transition-all ${pct > 0 ? color : "bg-slate-100"}`}
                            /* height is dynamic — inline style required */
                            style={{ height:`${Math.max(pct, 3)}%` }} />
                    </motion.div>
                );
            })}
        </div>
    );
}

export default function AnalyticsPage() {
    const [data, setData]     = useState<{ series:Series[]; top:TopProduct[] } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api("/analytics/overview").then(setData).catch(console.error).finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="space-y-6 animate-pulse">
                <div><div className="h-6 w-32 bg-slate-200 rounded mb-2"/><div className="h-4 w-48 bg-slate-100 rounded"/></div>
                <div className="grid grid-cols-2 gap-4">
                    {[1,2].map(i => <div key={i} className="h-24 bg-slate-100 rounded-2xl"/>)}
                </div>
                <div className="grid lg:grid-cols-2 gap-4">
                    {[1,2].map(i => <div key={i} className="h-48 bg-slate-100 rounded-2xl"/>)}
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div>
                <h1 className="page-title mb-2">Analytics</h1>
                <p className="text-sm text-slate-500">Could not load analytics data.</p>
            </div>
        );
    }

    const totalOrders  = data.series.reduce((a,s) => a + s.orders, 0);
    const totalRevenue = data.series.reduce((a,s) => a + s.grossCents, 0);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="page-title">Analytics</h1>
                <p className="page-subtitle">Last 30 days performance</p>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-4">
                {[
                    { label:"Orders (30d)",  value:totalOrders.toString(),  icon:"📦", color:"text-slate-900" },
                    { label:"Revenue (30d)", value:fmt(totalRevenue),        icon:"💰", color:"text-brand-600" },
                ].map((k, i) => (
                    <motion.div key={k.label} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.08 }}
                        className="bg-white rounded-2xl p-5 ring-1 ring-black/5 shadow-card cursor-default">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{k.label}</p>
                            <span className="text-xl">{k.icon}</span>
                        </div>
                        <p className={`text-3xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
                    </motion.div>
                ))}
            </div>

            {/* Charts */}
            <div className="grid lg:grid-cols-2 gap-4">
                <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.15 }}
                    className="bg-white rounded-2xl ring-1 ring-black/5 shadow-card p-5">
                    <h3 className="text-sm font-bold text-slate-900 mb-1">Orders per day</h3>
                    <p className="text-xs text-slate-400 mb-4">Count of orders placed each day</p>
                    <BarChart data={data.series} getValue={s => s.orders} getLabel={s => s.date} color="bg-brand-500" />
                    <div className="flex justify-between mt-2 text-[10px] text-slate-300 font-mono">
                        <span>{data.series[0]?.date}</span>
                        <span>{data.series[data.series.length-1]?.date}</span>
                    </div>
                </motion.div>

                <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.22 }}
                    className="bg-white rounded-2xl ring-1 ring-black/5 shadow-card p-5">
                    <h3 className="text-sm font-bold text-slate-900 mb-1">Revenue per day</h3>
                    <p className="text-xs text-slate-400 mb-4">Gross revenue generated each day</p>
                    <BarChart data={data.series} getValue={s => s.grossCents} getLabel={s => `${s.date}: ${fmt(s.grossCents)}`} color="bg-emerald-500" />
                    <div className="flex justify-between mt-2 text-[10px] text-slate-300 font-mono">
                        <span>{data.series[0]?.date}</span>
                        <span>{data.series[data.series.length-1]?.date}</span>
                    </div>
                </motion.div>
            </div>

            {/* Top Products */}
            <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.3 }}
                className="bg-white rounded-2xl ring-1 ring-black/5 shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                    <h3 className="text-sm font-bold text-slate-900">Top Products</h3>
                </div>
                {data.top.length === 0 ? (
                    <div className="py-12 text-center text-sm text-slate-400">No product sales yet</div>
                ) : (
                    <table className="data-table">
                        <thead><tr><th>#</th><th>Product</th><th>SKU</th><th>Units Sold</th><th>Sales</th></tr></thead>
                        <tbody>
                            {data.top.map((p, i) => (
                                <tr key={p.sku}>
                                    <td>
                                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${i===0 ? "bg-amber-100 text-amber-700" : i===1 ? "bg-slate-100 text-slate-600" : i===2 ? "bg-orange-100 text-orange-600" : "text-slate-400 font-mono"}`}>
                                            {i < 3 ? ["🥇","🥈","🥉"][i] : i+1}
                                        </span>
                                    </td>
                                    <td className="font-semibold text-slate-800">{p.name}</td>
                                    <td><code className="text-xs font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{p.sku}</code></td>
                                    <td>
                                        <span className="inline-flex items-center justify-center w-8 h-6 rounded-full bg-brand-50 text-brand-700 text-xs font-bold">{p.qty}</span>
                                    </td>
                                    <td className="font-bold text-slate-900 tabular-nums">{fmt(p.salesCents)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </motion.div>
        </div>
    );
}

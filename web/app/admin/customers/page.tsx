"use client";
import { useEffect, useState } from "react";
import { api } from "@/app/lib/api";
import { motion } from "framer-motion";

type Customer = { id:string; name:string; email:string; orders:number; totalCents:number; createdAt:string };

const fmt = (cents: number) =>
    new Intl.NumberFormat("en-US", { style:"currency", currency:"USD" }).format(cents / 100);

export default function CustomersPage() {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading]     = useState(true);
    const [search, setSearch]       = useState("");

    useEffect(() => {
        api("/customers").then(d => setCustomers(Array.isArray(d) ? d : [])).catch(console.error).finally(() => setLoading(false));
    }, []);

    const filtered = customers.filter(c =>
        !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase())
    );

    const totalRevenue = customers.reduce((a, c) => a + c.totalCents, 0);
    const totalOrderCount = customers.reduce((a, c) => a + c.orders, 0);
    const avgOrderValue = totalOrderCount > 0 ? totalRevenue / totalOrderCount : 0;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="page-title">Customers</h1>
                <p className="page-subtitle">Everyone who has placed an order</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                {[
                    { label:"Total Customers", value:loading ? "—" : customers.length.toString() },
                    { label:"Total Revenue",   value:loading ? "—" : fmt(totalRevenue) },
                    { label:"Avg. Order Value",value:loading ? "—" : fmt(avgOrderValue) }
                ].map((s, i) => (
                    <motion.div key={s.label} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.07 }}
                        className="bg-white rounded-2xl p-5 ring-1 ring-black/5 shadow-card cursor-default">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{s.label}</p>
                        <p className="text-2xl font-bold text-slate-900">{s.value}</p>
                    </motion.div>
                ))}
            </div>

            {/* Search */}
            <div className="relative max-w-xs">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                <input className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 bg-white shadow-sm transition-all"
                    placeholder="Search customers…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl ring-1 ring-black/5 shadow-card overflow-hidden">
                {loading ? (
                    <div className="p-8 space-y-4">
                        {[1,2,3,4].map(i => (
                            <div key={i} className="animate-pulse flex items-center gap-4">
                                <div className="w-9 h-9 bg-slate-100 rounded-full"/>
                                <div className="flex-1 space-y-1.5"><div className="h-3 w-36 bg-slate-200 rounded"/><div className="h-2.5 w-44 bg-slate-100 rounded"/></div>
                                <div className="h-4 w-16 bg-slate-100 rounded"/>
                            </div>
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center py-16 text-slate-300">
                        <svg className="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        <p className="text-sm text-slate-400 font-medium">{search ? "No customers match" : "No customers yet"}</p>
                        <p className="text-xs text-slate-300 mt-0.5">Customers are created automatically when orders are placed</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <div className="table-wrap"><table className="data-table">
                            <thead><tr><th>Customer</th><th>Orders</th><th>Total Spent</th><th>Top Customer?</th><th>Since</th></tr></thead>
                            <tbody>
                                {filtered.sort((a,b) => b.totalCents - a.totalCents).map((c, idx) => (
                                    <motion.tr key={c.id} initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} transition={{ delay:idx*0.025, duration:0.2 }}>
                                        <td>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                                                    <span className="text-xs font-bold text-brand-600">{c.name[0].toUpperCase()}</span>
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-slate-800 text-sm">{c.name}</p>
                                                    <p className="text-xs text-slate-400">{c.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-sm font-semibold text-slate-700">{c.orders}</span>
                                        </td>
                                        <td>
                                            <span className="text-sm font-bold text-slate-900 tabular-nums">{fmt(c.totalCents)}</span>
                                        </td>
                                        <td>
                                            {idx === 0 && customers.length > 1 ? (
                                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                                                    ⭐ Top spender
                                                </span>
                                            ) : <span className="text-slate-300">—</span>}
                                        </td>
                                        <td>
                                            <span className="text-xs text-slate-400">
                                                {new Date(c.createdAt).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" })}
                                            </span>
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table></div>
                    </div>
                )}
            </div>
        </div>
    );
}

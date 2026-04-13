"use client";
import { useEffect, useState } from "react";
import { api } from "@/app/lib/api";
import { Badge, statusVariant } from "@/components/ui/badge";
import { motion } from "framer-motion";

export default function AbandonedCheckoutsPage() {
    const [rows, setRows]     = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api("/checkouts").then(d => setRows(Array.isArray(d) ? d : [])).catch(console.error).finally(() => setLoading(false));
    }, []);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="page-title">Abandoned Checkouts</h1>
                <p className="page-subtitle">Carts that were started but not completed</p>
            </div>

            <div className="bg-white rounded-2xl ring-1 ring-black/5 shadow-card overflow-hidden">
                {loading ? (
                    <div className="p-8 space-y-3">
                        {[1,2,3].map(i => (
                            <div key={i} className="animate-pulse flex items-center gap-4">
                                <div className="flex-1 h-3 bg-slate-200 rounded"/>
                                <div className="h-3 w-32 bg-slate-100 rounded"/>
                                <div className="h-5 w-16 bg-slate-100 rounded-full"/>
                            </div>
                        ))}
                    </div>
                ) : rows.length === 0 ? (
                    <div className="flex flex-col items-center py-16 text-slate-300">
                        <svg className="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                        <p className="text-sm text-slate-400 font-medium">No abandoned checkouts</p>
                        <p className="text-xs text-slate-300 mt-0.5">When customers start but don&apos;t complete an order, they&apos;ll appear here</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead><tr><th>Date</th><th>Email</th><th>Shop</th><th>Items</th><th>Status</th></tr></thead>
                            <tbody>
                                {rows.map((r, idx) => {
                                    const items = (() => { try { return JSON.parse(r.cartJson || "[]"); } catch { return []; } })();
                                    return (
                                        <motion.tr key={r.id} initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} transition={{ delay:idx*0.03, duration:0.2 }}>
                                            <td><span className="text-xs text-slate-400">{new Date(r.updatedAt ?? r.createdAt).toLocaleString()}</span></td>
                                            <td><span className="text-sm text-slate-700">{r.email || <span className="text-slate-300">Anonymous</span>}</span></td>
                                            <td><span className="text-sm text-slate-500">{r.shop?.name || "—"}</span></td>
                                            <td><span className="text-sm font-medium text-slate-700">{items.length}</span></td>
                                            <td><Badge variant={statusVariant(r.status)} size="sm">{r.status}</Badge></td>
                                        </motion.tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

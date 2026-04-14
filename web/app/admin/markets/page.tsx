"use client";
import { useEffect, useState } from "react";
import { api } from "@/app/lib/api";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

export default function MarketsPage() {
    const [shops, setShops]   = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api("/shops")
            .then((d: any) => setShops(Array.isArray(d) ? d : d?.data ?? []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="page-title">Markets</h1>
                <p className="page-subtitle">Group storefronts (shops) overview</p>
            </div>

            <div className="bg-white rounded-2xl ring-1 ring-black/5 shadow-card overflow-hidden">
                {loading ? (
                    <div className="p-8 space-y-3">
                        {[1,2,3].map(i => (
                            <div key={i} className="animate-pulse flex items-center gap-4">
                                <div className="h-3 w-32 bg-slate-200 rounded"/>
                                <div className="flex-1 h-3 bg-slate-100 rounded"/>
                                <div className="h-5 w-14 bg-slate-100 rounded-full"/>
                            </div>
                        ))}
                    </div>
                ) : shops.length === 0 ? (
                    <div className="flex flex-col items-center py-16 text-slate-300">
                        <svg className="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <p className="text-sm text-slate-400 font-medium">No shops yet</p>
                        <p className="text-xs text-slate-300 mt-0.5">Create shops in the Shops section</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Collection</th>
                                    <th>Storefront Link</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shops.map((s, idx) => (
                                    <motion.tr key={s.id} initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} transition={{ delay:idx*0.03, duration:0.2 }}>
                                        <td>
                                            <span className="text-sm font-semibold text-slate-800">{s.name}</span>
                                        </td>
                                        <td>
                                            <span className="text-sm text-slate-600">{s.collection?.name ?? <span className="text-slate-300 italic">None</span>}</span>
                                        </td>
                                        <td>
                                            <a
                                                href={`/shop/${s.slug}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-brand-600 hover:text-brand-700 hover:underline transition-colors font-mono"
                                            >
                                                /shop/{s.slug}
                                            </a>
                                        </td>
                                        <td>
                                            <Badge variant={s.active ? "success" : "neutral"} size="sm" dot>
                                                {s.active ? "Active" : "Inactive"}
                                            </Badge>
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

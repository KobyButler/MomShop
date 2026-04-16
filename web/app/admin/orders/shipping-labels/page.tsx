"use client";
import { useEffect, useState } from "react";
import { api } from "@/app/lib/api";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { motion, AnimatePresence } from "framer-motion";

type LabelRow = {
    id:string; orderId:string; customerName:string; customerEmail:string;
    shipAddress1:string; shipCity:string; shipState:string; shipZip:string;
    status:"pending"|"printed"|"shipped";
};

const statusColor: Record<string, string> = { pending:"warning", printed:"info", shipped:"success" };

export default function ShippingLabelsPage() {
    const { toast }   = useToast();
    const [rows, setRows]         = useState<LabelRow[]>([]);
    const [loading, setLoading]   = useState(true);
    const [search, setSearch]     = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        api("/orders?status=UNFULFILLED&limit=500")
            .then((d: any) => {
                const orders = Array.isArray(d) ? d : d?.data ?? [];
                setRows(orders.map((o: any) => ({ id:o.id, orderId:o.id, customerName:o.customerName, customerEmail:o.customerEmail,
                    shipAddress1:o.shipAddress1, shipCity:o.shipCity, shipState:o.shipState, shipZip:o.shipZip, status:"pending" as const })));
            }).catch(console.error).finally(() => setLoading(false));
    }, []);

    const filtered = rows.filter(r => {
        const q = search.toLowerCase();
        return (!q || r.customerName.toLowerCase().includes(q) || r.customerEmail.toLowerCase().includes(q)) && (!statusFilter || r.status === statusFilter);
    });

    function toggleSelect(id: string) { setSelectedIds(p => { const n=new Set(p); n.has(id)?n.delete(id):n.add(id); return n; }); }
    function selectAll() { setSelectedIds(p => p.size===filtered.length ? new Set() : new Set(filtered.map(r=>r.id))); }
    function markStatus(ids: string[], status: LabelRow["status"]) {
        setRows(p => p.map(r => ids.includes(r.id) ? { ...r, status } : r));
        setSelectedIds(new Set()); toast(`${ids.length} label(s) marked as ${status}`);
    }
    function exportCSV() {
        const url = `${process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000/api"}/orders/shipping/export?status=UNFULFILLED`;
        window.open(url, "_blank"); toast("Downloading shipping CSV");
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="page-title">Shipping Labels</h1>
                    <p className="page-subtitle">Unfulfilled orders ready for shipment</p>
                </div>
                <div className="flex gap-2.5 flex-wrap">
                    <motion.button type="button" whileHover={{ y:-1 }} whileTap={{ scale:0.97 }} onClick={exportCSV}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-slate-700 bg-white ring-1 ring-black/8 shadow-sm hover:shadow-md transition-all duration-200">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                        Export CSV
                    </motion.button>
                    <AnimatePresence>
                        {selectedIds.size > 0 && (
                            <motion.div initial={{ opacity:0, scale:0.92 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0, scale:0.92 }} className="flex gap-2">
                                <motion.button type="button" whileHover={{ y:-1 }} whileTap={{ scale:0.97 }} onClick={() => { window.print(); toast(`Printing ${selectedIds.size} label(s)`); }}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-slate-700 bg-white ring-1 ring-black/8 shadow-sm hover:shadow-md transition-all duration-200">
                                    🖨️ Print ({selectedIds.size})
                                </motion.button>
                                <motion.button type="button" whileHover={{ y:-1 }} whileTap={{ scale:0.97 }} onClick={() => markStatus(Array.from(selectedIds), "shipped")}
                                    className="btn-shine flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-200"
                                    style={{ background:"linear-gradient(135deg,#10b981 0%,#059669 100%)", boxShadow:"0 4px 16px rgba(16,185,129,0.35)" }}>
                                    Mark Shipped
                                </motion.button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <div className="relative max-w-xs flex-1">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    <input className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 bg-white shadow-sm transition-all"
                        placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full sm:w-36">
                    <option value="">All statuses</option>
                    <option value="pending">Pending</option>
                    <option value="printed">Printed</option>
                    <option value="shipped">Shipped</option>
                </Select>
            </div>

            <div className="bg-white rounded-2xl ring-1 ring-black/5 shadow-card overflow-hidden">
                {loading ? (
                    <div className="p-8 space-y-3">
                        {[1,2,3,4].map(i => (<div key={i} className="animate-pulse flex items-center gap-4"><div className="w-4 h-4 bg-slate-100 rounded"/><div className="flex-1 h-3 bg-slate-200 rounded"/><div className="h-3 w-40 bg-slate-100 rounded"/><div className="h-5 w-16 bg-slate-100 rounded-full"/></div>))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center py-16 text-slate-300">
                        <svg className="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
                        <p className="text-sm text-slate-400 font-medium">No orders to ship</p>
                        <p className="text-xs text-slate-300 mt-0.5">Unfulfilled orders will appear here</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <div className="table-wrap"><table className="data-table">
                            <thead>
                                <tr>
                                    <th className="pl-5 w-10">
                                        <input type="checkbox" title="Select all" aria-label="Select all"
                                            checked={selectedIds.size===filtered.length && filtered.length>0} onChange={selectAll}
                                            className="rounded border-slate-300 accent-brand-600" />
                                    </th>
                                    <th>Order</th><th>Customer</th><th>Ship To</th><th>Status</th><th className="text-right pr-5">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((r, idx) => (
                                    <motion.tr key={r.id} initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} transition={{ delay:idx*0.025, duration:0.2 }}>
                                        <td className="pl-5">
                                            <input type="checkbox" title={`Select ${r.customerName}`} aria-label={`Select ${r.customerName}`}
                                                checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)}
                                                className="rounded border-slate-300 accent-brand-600" />
                                        </td>
                                        <td><code className="text-xs font-mono font-medium text-brand-600">#{r.orderId.slice(-8).toUpperCase()}</code></td>
                                        <td>
                                            <p className="text-sm font-semibold text-slate-800">{r.customerName}</p>
                                            <p className="text-xs text-slate-400">{r.customerEmail}</p>
                                        </td>
                                        <td>
                                            <p className="text-sm text-slate-700">{r.shipAddress1 || "—"}</p>
                                            {r.shipCity && <p className="text-xs text-slate-400">{r.shipCity}, {r.shipState} {r.shipZip}</p>}
                                        </td>
                                        <td><Badge variant={statusColor[r.status] as any} size="sm">{r.status.charAt(0).toUpperCase()+r.status.slice(1)}</Badge></td>
                                        <td className="text-right pr-5">
                                            <div className="flex items-center justify-end gap-1.5">
                                                {r.status==="pending" && (
                                                    <button type="button" onClick={() => markStatus([r.id],"printed")}
                                                        className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors">
                                                        Mark Printed
                                                    </button>
                                                )}
                                                {r.status!=="shipped" && (
                                                    <button type="button" onClick={() => markStatus([r.id],"shipped")}
                                                        className="px-2.5 py-1 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors">
                                                        Mark Shipped
                                                    </button>
                                                )}
                                            </div>
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

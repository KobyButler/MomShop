"use client";
import { useEffect, useState } from "react";
import { api } from "@/app/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { motion } from "framer-motion";

type Transaction = {
    id:string; type:string; amountCents:number; note?:string;
    orderId?:string; order?: { customerName:string; id:string };
    createdAt:string;
};
type Summary = { grossCents:number; netCents:number; orders:number };

const TYPE_VARIANT: Record<string, string> = { INCOME:"success", EXPENSE:"danger", REFUND:"info", FEE:"warning" };

const fmt = (cents: number) =>
    new Intl.NumberFormat("en-US", { style:"currency", currency:"USD" }).format(cents / 100);

export default function FinancePage() {
    const { toast } = useToast();
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [summary, setSummary]           = useState<Summary | null>(null);
    const [loading, setLoading]           = useState(true);
    const [search, setSearch]             = useState("");
    const [typeFilter, setTypeFilter]     = useState("");
    const [showAdd, setShowAdd]           = useState(false);
    const [saving, setSaving]             = useState(false);
    const [form, setForm]                 = useState({ type:"INCOME", amount:"", note:"" });

    useEffect(() => { fetchData(); }, []);

    async function fetchData() {
        setLoading(true);
        try {
            const [txData, sumData] = await Promise.all([api("/finance/transactions").catch(() => []), api("/finance/summary")]);
            setTransactions(Array.isArray(txData) ? txData : []);
            setSummary(sumData);
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }

    const filtered = transactions.filter(t => {
        const q = search.toLowerCase();
        return (!q || (t.note ?? "").toLowerCase().includes(q) || t.id.toLowerCase().includes(q)) && (!typeFilter || t.type === typeFilter);
    });

    async function addTransaction(e: React.FormEvent) {
        e.preventDefault(); setSaving(true);
        try {
            const tx = await api("/finance/transactions", { method:"POST", body:JSON.stringify({
                type:form.type,
                amountCents:Math.round(parseFloat(form.amount)*100) * (form.type==="EXPENSE"||form.type==="FEE" ? -1 : 1),
                note:form.note||undefined
            })});
            setTransactions(p => [tx, ...p]);
            setShowAdd(false); setForm({ type:"INCOME", amount:"", note:"" });
            toast("Transaction recorded"); fetchData();
        } catch (err: any) { toast(err.message||"Failed", "error"); }
        finally { setSaving(false); }
    }

    const income   = transactions.filter(t => t.amountCents > 0).reduce((a,t) => a + t.amountCents, 0);
    const expenses = transactions.filter(t => t.amountCents < 0).reduce((a,t) => a + Math.abs(t.amountCents), 0);

    const kpis = [
        { label:"Gross Revenue",   value:fmt(summary?.grossCents ?? 0), color:"text-brand-600",   icon:"💰" },
        { label:"Net Profit",      value:fmt(summary?.netCents ?? 0),   color:"text-slate-900",    icon:"📈" },
        { label:"Recorded Income", value:fmt(income),                   color:"text-emerald-600",  icon:"⬆️" },
        { label:"Expenses",        value:fmt(expenses),                 color:"text-red-500",      icon:"⬇️" },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="page-title">Finance</h1>
                    <p className="page-subtitle">Track revenue, expenses, and transactions</p>
                </div>
                <motion.button whileHover={{ y:-1 }} whileTap={{ scale:0.97 }}
                    onClick={() => setShowAdd(true)}
                    className="btn-shine flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-200"
                    style={{ background:"linear-gradient(135deg,#8b5cf6 0%,#7c3aed 100%)", boxShadow:"0 4px 16px rgba(124,58,237,0.35)" }}
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                    Add Transaction
                </motion.button>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {kpis.map((k, i) => (
                    <motion.div key={k.label} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.07 }}
                        className="bg-white rounded-2xl p-5 ring-1 ring-black/5 shadow-card cursor-default">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{k.label}</p>
                            <span className="text-lg">{k.icon}</span>
                        </div>
                        <p className={`text-2xl font-bold tabular-nums ${loading ? "text-slate-200" : k.color}`}>
                            {loading ? "———" : k.value}
                        </p>
                    </motion.div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3">
                <div className="relative max-w-xs flex-1">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    <input className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 bg-white shadow-sm transition-all"
                        placeholder="Search transactions…" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <Select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="w-36">
                    <option value="">All types</option>
                    <option value="INCOME">Income</option>
                    <option value="EXPENSE">Expense</option>
                    <option value="REFUND">Refund</option>
                    <option value="FEE">Fee</option>
                </Select>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl ring-1 ring-black/5 shadow-card overflow-hidden">
                {loading ? (
                    <div className="p-8 space-y-3">
                        {[1,2,3,4].map(i => (
                            <div key={i} className="animate-pulse flex items-center gap-4">
                                <div className="h-5 w-16 bg-slate-100 rounded-full"/>
                                <div className="h-4 w-20 bg-slate-200 rounded"/>
                                <div className="flex-1 h-3 bg-slate-100 rounded"/>
                                <div className="h-3 w-20 bg-slate-100 rounded"/>
                            </div>
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center py-16 text-slate-300">
                        <svg className="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        <p className="text-sm text-slate-400 font-medium">No transactions found</p>
                        <p className="text-xs text-slate-300 mt-0.5">{search||typeFilter ? "Try clearing filters" : "Add transactions to track income and expenses"}</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead><tr><th>Type</th><th>Amount</th><th>Note</th><th>Order</th><th>Date</th></tr></thead>
                            <tbody>
                                {filtered.map((tx, idx) => (
                                    <motion.tr key={tx.id} initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} transition={{ delay:idx*0.02, duration:0.2 }}>
                                        <td><Badge variant={TYPE_VARIANT[tx.type] as any} size="sm">{tx.type.charAt(0)+tx.type.slice(1).toLowerCase()}</Badge></td>
                                        <td>
                                            <span className={`text-sm font-bold tabular-nums ${tx.amountCents >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                                {tx.amountCents >= 0 ? "+" : ""}{fmt(tx.amountCents)}
                                            </span>
                                        </td>
                                        <td><span className="text-sm text-slate-700">{tx.note ?? <span className="text-slate-300">—</span>}</span></td>
                                        <td>
                                            {tx.order ? (
                                                <div>
                                                    <p className="text-sm text-slate-700">{tx.order.customerName}</p>
                                                    <p className="text-xs font-mono text-slate-400">#{tx.order.id.slice(-8).toUpperCase()}</p>
                                                </div>
                                            ) : <span className="text-slate-300">—</span>}
                                        </td>
                                        <td><span className="text-xs text-slate-400">{new Date(tx.createdAt).toLocaleDateString("en-US", { month:"short", day:"numeric" })}</span></td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Add Modal */}
            <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Transaction" size="sm">
                <form onSubmit={addTransaction} className="space-y-4">
                    <div>
                        <label className="field-label">Type</label>
                        <Select value={form.type} onChange={e => setForm(p => ({ ...p, type:e.target.value }))}>
                            <option value="INCOME">Income</option>
                            <option value="EXPENSE">Expense</option>
                            <option value="REFUND">Refund</option>
                            <option value="FEE">Fee</option>
                        </Select>
                    </div>
                    <Input label="Amount ($)" type="number" step="0.01" min="0" required placeholder="0.00"
                        value={form.amount} onChange={e => setForm(p => ({ ...p, amount:e.target.value }))} />
                    <Input label="Note" placeholder="e.g. Supply run at Hobby Lobby"
                        value={form.note} onChange={e => setForm(p => ({ ...p, note:e.target.value }))} />
                    <p className="text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2">
                        {form.type==="EXPENSE"||form.type==="FEE" ? "⬇️ Recorded as a deduction from net profit." : "⬆️ Recorded as an addition to net profit."}
                    </p>
                    <ModalFooter>
                        <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
                        <Button type="submit" loading={saving}>Save Transaction</Button>
                    </ModalFooter>
                </form>
            </Modal>
        </div>
    );
}

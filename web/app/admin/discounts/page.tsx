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

type DiscountCode = {
    id:string; code:string; type:"PERCENT"|"AMOUNT";
    value:number; active:boolean; usedCount:number;
    maxUses?:number; expiresAt?:string; createdAt:string;
};

const EMPTY = { code:"", type:"PERCENT", value:"", maxUses:"", expiresAt:"" };

export default function DiscountsPage() {
    const { toast } = useToast();
    const [codes, setCodes]     = useState<DiscountCode[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm]       = useState({ ...EMPTY });
    const [saving, setSaving]   = useState(false);

    useEffect(() => {
        api("/discounts").then(d => setCodes(Array.isArray(d) ? d : [])).catch(console.error).finally(() => setLoading(false));
    }, []);

    async function createCode(e: React.FormEvent) {
        e.preventDefault(); setSaving(true);
        try {
            const payload = {
                code:form.code.toUpperCase(), type:form.type,
                value:form.type==="PERCENT" ? parseInt(form.value,10) : Math.round(parseFloat(form.value)*100),
                maxUses:form.maxUses ? parseInt(form.maxUses,10) : undefined,
                expiresAt:form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined
            };
            const d = await api("/discounts", { method:"POST", body:JSON.stringify(payload) });
            setCodes(p => [d,...p]); setShowCreate(false); setForm({ ...EMPTY }); toast("Discount code created");
        } catch (err: any) { toast(err.message||"Failed to create code", "error"); }
        finally { setSaving(false); }
    }

    async function toggleCode(id: string, active: boolean) {
        try {
            await api(`/discounts/${id}`, { method:"PATCH", body:JSON.stringify({ active:!active }) });
            setCodes(p => p.map(c => c.id===id ? { ...c, active:!active } : c));
            toast(`Code ${active ? "deactivated" : "activated"}`);
        } catch { toast("Failed to update code", "error"); }
    }

    function formatValue(c: DiscountCode) {
        return c.type==="PERCENT" ? `${c.value}% off` : `$${(c.value/100).toFixed(2)} off`;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="page-title">Discount Codes</h1>
                    <p className="page-subtitle">Create codes customers can apply at checkout</p>
                </div>
                <motion.button whileHover={{ y:-1 }} whileTap={{ scale:0.97 }}
                    onClick={() => { setForm({ ...EMPTY }); setShowCreate(true); }}
                    className="btn-shine flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-200"
                    style={{ background:"linear-gradient(135deg,#8b5cf6 0%,#7c3aed 100%)", boxShadow:"0 4px 16px rgba(124,58,237,0.35)" }}
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                    Create Code
                </motion.button>
            </div>

            <div className="bg-white rounded-2xl ring-1 ring-black/5 shadow-card overflow-hidden">
                {loading ? (
                    <div className="p-8 space-y-3">
                        {[1,2,3].map(i => (
                            <div key={i} className="animate-pulse flex items-center gap-4">
                                <div className="h-6 w-24 bg-slate-100 rounded-lg"/>
                                <div className="h-4 w-20 bg-slate-100 rounded"/>
                                <div className="flex-1"/>
                                <div className="h-5 w-14 bg-slate-100 rounded-full"/>
                            </div>
                        ))}
                    </div>
                ) : codes.length === 0 ? (
                    <div className="flex flex-col items-center py-16 text-slate-300">
                        <svg className="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
                        <p className="text-sm text-slate-400 font-medium">No discount codes yet</p>
                        <p className="text-xs text-slate-300 mt-0.5">Create a code to offer discounts at checkout</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <div className="table-wrap"><table className="data-table">
                            <thead><tr><th>Code</th><th>Discount</th><th>Used</th><th>Status</th><th>Expires</th><th className="text-right pr-5">Actions</th></tr></thead>
                            <tbody>
                                {codes.map((c, idx) => {
                                    const expired   = c.expiresAt && new Date(c.expiresAt) < new Date();
                                    const exhausted = c.maxUses && c.usedCount >= c.maxUses;
                                    const isActive  = c.active && !expired && !exhausted;
                                    return (
                                        <motion.tr key={c.id} initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} transition={{ delay:idx*0.03, duration:0.2 }}>
                                            <td>
                                                <span className="inline-flex items-center gap-1.5">
                                                    <code className="text-sm font-mono font-bold tracking-widest text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg">
                                                        {c.code}
                                                    </code>
                                                    <button type="button" title="Copy code" aria-label="Copy code"
                                                        onClick={() => navigator.clipboard.writeText(c.code)}
                                                        className="p-1 text-slate-300 hover:text-brand-500 transition-colors">
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                                                    </button>
                                                </span>
                                            </td>
                                            <td>
                                                <span className="text-sm font-semibold text-brand-600">{formatValue(c)}</span>
                                            </td>
                                            <td>
                                                <span className="text-sm text-slate-600 tabular-nums">
                                                    {c.usedCount}{c.maxUses ? <span className="text-slate-400"> / {c.maxUses}</span> : ""}
                                                </span>
                                            </td>
                                            <td>
                                                <Badge variant={isActive ? "success" : "neutral"} size="sm">
                                                    {expired ? "Expired" : exhausted ? "Exhausted" : c.active ? "Active" : "Inactive"}
                                                </Badge>
                                            </td>
                                            <td>
                                                {c.expiresAt ? (
                                                    <span className={`text-xs ${expired ? "text-red-500 font-medium" : "text-slate-400"}`}>
                                                        {new Date(c.expiresAt).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" })}
                                                    </span>
                                                ) : <span className="text-xs text-slate-300">Never</span>}
                                            </td>
                                            <td className="text-right pr-5">
                                                <button type="button" onClick={() => toggleCode(c.id, c.active)}
                                                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${c.active ? "text-red-500 hover:bg-red-50 hover:text-red-700" : "text-emerald-600 bg-emerald-50 hover:bg-emerald-100"}`}>
                                                    {c.active ? "Deactivate" : "Activate"}
                                                </button>
                                            </td>
                                        </motion.tr>
                                    );
                                })}
                            </tbody>
                        </table></div>
                    </div>
                )}
            </div>

            <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Discount Code" size="sm">
                <form onSubmit={createCode} className="space-y-4">
                    <Input label="Code" required placeholder="e.g. SUMMER20"
                        value={form.code} onChange={e => setForm(p => ({ ...p, code:e.target.value.toUpperCase() }))} />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="field-label">Type</label>
                            <Select value={form.type} onChange={e => setForm(p => ({ ...p, type:e.target.value }))}>
                                <option value="PERCENT">Percentage</option>
                                <option value="AMOUNT">Fixed amount</option>
                            </Select>
                        </div>
                        <Input label={form.type==="PERCENT" ? "Percent off" : "Amount off ($)"}
                            type="number" min="0" step={form.type==="PERCENT" ? "1" : "0.01"} max={form.type==="PERCENT" ? "100" : undefined} required
                            placeholder={form.type==="PERCENT" ? "10" : "5.00"}
                            value={form.value} onChange={e => setForm(p => ({ ...p, value:e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Input label="Max uses (optional)" type="number" min="1" placeholder="Unlimited"
                            value={form.maxUses} onChange={e => setForm(p => ({ ...p, maxUses:e.target.value }))} />
                        <Input label="Expiry date (optional)" type="date"
                            value={form.expiresAt} onChange={e => setForm(p => ({ ...p, expiresAt:e.target.value }))} />
                    </div>
                    <ModalFooter>
                        <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                        <Button type="submit" loading={saving}>Create Code</Button>
                    </ModalFooter>
                </form>
            </Modal>
        </div>
    );
}

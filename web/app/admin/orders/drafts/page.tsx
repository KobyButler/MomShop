"use client";
import { useEffect, useState } from "react";
import { api } from "@/app/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { motion } from "framer-motion";

const fmt = (cents: number) =>
    new Intl.NumberFormat("en-US", { style:"currency", currency:"USD" }).format(cents / 100);

export default function DraftsPage() {
    const { toast }   = useToast();
    const [drafts, setDrafts]       = useState<any[]>([]);
    const [products, setProducts]   = useState<any[]>([]);
    const [collections, setCollections] = useState<any[]>([]);
    const [loading, setLoading]     = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [saving, setSaving]       = useState(false);
    const [filterColl, setFilterColl] = useState("");
    const [form, setForm] = useState({ customerName:"", customerEmail:"", shipAddress1:"", shipCity:"", shipState:"", shipZip:"" });
    const [lines, setLines] = useState<{ productId:string; name:string; quantity:number }[]>([]);

    useEffect(() => {
        Promise.all([api("/orders?status=DRAFT"), api("/products"), api("/collections")])
            .then(([d, p, c]) => {
                setDrafts(Array.isArray(d) ? d : d?.data ?? []);
                setProducts(Array.isArray(p) ? p : p?.data ?? []);
                setCollections(Array.isArray(c) ? c : c?.data ?? []);
            }).catch(console.error).finally(() => setLoading(false));
    }, []);

    function addLine(productId: string) {
        const p = products.find(x => x.id === productId);
        if (!p) return;
        setLines(prev => [...prev, { productId, name:p.name, quantity:1 }]);
    }

    async function createDraft(e: React.FormEvent) {
        e.preventDefault();
        if (lines.length === 0) { toast("Add at least one item", "error"); return; }
        setSaving(true);
        try {
            const order = await api("/orders", { method:"POST", body:JSON.stringify({
                customerName:form.customerName||"Draft Customer",
                customerEmail:form.customerEmail||"draft@noreply.com",
                shipAddress1:form.shipAddress1||"TBD",
                shipCity:form.shipCity||"TBD", shipState:form.shipState||"XX", shipZip:form.shipZip||"00000",
                items:lines.map(l => ({ productId:l.productId, quantity:l.quantity }))
            })});
            setDrafts(p => [order,...p]); setShowCreate(false);
            setForm({ customerName:"",customerEmail:"",shipAddress1:"",shipCity:"",shipState:"",shipZip:"" });
            setLines([]); toast("Draft order created");
        } catch (err: any) { toast(err.message||"Failed to create draft", "error"); }
        finally { setSaving(false); }
    }

    const filteredProducts = products.filter(p => !filterColl || p.collectionId === filterColl);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="page-title">Draft Orders</h1>
                    <p className="page-subtitle">Orders being built before confirmation</p>
                </div>
                <motion.button whileHover={{ y:-1 }} whileTap={{ scale:0.97 }}
                    onClick={() => setShowCreate(true)}
                    className="btn-shine flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-200"
                    style={{ background:"linear-gradient(135deg,#8b5cf6 0%,#7c3aed 100%)", boxShadow:"0 4px 16px rgba(124,58,237,0.35)" }}
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                    New Draft
                </motion.button>
            </div>

            <div className="bg-white rounded-2xl ring-1 ring-black/5 shadow-card overflow-hidden">
                {loading ? (
                    <div className="p-8 space-y-3">
                        {[1,2,3].map(i => (<div key={i} className="animate-pulse flex items-center gap-4"><div className="h-4 w-24 bg-slate-100 rounded"/><div className="flex-1 h-3 bg-slate-200 rounded"/><div className="h-4 w-16 bg-slate-100 rounded"/></div>))}
                    </div>
                ) : drafts.length === 0 ? (
                    <div className="flex flex-col items-center py-16 text-slate-300">
                        <svg className="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        <p className="text-sm text-slate-400 font-medium">No draft orders</p>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead><tr><th>Order ID</th><th>Customer</th><th>Items</th><th>Total</th><th>Created</th></tr></thead>
                        <tbody>
                            {drafts.map((o, idx) => (
                                <motion.tr key={o.id} initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} transition={{ delay:idx*0.03, duration:0.2 }}>
                                    <td><code className="text-xs font-mono font-medium text-brand-600">#{o.id.slice(-8).toUpperCase()}</code></td>
                                    <td><p className="text-sm font-semibold text-slate-800">{o.customerName}</p><p className="text-xs text-slate-400">{o.customerEmail}</p></td>
                                    <td><span className="text-sm text-slate-600">{o.items?.length ?? 0}</span></td>
                                    <td><span className="text-sm font-bold text-slate-900 tabular-nums">{fmt(o.totalCents)}</span></td>
                                    <td><span className="text-xs text-slate-400">{new Date(o.createdAt).toLocaleDateString("en-US", { month:"short", day:"numeric" })}</span></td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Draft Order" size="lg">
                <form onSubmit={createDraft} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <Input label="Customer Name" placeholder="Optional" value={form.customerName} onChange={e => setForm(p => ({ ...p, customerName:e.target.value }))} />
                        <Input label="Customer Email" type="email" placeholder="Optional" value={form.customerEmail} onChange={e => setForm(p => ({ ...p, customerEmail:e.target.value }))} />
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="field-label mb-0">Items</label>
                            <div className="flex gap-2">
                                <Select value={filterColl} onChange={e => setFilterColl(e.target.value)} className="w-40">
                                    <option value="">All collections</option>
                                    {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </Select>
                                <Select value="" onChange={e => { if (e.target.value) addLine(e.target.value); }} className="w-52">
                                    <option value="">+ Add product</option>
                                    {filteredProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </Select>
                            </div>
                        </div>
                        {lines.length === 0 ? (
                            <p className="text-sm text-slate-400 italic py-3 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">No items yet — pick from the dropdown above</p>
                        ) : (
                            <div className="space-y-2 bg-slate-50 rounded-xl p-3 border border-slate-100">
                                {lines.map((l, i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <span className="text-sm text-slate-700 flex-1">{l.name}</span>
                                        <input type="number" min={1} value={l.quantity}
                                            title={`Quantity for ${l.name}`} aria-label={`Quantity for ${l.name}`}
                                            onChange={e => setLines(p => p.map((x,j) => j===i ? { ...x, quantity:+e.target.value } : x))}
                                            className="w-16 text-center rounded-xl border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
                                        <button type="button" title="Remove" aria-label="Remove item"
                                            onClick={() => setLines(p => p.filter((_,j) => j!==i))}
                                            className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <ModalFooter>
                        <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                        <Button type="submit" loading={saving}>Create Draft</Button>
                    </ModalFooter>
                </form>
            </Modal>
        </div>
    );
}

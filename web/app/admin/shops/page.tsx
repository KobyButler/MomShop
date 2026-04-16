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

type Shop = {
    id: string; name: string; slug: string;
    collectionId: string; collection?: { name: string };
    active: boolean; expiresAt?: string; notes?: string; createdAt: string;
};
type Collection = { id: string; name: string; slug: string };

const EMPTY = { name:"", collectionId:"", expiresAt:"", notes:"" };

export default function ShopsPage() {
    const { toast } = useToast();
    const [shops, setShops]           = useState<Shop[]>([]);
    const [collections, setCollections] = useState<Collection[]>([]);
    const [loading, setLoading]       = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [editShop, setEditShop]     = useState<Shop | null>(null);
    const [form, setForm]             = useState({ ...EMPTY });
    const [saving, setSaving]         = useState(false);
    const [search, setSearch]         = useState("");

    useEffect(() => {
        Promise.all([api("/shops"), api("/collections")])
            .then(([s, c]) => {
                setShops(Array.isArray(s) ? s : s?.data ?? []);
                setCollections(Array.isArray(c) ? c : c?.data ?? []);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const filtered = shops.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()));
    const activeCount = shops.filter(s => s.active).length;

    async function createShop(e: React.FormEvent) {
        e.preventDefault(); setSaving(true);
        try {
            const shop = await api("/shops", { method:"POST", body:JSON.stringify({
                name:form.name, collectionId:form.collectionId,
                expiresAt:form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
                notes:form.notes || undefined
            })});
            setShops(p => [{ ...shop, collection:collections.find(c => c.id === shop.collectionId) }, ...p]);
            setShowCreate(false); setForm({ ...EMPTY }); toast("Shop created! Link is ready to share.");
        } catch (err: any) { toast(err.message || "Failed to create shop", "error"); }
        finally { setSaving(false); }
    }

    async function saveEdit(e: React.FormEvent) {
        e.preventDefault(); if (!editShop) return; setSaving(true);
        try {
            const u = await api(`/shops/${editShop.id}`, { method:"PATCH", body:JSON.stringify({
                name:form.name, collectionId:form.collectionId,
                expiresAt:form.expiresAt ? new Date(form.expiresAt).toISOString() : null, notes:form.notes||null
            })});
            setShops(p => p.map(s => s.id===editShop.id ? { ...u, collection:collections.find(c => c.id===u.collectionId) } : s));
            setEditShop(null); toast("Shop updated");
        } catch (err: any) { toast(err.message || "Failed to update shop", "error"); }
        finally { setSaving(false); }
    }

    async function toggleActive(shop: Shop) {
        try {
            const u = await api(`/shops/${shop.id}`, { method:"PATCH", body:JSON.stringify({ active:!shop.active }) });
            setShops(p => p.map(s => s.id===shop.id ? { ...s, active:u.active } : s));
            toast(`Shop ${u.active ? "activated" : "deactivated"}`);
        } catch (err: any) { toast(err.message || "Failed", "error"); }
    }

    function copyLink(slug: string) {
        navigator.clipboard.writeText(`${window.location.origin}/shop/${slug}`).then(() => toast("Link copied!"));
    }

    function openEdit(shop: Shop) {
        setEditShop(shop);
        setForm({ name:shop.name, collectionId:shop.collectionId,
            expiresAt:shop.expiresAt ? new Date(shop.expiresAt).toISOString().split("T")[0] : "",
            notes:shop.notes ?? "" });
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="page-title">Group Shops</h1>
                    <p className="page-subtitle">Create shareable links for teams, schools, and events</p>
                </div>
                <motion.button whileHover={{ y:-1 }} whileTap={{ scale:0.97 }}
                    onClick={() => { setForm({ ...EMPTY }); setShowCreate(true); }}
                    className="btn-shine flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-200"
                    style={{ background:"linear-gradient(135deg,#8b5cf6 0%,#7c3aed 100%)", boxShadow:"0 4px 16px rgba(124,58,237,0.35)" }}
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                    New Shop
                </motion.button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                {[
                    { label:"Total Shops", value:shops.length, color:"text-slate-900" },
                    { label:"Active", value:activeCount, color:"text-emerald-600" },
                    { label:"Inactive", value:shops.length-activeCount, color:"text-slate-500" }
                ].map((s, i) => (
                    <motion.div key={s.label} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.07 }}
                        className="bg-white rounded-2xl p-5 ring-1 ring-black/5 shadow-card cursor-default">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{s.label}</p>
                        <p className={`text-2xl font-bold ${s.color}`}>{loading ? "—" : s.value}</p>
                    </motion.div>
                ))}
            </div>

            {/* Search */}
            <div className="relative max-w-xs">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                <input className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 bg-white shadow-sm transition-all"
                    placeholder="Search shops…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl ring-1 ring-black/5 shadow-card overflow-hidden">
                {loading ? (
                    <div className="p-8 space-y-3">
                        {[1,2,3].map(i => (
                            <div key={i} className="animate-pulse flex items-center gap-4">
                                <div className="w-8 h-8 bg-slate-100 rounded-xl" />
                                <div className="flex-1 space-y-1.5"><div className="h-3 w-40 bg-slate-200 rounded"/><div className="h-2.5 w-28 bg-slate-100 rounded"/></div>
                                <div className="h-5 w-16 bg-slate-100 rounded-full"/>
                            </div>
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center py-16 text-slate-300">
                        <svg className="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                        <p className="text-sm text-slate-400 font-medium">No shops yet</p>
                        <p className="text-xs text-slate-300 mt-0.5">Create a shop to generate a shareable link</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <div className="table-wrap"><table className="data-table">
                            <thead><tr><th>Shop Name</th><th>Collection</th><th>Link</th><th>Status</th><th>Expires</th><th className="text-right pr-5">Actions</th></tr></thead>
                            <tbody>
                                {filtered.map((shop, idx) => {
                                    const expired = shop.expiresAt && new Date(shop.expiresAt) < new Date();
                                    return (
                                        <motion.tr key={shop.id} initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} transition={{ delay:idx*0.03, duration:0.2 }}>
                                            <td>
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                                                        <svg className="w-4 h-4 text-brand-500" fill="currentColor" viewBox="0 0 20 20"><path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3z"/></svg>
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-slate-800 text-sm">{shop.name}</p>
                                                        {shop.notes && <p className="text-xs text-slate-400 truncate max-w-full sm:max-w-[180px]">{shop.notes}</p>}
                                                    </div>
                                                </div>
                                            </td>
                                            <td><span className="text-sm text-slate-500">{shop.collection?.name ?? "—"}</span></td>
                                            <td>
                                                <div className="flex items-center gap-1.5">
                                                    <a href={`/shop/${shop.slug}`} target="_blank" rel="noopener noreferrer"
                                                        className="text-xs font-mono text-brand-600 hover:text-brand-700 hover:underline">
                                                        /shop/{shop.slug}
                                                    </a>
                                                    <button type="button" title="Copy link" aria-label="Copy link" onClick={() => copyLink(shop.slug)}
                                                        className="p-1 rounded-lg text-slate-300 hover:text-brand-500 hover:bg-brand-50 transition-all">
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                                                    </button>
                                                </div>
                                            </td>
                                            <td>
                                                <Badge variant={shop.active && !expired ? "success" : "danger"} size="sm">
                                                    {expired ? "Expired" : shop.active ? "Active" : "Inactive"}
                                                </Badge>
                                            </td>
                                            <td>
                                                {shop.expiresAt ? (
                                                    <span className={`text-xs ${expired ? "text-red-500 font-medium" : "text-slate-500"}`}>
                                                        {new Date(shop.expiresAt).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" })}
                                                    </span>
                                                ) : <span className="text-xs text-slate-300">No expiry</span>}
                                            </td>
                                            <td className="text-right pr-5">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button type="button" onClick={() => openEdit(shop)}
                                                        className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors">
                                                        Edit
                                                    </button>
                                                    <button type="button" onClick={() => toggleActive(shop)}
                                                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${shop.active ? "text-red-500 hover:bg-red-50 hover:text-red-700" : "text-emerald-600 bg-emerald-50 hover:bg-emerald-100"}`}>
                                                        {shop.active ? "Deactivate" : "Activate"}
                                                    </button>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    );
                                })}
                            </tbody>
                        </table></div>
                    </div>
                )}
            </div>

            {/* Create/Edit Modal */}
            <Modal open={showCreate || !!editShop} onClose={() => { setShowCreate(false); setEditShop(null); }}
                title={editShop ? "Edit Shop" : "Create Group Shop"}
                description={editShop ? undefined : "A unique shareable link will be generated automatically"}
                size="md">
                <form onSubmit={editShop ? saveEdit : createShop} className="space-y-4">
                    <Input label="Shop Name" required placeholder="e.g. Central High Football 2024"
                        value={form.name} onChange={e => setForm(p => ({ ...p, name:e.target.value }))} />
                    <div>
                        <label className="field-label">Collection</label>
                        <Select required value={form.collectionId} onChange={e => setForm(p => ({ ...p, collectionId:e.target.value }))}>
                            <option value="">Select a collection</option>
                            {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </Select>
                    </div>
                    <Input label="Expiry Date (optional)" type="date" value={form.expiresAt} onChange={e => setForm(p => ({ ...p, expiresAt:e.target.value }))} />
                    <div>
                        <label className="field-label">Notes (optional)</label>
                        <textarea rows={2} placeholder="Internal notes about this shop…" value={form.notes}
                            onChange={e => setForm(p => ({ ...p, notes:e.target.value }))}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 resize-none transition-all" />
                    </div>
                    <ModalFooter>
                        <Button type="button" variant="outline" onClick={() => { setShowCreate(false); setEditShop(null); }}>Cancel</Button>
                        <Button type="submit" loading={saving}>{editShop ? "Save Changes" : "Create Shop"}</Button>
                    </ModalFooter>
                </form>
            </Modal>
        </div>
    );
}

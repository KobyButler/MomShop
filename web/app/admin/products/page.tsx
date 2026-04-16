"use client";
import { useEffect, useState } from "react";
import { api, imgUrl } from "@/app/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { motion } from "framer-motion";

type Product = {
    id: string; name: string; sku: string; vendor: string;
    vendorIdentifier?: string; brand?: string; description?: string;
    priceCents: number; collectionId: string; collection?: { name: string };
    sizesJson?: string; colorsJson?: string; imagesJson?: string;
};
type Collection = { id: string; name: string; slug: string; description?: string };

const VENDOR_LABELS: Record<string, string> = { SANMAR:"SanMar", SSACTIVEWEAR:"S&S Activewear", OTHER:"Other" };
const VENDOR_COLORS: Record<string, string> = { SANMAR:"info", SSACTIVEWEAR:"success", OTHER:"default" };
const EMPTY = { name:"", sku:"", vendor:"OTHER", vendorIdentifier:"", brand:"", description:"", priceDollars:"", collectionId:"", sizes:[] as string[], colors:[] as string[] };

function TagInput({ label, tags, onChange, placeholder }: { label:string; tags:string[]; onChange:(t:string[])=>void; placeholder?:string }) {
    const [input, setInput] = useState("");
    function add() {
        const v = input.trim();
        if (v && !tags.includes(v)) onChange([...tags, v]);
        setInput("");
    }
    return (
        <div>
            <label className="field-label">{label}</label>
            <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
                {tags.map(t => (
                    <span key={t} className="inline-flex items-center gap-1 text-xs bg-brand-50 text-brand-700 border border-brand-200 px-2 py-0.5 rounded-full">
                        {t}
                        <button type="button" title={`Remove ${t}`} aria-label={`Remove ${t}`}
                            onClick={() => onChange(tags.filter(x => x !== t))} className="hover:text-red-500 transition-colors">
                            <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3"><path d="M4.586 6L1.293 2.707 2.707 1.293 6 4.586l3.293-3.293 1.414 1.414L7.414 6l3.293 3.293-1.414 1.414L6 7.414l-3.293 3.293-1.414-1.414L4.586 6z"/></svg>
                        </button>
                    </span>
                ))}
                {tags.length === 0 && <span className="text-xs text-slate-300 italic">None added yet</span>}
            </div>
            <div className="flex gap-2">
                <input type="text" value={input} onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
                    placeholder={placeholder ?? "Type and press Enter"}
                    className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all" />
                <button type="button" onClick={add}
                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700 transition-all">
                    Add
                </button>
            </div>
        </div>
    );
}

function ImageUploader({ productId, existingImages, onUploaded }: { productId:string; existingImages:string[]; onUploaded:(url:string)=>void }) {
    const { toast } = useToast();
    const [uploading, setUploading] = useState(false);
    const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000/api";

    async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append("image", file);
            const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
            const res = await fetch(`${base}/products/${productId}/images`, {
                method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: formData
            });
            if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
            onUploaded((await res.json()).url);
            toast("Image uploaded");
        } catch (err: any) { toast(err.message || "Upload failed", "error"); }
        finally { setUploading(false); e.target.value = ""; }
    }

    return (
        <div>
            <label className="field-label">Product Images</label>
            <div className="flex flex-wrap gap-2 mb-3">
                {existingImages.map((url, i) => (
                    <div key={i} className="relative group">
                        <img src={imgUrl(url)} alt={`Product ${i+1}`}
                            className="w-16 h-16 object-cover rounded-xl border border-slate-200 ring-2 ring-transparent group-hover:ring-brand-300 transition-all" />
                    </div>
                ))}
                {existingImages.length === 0 && (
                    <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center">
                        <svg className="w-5 h-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    </div>
                )}
            </div>
            <label className={`inline-flex items-center gap-2 text-sm cursor-pointer px-3 py-2 border border-dashed rounded-xl transition-all ${uploading ? "opacity-50 pointer-events-none border-slate-200 text-slate-400" : "border-brand-300 text-brand-600 hover:bg-brand-50"}`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                {uploading ? "Uploading…" : "Upload image"}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={handleFile} />
            </label>
        </div>
    );
}

export default function ProductsPage() {
    const { toast } = useToast();
    const [products, setProducts]     = useState<Product[]>([]);
    const [collections, setCollections] = useState<Collection[]>([]);
    const [loading, setLoading]       = useState(true);
    const [tab, setTab]               = useState<"products"|"collections">("products");
    const [search, setSearch]         = useState("");
    const [filterCollection, setFilterCollection] = useState("");
    const [filterVendor, setFilterVendor]         = useState("");
    const [showAdd, setShowAdd]       = useState(false);
    const [showAddColl, setShowAddColl] = useState(false);
    const [editProduct, setEditProduct] = useState<Product | null>(null);
    const [form, setForm]             = useState({ ...EMPTY });
    const [collForm, setCollForm]     = useState({ name:"", description:"" });
    const [saving, setSaving]         = useState(false);

    useEffect(() => {
        Promise.all([api("/products"), api("/collections")])
            .then(([p, c]) => {
                setProducts(Array.isArray(p) ? p : p?.data ?? []);
                setCollections(Array.isArray(c) ? c : c?.data ?? []);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const filtered = products.filter(p => {
        const q = search.toLowerCase();
        return (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.brand ?? "").toLowerCase().includes(q))
            && (!filterCollection || p.collectionId === filterCollection)
            && (!filterVendor || p.vendor === filterVendor);
    });

    function openEdit(p: Product) {
        setEditProduct(p);
        setForm({ name:p.name, sku:p.sku, vendor:p.vendor, vendorIdentifier:p.vendorIdentifier??"", brand:p.brand??"", description:p.description??"",
            priceDollars:(p.priceCents/100).toFixed(2), collectionId:p.collectionId,
            sizes:p.sizesJson?JSON.parse(p.sizesJson):[], colors:p.colorsJson?JSON.parse(p.colorsJson):[] });
    }

    async function saveProduct(e: React.FormEvent) {
        e.preventDefault(); setSaving(true);
        try {
            const payload = { name:form.name, sku:form.sku, vendor:form.vendor, vendorIdentifier:form.vendorIdentifier||undefined,
                brand:form.brand||undefined, description:form.description||undefined,
                priceCents:Math.round(parseFloat(form.priceDollars)*100), sizes:form.sizes, colors:form.colors, collectionId:form.collectionId };
            if (editProduct) {
                const u = await api(`/products/${editProduct.id}`, { method:"PUT", body:JSON.stringify(payload) });
                setProducts(p => p.map(x => x.id===editProduct.id ? u : x));
                toast("Product updated"); setEditProduct(null);
            } else {
                const c = await api("/products", { method:"POST", body:JSON.stringify(payload) });
                setProducts(p => [c,...p]); toast("Product created"); setShowAdd(false);
            }
            setForm({ ...EMPTY });
        } catch (err: any) { toast(err.message || "Failed to save product", "error"); }
        finally { setSaving(false); }
    }

    async function saveCollection(e: React.FormEvent) {
        e.preventDefault(); setSaving(true);
        try {
            const c = await api("/collections", { method:"POST", body:JSON.stringify(collForm) });
            setCollections(p => [c,...p]); setCollForm({ name:"", description:"" });
            setShowAddColl(false); toast("Collection created");
        } catch (err: any) { toast(err.message||"Failed", "error"); }
        finally { setSaving(false); }
    }

    const TABS = [
        { key:"products", label:"Products", count:products.length },
        { key:"collections", label:"Collections", count:collections.length }
    ] as const;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="page-title">Products</h1>
                    <p className="page-subtitle">Manage your product catalog and collections</p>
                </div>
                <div className="flex gap-2.5 flex-wrap">
                    {tab === "products" && (
                        <motion.button whileHover={{ y:-1 }} whileTap={{ scale:0.97 }}
                            onClick={() => { setForm({ ...EMPTY }); setEditProduct(null); setShowAdd(true); }}
                            className="btn-shine flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-200"
                            style={{ background:"linear-gradient(135deg,#8b5cf6 0%,#7c3aed 100%)", boxShadow:"0 4px 16px rgba(124,58,237,0.35)" }}
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                            Add Product
                        </motion.button>
                    )}
                    {tab === "collections" && (
                        <motion.button whileHover={{ y:-1 }} whileTap={{ scale:0.97 }}
                            onClick={() => setShowAddColl(true)}
                            className="btn-shine flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-200"
                            style={{ background:"linear-gradient(135deg,#8b5cf6 0%,#7c3aed 100%)", boxShadow:"0 4px 16px rgba(124,58,237,0.35)" }}
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                            Add Collection
                        </motion.button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-slate-200">
                {TABS.map(t => (
                    <button key={t.key} type="button" onClick={() => setTab(t.key)}
                        className={`relative px-4 py-2.5 text-sm font-medium transition-colors -mb-px ${tab===t.key ? "text-brand-700" : "text-slate-500 hover:text-slate-700"}`}
                    >
                        {tab===t.key && <motion.div layoutId="products-tab-bar" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 rounded-full" transition={{ duration:0.2 }} />}
                        {t.label}
                        <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${tab===t.key ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"}`}>{t.count}</span>
                    </button>
                ))}
            </div>

            {/* Products Tab */}
            {tab === "products" && (
                <>
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="relative flex-1 max-w-xs">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                            <input className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 bg-white shadow-sm transition-all"
                                placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <Select value={filterCollection} onChange={e => setFilterCollection(e.target.value)} className="w-full sm:w-44">
                            <option value="">All collections</option>
                            {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </Select>
                        <Select value={filterVendor} onChange={e => setFilterVendor(e.target.value)} className="w-full sm:w-40">
                            <option value="">All vendors</option>
                            <option value="SANMAR">SanMar</option>
                            <option value="SSACTIVEWEAR">S&S Activewear</option>
                            <option value="OTHER">Other</option>
                        </Select>
                        {(search || filterCollection || filterVendor) && (
                            <button type="button" onClick={() => { setSearch(""); setFilterCollection(""); setFilterVendor(""); }}
                                className="text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors">
                                Clear filters
                            </button>
                        )}
                    </div>

                    <div className="bg-white rounded-2xl ring-1 ring-black/5 shadow-card overflow-hidden">
                        {loading ? (
                            <div className="p-8 space-y-3">
                                {[1,2,3,4].map(i => (
                                    <div key={i} className="animate-pulse flex items-center gap-4">
                                        <div className="w-8 h-8 bg-slate-100 rounded-lg" />
                                        <div className="flex-1 space-y-1.5">
                                            <div className="h-3 w-36 bg-slate-200 rounded" />
                                            <div className="h-2.5 w-20 bg-slate-100 rounded" />
                                        </div>
                                        <div className="h-5 w-16 bg-slate-100 rounded-full" />
                                        <div className="h-4 w-12 bg-slate-100 rounded" />
                                    </div>
                                ))}
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-slate-300">
                                <svg className="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
                                <p className="text-sm text-slate-400 font-medium">No products found</p>
                                <p className="text-xs text-slate-300 mt-0.5">{search ? "Try a different search" : "Click \"Add Product\" to get started"}</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <div className="table-wrap"><table className="data-table">
                                    <thead><tr><th>Product</th><th>SKU</th><th>Collection</th><th>Vendor</th><th>Variants</th><th>Price</th><th className="text-right pr-5">Actions</th></tr></thead>
                                    <tbody>
                                        {filtered.map((p, idx) => (
                                            <motion.tr key={p.id} initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} transition={{ delay:idx*0.02, duration:0.2 }}>
                                                <td>
                                                    <div className="flex items-center gap-3">
                                                        {p.imagesJson && JSON.parse(p.imagesJson)[0] ? (
                                                            <img src={imgUrl(JSON.parse(p.imagesJson)[0])}
                                                                alt={p.name} className="w-8 h-8 rounded-lg object-cover shrink-0 ring-1 ring-black/5" />
                                                        ) : (
                                                            <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                                                                <svg className="w-4 h-4 text-brand-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14"/></svg>
                                                            </div>
                                                        )}
                                                        <div>
                                                            <p className="font-semibold text-slate-800 text-sm">{p.name}</p>
                                                            {p.brand && <p className="text-xs text-slate-400">{p.brand}</p>}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td><code className="text-xs font-mono bg-slate-100 px-1.5 py-0.5 rounded-md text-slate-600">{p.sku}</code></td>
                                                <td><span className="text-sm text-slate-500">{p.collection?.name ?? "—"}</span></td>
                                                <td><Badge variant={VENDOR_COLORS[p.vendor] as any} size="sm">{VENDOR_LABELS[p.vendor] ?? p.vendor}</Badge></td>
                                                <td>
                                                    <div className="flex gap-1 flex-wrap">
                                                        {p.sizesJson && JSON.parse(p.sizesJson).length > 0 && (
                                                            <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{JSON.parse(p.sizesJson).length} sizes</span>
                                                        )}
                                                        {p.colorsJson && JSON.parse(p.colorsJson).length > 0 && (
                                                            <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{JSON.parse(p.colorsJson).length} colors</span>
                                                        )}
                                                        {(!p.sizesJson || JSON.parse(p.sizesJson).length === 0) && (!p.colorsJson || JSON.parse(p.colorsJson).length === 0) && (
                                                            <span className="text-xs text-slate-300">—</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td><span className="text-sm font-bold text-slate-900 tabular-nums">${(p.priceCents/100).toFixed(2)}</span></td>
                                                <td className="text-right pr-5">
                                                    <button type="button" onClick={() => openEdit(p)}
                                                        className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors">
                                                        Edit
                                                    </button>
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </tbody>
                                </table></div>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Collections Tab */}
            {tab === "collections" && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {loading ? (
                        [1,2,3].map(i => (
                            <div key={i} className="bg-white rounded-2xl ring-1 ring-black/5 p-5 animate-pulse">
                                <div className="h-4 w-32 bg-slate-200 rounded mb-3" />
                                <div className="h-3 w-24 bg-slate-100 rounded" />
                            </div>
                        ))
                    ) : collections.length === 0 ? (
                        <div className="col-span-full flex flex-col items-center py-16 text-slate-300">
                            <svg className="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                            <p className="text-sm text-slate-400 font-medium">No collections yet</p>
                            <p className="text-xs text-slate-300 mt-0.5">Create a collection to organize your products</p>
                        </div>
                    ) : (
                        collections.map((c, idx) => {
                            const count = products.filter(p => p.collectionId === c.id).length;
                            return (
                                <motion.div key={c.id} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
                                    transition={{ delay:idx*0.05, duration:0.3 }}
                                    className="bg-white rounded-2xl ring-1 ring-black/5 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-300 p-5"
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                                            <svg className="w-4.5 h-4.5 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                                        </div>
                                        <span className="text-xs font-semibold bg-brand-50 text-brand-600 px-2 py-0.5 rounded-full">
                                            {count} product{count !== 1 ? "s" : ""}
                                        </span>
                                    </div>
                                    <h3 className="text-sm font-bold text-slate-900 mt-3">{c.name}</h3>
                                    {c.description && <p className="text-xs text-slate-500 mt-0.5 mb-2">{c.description}</p>}
                                    <code className="text-xs font-mono text-slate-400">/collections/{c.slug}</code>
                                </motion.div>
                            );
                        })
                    )}
                </div>
            )}

            {/* Add/Edit Product Modal */}
            <Modal open={showAdd || !!editProduct}
                onClose={() => { setShowAdd(false); setEditProduct(null); setForm({ ...EMPTY }); }}
                title={editProduct ? "Edit Product" : "Add Product"} size="lg">
                <form onSubmit={saveProduct} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Input label="Product Name" required value={form.name} onChange={e => setForm(p => ({ ...p, name:e.target.value }))} />
                        <Input label="SKU" required value={form.sku} onChange={e => setForm(p => ({ ...p, sku:e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="field-label">Vendor</label>
                            <Select value={form.vendor} onChange={e => setForm(p => ({ ...p, vendor:e.target.value }))}>
                                <option value="SANMAR">SanMar</option>
                                <option value="SSACTIVEWEAR">S&S Activewear</option>
                                <option value="OTHER">Other</option>
                            </Select>
                        </div>
                        <Input label="Vendor SKU / Style #" placeholder="e.g. PC61"
                            value={form.vendorIdentifier} onChange={e => setForm(p => ({ ...p, vendorIdentifier:e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Input label="Brand" placeholder="e.g. Port & Company" value={form.brand} onChange={e => setForm(p => ({ ...p, brand:e.target.value }))} />
                        <Input label="Price ($)" type="number" step="0.01" min="0" required value={form.priceDollars} onChange={e => setForm(p => ({ ...p, priceDollars:e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <TagInput label="Available Sizes" tags={form.sizes} onChange={sizes => setForm(p => ({ ...p, sizes }))} placeholder="S, M, L, XL…" />
                        <TagInput label="Available Colors" tags={form.colors} onChange={colors => setForm(p => ({ ...p, colors }))} placeholder="Black, White…" />
                    </div>
                    <div>
                        <label className="field-label">Collection</label>
                        <Select required value={form.collectionId} onChange={e => setForm(p => ({ ...p, collectionId:e.target.value }))}>
                            <option value="">Select a collection</option>
                            {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </Select>
                    </div>
                    {editProduct && (
                        <ImageUploader productId={editProduct.id}
                            existingImages={editProduct.imagesJson ? JSON.parse(editProduct.imagesJson) : []}
                            onUploaded={url => {
                                setProducts(prev => prev.map(p => {
                                    if (p.id !== editProduct.id) return p;
                                    const imgs = p.imagesJson ? JSON.parse(p.imagesJson) : [];
                                    return { ...p, imagesJson: JSON.stringify([...imgs, url]) };
                                }));
                                setEditProduct(prev => {
                                    if (!prev) return null;
                                    const imgs = prev.imagesJson ? JSON.parse(prev.imagesJson) : [];
                                    return { ...prev, imagesJson: JSON.stringify([...imgs, url]) };
                                });
                            }}
                        />
                    )}
                    {!editProduct && <p className="text-xs text-slate-400">Images can be added after creating the product.</p>}
                    <ModalFooter>
                        <Button type="button" variant="outline" onClick={() => { setShowAdd(false); setEditProduct(null); }}>Cancel</Button>
                        <Button type="submit" loading={saving}>{editProduct ? "Save Changes" : "Create Product"}</Button>
                    </ModalFooter>
                </form>
            </Modal>

            {/* Add Collection Modal */}
            <Modal open={showAddColl} onClose={() => setShowAddColl(false)} title="New Collection" size="sm">
                <form onSubmit={saveCollection} className="space-y-4">
                    <Input label="Collection Name" required value={collForm.name} onChange={e => setCollForm(p => ({ ...p, name:e.target.value }))} />
                    <Input label="Description (optional)" value={collForm.description} onChange={e => setCollForm(p => ({ ...p, description:e.target.value }))} />
                    <ModalFooter>
                        <Button type="button" variant="outline" onClick={() => setShowAddColl(false)}>Cancel</Button>
                        <Button type="submit" loading={saving}>Create Collection</Button>
                    </ModalFooter>
                </form>
            </Modal>
        </div>
    );
}

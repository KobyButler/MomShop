"use client";
import { useEffect, useState } from "react";
import { api } from "@/app/lib/api";
import { Button } from "@/components/ui/button";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { motion, AnimatePresence } from "framer-motion";

type VendorOrder = {
    id: string; vendor: string; status: string;
    externalOrderNumber?: string; createdAt: string;
};
type Order = {
    id: string; customerName: string; customerEmail: string;
    status: string; totalCents: number; createdAt: string;
    items: any[]; shop?: { name: string };
    shipAddress1?: string; shipCity?: string; shipState?: string; shipZip?: string;
    vendorOrders?: VendorOrder[];
};
type Product = { id: string; name: string; priceCents: number; sku: string };

const TABS = [
    { key: "all",         label: "All"         },
    { key: "UNFULFILLED", label: "Unfulfilled"  },
    { key: "FULFILLED",   label: "Fulfilled"    },
    { key: "CANCELLED",   label: "Cancelled"    },
] as const;

const fmt = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export default function OrdersPage() {
    const { toast } = useToast();
    const [orders, setOrders]             = useState<Order[]>([]);
    const [products, setProducts]         = useState<Product[]>([]);
    const [loading, setLoading]           = useState(true);
    const [tab, setTab]                   = useState<string>("all");
    const [search, setSearch]             = useState("");
    const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
    const [detailOrder, setDetailOrder]   = useState<Order | null>(null);
    const [showCreate, setShowCreate]     = useState(false);
    const [showExport, setShowExport]     = useState(false);
    const [creating, setCreating]         = useState(false);
    const [page, setPage]                 = useState(1);
    const [totalPages, setTotalPages]     = useState(1);
    const [totalOrders, setTotalOrders]   = useState(0);
    const PAGE_SIZE = 50;

    const [createForm, setCreateForm] = useState({
        customerName: "", customerEmail: "",
        shipAddress1: "", shipAddress2: "",
        shipCity: "", shipState: "", shipZip: ""
    });
    const [cartItems, setCartItems] = useState<{ productId: string; quantity: number }[]>([]);

    useEffect(() => { setPage(1); }, [tab]);
    useEffect(() => { fetchOrders(); }, [tab, page]);
    useEffect(() => { api("/products").then(d => setProducts(Array.isArray(d) ? d : d?.data ?? [])).catch(() => {}); }, []);

    async function fetchOrders() {
        setLoading(true);
        try {
            const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
            if (tab !== "all") params.set("status", tab);
            const result = await api(`/orders?${params}`);
            setOrders(result.data ?? []);
            setTotalPages(result.pages ?? 1);
            setTotalOrders(result.total ?? 0);
        } catch { setOrders([]); }
        finally { setLoading(false); }
    }

    const filtered = orders.filter(o => {
        const q = search.toLowerCase();
        return !q || o.customerName.toLowerCase().includes(q) ||
            o.customerEmail.toLowerCase().includes(q) || o.id.toLowerCase().includes(q);
    });

    function toggleSelect(id: string) {
        setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    }
    function toggleAll() {
        setSelectedIds(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(o => o.id)));
    }

    async function cancelOrder(id: string) {
        try { await api(`/orders/${id}/cancel`, { method: "POST" }); toast("Order cancelled"); fetchOrders(); }
        catch (err: any) { toast(err.message || "Failed to cancel order", "error"); }
    }
    async function markFulfilled(id: string) {
        try { await api(`/orders/${id}/fulfill`, { method: "POST" }); toast("Order marked as fulfilled"); fetchOrders(); }
        catch { toast("Failed to update order", "error"); }
    }
    async function bulkFulfill() {
        let count = 0;
        for (const id of selectedIds) { try { await api(`/orders/${id}/fulfill`, { method: "POST" }); count++; } catch {} }
        toast(`${count} order(s) marked as fulfilled`);
        setSelectedIds(new Set()); fetchOrders();
    }

    function exportCSV() {
        const csv = [
            ["Order ID","Customer","Email","Status","Total","Date","Items"].join(","),
            ...filtered.map(o => [o.id,`"${o.customerName}"`,o.customerEmail,o.status,`$${(o.totalCents/100).toFixed(2)}`,new Date(o.createdAt).toLocaleDateString(),o.items?.length??0].join(","))
        ].join("\n");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        a.download = `orders-${new Date().toISOString().split("T")[0]}.csv`;
        a.click(); setShowExport(false); toast("Orders exported");
    }

    async function createOrder(e: React.FormEvent) {
        e.preventDefault();
        if (cartItems.length === 0) { toast("Add at least one item", "error"); return; }
        setCreating(true);
        try {
            await api("/orders", { method: "POST", body: JSON.stringify({ ...createForm, items: cartItems }) });
            toast("Order created successfully");
            setShowCreate(false);
            setCreateForm({ customerName:"",customerEmail:"",shipAddress1:"",shipAddress2:"",shipCity:"",shipState:"",shipZip:"" });
            setCartItems([]); fetchOrders();
        } catch (err: any) { toast(err.message || "Failed to create order", "error"); }
        finally { setCreating(false); }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="page-title">Orders</h1>
                    <p className="page-subtitle">Manage and fulfill customer orders · {totalOrders} total</p>
                </div>
                <div className="flex gap-2.5">
                    <motion.button whileHover={{ y:-1 }} whileTap={{ scale:0.97 }}
                        onClick={() => setShowExport(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-slate-700 bg-white ring-1 ring-black/8 shadow-sm hover:shadow-md transition-all duration-200"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                        Export
                    </motion.button>
                    <motion.button whileHover={{ y:-1 }} whileTap={{ scale:0.97 }}
                        onClick={() => setShowCreate(true)}
                        className="btn-shine flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-200"
                        style={{ background:"linear-gradient(135deg,#8b5cf6 0%,#7c3aed 100%)", boxShadow:"0 4px 16px rgba(124,58,237,0.35)" }}
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                        New Order
                    </motion.button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-slate-200">
                {TABS.map(t => (
                    <button key={t.key} type="button" onClick={() => setTab(t.key)}
                        className={`relative px-4 py-2.5 text-sm font-medium transition-colors -mb-px ${
                            tab === t.key ? "text-brand-700" : "text-slate-500 hover:text-slate-700"
                        }`}
                    >
                        {tab === t.key && (
                            <motion.div layoutId="orders-tab-indicator"
                                className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 rounded-full"
                                transition={{ duration: 0.2 }}
                            />
                        )}
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-xs">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    <input
                        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 bg-white shadow-sm transition-all duration-200"
                        placeholder="Search orders…"
                        value={search} onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <AnimatePresence>
                    {selectedIds.size > 0 && (
                        <motion.div initial={{ opacity:0, scale:0.92 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0, scale:0.92 }}
                            className="flex items-center gap-2 ml-auto bg-brand-50 border border-brand-200 rounded-xl px-3 py-1.5"
                        >
                            <span className="text-sm text-brand-700 font-medium">{selectedIds.size} selected</span>
                            <button type="button" onClick={bulkFulfill}
                                className="text-xs font-semibold text-brand-700 hover:text-brand-900 underline underline-offset-2 transition-colors">
                                Mark fulfilled
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl ring-1 ring-black/5 shadow-card overflow-hidden">
                {loading ? (
                    <div className="p-8 space-y-3">
                        {[1,2,3,4,5].map(i => (
                            <div key={i} className="animate-pulse flex items-center gap-4">
                                <div className="w-4 h-4 bg-slate-100 rounded" />
                                <div className="w-8 h-8 bg-slate-100 rounded-full" />
                                <div className="flex-1 space-y-1.5">
                                    <div className="h-3 w-36 bg-slate-200 rounded" />
                                    <div className="h-2.5 w-44 bg-slate-100 rounded" />
                                </div>
                                <div className="h-5 w-20 bg-slate-100 rounded-full" />
                                <div className="h-4 w-16 bg-slate-100 rounded" />
                            </div>
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-300">
                        <svg className="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
                        <p className="text-sm text-slate-400 font-medium">No orders found</p>
                        <p className="text-xs text-slate-300 mt-0.5">{search ? "Try a different search" : "Orders will appear here"}</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th className="w-10 pl-5">
                                        <input type="checkbox" title="Select all" aria-label="Select all"
                                            checked={selectedIds.size === filtered.length && filtered.length > 0}
                                            onChange={toggleAll} className="rounded border-slate-300 accent-brand-600" />
                                    </th>
                                    <th>Order</th><th>Customer</th><th>Shop</th>
                                    <th>Items</th><th>Total</th><th>Status</th>
                                    <th>Date</th><th className="text-right pr-5">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((order, idx) => (
                                    <motion.tr key={order.id}
                                        initial={{ opacity:0, y:4 }}
                                        animate={{ opacity:1, y:0 }}
                                        transition={{ delay: idx * 0.02, duration: 0.2 }}
                                    >
                                        <td className="pl-5">
                                            <input type="checkbox"
                                                title={`Select order ${order.id.slice(-8).toUpperCase()}`}
                                                aria-label={`Select order ${order.id.slice(-8).toUpperCase()}`}
                                                checked={selectedIds.has(order.id)} onChange={() => toggleSelect(order.id)}
                                                className="rounded border-slate-300 accent-brand-600" />
                                        </td>
                                        <td>
                                            <span className="font-mono text-xs font-medium text-brand-600 hover:text-brand-700 cursor-pointer"
                                                onClick={() => setDetailOrder(order)}>
                                                #{order.id.slice(-8).toUpperCase()}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                                                    <span className="text-[10px] font-bold text-brand-600">
                                                        {(order.customerName ?? "?")[0].toUpperCase()}
                                                    </span>
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-slate-800 text-sm leading-none">{order.customerName}</p>
                                                    <p className="text-xs text-slate-400 mt-0.5">{order.customerEmail}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <span className="text-sm text-slate-500">{order.shop?.name || "—"}</span>
                                        </td>
                                        <td>
                                            <span className="text-sm text-slate-600 font-medium">{order.items?.length ?? 0}</span>
                                        </td>
                                        <td>
                                            <span className="text-sm font-bold text-slate-900 tabular-nums">{fmt(order.totalCents)}</span>
                                        </td>
                                        <td>
                                            <Badge variant={statusVariant(order.status)} size="sm">
                                                {order.status.charAt(0) + order.status.slice(1).toLowerCase()}
                                            </Badge>
                                        </td>
                                        <td>
                                            <span className="text-xs text-slate-400">
                                                {new Date(order.createdAt).toLocaleDateString("en-US", { month:"short", day:"numeric" })}
                                            </span>
                                        </td>
                                        <td className="text-right pr-5">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <button type="button" onClick={() => setDetailOrder(order)}
                                                    className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors">
                                                    View
                                                </button>
                                                {order.status === "UNFULFILLED" && (
                                                    <>
                                                        <button type="button" onClick={() => markFulfilled(order.id)}
                                                            className="px-2.5 py-1 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors">
                                                            Fulfill
                                                        </button>
                                                        <button type="button" onClick={() => cancelOrder(order.id)}
                                                            className="px-2.5 py-1 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors">
                                                            Cancel
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between text-sm text-slate-500">
                    <span>{totalOrders} total orders</span>
                    <div className="flex items-center gap-1">
                        <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                            ← Prev
                        </button>
                        <span className="px-3 py-1.5 text-xs text-slate-400">Page {page} of {totalPages}</span>
                        <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                            Next →
                        </button>
                    </div>
                </div>
            )}

            {/* Order Detail Modal */}
            <Modal open={!!detailOrder} onClose={() => setDetailOrder(null)}
                title={`Order #${detailOrder?.id.slice(-8).toUpperCase()}`}
                description={detailOrder ? `Placed ${new Date(detailOrder.createdAt).toLocaleString()}` : ""} size="lg">
                {detailOrder && (
                    <div className="space-y-5">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-50 rounded-xl p-4">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Customer</p>
                                <p className="text-sm font-semibold text-slate-900">{detailOrder.customerName}</p>
                                <p className="text-sm text-slate-500 mt-0.5">{detailOrder.customerEmail}</p>
                            </div>
                            <div className="bg-slate-50 rounded-xl p-4">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Ship To</p>
                                <p className="text-sm text-slate-700">{detailOrder.shipAddress1 || "—"}</p>
                                {detailOrder.shipCity && <p className="text-sm text-slate-500">{detailOrder.shipCity}, {detailOrder.shipState} {detailOrder.shipZip}</p>}
                            </div>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                Items ({detailOrder.items?.length})
                            </p>
                            <div className="rounded-xl overflow-hidden border border-slate-100">
                                {detailOrder.items?.map((item: any, i: number) => (
                                    <div key={i} className="flex justify-between items-center px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors text-sm">
                                        <span className="text-slate-800 font-medium">{item.product?.name ?? "Item"} {item.size && <span className="text-slate-400 font-normal">({item.size})</span>}</span>
                                        <span className="text-slate-400 mx-4">×{item.quantity}</span>
                                        <span className="font-bold text-slate-900 tabular-nums">{fmt(item.priceCents * item.quantity)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {detailOrder.vendorOrders && detailOrder.vendorOrders.length > 0 && (
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Vendor Orders</p>
                                <div className="rounded-xl overflow-hidden border border-slate-100 divide-y divide-slate-50">
                                    {detailOrder.vendorOrders.map(vo => (
                                        <div key={vo.id} className="flex items-center justify-between px-4 py-3 text-sm">
                                            <div>
                                                <span className="font-medium text-slate-800">{vo.vendor}</span>
                                                {vo.externalOrderNumber && <span className="ml-2 text-xs text-slate-400 font-mono">#{vo.externalOrderNumber}</span>}
                                            </div>
                                            <Badge variant={vo.status === "SUBMITTED" ? "success" : vo.status === "FAILED" ? "danger" : "default"}>
                                                {vo.status}
                                            </Badge>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="flex justify-between items-center pt-1">
                            <div className="flex items-center gap-2">
                                <Badge variant={statusVariant(detailOrder.status)}>{detailOrder.status}</Badge>
                                {detailOrder.shop && <span className="text-xs text-slate-400">via {detailOrder.shop.name}</span>}
                            </div>
                            <p className="text-lg font-bold text-slate-900">{fmt(detailOrder.totalCents)}</p>
                        </div>
                        <ModalFooter>
                            <Button variant="outline" onClick={() => setDetailOrder(null)}>Close</Button>
                            {detailOrder.status === "UNFULFILLED" && (
                                <>
                                    <Button variant="danger" onClick={() => { cancelOrder(detailOrder.id); setDetailOrder(null); }}>Cancel Order</Button>
                                    <Button onClick={() => { markFulfilled(detailOrder.id); setDetailOrder(null); }}>Mark Fulfilled</Button>
                                </>
                            )}
                        </ModalFooter>
                    </div>
                )}
            </Modal>

            {/* Create Order Modal */}
            <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Order" size="lg">
                <form onSubmit={createOrder} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <Input label="Customer Name" required value={createForm.customerName}
                            onChange={e => setCreateForm(p => ({ ...p, customerName: e.target.value }))} />
                        <Input label="Customer Email" type="email" required value={createForm.customerEmail}
                            onChange={e => setCreateForm(p => ({ ...p, customerEmail: e.target.value }))} />
                    </div>
                    <Input label="Address" required value={createForm.shipAddress1}
                        onChange={e => setCreateForm(p => ({ ...p, shipAddress1: e.target.value }))} />
                    <Input placeholder="Apt, suite, etc. (optional)" value={createForm.shipAddress2}
                        onChange={e => setCreateForm(p => ({ ...p, shipAddress2: e.target.value }))} />
                    <div className="grid grid-cols-3 gap-3">
                        <Input label="City" required value={createForm.shipCity}
                            onChange={e => setCreateForm(p => ({ ...p, shipCity: e.target.value }))} />
                        <Input label="State" required value={createForm.shipState}
                            onChange={e => setCreateForm(p => ({ ...p, shipState: e.target.value }))} />
                        <Input label="ZIP" required value={createForm.shipZip}
                            onChange={e => setCreateForm(p => ({ ...p, shipZip: e.target.value }))} />
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="field-label mb-0">Items</label>
                            <button type="button" onClick={() => setCartItems(p => [...p, { productId:"", quantity:1 }])}
                                className="text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors">
                                + Add item
                            </button>
                        </div>
                        {cartItems.length === 0 ? (
                            <p className="text-sm text-slate-400 italic py-3 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">No items yet — click "Add item"</p>
                        ) : (
                            <div className="space-y-2">
                                {cartItems.map((item, i) => (
                                    <div key={i} className="flex gap-2 items-center">
                                        <Select className="flex-1" value={item.productId}
                                            onChange={e => setCartItems(p => p.map((it,idx) => idx===i ? {...it, productId:e.target.value} : it))}>
                                            <option value="">Select product</option>
                                            {products.map(p => <option key={p.id} value={p.id}>{p.name} — ${(p.priceCents/100).toFixed(2)}</option>)}
                                        </Select>
                                        <input type="number" min={1} value={item.quantity} title="Quantity" aria-label="Quantity" placeholder="1"
                                            onChange={e => setCartItems(p => p.map((it,idx) => idx===i ? {...it, quantity:+e.target.value} : it))}
                                            className="w-20 rounded-xl border border-slate-200 px-2 py-2 text-sm text-center outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
                                        <button type="button" title="Remove" aria-label="Remove item"
                                            onClick={() => setCartItems(p => p.filter((_,idx) => idx!==i))}
                                            className="p-1.5 text-slate-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <ModalFooter>
                        <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                        <Button type="submit" loading={creating}>Create Order</Button>
                    </ModalFooter>
                </form>
            </Modal>

            {/* Export Modal */}
            <Modal open={showExport} onClose={() => setShowExport(false)} title="Export Orders" size="sm">
                <p className="text-sm text-slate-600 mb-4">
                    Export <strong className="text-slate-900">{filtered.length}</strong> order{filtered.length !== 1 ? "s" : ""} based on current filters.
                </p>
                <ModalFooter>
                    <Button variant="outline" onClick={() => setShowExport(false)}>Cancel</Button>
                    <Button onClick={exportCSV}>Download CSV</Button>
                </ModalFooter>
            </Modal>
        </div>
    );
}

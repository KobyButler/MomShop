"use client";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Product = {
    id:string; name:string; sku:string; brand?:string;
    priceCents:number; description?:string; imagesJson?:string;
    sizesJson?:string; colorsJson?:string;
};
type CartItem = { productId:string; name:string; priceCents:number; quantity:number; size?:string; color?:string };
type Shop = { id:string; name:string; collection:{ name:string; products:Product[] } };

async function publicFetch(path: string, init?: RequestInit) {
    const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000/api";
    const res = await fetch(`${base}${path}`, { headers:{ "Content-Type":"application/json", ...(init?.headers ?? {}) }, ...init });
    if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const j = await res.json(); msg += j?.error ? `: ${j.error}` : ""; } catch {}
        throw new Error(msg);
    }
    return res.json();
}

const fmt = (cents: number) =>
    new Intl.NumberFormat("en-US", { style:"currency", currency:"USD" }).format(cents / 100);

const serverBase = (process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000/api").replace(/\/api$/, "");

export default function ShopPage({ params }: { params: { slug: string } }) {
    const { slug } = params;
    const [shop, setShop]             = useState<Shop | null>(null);
    const [cart, setCart]             = useState<CartItem[]>([]);
    const [selections, setSelections] = useState<Record<string, { size:string; color:string }>>({});
    const [step, setStep]             = useState<"browse"|"checkout"|"done">("browse");
    const [placedOrderId, setPlacedOrderId] = useState("");
    const [discountCode, setDiscountCode]   = useState("");
    const [discountApplied, setDiscountApplied] = useState(false);
    const [form, setForm] = useState({ customerName:"", customerEmail:"", shipAddress1:"", shipAddress2:"", shipCity:"", shipState:"", shipZip:"" });
    const [placing, setPlacing] = useState(false);
    const [error, setError]     = useState("");
    const [notFound, setNotFound] = useState(false);
    const [showCart, setShowCart] = useState(false);

    useEffect(() => {
        publicFetch(`/shops/${slug}`).then(setShop).catch(() => setNotFound(true));
    }, [slug]);

    const products: Product[] = shop?.collection?.products ?? [];
    const subtotalCents = useMemo(() => cart.reduce((a,c) => a + c.priceCents*c.quantity, 0), [cart]);
    const cartCount = cart.reduce((a,c) => a + c.quantity, 0);

    function getSelection(productId: string) { return selections[productId] ?? { size:"", color:"" }; }
    function setSelection(productId: string, key:"size"|"color", value:string) {
        setSelections(p => ({ ...p, [productId]:{ ...getSelection(productId), [key]:value } }));
    }

    function addToCart(product: Product) {
        const sizes: string[] = product.sizesJson ? JSON.parse(product.sizesJson) : [];
        const colors: string[] = product.colorsJson ? JSON.parse(product.colorsJson) : [];
        const sel = getSelection(product.id);
        if (sizes.length > 0 && !sel.size) { alert("Please select a size."); return; }
        if (colors.length > 0 && !sel.color) { alert("Please select a color."); return; }
        const key = `${product.id}|${sel.size}|${sel.color}`;
        setCart(prev => {
            const ex = prev.findIndex(x => `${x.productId}|${x.size??""}|${x.color??""}` === key);
            if (ex >= 0) return prev.map((x,i) => i===ex ? { ...x, quantity:x.quantity+1 } : x);
            return [...prev, { productId:product.id, name:product.name, priceCents:product.priceCents, quantity:1, size:sel.size||undefined, color:sel.color||undefined }];
        });
    }

    function updateQty(idx: number, qty: number) {
        setCart(p => qty < 1 ? p.filter((_,i) => i!==idx) : p.map((x,i) => i===idx ? { ...x, quantity:qty } : x));
    }

    async function placeOrder(e: React.FormEvent) {
        e.preventDefault(); setPlacing(true); setError("");
        try {
            const order = await publicFetch("/orders", { method:"POST", body:JSON.stringify({
                shopSlug:slug, ...form,
                items:cart.map(c => ({ productId:c.productId, quantity:c.quantity, size:c.size, color:c.color })),
                discountCode:discountCode||undefined
            })});
            setPlacedOrderId(order.id); setStep("done");
        } catch (err: any) { setError(err.message || "Failed to place order. Please try again."); }
        finally { setPlacing(false); }
    }

    /* ── Loading ── */
    if (!shop && !notFound) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm text-slate-400">Loading shop…</p>
                </div>
            </div>
        );
    }

    /* ── Not found ── */
    if (notFound) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <motion.div initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} className="text-center max-w-md">
                    <div className="w-16 h-16 bg-white rounded-2xl shadow-card flex items-center justify-center mx-auto mb-4 ring-1 ring-black/5">
                        <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                    </div>
                    <h1 className="text-xl font-bold text-slate-900 mb-2">Shop not found</h1>
                    <p className="text-sm text-slate-500">This shop link may have expired or is no longer active.</p>
                </motion.div>
            </div>
        );
    }

    /* ── Done ── */
    if (step === "done") {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <motion.div initial={{ opacity:0, scale:0.93, y:16 }} animate={{ opacity:1, scale:1, y:0 }}
                    transition={{ duration:0.4, ease:[0.32,0.72,0,1] }}
                    className="bg-white rounded-3xl shadow-xl ring-1 ring-black/5 p-10 max-w-md w-full text-center"
                >
                    <motion.div initial={{ scale:0 }} animate={{ scale:1 }} transition={{ delay:0.2, type:"spring", stiffness:260, damping:20 }}
                        className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
                        <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                        </svg>
                    </motion.div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-2">Order placed! 🎉</h1>
                    <p className="text-sm text-slate-500 mb-5">Thanks, <strong className="text-slate-700">{form.customerName}</strong>! Your order has been received and will be processed shortly.</p>
                    <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-600 mb-5">
                        Order ID: <code className="font-mono font-bold text-slate-800">#{placedOrderId.slice(-8).toUpperCase()}</code>
                    </div>
                    <p className="text-xs text-slate-400">A confirmation will be sent to {form.customerEmail}</p>
                </motion.div>
            </div>
        );
    }

    const inputCls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all";

    return (
        <div className="min-h-screen bg-[#f8f7ff]">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
                <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="sidebar-logo-icon w-8 h-8 rounded-xl flex items-center justify-center shrink-0">
                            <svg className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5zm4.707 3.707a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L7.414 9H13a1 1 0 100-2H7.414l2.293-2.293z" clipRule="evenodd"/>
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-sm font-bold text-slate-900 leading-none">{shop!.name}</h1>
                            <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">{shop!.collection.name}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {step === "checkout" && (
                            <button type="button" onClick={() => setStep("browse")} className="text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
                                Products
                            </button>
                        )}
                        {step === "browse" && cart.length > 0 && (
                            <motion.button type="button" whileHover={{ y:-1 }} whileTap={{ scale:0.96 }}
                                onClick={() => setStep("checkout")}
                                className="btn-shine flex items-center gap-2 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all duration-200"
                                style={{ background:"linear-gradient(135deg,#8b5cf6 0%,#7c3aed 100%)", boxShadow:"0 4px 16px rgba(124,58,237,0.35)" }}
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                                Checkout
                                <motion.span key={cartCount} initial={{ scale:1.4 }} animate={{ scale:1 }}
                                    className="bg-white/25 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                                    {cartCount}
                                </motion.span>
                            </motion.button>
                        )}
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 py-8">
                {/* Browse */}
                {step === "browse" && (
                    <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ duration:0.3 }}>
                        {products.length === 0 ? (
                            <div className="text-center py-16 text-slate-400">
                                <p className="text-sm">No products in this shop yet.</p>
                            </div>
                        ) : (
                            <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {products.map((p, idx) => {
                                    const sizes: string[] = p.sizesJson ? JSON.parse(p.sizesJson) : [];
                                    const colors: string[] = p.colorsJson ? JSON.parse(p.colorsJson) : [];
                                    const sel = getSelection(p.id);
                                    const totalInCart = cart.filter(c => c.productId===p.id).reduce((a,c) => a+c.quantity, 0);
                                    const imgs: string[] = p.imagesJson ? JSON.parse(p.imagesJson) : [];

                                    return (
                                        <motion.div key={p.id}
                                            initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }}
                                            transition={{ delay:idx*0.04, duration:0.3, ease:[0.32,0.72,0,1] }}
                                            className="bg-white rounded-2xl ring-1 ring-black/5 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-300 overflow-hidden flex flex-col"
                                        >
                                            {/* Image */}
                                            <div className="aspect-square overflow-hidden shrink-0">
                                                {imgs.length > 0 ? (
                                                    <img src={`${serverBase}${imgs[0]}`} alt={p.name} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
                                                ) : (
                                                    <div className="w-full h-full bg-gradient-to-br from-brand-50 to-violet-50 flex items-center justify-center">
                                                        <svg className="w-12 h-12 text-brand-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="p-4 flex flex-col flex-1 gap-3">
                                                <div>
                                                    <p className="text-sm font-bold text-slate-900">{p.name}</p>
                                                    {p.brand && <p className="text-xs text-slate-400 mt-0.5">{p.brand}</p>}
                                                    {p.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{p.description}</p>}
                                                    <p className="text-base font-bold text-brand-600 mt-2">{fmt(p.priceCents)}</p>
                                                </div>

                                                {(sizes.length > 0 || colors.length > 0) && (
                                                    <div className="space-y-2">
                                                        {sizes.length > 0 && (
                                                            <div>
                                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Size</label>
                                                                <div className="flex flex-wrap gap-1">
                                                                    {sizes.map(s => (
                                                                        <button key={s} type="button"
                                                                            onClick={() => setSelection(p.id,"size", sel.size===s ? "" : s)}
                                                                            className={`text-xs px-2 py-1 rounded-lg border font-medium transition-all duration-150 ${sel.size===s ? "bg-brand-600 text-white border-brand-600 shadow-sm" : "border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-600"}`}>
                                                                            {s}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {colors.length > 0 && (
                                                            <div>
                                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Color</label>
                                                                <div className="flex flex-wrap gap-1">
                                                                    {colors.map(c => (
                                                                        <button key={c} type="button"
                                                                            onClick={() => setSelection(p.id,"color", sel.color===c ? "" : c)}
                                                                            className={`text-xs px-2 py-1 rounded-lg border font-medium transition-all duration-150 ${sel.color===c ? "bg-brand-600 text-white border-brand-600 shadow-sm" : "border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-600"}`}>
                                                                            {c}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                <div className="mt-auto flex items-center gap-2">
                                                    <AnimatePresence>
                                                        {totalInCart > 0 && (
                                                            <motion.span initial={{ opacity:0, scale:0.8 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0, scale:0.8 }}
                                                                className="text-xs font-semibold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">
                                                                {totalInCart} in cart
                                                            </motion.span>
                                                        )}
                                                    </AnimatePresence>
                                                    <motion.button type="button" whileTap={{ scale:0.95 }} onClick={() => addToCart(p)}
                                                        className="ml-auto btn-shine text-xs font-semibold text-white px-3 py-1.5 rounded-lg transition-all"
                                                        style={{ background:"linear-gradient(135deg,#8b5cf6 0%,#7c3aed 100%)" }}>
                                                        Add to cart
                                                    </motion.button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}
                    </motion.div>
                )}

                {/* Checkout */}
                {step === "checkout" && (
                    <motion.div initial={{ opacity:0, x:16 }} animate={{ opacity:1, x:0 }} transition={{ duration:0.3, ease:[0.32,0.72,0,1] }}
                        className="grid lg:grid-cols-5 gap-6">
                        <div className="lg:col-span-3">
                            <form onSubmit={placeOrder} className="space-y-4">
                                {/* Contact */}
                                <div className="bg-white rounded-2xl ring-1 ring-black/5 shadow-card p-5 space-y-4">
                                    <h2 className="text-sm font-bold text-slate-900">Contact information</h2>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="field-label" htmlFor="cust-name">Full name</label>
                                            <input id="cust-name" required className={inputCls} placeholder="Jane Smith" value={form.customerName} onChange={e => setForm(p => ({ ...p, customerName:e.target.value }))} />
                                        </div>
                                        <div>
                                            <label className="field-label" htmlFor="cust-email">Email</label>
                                            <input id="cust-email" required type="email" className={inputCls} placeholder="jane@example.com" value={form.customerEmail} onChange={e => setForm(p => ({ ...p, customerEmail:e.target.value }))} />
                                        </div>
                                    </div>
                                </div>
                                {/* Shipping */}
                                <div className="bg-white rounded-2xl ring-1 ring-black/5 shadow-card p-5 space-y-4">
                                    <h2 className="text-sm font-bold text-slate-900">Shipping address</h2>
                                    <div>
                                        <label className="field-label" htmlFor="addr1">Street address</label>
                                        <input id="addr1" required className={inputCls} placeholder="123 Main St" value={form.shipAddress1} onChange={e => setForm(p => ({ ...p, shipAddress1:e.target.value }))} />
                                    </div>
                                    <div>
                                        <label className="field-label" htmlFor="addr2">Apartment, suite, etc. (optional)</label>
                                        <input id="addr2" className={inputCls} placeholder="Apt 4B" value={form.shipAddress2} onChange={e => setForm(p => ({ ...p, shipAddress2:e.target.value }))} />
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="col-span-1">
                                            <label className="field-label" htmlFor="city">City</label>
                                            <input id="city" required className={inputCls} placeholder="Springfield" value={form.shipCity} onChange={e => setForm(p => ({ ...p, shipCity:e.target.value }))} />
                                        </div>
                                        <div>
                                            <label className="field-label" htmlFor="state">State</label>
                                            <input id="state" required maxLength={2} className={inputCls} placeholder="IL" value={form.shipState} onChange={e => setForm(p => ({ ...p, shipState:e.target.value.toUpperCase() }))} />
                                        </div>
                                        <div>
                                            <label className="field-label" htmlFor="zip">ZIP</label>
                                            <input id="zip" required className={inputCls} placeholder="62701" value={form.shipZip} onChange={e => setForm(p => ({ ...p, shipZip:e.target.value }))} />
                                        </div>
                                    </div>
                                </div>
                                {/* Discount */}
                                <div className="bg-white rounded-2xl ring-1 ring-black/5 shadow-card p-5">
                                    <h2 className="text-sm font-bold text-slate-900 mb-3">Discount code</h2>
                                    <div className="flex gap-2">
                                        <input aria-label="Discount code" className={`${inputCls} flex-1 uppercase`} placeholder="Enter code"
                                            value={discountCode} onChange={e => { setDiscountCode(e.target.value.toUpperCase()); setDiscountApplied(false); }} />
                                        <button type="button" onClick={() => setDiscountApplied(true)}
                                            className="px-4 py-2 bg-slate-100 hover:bg-brand-50 hover:text-brand-700 text-slate-700 text-sm font-medium rounded-xl transition-colors">
                                            Apply
                                        </button>
                                    </div>
                                    {discountApplied && discountCode && (
                                        <p className="text-xs text-emerald-600 mt-2 font-medium">✓ Code will be applied at checkout.</p>
                                    )}
                                </div>
                                {error && (
                                    <motion.div initial={{ opacity:0, y:-4 }} animate={{ opacity:1, y:0 }}
                                        className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm font-medium text-red-700">
                                        {error}
                                    </motion.div>
                                )}
                                <motion.button type="submit" disabled={placing} whileHover={{ y:-1 }} whileTap={{ scale:0.98 }}
                                    className="btn-shine w-full text-white font-semibold py-3.5 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-60"
                                    style={{ background:"linear-gradient(135deg,#8b5cf6 0%,#7c3aed 100%)", boxShadow:"0 6px 24px rgba(124,58,237,0.4)" }}>
                                    {placing ? (
                                        <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Placing order…</>
                                    ) : (
                                        <>Place order · {fmt(subtotalCents)}</>
                                    )}
                                </motion.button>
                            </form>
                        </div>

                        {/* Order Summary */}
                        <div className="lg:col-span-2">
                            <div className="bg-white rounded-2xl ring-1 ring-black/5 shadow-card p-5 sticky top-20">
                                <h2 className="text-sm font-bold text-slate-900 mb-4">
                                    Order summary <span className="font-normal text-slate-400">({cartCount} item{cartCount!==1?"s":""})</span>
                                </h2>
                                <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
                                    {cart.map((item,i) => (
                                        <div key={i} className="flex items-start gap-3">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                                                {(item.size || item.color) && (
                                                    <p className="text-xs text-slate-400">{[item.size, item.color].filter(Boolean).join(" / ")}</p>
                                                )}
                                                <div className="flex items-center gap-2 mt-1">
                                                    <button type="button" onClick={() => updateQty(i, item.quantity-1)} className="w-5 h-5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs flex items-center justify-center transition-colors">−</button>
                                                    <span className="text-xs font-medium text-slate-700 w-4 text-center">{item.quantity}</span>
                                                    <button type="button" onClick={() => updateQty(i, item.quantity+1)} className="w-5 h-5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs flex items-center justify-center transition-colors">+</button>
                                                </div>
                                            </div>
                                            <span className="text-sm font-bold text-slate-900 tabular-nums shrink-0">{fmt(item.priceCents*item.quantity)}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="border-t border-slate-100 pt-4">
                                    <div className="flex justify-between text-base font-bold text-slate-900">
                                        <span>Subtotal</span>
                                        <span className="tabular-nums">{fmt(subtotalCents)}</span>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-1">Shipping calculated at fulfillment</p>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </main>
        </div>
    );
}

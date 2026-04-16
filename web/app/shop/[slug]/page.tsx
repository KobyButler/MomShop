"use client";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { imgUrl } from "@/app/lib/api";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import Image from "next/image";

// ─── Types ────────────────────────────────────────────────────────────────────
type Product = {
    id:string; name:string; sku:string; brand?:string;
    priceCents:number; description?:string; imagesJson?:string;
    sizesJson?:string; colorsJson?:string;
};
type CartItem = { productId:string; name:string; priceCents:number; quantity:number; size?:string; color?:string };
type Shop = { id:string; name:string; notes?:string; expiresAt?:string; collection:{ name:string; products:Product[] } };
type PaymentMethod = "stripe" | "pickup" | "";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");

async function publicFetch(path: string, init?: RequestInit) {
    const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000/api";
    const res = await fetch(`${base}${path}`, {
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
        ...init
    });
    if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const j = await res.json(); msg += j?.error ? `: ${j.error}` : ""; } catch {}
        throw new Error(msg);
    }
    return res.json();
}

const fmt = (cents: number) =>
    new Intl.NumberFormat("en-US", { style:"currency", currency:"USD" }).format(cents / 100);

// ─── Stripe Payment Form ──────────────────────────────────────────────────────
function StripePaymentForm({ orderId, totalCents, onSuccess, onBack }: {
    orderId: string; totalCents: number; onSuccess: () => void; onBack: () => void;
}) {
    const stripe = useStripe();
    const elements = useElements();
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState("");

    async function handlePay(e: React.FormEvent) {
        e.preventDefault();
        if (!stripe || !elements) return;
        setProcessing(true); setError("");
        const { error: stripeError } = await stripe.confirmPayment({ elements, redirect: "if_required" });
        if (stripeError) { setError(stripeError.message ?? "Payment failed."); setProcessing(false); }
        else onSuccess();
    }

    return (
        <form onSubmit={handlePay} className="space-y-4">
            <div className="bg-white rounded-2xl ring-1 ring-black/5 p-5">
                <h2 className="text-sm font-bold text-slate-900 mb-4">Card / digital wallet</h2>
                <PaymentElement options={{ layout: "tabs" }} />
            </div>
            {error && (
                <motion.div initial={{ opacity:0, y:-4 }} animate={{ opacity:1, y:0 }}
                    className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm font-medium text-red-700">
                    {error}
                </motion.div>
            )}
            <div className="flex gap-3">
                <button type="button" onClick={onBack}
                    className="flex-1 py-3 rounded-xl text-sm font-medium text-slate-600 bg-white ring-1 ring-black/8 hover:bg-slate-50 transition-colors">
                    ← Back
                </button>
                <motion.button type="submit" disabled={!stripe || processing} whileHover={{ y:-1 }} whileTap={{ scale:0.98 }}
                    className="btn-shine flex-[2] text-white font-semibold py-3 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-60"
                    style={{ background:"linear-gradient(135deg,#8b5cf6 0%,#7c3aed 100%)", boxShadow:"0 6px 24px rgba(124,58,237,0.4)" }}>
                    {processing ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Processing…</> : <>Pay {fmt(totalCents)}</>}
                </motion.button>
            </div>
        </form>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ShopPage({ params }: { params: { slug: string } }) {
    const { slug } = params;
    const [shop, setShop]             = useState<Shop | null>(null);
    const [cart, setCart]             = useState<CartItem[]>([]);
    const [selections, setSelections] = useState<Record<string, { size:string; color:string }>>({});
    const [step, setStep]             = useState<"browse"|"checkout"|"payment"|"done">("browse");
    const [placedOrderId, setPlacedOrderId] = useState("");
    const [discountCode, setDiscountCode]   = useState("");
    const [discountApplied, setDiscountApplied] = useState(false);
    const [form, setForm] = useState({
        customerName:"", customerEmail:"",
        shipAddress1:"", shipAddress2:"", shipCity:"", shipState:"", shipZip:""
    });
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("");
    const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(null);
    const [stripeOrderId, setStripeOrderId] = useState("");
    const [placing, setPlacing] = useState(false);
    const [error, setError]     = useState("");
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        publicFetch(`/shops/${slug}`).then(setShop).catch(() => setNotFound(true));
    }, [slug]);

    const products: Product[] = shop?.collection?.products ?? [];
    const subtotalCents = useMemo(() => cart.reduce((a,c) => a + c.priceCents*c.quantity, 0), [cart]);
    const cartCount = cart.reduce((a,c) => a + c.quantity, 0);

    function getSelection(pid: string) { return selections[pid] ?? { size:"", color:"" }; }
    function setSelection(pid: string, key:"size"|"color", val:string) {
        setSelections(p => ({ ...p, [pid]:{ ...getSelection(pid), [key]:val } }));
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

    async function handleContinueToPayment(e: React.FormEvent) {
        e.preventDefault();
        if (!paymentMethod) { setError("Please select a payment method."); return; }
        setError("");
        if (paymentMethod === "stripe") {
            setPlacing(true);
            try {
                const { clientSecret, orderId } = await publicFetch("/payments/create-intent", {
                    method: "POST",
                    body: JSON.stringify({ shopSlug: slug, ...form, items: cart.map(c => ({ productId:c.productId, quantity:c.quantity, size:c.size, color:c.color })), discountCode: discountCode || undefined })
                });
                setStripeClientSecret(clientSecret); setStripeOrderId(orderId); setStep("payment");
            } catch (err: any) { setError(err.message || "Could not initialize payment."); }
            finally { setPlacing(false); }
        } else {
            setPlacing(true);
            try {
                const order = await publicFetch("/orders", {
                    method: "POST",
                    body: JSON.stringify({ shopSlug: slug, ...form, items: cart.map(c => ({ productId:c.productId, quantity:c.quantity, size:c.size, color:c.color })), discountCode: discountCode || undefined, paymentMethod })
                });
                setPlacedOrderId(order.id); setStep("done");
            } catch (err: any) { setError(err.message || "Failed to place order."); }
            finally { setPlacing(false); }
        }
    }

    const inputCls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all";

    /* ── Loading ── */
    if (!shop && !notFound) return (
        <div className="min-h-screen bg-[#08080f] flex items-center justify-center">
            <div className="text-center">
                <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-slate-400">Loading shop…</p>
            </div>
        </div>
    );

    /* ── Not found ── */
    if (notFound) return (
        <div className="min-h-screen bg-[#f8f7ff] flex items-center justify-center p-4">
            <motion.div initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} className="text-center max-w-md">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-card flex items-center justify-center mx-auto mb-4 ring-1 ring-black/5">
                    <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                </div>
                <h1 className="text-xl font-bold text-slate-900 mb-2">Shop not found</h1>
                <p className="text-sm text-slate-500">This shop link may have expired or is no longer active.</p>
                <p className="text-xs text-slate-400 mt-4">Questions? Contact <a href="mailto:hello@crossroadscustomapparel.com" className="text-violet-600 hover:underline">hello@crossroadscustomapparel.com</a></p>
            </motion.div>
        </div>
    );

    /* ── Done ── */
    if (step === "done") {
        const isOffline = paymentMethod === "pickup";
        return (
            <div className="min-h-screen bg-[#f8f7ff] flex flex-col items-center justify-center p-4">
                <motion.div initial={{ opacity:0, scale:0.93, y:16 }} animate={{ opacity:1, scale:1, y:0 }}
                    transition={{ duration:0.4, ease:[0.32,0.72,0,1] }}
                    className="bg-white rounded-3xl shadow-xl ring-1 ring-black/5 p-8 sm:p-10 max-w-md w-full text-center">
                    <motion.div initial={{ scale:0 }} animate={{ scale:1 }}
                        transition={{ delay:0.2, type:"spring", stiffness:260, damping:20 }}
                        className={`w-16 h-16 ${isOffline ? "bg-amber-100" : "bg-emerald-100"} rounded-full flex items-center justify-center mx-auto mb-5`}>
                        {isOffline ? (
                            <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                        ) : (
                            <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                        )}
                    </motion.div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-2">{isOffline ? "Order confirmed!" : "Payment received!"}</h1>
                    <p className="text-sm text-slate-500 mb-5">
                        Thanks, <strong className="text-slate-700">{form.customerName}</strong>!{" "}
                        {isOffline ? `Your order is confirmed. Please bring cash or a check for ${fmt(subtotalCents)} when you pick it up.` : "Your payment was successful and your order is being processed."}
                    </p>
                    {isOffline && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 mb-5 text-left">
                            <p className="font-semibold mb-1">Payment due at pickup</p>
                            <p className="text-xs text-amber-700">Amount: <strong>{fmt(subtotalCents)}</strong> · Method: Cash or Check</p>
                        </div>
                    )}
                    <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-600 mb-5">
                        Order ID: <code className="font-mono font-bold text-slate-800">#{(placedOrderId || stripeOrderId).slice(-8).toUpperCase()}</code>
                    </div>
                    <p className="text-xs text-slate-400 mb-6">A confirmation email will be sent to {form.customerEmail}</p>
                    <div className="border-t border-slate-100 pt-5">
                        <Image src="/logo.png" alt="Crossroads Custom Apparel" width={120} height={48} className="mx-auto object-contain opacity-60" />
                        <p className="text-xs text-slate-400 mt-2">crossroadscustomapparel.com</p>
                    </div>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col" style={{ background: "#f4f3fb" }}>

            {/* ── HERO HEADER ── */}
            <div className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, #08080f 0%, #1a0a2e 50%, #0f0520 100%)" }}>
                {/* Decorative orbs */}
                <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full opacity-20 pointer-events-none" style={{ background: "radial-gradient(circle, #7c3aed, transparent 70%)", filter: "blur(60px)" }} />
                <div className="absolute bottom-0 right-1/4 w-64 h-64 rounded-full opacity-15 pointer-events-none" style={{ background: "radial-gradient(circle, #a78bfa, transparent 70%)", filter: "blur(50px)" }} />

                {/* Top bar */}
                <div className="relative z-10 border-b border-white/5">
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Image src="/logo.png" alt="Crossroads Custom Apparel" width={110} height={44} className="object-contain" priority />
                        </div>
                        <a href="mailto:hello@crossroadscustomapparel.com"
                            className="text-xs text-violet-300/70 hover:text-violet-300 transition-colors hidden sm:block">
                            hello@crossroadscustomapparel.com
                        </a>
                    </div>
                </div>

                {/* Hero content */}
                <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
                    <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.5, ease:[0.32,0.72,0,1] }}>
                        {/* Collection badge */}
                        <div className="inline-flex items-center gap-1.5 bg-white/8 border border-white/10 rounded-full px-3 py-1 mb-4">
                            <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                            <span className="text-xs font-semibold text-violet-300 tracking-wide uppercase">{shop!.collection.name}</span>
                        </div>

                        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight mb-3 tracking-tight">
                            {shop!.name}
                        </h1>

                        {shop!.notes && (
                            <p className="text-base text-slate-300/80 max-w-xl leading-relaxed mb-4">{shop!.notes}</p>
                        )}

                        {/* Info pills */}
                        <div className="flex flex-wrap gap-3 mt-5">
                            <div className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-xl px-3.5 py-2">
                                <svg className="w-4 h-4 text-violet-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
                                <span className="text-sm text-slate-200 font-medium">{products.length} item{products.length !== 1 ? "s" : ""} available</span>
                            </div>
                            <div className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-xl px-3.5 py-2">
                                <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                                <span className="text-sm text-slate-200 font-medium">Secure checkout</span>
                            </div>
                            {shop!.expiresAt && (
                                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-400/20 rounded-xl px-3.5 py-2">
                                    <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                    <span className="text-sm text-amber-300 font-medium">
                                        Closes {new Date(shop!.expiresAt).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" })}
                                    </span>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* ── STICKY NAV BAR (shows on browse) ── */}
            {step === "browse" && (
                <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-sm border-b border-slate-200 shadow-sm">
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 h-13 py-2.5 flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-700">
                            {cartCount === 0 ? "Select your items below" : `${cartCount} item${cartCount !== 1 ? "s" : ""} in your cart`}
                        </p>
                        <AnimatePresence>
                            {cart.length > 0 && (
                                <motion.button type="button" initial={{ opacity:0, x:10 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:10 }}
                                    whileHover={{ y:-1 }} whileTap={{ scale:0.96 }}
                                    onClick={() => setStep("checkout")}
                                    className="btn-shine flex items-center gap-2 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-all"
                                    style={{ background:"linear-gradient(135deg,#8b5cf6 0%,#7c3aed 100%)", boxShadow:"0 4px 16px rgba(124,58,237,0.35)" }}>
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                                    Checkout · {fmt(subtotalCents)}
                                    <motion.span key={cartCount} initial={{ scale:1.4 }} animate={{ scale:1 }}
                                        className="bg-white/25 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                                        {cartCount}
                                    </motion.span>
                                </motion.button>
                            )}
                        </AnimatePresence>
                        {(step === "checkout" || step === "payment") && (
                            <button type="button"
                                onClick={() => step === "payment" ? setStep("checkout") : setStep("browse")}
                                className="text-sm font-medium text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
                                {step === "payment" ? "Edit order" : "Back to products"}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ── CHECKOUT / PAYMENT nav ── */}
            {(step === "checkout" || step === "payment") && (
                <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-sm border-b border-slate-200 shadow-sm">
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 h-13 py-2.5 flex items-center gap-3">
                        <button type="button"
                            onClick={() => step === "payment" ? setStep("checkout") : setStep("browse")}
                            className="text-sm font-medium text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
                            {step === "payment" ? "Edit order" : "Back to products"}
                        </button>
                        <span className="text-slate-200">|</span>
                        <span className="text-sm text-slate-500">{shop!.name}</span>
                    </div>
                </div>
            )}

            <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8">

                {/* ── BROWSE ── */}
                {step === "browse" && (
                    <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ duration:0.3 }}>
                        {products.length === 0 ? (
                            <div className="text-center py-24">
                                <div className="w-16 h-16 bg-white rounded-2xl ring-1 ring-black/5 flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                                </div>
                                <p className="text-slate-500 font-medium">No products in this shop yet.</p>
                                <p className="text-sm text-slate-400 mt-1">Check back soon!</p>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                                    {products.map((p, idx) => {
                                        const sizes: string[] = p.sizesJson ? JSON.parse(p.sizesJson) : [];
                                        const colors: string[] = p.colorsJson ? JSON.parse(p.colorsJson) : [];
                                        const sel = getSelection(p.id);
                                        const totalInCart = cart.filter(c => c.productId===p.id).reduce((a,c) => a+c.quantity, 0);
                                        const imgs: string[] = p.imagesJson ? JSON.parse(p.imagesJson) : [];
                                        return (
                                            <motion.div key={p.id}
                                                initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
                                                transition={{ delay:idx*0.05, duration:0.35, ease:[0.32,0.72,0,1] }}
                                                className="bg-white rounded-2xl ring-1 ring-black/5 shadow-card hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col group">

                                                {/* Image */}
                                                <div className="relative aspect-[4/3] overflow-hidden bg-slate-50">
                                                    {imgs.length > 0 ? (
                                                        <img src={imgUrl(imgs[0])} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center" style={{ background:"linear-gradient(135deg,#f3f0ff,#ede9fe)" }}>
                                                            <svg className="w-14 h-14 text-violet-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                                                        </div>
                                                    )}
                                                    {totalInCart > 0 && (
                                                        <div className="absolute top-2.5 right-2.5 bg-violet-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg">
                                                            {totalInCart} in cart
                                                        </div>
                                                    )}
                                                    {p.brand && (
                                                        <div className="absolute bottom-2.5 left-2.5 bg-black/50 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                                                            {p.brand}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Info */}
                                                <div className="p-4 flex flex-col flex-1 gap-3">
                                                    <div className="flex-1">
                                                        <h3 className="font-bold text-slate-900 text-sm leading-snug">{p.name}</h3>
                                                        {p.description && (
                                                            <p className="text-xs text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">{p.description}</p>
                                                        )}
                                                        <p className="text-lg font-black mt-2" style={{ background:"linear-gradient(135deg,#8b5cf6,#7c3aed)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text" }}>
                                                            {fmt(p.priceCents)}
                                                        </p>
                                                    </div>

                                                    {/* Size & Color pickers */}
                                                    {(sizes.length > 0 || colors.length > 0) && (
                                                        <div className="space-y-2.5 border-t border-slate-100 pt-3">
                                                            {sizes.length > 0 && (
                                                                <div>
                                                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Size</label>
                                                                    <div className="flex flex-wrap gap-1">
                                                                        {sizes.map(s => (
                                                                            <button key={s} type="button"
                                                                                onClick={() => setSelection(p.id,"size", sel.size===s ? "" : s)}
                                                                                className={`text-xs px-2.5 py-1 rounded-lg border font-semibold transition-all duration-150 ${sel.size===s ? "bg-violet-600 text-white border-violet-600 shadow-sm" : "border-slate-200 text-slate-500 hover:border-violet-300 hover:text-violet-600"}`}>
                                                                                {s}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {colors.length > 0 && (
                                                                <div>
                                                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Color</label>
                                                                    <div className="flex flex-wrap gap-1">
                                                                        {colors.map(c => (
                                                                            <button key={c} type="button"
                                                                                onClick={() => setSelection(p.id,"color", sel.color===c ? "" : c)}
                                                                                className={`text-xs px-2.5 py-1 rounded-lg border font-semibold transition-all duration-150 ${sel.color===c ? "bg-violet-600 text-white border-violet-600 shadow-sm" : "border-slate-200 text-slate-500 hover:border-violet-300 hover:text-violet-600"}`}>
                                                                                {c}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    <motion.button type="button" whileTap={{ scale:0.96 }} onClick={() => addToCart(p)}
                                                        className="btn-shine w-full text-white text-sm font-semibold py-2.5 rounded-xl transition-all"
                                                        style={{ background:"linear-gradient(135deg,#8b5cf6 0%,#7c3aed 100%)", boxShadow:"0 4px 16px rgba(124,58,237,0.25)" }}>
                                                        Add to cart
                                                    </motion.button>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>

                                {/* Trust / info bar */}
                                <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    {[
                                        { icon: "🎨", title: "Custom Decorated", desc: "Every item screen printed or embroidered by our team" },
                                        { icon: "📦", title: "Ships to You", desc: "Orders delivered directly to your door" },
                                        { icon: "💬", title: "Questions?", desc: "hello@crossroadscustomapparel.com" },
                                    ].map(item => (
                                        <div key={item.title} className="bg-white rounded-2xl ring-1 ring-black/5 p-5 flex gap-4 items-start">
                                            <span className="text-2xl">{item.icon}</span>
                                            <div>
                                                <p className="text-sm font-bold text-slate-800">{item.title}</p>
                                                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.desc}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </motion.div>
                )}

                {/* ── CHECKOUT ── */}
                {step === "checkout" && (
                    <motion.div initial={{ opacity:0, x:16 }} animate={{ opacity:1, x:0 }} transition={{ duration:0.3, ease:[0.32,0.72,0,1] }}
                        className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                        <div className="lg:col-span-3 space-y-4">
                            {/* Contact */}
                            <div className="bg-white rounded-2xl ring-1 ring-black/5 p-5 space-y-4">
                                <h2 className="text-sm font-bold text-slate-900">Contact information</h2>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="field-label" htmlFor="cust-name">Full name</label>
                                        <input id="cust-name" required className={inputCls} placeholder="Jane Smith"
                                            value={form.customerName} onChange={e => setForm(p => ({ ...p, customerName:e.target.value }))} />
                                    </div>
                                    <div>
                                        <label className="field-label" htmlFor="cust-email">Email</label>
                                        <input id="cust-email" required type="email" className={inputCls} placeholder="jane@example.com"
                                            value={form.customerEmail} onChange={e => setForm(p => ({ ...p, customerEmail:e.target.value }))} />
                                    </div>
                                </div>
                            </div>

                            {/* Shipping */}
                            <div className="bg-white rounded-2xl ring-1 ring-black/5 p-5 space-y-4">
                                <h2 className="text-sm font-bold text-slate-900">Shipping address</h2>
                                <div>
                                    <label className="field-label" htmlFor="addr1">Street address</label>
                                    <input id="addr1" required className={inputCls} placeholder="123 Main St"
                                        value={form.shipAddress1} onChange={e => setForm(p => ({ ...p, shipAddress1:e.target.value }))} />
                                </div>
                                <div>
                                    <label className="field-label" htmlFor="addr2">Apartment, suite, etc. (optional)</label>
                                    <input id="addr2" className={inputCls} placeholder="Apt 4B"
                                        value={form.shipAddress2} onChange={e => setForm(p => ({ ...p, shipAddress2:e.target.value }))} />
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    <div className="col-span-2 sm:col-span-1">
                                        <label className="field-label" htmlFor="city">City</label>
                                        <input id="city" required className={inputCls} placeholder="Springfield"
                                            value={form.shipCity} onChange={e => setForm(p => ({ ...p, shipCity:e.target.value }))} />
                                    </div>
                                    <div>
                                        <label className="field-label" htmlFor="state">State</label>
                                        <input id="state" required maxLength={2} className={inputCls} placeholder="IL"
                                            value={form.shipState} onChange={e => setForm(p => ({ ...p, shipState:e.target.value.toUpperCase() }))} />
                                    </div>
                                    <div>
                                        <label className="field-label" htmlFor="zip">ZIP</label>
                                        <input id="zip" required className={inputCls} placeholder="62701"
                                            value={form.shipZip} onChange={e => setForm(p => ({ ...p, shipZip:e.target.value }))} />
                                    </div>
                                </div>
                            </div>

                            {/* Payment method */}
                            <div className="bg-white rounded-2xl ring-1 ring-black/5 p-5">
                                <h2 className="text-sm font-bold text-slate-900 mb-3">Payment method</h2>
                                <div className="space-y-2">
                                    <label className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all duration-150 ${paymentMethod === "stripe" ? "border-violet-500 bg-violet-50" : "border-slate-200 hover:border-slate-300"}`}>
                                        <input type="radio" name="paymentMethod" value="stripe" className="accent-violet-600"
                                            checked={paymentMethod === "stripe"} onChange={() => setPaymentMethod("stripe")} />
                                        <div className="flex-1">
                                            <p className="text-sm font-semibold text-slate-900">Card / Apple Pay / Google Pay</p>
                                            <p className="text-xs text-slate-400 mt-0.5">Pay securely online with card or digital wallet</p>
                                        </div>
                                        <div className="flex gap-1">
                                            <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono font-bold">VISA</span>
                                            <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono font-bold">MC</span>
                                            <span className="text-xs bg-slate-700 text-white px-1.5 py-0.5 rounded font-bold">Pay</span>
                                        </div>
                                    </label>
                                    <label className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all duration-150 ${paymentMethod === "pickup" ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-slate-300"}`}>
                                        <input type="radio" name="paymentMethod" value="pickup" className="accent-emerald-600"
                                            checked={paymentMethod === "pickup"} onChange={() => setPaymentMethod("pickup")} />
                                        <div className="flex-1">
                                            <p className="text-sm font-semibold text-slate-900">Pay at pickup</p>
                                            <p className="text-xs text-slate-400 mt-0.5">Pay with cash or check when you collect your order</p>
                                        </div>
                                        <span className="text-lg">💵</span>
                                    </label>
                                </div>
                            </div>

                            {/* Discount */}
                            <div className="bg-white rounded-2xl ring-1 ring-black/5 p-5">
                                <h2 className="text-sm font-bold text-slate-900 mb-3">Discount code</h2>
                                <div className="flex gap-2">
                                    <input aria-label="Discount code" className={`${inputCls} flex-1 uppercase`} placeholder="Enter code"
                                        value={discountCode} onChange={e => { setDiscountCode(e.target.value.toUpperCase()); setDiscountApplied(false); }} />
                                    <button type="button" onClick={() => setDiscountApplied(true)}
                                        className="px-4 py-2 bg-slate-100 hover:bg-violet-50 hover:text-violet-700 text-slate-700 text-sm font-medium rounded-xl transition-colors">
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

                            <motion.button type="button" disabled={placing || !paymentMethod} whileHover={{ y:-1 }} whileTap={{ scale:0.98 }}
                                onClick={handleContinueToPayment as any}
                                className="btn-shine w-full text-white font-semibold py-3.5 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-60"
                                style={{ background:"linear-gradient(135deg,#8b5cf6 0%,#7c3aed 100%)", boxShadow:"0 6px 24px rgba(124,58,237,0.4)" }}>
                                {placing ? (
                                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Working…</>
                                ) : paymentMethod === "stripe" ? (
                                    <>Continue to payment · {fmt(subtotalCents)}</>
                                ) : paymentMethod ? (
                                    <>Place order · {fmt(subtotalCents)}</>
                                ) : <>Select a payment method</>}
                            </motion.button>
                        </div>

                        {/* Order summary */}
                        <div className="lg:col-span-2">
                            <div className="bg-white rounded-2xl ring-1 ring-black/5 p-5 sticky top-20">
                                <h2 className="text-sm font-bold text-slate-900 mb-4">
                                    Order summary <span className="font-normal text-slate-400">({cartCount} item{cartCount!==1?"s":""})</span>
                                </h2>
                                <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                                    {cart.map((item,i) => (
                                        <div key={i} className="flex items-start gap-3">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-slate-900 truncate">{item.name}</p>
                                                <p className="text-xs text-slate-400 mt-0.5">
                                                    {[item.size, item.color].filter(Boolean).join(" · ")}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <button type="button" onClick={() => updateQty(i, item.quantity-1)}
                                                    className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center text-sm font-bold transition-colors">−</button>
                                                <span className="text-sm font-semibold text-slate-900 w-4 text-center">{item.quantity}</span>
                                                <button type="button" onClick={() => updateQty(i, item.quantity+1)}
                                                    className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center text-sm font-bold transition-colors">+</button>
                                            </div>
                                            <p className="text-sm font-bold text-slate-900 shrink-0 w-16 text-right">{fmt(item.priceCents*item.quantity)}</p>
                                        </div>
                                    ))}
                                </div>
                                <div className="border-t border-slate-100 pt-4 space-y-2">
                                    <div className="flex justify-between text-sm text-slate-500">
                                        <span>Subtotal</span><span className="font-medium text-slate-900">{fmt(subtotalCents)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm text-slate-500">
                                        <span>Shipping</span><span className="text-slate-400 text-xs">Calculated at next step</span>
                                    </div>
                                    <div className="flex justify-between font-bold text-slate-900 pt-2 border-t border-slate-100 text-base">
                                        <span>Total</span><span>{fmt(subtotalCents)}</span>
                                    </div>
                                </div>
                                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-center gap-2">
                                    <Image src="/logo.png" alt="Crossroads Custom Apparel" width={90} height={36} className="object-contain opacity-50" />
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* ── PAYMENT ── */}
                {step === "payment" && stripeClientSecret && (
                    <motion.div initial={{ opacity:0, x:16 }} animate={{ opacity:1, x:0 }} transition={{ duration:0.3 }}
                        className="max-w-lg mx-auto">
                        <h2 className="text-lg font-bold text-slate-900 mb-4">Complete your payment</h2>
                        <Elements stripe={stripePromise} options={{ clientSecret: stripeClientSecret, appearance: { theme:"stripe", variables: { colorPrimary:"#7c3aed" } } }}>
                            <StripePaymentForm orderId={stripeOrderId} totalCents={subtotalCents} onSuccess={() => setStep("done")} onBack={() => setStep("checkout")} />
                        </Elements>
                    </motion.div>
                )}
            </main>

            {/* ── MOBILE STICKY CART ── */}
            <AnimatePresence>
                {step === "browse" && cart.length > 0 && (
                    <motion.div
                        initial={{ opacity:0, y:80 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:80 }}
                        transition={{ duration:0.3, ease:[0.32,0.72,0,1] }}
                        className="fixed bottom-0 left-0 right-0 z-30 p-4 sm:hidden"
                        style={{ background:"linear-gradient(to top, rgba(244,243,251,1) 60%, rgba(244,243,251,0))" }}>
                        <button type="button" onClick={() => setStep("checkout")}
                            className="btn-shine w-full flex items-center justify-between text-white font-semibold px-5 py-4 rounded-2xl shadow-xl"
                            style={{ background:"linear-gradient(135deg,#8b5cf6 0%,#7c3aed 100%)", boxShadow:"0 8px 32px rgba(124,58,237,0.45)" }}>
                            <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full">{cartCount}</span>
                            <span>View Cart &amp; Checkout</span>
                            <span className="font-bold">{fmt(subtotalCents)}</span>
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── FOOTER ── */}
            <footer className="mt-12 border-t border-slate-200 bg-white">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Image src="/logo.png" alt="Crossroads Custom Apparel" width={100} height={40} className="object-contain" />
                    </div>
                    <div className="text-center sm:text-right">
                        <p className="text-xs text-slate-400">Screen printing &amp; embroidery · <a href="mailto:hello@crossroadscustomapparel.com" className="hover:text-violet-600 transition-colors">hello@crossroadscustomapparel.com</a></p>
                        <p className="text-xs text-slate-300 mt-0.5">© {new Date().getFullYear()} Crossroads Custom Apparel. All rights reserved.</p>
                    </div>
                </div>
            </footer>
        </div>
    );
}

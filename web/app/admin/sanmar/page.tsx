"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/app/lib/api";
import { useToast } from "@/components/ui/toast";
import { motion, AnimatePresence } from "framer-motion";

/* ─── Types ───────────────────────────────────────────────────────────────── */

type Status = {
    sftpEnabled: boolean; soapEnabled: boolean;
    catalogCount: number;
    lastSync: Record<string, SyncLog>;
};

type SyncLog = {
    id: string; type: string; status: string;
    rowsProcessed?: number; rowsTotal?: number; fileSizeBytes?: number;
    error?: string; startedAt: string; completedAt?: string;
};

type CatalogRow = {
    id: string; style: string; colorName: string; sizeName: string;
    title?: string; description?: string; brand?: string;
    category?: string; subcategory?: string; priceCents: number;
    inventoryQty: number; colorSwatchImage?: string; productImage?: string;
    inventoryKey?: string;
};

type StyleDetail = {
    style: string; title?: string; description?: string; brand?: string;
    category?: string; subcategory?: string; colors: string[]; sizes: string[];
    priceCents: number; variants: CatalogRow[];
};

type StyleCard = {
    style: string; title?: string; brand?: string; category?: string;
    priceCents: number; colorCount: number; sizeCount: number;
    totalQty: number; productImage?: string;
    colors: string[]; sizes: string[];
};

type Collection = { id: string; name: string };

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

const fmt = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

function timeAgo(d: string): string {
    const diff = Date.now() - new Date(d).getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
}

function groupToStyleCards(rows: CatalogRow[]): StyleCard[] {
    const map = new Map<string, StyleCard>();
    for (const row of rows) {
        if (!map.has(row.style)) {
            map.set(row.style, {
                style: row.style, title: row.title, brand: row.brand,
                category: row.category, priceCents: row.priceCents,
                colorCount: 0, sizeCount: 0, totalQty: 0,
                productImage: row.productImage, colors: [], sizes: [],
            });
        }
        const card = map.get(row.style)!;
        if (row.colorName && !card.colors.includes(row.colorName)) card.colors.push(row.colorName);
        if (row.sizeName  && !card.sizes.includes(row.sizeName))   card.sizes.push(row.sizeName);
        card.totalQty += row.inventoryQty;
        if (row.priceCents > 0 && (card.priceCents === 0 || row.priceCents < card.priceCents))
            card.priceCents = row.priceCents;
        if (!card.productImage && row.productImage) card.productImage = row.productImage;
    }
    return Array.from(map.values()).map(c => ({ ...c, colorCount: c.colors.length, sizeCount: c.sizes.length }));
}

function colorHex(name: string): string {
    const n = name.toLowerCase();
    if (n.includes("black"))                         return "#111827";
    if (n.includes("white") || n.includes("natural") || n.includes("ivory") || n.includes("cream")) return "#f9fafb";
    if (n.includes("navy") || n.includes("dark blue")) return "#1e3a5f";
    if (n.includes("royal") || n.includes("cobalt"))  return "#1d4ed8";
    if (n.includes("carolina") || n.includes("columbia") || n.includes("sky")) return "#7dd3fc";
    if (n.includes("light blue") || n.includes("baby blue") || n.includes("powder")) return "#bfdbfe";
    if (n.includes("blue"))                          return "#2563eb";
    if (n.includes("cardinal") || n.includes("garnet")) return "#9b1c1c";
    if (n.includes("maroon") || n.includes("wine") || n.includes("burgundy")) return "#7f1d1d";
    if (n.includes("true red") || n.includes("bright red")) return "#ef4444";
    if (n.includes("red"))                           return "#dc2626";
    if (n.includes("forest"))                        return "#14532d";
    if (n.includes("kelly") || n.includes("lime"))   return "#16a34a";
    if (n.includes("military") || n.includes("olive")) return "#4d5e30";
    if (n.includes("green"))                         return "#15803d";
    if (n.includes("athletic gold") || n.includes("vegas gold")) return "#ca8a04";
    if (n.includes("yellow") || n.includes("gold"))  return "#eab308";
    if (n.includes("orange") || n.includes("tangerine")) return "#f97316";
    if (n.includes("purple") || n.includes("violet")) return "#7c3aed";
    if (n.includes("lavender"))                      return "#c4b5fd";
    if (n.includes("hot pink") || n.includes("neon pink")) return "#f472b6";
    if (n.includes("pink") || n.includes("azalea"))  return "#ec4899";
    if (n.includes("heather"))                       return "#9ca3af";
    if (n.includes("sport grey") || n.includes("ash") || n.includes("silver")) return "#d1d5db";
    if (n.includes("charcoal") || n.includes("dark grey") || n.includes("dark gray")) return "#374151";
    if (n.includes("grey") || n.includes("gray"))    return "#6b7280";
    if (n.includes("tan") || n.includes("khaki") || n.includes("sand") || n.includes("desert")) return "#d4a96a";
    if (n.includes("brown") || n.includes("coffee") || n.includes("chocolate")) return "#78350f";
    if (n.includes("teal") || n.includes("aqua"))    return "#0d9488";
    if (n.includes("deep teal") || n.includes("dark teal")) return "#134e4a";
    if (n.includes("storm"))                         return "#64748b";
    return "#cbd5e1";
}

/* ─── Color Swatch ────────────────────────────────────────────────────────── */

function Swatch({ color, selected, onClick, outOfStock }: {
    color: string; selected?: boolean; onClick?: () => void; outOfStock?: boolean;
}) {
    const hex = colorHex(color);
    const isLight = ["#f9fafb", "#bfdbfe", "#d1d5db", "#c4b5fd", "#fef3c7"].includes(hex);
    return (
        <button
            type="button"
            onClick={onClick}
            title={color}
            aria-label={color}
            className={`relative w-7 h-7 rounded-full transition-all duration-150 shrink-0 ${
                selected ? "ring-2 ring-offset-2 ring-violet-500 scale-110 shadow-lg" : "hover:scale-105"
            } ${isLight ? "ring-1 ring-slate-200" : ""}`}
            style={{ backgroundColor: hex }}
        >
            {outOfStock && (
                <div className="absolute inset-0 rounded-full flex items-center justify-center">
                    <div className="w-5 h-px bg-white/70 rotate-45" />
                </div>
            )}
        </button>
    );
}

/* ─── Product Card ────────────────────────────────────────────────────────── */

function ProductCard({ card, onClick, index }: { card: StyleCard; onClick: () => void; index: number }) {
    const [imgErr, setImgErr] = useState(false);
    const stockLevel = card.totalQty > 500 ? "high" : card.totalQty > 0 ? "low" : "none";

    return (
        <motion.button
            onClick={onClick}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.25, ease: "easeOut" }}
            className="text-left bg-white rounded-3xl ring-1 ring-black/5 shadow-sm hover:shadow-xl hover:ring-violet-200/80 hover:-translate-y-1 transition-all duration-200 group overflow-hidden"
        >
            {/* Image */}
            <div className="relative bg-gradient-to-br from-slate-50 to-slate-100 aspect-[4/5] overflow-hidden">
                {card.productImage && !imgErr ? (
                    <img
                        src={card.productImage}
                        alt={card.title ?? card.style}
                        onError={() => setImgErr(true)}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-200">
                        <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </div>
                )}

                {/* Stock dot */}
                <div className={`absolute top-3 right-3 w-2.5 h-2.5 rounded-full ring-2 ring-white ${
                    stockLevel === "high" ? "bg-emerald-400" : stockLevel === "low" ? "bg-amber-400" : "bg-red-400"
                }`} />

                {/* Style number */}
                <div className="absolute bottom-0 left-0 right-0 px-3 pb-3 pt-8 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-xs font-mono font-bold text-white/90">{card.style}</span>
                </div>
            </div>

            {/* Body */}
            <div className="p-3.5">
                <p className="font-bold text-slate-900 text-sm leading-snug line-clamp-1">{card.title ?? card.style}</p>
                {card.brand && <p className="text-xs text-slate-400 mt-0.5 truncate">{card.brand}</p>}

                <div className="mt-2.5 flex items-end justify-between gap-2">
                    <div>
                        <p className="text-base font-black text-slate-900">
                            {card.priceCents > 0 ? fmt(card.priceCents) : "—"}
                        </p>
                        <p className="text-xs text-slate-400">{card.colorCount} colors</p>
                    </div>

                    {/* Mini color swatches */}
                    <div className="flex -space-x-1.5 flex-wrap justify-end gap-y-1 max-w-[80px]">
                        {card.colors.slice(0, 5).map(c => (
                            <div key={c} className="w-4 h-4 rounded-full ring-1 ring-white shrink-0"
                                style={{ backgroundColor: colorHex(c) }} />
                        ))}
                        {card.colorCount > 5 && (
                            <div className="w-4 h-4 rounded-full bg-slate-100 ring-1 ring-white flex items-center justify-center shrink-0">
                                <span className="text-[8px] font-bold text-slate-500">+{card.colorCount - 5}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </motion.button>
    );
}

/* ─── List Row ────────────────────────────────────────────────────────────── */

function ListRow({ card, onClick, index }: { card: StyleCard; onClick: () => void; index: number }) {
    const [imgErr, setImgErr] = useState(false);
    return (
        <motion.button
            onClick={onClick}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(index * 0.02, 0.2), duration: 0.2 }}
            className="w-full flex items-center gap-4 px-4 py-3 hover:bg-violet-50/50 transition-colors border-b border-slate-50 last:border-0 text-left group"
        >
            <div className="w-14 h-14 rounded-2xl bg-slate-50 overflow-hidden shrink-0 ring-1 ring-black/5">
                {card.productImage && !imgErr ? (
                    <img src={card.productImage} alt="" onError={() => setImgErr(true)}
                        className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-200">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </div>
                )}
            </div>

            <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 text-sm truncate">{card.title ?? card.style}</p>
                <p className="text-xs text-slate-400 mt-0.5">{card.brand} · {card.style}</p>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {card.colors.slice(0, 8).map(c => (
                        <div key={c} className="w-3.5 h-3.5 rounded-full ring-1 ring-white shadow-sm shrink-0"
                            style={{ backgroundColor: colorHex(c) }} />
                    ))}
                    {card.colorCount > 8 && (
                        <span className="text-[10px] text-slate-400">+{card.colorCount - 8}</span>
                    )}
                </div>
            </div>

            <div className="text-right shrink-0 space-y-1">
                <p className="font-black text-slate-900 text-sm">{card.priceCents > 0 ? fmt(card.priceCents) : "—"}</p>
                <p className={`text-xs font-medium ${card.totalQty > 0 ? "text-emerald-500" : "text-slate-300"}`}>
                    {card.totalQty > 0 ? `${card.totalQty.toLocaleString()} in stock` : "Out of stock"}
                </p>
            </div>

            <svg className="w-4 h-4 text-slate-300 group-hover:text-violet-400 transition-colors shrink-0"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
        </motion.button>
    );
}

/* ─── Health Card ─────────────────────────────────────────────────────────── */

function HealthCard({ title, sub, log, syncKey, syncing, onSync }: {
    title: string; sub: string; log?: SyncLog;
    syncKey: string; syncing: boolean; onSync: () => void;
}) {
    const ok = log?.status === "SUCCESS";
    const running = log?.status === "RUNNING" || syncing;
    return (
        <div className="bg-white rounded-2xl ring-1 ring-black/5 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="font-bold text-slate-800 text-sm">{title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
                </div>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    running ? "bg-amber-50" : ok ? "bg-emerald-50" : "bg-slate-100"
                }`}>
                    {running ? (
                        <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                    ) : ok ? (
                        <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    ) : (
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                    )}
                </div>
            </div>

            {log ? (
                <div className="text-xs text-slate-500 space-y-1">
                    {log.rowsProcessed != null && (
                        <p className="font-medium text-slate-700">{log.rowsProcessed.toLocaleString()} items synced</p>
                    )}
                    <p>{ok ? "Last updated" : "Last attempt"} · {timeAgo(log.startedAt)}</p>
                    {log.error && !running && (
                        <p className="text-red-400 text-[11px] leading-tight line-clamp-2">{log.error.slice(0, 120)}</p>
                    )}
                </div>
            ) : (
                <p className="text-xs text-slate-400">Never synced</p>
            )}

            <button
                onClick={onSync}
                disabled={running}
                className="w-full py-2.5 text-xs font-bold rounded-xl bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
                {running ? "Updating…" : "Refresh Now"}
            </button>
        </div>
    );
}

/* ─── Main Page ───────────────────────────────────────────────────────────── */

export default function SanMarPage() {
    const { toast } = useToast();

    // State
    const [status, setStatus]   = useState<Status | null>(null);
    const [catMeta, setCatMeta] = useState<{ categories: string[]; brands: string[] }>({ categories: [], brands: [] });
    const [catalog, setCatalog] = useState<CatalogRow[]>([]);
    const [catTotal, setCatTotal] = useState(0);
    const [catPage, setCatPage] = useState(1);
    const [catLoading, setCatLoading] = useState(false);
    const [view, setView]       = useState<"grid" | "list">("grid");
    const [showHealth, setShowHealth] = useState(false);

    // Filters
    const [q, setQ]                     = useState("");
    const [activeCategory, setCategory] = useState("");
    const [activeBrand, setBrand]       = useState("");

    // Product detail panel
    const [panelStyle, setPanelStyle]   = useState<string | null>(null);
    const [detail, setDetail]           = useState<StyleDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [selectedColor, setColor]     = useState<string | null>(null);

    // Import flow
    const [collections, setCollections] = useState<Collection[]>([]);
    const [collectionId, setCollectionId] = useState("");
    const [priceVal, setPriceVal]       = useState("");
    const [importing, setImporting]     = useState(false);
    const [importDone, setImportDone]   = useState(false);

    // Sync
    const [syncing, setSyncing] = useState<Record<string, boolean>>({});

    // Debounce search
    const searchTimer = useRef<ReturnType<typeof setTimeout>>();

    /* ── Boot ── */
    useEffect(() => {
        api("/sanmar/status").then(setStatus).catch(console.error);
        api("/sanmar/catalog/meta").then(setCatMeta).catch(() => {});
        api("/collections").then((c: any) => setCollections(Array.isArray(c) ? c : c?.data ?? [])).catch(console.error);
    }, []);

    /* ── Load catalog ── */
    const loadCatalog = useCallback(() => {
        setCatLoading(true);
        const p = new URLSearchParams({ limit: "200", page: String(catPage) });
        if (q)              p.set("q", q);
        if (activeCategory) p.set("category", activeCategory);
        if (activeBrand)    p.set("brand", activeBrand);
        api(`/sanmar/catalog?${p}`)
            .then((r: any) => { setCatalog(r.data ?? []); setCatTotal(r.total ?? 0); })
            .catch(console.error)
            .finally(() => setCatLoading(false));
    }, [q, activeCategory, activeBrand, catPage]);

    useEffect(() => { loadCatalog(); }, [loadCatalog]);

    /* ── Open product panel ── */
    async function openProduct(style: string) {
        setPanelStyle(style);
        setDetail(null);
        setDetailLoading(true);
        setColor(null);
        setCollectionId("");
        setImportDone(false);
        try {
            const r = await api(`/sanmar/catalog/${encodeURIComponent(style)}`);
            setDetail(r);
            setColor(r.colors[0] ?? null);
            setPriceVal(r.priceCents > 0 ? (r.priceCents / 100).toFixed(2) : "");
        } catch { /* ignore */ }
        finally { setDetailLoading(false); }
    }

    function closePanel() {
        setPanelStyle(null);
        setDetail(null);
        setImportDone(false);
    }

    /* ── Sync ── */
    async function triggerSync(key: string, endpoint: string) {
        setSyncing(s => ({ ...s, [key]: true }));
        try {
            const r = await api(endpoint, { method: "POST" });
            toast(r.message ?? "Update started — check back in a few minutes");
            if (r.logId) pollLog(r.logId, key);
        } catch (err: any) {
            toast(err.message || "Failed to start update", "error");
            setSyncing(s => ({ ...s, [key]: false }));
        }
    }

    function pollLog(logId: string, key: string) {
        const iv = setInterval(async () => {
            try {
                const r = await api(`/sanmar/sync-logs?limit=20&offset=0`);
                const log = (r.logs ?? []).find((l: SyncLog) => l.id === logId);
                if (!log || log.status === "RUNNING") return;
                clearInterval(iv);
                setSyncing(s => ({ ...s, [key]: false }));
                if (log.status === "SUCCESS") {
                    toast(`Done! ${log.rowsProcessed?.toLocaleString() ?? 0} items updated`);
                    api("/sanmar/status").then(setStatus).catch(console.error);
                    if (key !== "dip") loadCatalog();
                } else {
                    toast("Update encountered an error", "error");
                }
                api("/sanmar/status").then(setStatus).catch(console.error);
            } catch { /* ignore */ }
        }, 5000);
    }

    /* ── Import ── */
    async function doImport() {
        if (!collectionId || !panelStyle) return;
        setImporting(true);
        try {
            const res = await api("/sanmar/import", {
                method: "POST",
                body: JSON.stringify({
                    style: panelStyle,
                    collectionId,
                    priceCents: Math.round(parseFloat(priceVal) * 100),
                }),
            });
            setImportDone(true);
            toast(`${res.action === "created" ? "Added" : "Updated"}: ${res.product.name}`);
        } catch (err: any) {
            toast(err.message || "Could not add product", "error");
        } finally {
            setImporting(false);
        }
    }

    /* ── Derived ── */
    const styleCards = groupToStyleCards(catalog);
    const lastSDL  = status?.lastSync["CATALOG_SDL"];
    const lastEPDD = status?.lastSync["CATALOG_EPDD"];
    const lastDIP  = status?.lastSync["INVENTORY_DIP"];
    const totalPages = Math.ceil(catTotal / 200);
    const hasFilters = q || activeCategory || activeBrand;

    const selectedColorVariants = detail?.variants.filter(v => v.colorName === selectedColor) ?? [];
    const selectedColorQty = selectedColorVariants.reduce((a, v) => a + v.inventoryQty, 0);

    /* ── Close panel on Escape ── */
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") closePanel(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    /* ─────────────────────────────────────────────────────────────────── */
    return (
        <div className="space-y-8 pb-16">

            {/* ── Hero ────────────────────────────────────────────────────── */}
            <div className="relative overflow-hidden rounded-3xl p-8 text-white"
                style={{ background: "linear-gradient(135deg, #6d28d9 0%, #4f46e5 50%, #2563eb 100%)" }}>
                {/* Decorative blobs */}
                <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/10 blur-3xl" />
                <div className="absolute -bottom-10 -left-10 w-64 h-64 rounded-full bg-white/5 blur-3xl" />

                <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <div className={`w-2 h-2 rounded-full ${status?.sftpEnabled ? "bg-emerald-400" : "bg-amber-400"} animate-pulse`} />
                            <p className="text-violet-200 text-xs font-semibold uppercase tracking-widest">SanMar Wholesale</p>
                        </div>
                        <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight">
                            Product Catalog
                        </h1>
                        <p className="text-violet-200 mt-2 text-sm">
                            Browse, customize, and add wholesale products to your store
                        </p>
                    </div>

                    {/* Live stats */}
                    <div className="flex gap-3 flex-wrap">
                        <div className="bg-white/15 backdrop-blur-sm border border-white/20 rounded-2xl px-5 py-3.5 text-center min-w-[90px]">
                            <p className="text-2xl font-black tabular-nums">
                                {status?.catalogCount != null
                                    ? status.catalogCount >= 1000
                                        ? `${(status.catalogCount / 1000).toFixed(0)}K`
                                        : status.catalogCount.toLocaleString()
                                    : "—"}
                            </p>
                            <p className="text-xs text-violet-200 mt-0.5">Products</p>
                        </div>
                        <div className="bg-white/15 backdrop-blur-sm border border-white/20 rounded-2xl px-5 py-3.5 text-center min-w-[90px]">
                            <p className="text-2xl font-black tabular-nums">{catMeta.brands.length || "—"}</p>
                            <p className="text-xs text-violet-200 mt-0.5">Brands</p>
                        </div>
                        <div className="bg-white/15 backdrop-blur-sm border border-white/20 rounded-2xl px-5 py-3.5 text-center min-w-[90px]">
                            <p className="text-2xl font-black tabular-nums">{catMeta.categories.length || "—"}</p>
                            <p className="text-xs text-violet-200 mt-0.5">Categories</p>
                        </div>
                    </div>
                </div>

                {/* Last updated bar */}
                {lastSDL?.completedAt && (
                    <div className="relative mt-6 pt-5 border-t border-white/20 flex items-center justify-between text-xs text-violet-200">
                        <span>
                            <span className="text-white font-medium">Last updated</span> · {timeAgo(lastSDL.completedAt)}
                        </span>
                        <span>Inventory auto-refreshes hourly</span>
                    </div>
                )}
            </div>

            {/* ── Search + filters ────────────────────────────────────────── */}
            <div className="space-y-4">
                {/* Search */}
                <div className="relative">
                    <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none"
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        className="w-full pl-12 pr-12 py-4 text-sm border border-slate-200 rounded-2xl outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-400/10 bg-white shadow-sm transition-all placeholder:text-slate-400"
                        placeholder="Search by name, style number, or brand…"
                        value={q}
                        onChange={e => {
                            const v = e.target.value;
                            setQ(v);
                            setCatPage(1);
                        }}
                    />
                    {q && (
                        <button
                            type="button"
                            aria-label="Clear search"
                            onClick={() => { setQ(""); setCatPage(1); }}
                            className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 transition-colors"
                        >
                            <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>

                {/* Category chips */}
                {catMeta.categories.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
                        {(["", ...catMeta.categories] as string[]).map(cat => (
                            <button
                                key={cat || "__all"}
                                onClick={() => { setCategory(cat); setCatPage(1); }}
                                className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                                    activeCategory === cat
                                        ? "bg-violet-600 text-white shadow-lg shadow-violet-200"
                                        : "bg-white text-slate-600 border border-slate-200 hover:border-violet-300 hover:text-violet-600 hover:shadow-sm"
                                }`}
                            >
                                {cat || "All Products"}
                            </button>
                        ))}
                    </div>
                )}

                {/* Brand chips */}
                {catMeta.brands.length > 0 && (
                    <div className="flex gap-2 items-center overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                        <span className="text-xs text-slate-400 shrink-0 font-medium">Brand:</span>
                        {(["", ...catMeta.brands] as string[]).map(brand => (
                            <button
                                key={brand || "__allb"}
                                onClick={() => { setBrand(brand); setCatPage(1); }}
                                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                                    activeBrand === brand
                                        ? "bg-slate-900 text-white shadow"
                                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                }`}
                            >
                                {brand || "All Brands"}
                            </button>
                        ))}
                    </div>
                )}

                {/* Results row */}
                <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-500">
                        {catLoading
                            ? "Loading…"
                            : catTotal === 0
                                ? "No products found"
                                : `${styleCards.length} styles${hasFilters ? ` · ${catTotal.toLocaleString()} variants` : ""}`}
                        {hasFilters && (
                            <button onClick={() => { setQ(""); setCategory(""); setBrand(""); setCatPage(1); }}
                                className="ml-3 text-violet-500 hover:text-violet-700 font-medium text-xs underline underline-offset-2">
                                Clear filters
                            </button>
                        )}
                    </p>

                    {/* View toggle */}
                    <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                        <button onClick={() => setView("grid")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${view === "grid" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M1 2.5A1.5 1.5 0 012.5 1h3A1.5 1.5 0 017 2.5v3A1.5 1.5 0 015.5 7h-3A1.5 1.5 0 011 5.5v-3zm8 0A1.5 1.5 0 0110.5 1h3A1.5 1.5 0 0115 2.5v3A1.5 1.5 0 0113.5 7h-3A1.5 1.5 0 019 5.5v-3zm-8 8A1.5 1.5 0 012.5 9h3A1.5 1.5 0 017 10.5v3A1.5 1.5 0 015.5 15h-3A1.5 1.5 0 011 13.5v-3zm8 0A1.5 1.5 0 0110.5 9h3A1.5 1.5 0 0115 10.5v3A1.5 1.5 0 0113.5 15h-3A1.5 1.5 0 019 13.5v-3z"/>
                            </svg>
                            Grid
                        </button>
                        <button onClick={() => setView("list")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${view === "list" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                                <path fillRule="evenodd" d="M2.5 12a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5zm0-4a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5zm0-4a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5z"/>
                            </svg>
                            List
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Product grid / list ──────────────────────────────────────── */}
            {catLoading ? (
                <div className={view === "grid"
                    ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
                    : "space-y-2"}>
                    {Array.from({ length: 10 }).map((_, i) => (
                        <div key={i} className={`animate-pulse bg-slate-100 rounded-3xl ${view === "grid" ? "aspect-[4/5]" : "h-20"}`} />
                    ))}
                </div>
            ) : styleCards.length === 0 ? (
                <div className="flex flex-col items-center py-32 gap-4">
                    <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center">
                        <svg className="w-10 h-10 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <div className="text-center">
                        <p className="font-bold text-slate-600 text-lg">
                            {catTotal === 0 ? "Your catalog is empty" : "No results found"}
                        </p>
                        <p className="text-sm text-slate-400 mt-1">
                            {catTotal === 0
                                ? "Use Catalog Health below to load products"
                                : "Try adjusting your search or filters"}
                        </p>
                    </div>
                    {hasFilters && (
                        <button onClick={() => { setQ(""); setCategory(""); setBrand(""); setCatPage(1); }}
                            className="px-4 py-2 text-sm font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-xl transition-colors">
                            Clear All Filters
                        </button>
                    )}
                </div>
            ) : view === "grid" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {styleCards.map((card, i) => (
                        <ProductCard key={card.style} card={card} index={i} onClick={() => openProduct(card.style)} />
                    ))}
                </div>
            ) : (
                <div className="bg-white rounded-3xl ring-1 ring-black/5 shadow-sm overflow-hidden">
                    {styleCards.map((card, i) => (
                        <ListRow key={card.style} card={card} index={i} onClick={() => openProduct(card.style)} />
                    ))}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-2">
                    <button disabled={catPage <= 1} onClick={() => setCatPage(p => p - 1)}
                        className="px-5 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:shadow-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                        ← Previous
                    </button>
                    <span className="text-sm text-slate-500 tabular-nums">
                        Page {catPage} of {totalPages}
                    </span>
                    <button disabled={catPage >= totalPages} onClick={() => setCatPage(p => p + 1)}
                        className="px-5 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:shadow-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                        Next →
                    </button>
                </div>
            )}

            {/* ── Catalog Health (collapsible) ─────────────────────────────── */}
            <div className="border-t border-slate-100 pt-6">
                <button
                    onClick={() => setShowHealth(h => !h)}
                    className="flex items-center gap-3 text-slate-500 hover:text-slate-800 transition-colors group"
                >
                    <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full transition-colors ${
                            lastSDL?.status === "SUCCESS" ? "bg-emerald-400" : "bg-amber-400 animate-pulse"
                        }`} />
                        <span className="text-sm font-semibold">Catalog Health</span>
                    </div>
                    {lastSDL?.completedAt && (
                        <span className="text-xs text-slate-400">Updated {timeAgo(lastSDL.completedAt)}</span>
                    )}
                    <svg className={`w-4 h-4 ml-auto transition-transform duration-200 ${showHealth ? "rotate-180" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                </button>

                <AnimatePresence initial={false}>
                    {showHealth && (
                        <motion.div
                            key="health"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: "easeInOut" }}
                            className="overflow-hidden"
                        >
                            <div className="pt-5 grid sm:grid-cols-3 gap-4">
                                <HealthCard
                                    title="Product Catalog"
                                    sub="Names, images, prices & descriptions"
                                    log={lastSDL}
                                    syncKey="sdl"
                                    syncing={!!syncing["sdl"]}
                                    onSync={() => triggerSync("sdl", "/sanmar/sync/catalog-sdl")}
                                />
                                <HealthCard
                                    title="Extended Data"
                                    sub="Bulk inventory, extra images & categories"
                                    log={lastEPDD}
                                    syncKey="epdd"
                                    syncing={!!syncing["epdd"]}
                                    onSync={() => triggerSync("epdd", "/sanmar/sync/catalog-epdd")}
                                />
                                <HealthCard
                                    title="Live Inventory"
                                    sub="Real-time stock levels · auto-updates hourly"
                                    log={lastDIP}
                                    syncKey="dip"
                                    syncing={!!syncing["dip"]}
                                    onSync={() => triggerSync("dip", "/sanmar/sync/inventory-dip")}
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ── Product Detail Side Panel ────────────────────────────────── */}
            <AnimatePresence>
                {panelStyle && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            key="backdrop"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
                            onClick={closePanel}
                        />

                        {/* Panel */}
                        <motion.div
                            key="panel"
                            initial={{ x: "100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "100%" }}
                            transition={{ type: "spring", damping: 28, stiffness: 280, mass: 0.9 }}
                            className="fixed right-0 top-0 h-full w-full max-w-[480px] bg-white z-50 shadow-2xl shadow-black/20 flex flex-col"
                        >
                            {/* Close */}
                            <button
                                type="button"
                                aria-label="Close panel"
                                onClick={closePanel}
                                className="absolute top-4 right-4 z-10 w-8 h-8 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center shadow hover:bg-slate-100 transition-colors"
                            >
                                <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>

                            {detailLoading ? (
                                <div className="flex-1 flex items-center justify-center">
                                    <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : detail ? (
                                <div className="flex-1 overflow-y-auto">
                                    {/* Hero image */}
                                    <div className="relative bg-gradient-to-br from-slate-50 to-slate-100 h-72 overflow-hidden flex-shrink-0">
                                        {(() => {
                                            const v = detail.variants.find(v => v.colorName === selectedColor);
                                            const src = v?.productImage ?? detail.variants[0]?.productImage;
                                            return src ? (
                                                <img src={src} alt={detail.title ?? panelStyle!}
                                                    className="w-full h-full object-contain" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-slate-200">
                                                    <svg className="w-20 h-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={0.75}
                                                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                    </svg>
                                                </div>
                                            );
                                        })()}

                                        {/* Style pill */}
                                        <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm text-white text-xs font-mono font-bold px-3 py-1.5 rounded-full">
                                            {panelStyle}
                                        </div>

                                        {/* Inventory indicator */}
                                        <div className="absolute bottom-3 right-3">
                                            {(() => {
                                                const totalQty = detail.variants.reduce((a, v) => a + v.inventoryQty, 0);
                                                return (
                                                    <div className={`text-xs font-bold px-3 py-1.5 rounded-full backdrop-blur-sm ${
                                                        totalQty > 500 ? "bg-emerald-500/90 text-white" :
                                                        totalQty > 0   ? "bg-amber-500/90 text-white" :
                                                                          "bg-red-500/90 text-white"
                                                    }`}>
                                                        {totalQty > 0 ? `${totalQty.toLocaleString()} in stock` : "Out of stock"}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>

                                    <div className="p-6 space-y-6">
                                        {/* Title */}
                                        <div>
                                            {detail.brand && (
                                                <p className="text-xs font-bold text-violet-500 uppercase tracking-widest mb-1">{detail.brand}</p>
                                            )}
                                            <h2 className="text-xl font-black text-slate-900 leading-tight">
                                                {detail.title ?? panelStyle}
                                            </h2>
                                            {detail.category && (
                                                <p className="text-xs text-slate-400 mt-1">
                                                    {detail.category}{detail.subcategory ? ` · ${detail.subcategory}` : ""}
                                                </p>
                                            )}
                                            <p className="text-2xl font-black text-slate-900 mt-3">
                                                {detail.priceCents > 0 ? `From ${fmt(detail.priceCents)}` : "Price on request"}
                                                <span className="text-sm font-normal text-slate-400 ml-2">wholesale</span>
                                            </p>
                                        </div>

                                        {/* Description */}
                                        {detail.description && (
                                            <p className="text-sm text-slate-600 leading-relaxed">{detail.description}</p>
                                        )}

                                        {/* Colors */}
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                                    Colors <span className="font-normal text-slate-400">({detail.colors.length})</span>
                                                </p>
                                                {selectedColor && (
                                                    <p className="text-xs text-slate-500">
                                                        <span className="font-medium">{selectedColor}</span>
                                                        {selectedColorQty > 0 && (
                                                            <span className="ml-1 text-emerald-500">· {selectedColorQty.toLocaleString()} in stock</span>
                                                        )}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {detail.colors.map(color => {
                                                    const qty = detail.variants
                                                        .filter(v => v.colorName === color)
                                                        .reduce((a, v) => a + v.inventoryQty, 0);
                                                    return (
                                                        <Swatch
                                                            key={color}
                                                            color={color}
                                                            selected={selectedColor === color}
                                                            outOfStock={qty === 0}
                                                            onClick={() => setColor(color)}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Sizes */}
                                        <div>
                                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                                                Sizes Available <span className="font-normal text-slate-400">({detail.sizes.length})</span>
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                {detail.sizes.map(size => {
                                                    const qty = detail.variants
                                                        .filter(v => v.sizeName === size && (!selectedColor || v.colorName === selectedColor))
                                                        .reduce((a, v) => a + v.inventoryQty, 0);
                                                    return (
                                                        <span key={size}
                                                            className={`px-3 py-1.5 text-xs font-bold rounded-xl border-2 transition-colors ${
                                                                qty > 0
                                                                    ? "border-slate-200 text-slate-700 bg-white"
                                                                    : "border-slate-100 text-slate-300 bg-slate-50"
                                                            }`}>
                                                            {size}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Inventory bar */}
                                        {(() => {
                                            const totalQty = detail.variants.reduce((a, v) => a + v.inventoryQty, 0);
                                            const pct = Math.min(100, (totalQty / 5000) * 100);
                                            return totalQty > 0 ? (
                                                <div className="bg-slate-50 rounded-2xl p-4">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <p className="text-xs font-semibold text-slate-600">Combined Stock Across All Variants</p>
                                                        <p className="text-sm font-black text-slate-900 tabular-nums">{totalQty.toLocaleString()}</p>
                                                    </div>
                                                    <div className="bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                                        <div
                                                            className="h-full rounded-full"
                                                            style={{
                                                                width: `${pct}%`,
                                                                background: "linear-gradient(90deg, #7c3aed, #4f46e5)"
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            ) : null;
                                        })()}

                                        {/* ── Add to Store ── */}
                                        <div className="border-t border-slate-100 pt-5 space-y-4">
                                            <p className="font-bold text-slate-900">Add to Your Store</p>

                                            {importDone ? (
                                                <motion.div
                                                    initial={{ scale: 0.9, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    className="flex flex-col items-center gap-3 py-8 text-center"
                                                >
                                                    <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                                                        <svg className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-slate-900">Added to your store!</p>
                                                        <p className="text-sm text-slate-500 mt-0.5">{detail.title ?? panelStyle} is now in your products</p>
                                                    </div>
                                                    <button
                                                        onClick={() => setImportDone(false)}
                                                        className="text-sm text-violet-600 hover:text-violet-800 font-medium underline underline-offset-2"
                                                    >
                                                        Add to another collection
                                                    </button>
                                                </motion.div>
                                            ) : (
                                                <>
                                                    <div>
                                                        <label className="text-xs text-slate-500 font-semibold mb-1.5 block">Collection</label>
                                                        <select
                                                            aria-label="Choose a collection"
                                                            value={collectionId}
                                                            onChange={e => setCollectionId(e.target.value)}
                                                            className="w-full px-3.5 py-3 text-sm border border-slate-200 rounded-xl outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 bg-white transition-all"
                                                        >
                                                            <option value="">Choose a collection…</option>
                                                            {collections.map(c => (
                                                                <option key={c.id} value={c.id}>{c.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="text-xs text-slate-500 font-semibold mb-1.5 block">Your Selling Price</label>
                                                        <div className="relative">
                                                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-sm pointer-events-none">$</span>
                                                            <input
                                                                type="number" step="0.01" min="0"
                                                                value={priceVal}
                                                                onChange={e => setPriceVal(e.target.value)}
                                                                className="w-full pl-8 pr-4 py-3 text-sm border border-slate-200 rounded-xl outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 transition-all"
                                                                placeholder="0.00"
                                                            />
                                                        </div>
                                                        {detail.priceCents > 0 && (
                                                            <p className="text-xs text-slate-400 mt-1.5">
                                                                Wholesale cost: {fmt(detail.priceCents)}
                                                                {priceVal && parseFloat(priceVal) > detail.priceCents / 100 && (
                                                                    <span className="ml-2 text-emerald-500 font-medium">
                                                                        +{fmt((parseFloat(priceVal) * 100) - detail.priceCents)} margin
                                                                    </span>
                                                                )}
                                                            </p>
                                                        )}
                                                    </div>

                                                    <button
                                                        disabled={!collectionId || importing || !priceVal}
                                                        onClick={doImport}
                                                        className="w-full py-3.5 text-sm font-black rounded-xl text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
                                                        style={{
                                                            background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 50%, #2563eb 100%)",
                                                            boxShadow: "0 4px 20px rgba(109, 40, 217, 0.3)"
                                                        }}
                                                    >
                                                        {importing ? (
                                                            <span className="flex items-center justify-center gap-2">
                                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                                Adding…
                                                            </span>
                                                        ) : "Add to Store →"}
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}

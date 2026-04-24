"use client";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
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

type CatMeta = {
    categories: string[];
    subcategories: { category: string; subcategory: string }[];
    brands: string[];
    colors: string[];
};

type Collection = { id: string; name: string };

type Filters = {
    q: string;
    category: string;       // full semicolon path e.g. "Activewear;Bottoms"
    subcategory: string;    // separate DB subcategory field
    brand: string;
    colorName: string;
    inStock: boolean;
    size: string;
    priceRange: string;
};

/** A node in the parsed category tree */
type CatTreeNode = {
    name: string;           // display name (last segment)
    path: string;           // full semicolon path
    children: CatTreeNode[];
};

/* ─── Category Tree Helpers ───────────────────────────────────────────────── */

function buildCategoryTree(categories: string[]): CatTreeNode[] {
    const nodeMap = new Map<string, CatTreeNode>();
    const roots: CatTreeNode[] = [];

    // Sort shallower paths before deeper so parents always exist when children are added
    const sorted = [...categories]
        .filter(Boolean)
        .sort((a, b) => {
            const da = a.split(";").length;
            const db = b.split(";").length;
            return da !== db ? da - db : a.localeCompare(b);
        });

    for (const cat of sorted) {
        const parts = cat.split(";").map(s => s.trim()).filter(Boolean);
        for (let i = 0; i < parts.length; i++) {
            const path = parts.slice(0, i + 1).join(";");
            if (!nodeMap.has(path)) {
                const node: CatTreeNode = { name: parts[i], path, children: [] };
                nodeMap.set(path, node);
                if (i === 0) {
                    roots.push(node);
                } else {
                    const parentPath = parts.slice(0, i).join(";");
                    nodeMap.get(parentPath)?.children.push(node);
                }
            }
        }
    }

    return roots;
}

function findCatNode(nodes: CatTreeNode[], path: string): CatTreeNode | null {
    for (const node of nodes) {
        if (node.path === path) return node;
        if (path.startsWith(node.path + ";")) {
            const found = findCatNode(node.children, path);
            if (found) return found;
        }
    }
    return null;
}

function formatCatPath(path: string): string {
    return path.split(";").join(" › ");
}

/* ─── Constants ───────────────────────────────────────────────────────────── */

const COLOR_FAMILIES = [
    { label: "Black",  hex: "#111827", keywords: ["black"] },
    { label: "White",  hex: "#f3f4f6", keywords: ["white", "natural", "ivory", "cream"] },
    { label: "Gray",   hex: "#9ca3af", keywords: ["grey", "gray", "charcoal", "heather", "ash", "silver", "storm", "sport grey"] },
    { label: "Navy",   hex: "#1e3a5f", keywords: ["navy"] },
    { label: "Royal",  hex: "#1d4ed8", keywords: ["royal", "cobalt"] },
    { label: "Blue",   hex: "#60a5fa", keywords: ["blue", "columbia", "carolina", "sky", "powder", "baby blue", "light blue"] },
    { label: "Denim",  hex: "#4b6cb7", keywords: ["denim"] },
    { label: "Red",    hex: "#dc2626", keywords: ["red", "cardinal", "garnet"] },
    { label: "Maroon", hex: "#881337", keywords: ["maroon", "wine", "burgundy"] },
    { label: "Green",  hex: "#16a34a", keywords: ["green", "forest", "kelly", "lime"] },
    { label: "Olive",  hex: "#4a5c2a", keywords: ["olive", "military"] },
    { label: "Yellow", hex: "#eab308", keywords: ["yellow", "gold", "athletic gold", "vegas gold"] },
    { label: "Orange", hex: "#f97316", keywords: ["orange", "tangerine"] },
    { label: "Purple", hex: "#7c3aed", keywords: ["purple", "violet", "lavender"] },
    { label: "Pink",   hex: "#ec4899", keywords: ["pink", "azalea"] },
    { label: "Brown",  hex: "#92400e", keywords: ["brown", "coffee", "chocolate"] },
    { label: "Tan",    hex: "#d4a96a", keywords: ["tan", "khaki", "sand", "desert"] },
    { label: "Teal",   hex: "#0d9488", keywords: ["teal", "aqua"] },
    { label: "Camo",   hex: "#4a5e2a", keywords: ["camo", "camouflage"] },
];

const PRICE_RANGES = [
    { label: "$0–$10",   key: "0-10"   },
    { label: "$10–$20",  key: "10-20"  },
    { label: "$20–$30",  key: "20-30"  },
    { label: "$30–$40",  key: "30-40"  },
    { label: "$40–$50",  key: "40-50"  },
    { label: "$50–$75",  key: "50-75"  },
    { label: "$75–$100", key: "75-100" },
    { label: "$100+",    key: "100+"   },
];

const SIZE_ORDER = ["XS","S","M","L","XL","2XL","3XL","4XL","5XL","6XL","YXS","YS","YM","YL","YXL","OSFA"];

const EMPTY_FILTERS: Filters = {
    q: "", category: "", subcategory: "", brand: "",
    colorName: "", inStock: false, size: "", priceRange: "",
};

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

const fmt = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

function timeAgo(d: string): string {
    const diff = Date.now() - new Date(d).getTime();
    if (diff < 60_000)     return "just now";
    if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
}

const isUrl = (s?: string | null) => !!s && (s.startsWith("http://") || s.startsWith("https://"));

function groupToStyleCards(rows: CatalogRow[]): StyleCard[] {
    const map = new Map<string, StyleCard>();
    for (const row of rows) {
        if (!map.has(row.style)) {
            map.set(row.style, {
                style: row.style, title: row.title, brand: row.brand,
                category: row.category, priceCents: row.priceCents,
                colorCount: 0, sizeCount: 0, totalQty: 0,
                productImage: isUrl(row.productImage) ? row.productImage! : undefined,
                colors: [], sizes: [],
            });
        }
        const card = map.get(row.style)!;
        if (row.colorName && !card.colors.includes(row.colorName)) card.colors.push(row.colorName);
        if (row.sizeName  && !card.sizes.includes(row.sizeName))   card.sizes.push(row.sizeName);
        card.totalQty += row.inventoryQty;
        if (row.priceCents > 0 && (card.priceCents === 0 || row.priceCents < card.priceCents))
            card.priceCents = row.priceCents;
        if (!card.productImage && isUrl(row.productImage)) card.productImage = row.productImage!;
    }
    return Array.from(map.values()).map(c => ({ ...c, colorCount: c.colors.length, sizeCount: c.sizes.length }));
}

function colorHex(name: string): string {
    const n = name.toLowerCase();
    if (n.includes("black"))                                       return "#111827";
    if (n.includes("white") || n.includes("natural") || n.includes("ivory") || n.includes("cream")) return "#f9fafb";
    if (n.includes("navy") || n.includes("dark blue"))             return "#1e3a5f";
    if (n.includes("royal") || n.includes("cobalt"))               return "#1d4ed8";
    if (n.includes("carolina") || n.includes("columbia") || n.includes("sky blue")) return "#7dd3fc";
    if (n.includes("light blue") || n.includes("baby blue") || n.includes("powder")) return "#bfdbfe";
    if (n.includes("blue"))                                        return "#2563eb";
    if (n.includes("denim"))                                       return "#4b6cb7";
    if (n.includes("cardinal") || n.includes("garnet"))            return "#9b1c1c";
    if (n.includes("maroon") || n.includes("wine") || n.includes("burgundy")) return "#7f1d1d";
    if (n.includes("true red") || n.includes("bright red"))        return "#ef4444";
    if (n.includes("red"))                                         return "#dc2626";
    if (n.includes("forest"))                                      return "#14532d";
    if (n.includes("kelly") || n.includes("lime"))                 return "#16a34a";
    if (n.includes("military") || n.includes("olive"))             return "#4d5e30";
    if (n.includes("green"))                                       return "#15803d";
    if (n.includes("athletic gold") || n.includes("vegas gold"))   return "#ca8a04";
    if (n.includes("yellow") || n.includes("gold"))                return "#eab308";
    if (n.includes("orange") || n.includes("tangerine"))           return "#f97316";
    if (n.includes("purple") || n.includes("violet"))              return "#7c3aed";
    if (n.includes("lavender"))                                    return "#c4b5fd";
    if (n.includes("hot pink") || n.includes("neon pink"))         return "#f472b6";
    if (n.includes("pink") || n.includes("azalea"))                return "#ec4899";
    if (n.includes("heather"))                                     return "#9ca3af";
    if (n.includes("sport grey") || n.includes("ash") || n.includes("silver")) return "#d1d5db";
    if (n.includes("charcoal") || n.includes("dark grey") || n.includes("dark gray")) return "#374151";
    if (n.includes("grey") || n.includes("gray"))                  return "#6b7280";
    if (n.includes("tan") || n.includes("khaki") || n.includes("sand") || n.includes("desert")) return "#d4a96a";
    if (n.includes("brown") || n.includes("coffee") || n.includes("chocolate")) return "#78350f";
    if (n.includes("teal") || n.includes("aqua"))                  return "#0d9488";
    if (n.includes("storm"))                                       return "#64748b";
    if (n.includes("camo"))                                        return "#4a5e2a";
    return "#cbd5e1";
}

/* ─── FacetSection ────────────────────────────────────────────────────────── */

function FacetSection({ title, expanded, onToggle, children }: {
    title: string; expanded: boolean; onToggle: () => void; children: React.ReactNode;
}) {
    return (
        <div className="border-b border-slate-100 last:border-0">
            <button type="button" onClick={onToggle}
                className="flex items-center justify-between w-full py-3 text-sm font-bold text-slate-700 hover:text-slate-900 transition-colors">
                {title}
                <svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15, ease: "easeInOut" }}
                        className="overflow-hidden">
                        <div className="pb-3">{children}</div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/* ─── Product Card ────────────────────────────────────────────────────────── */

function ProductCard({ card, onClick, index }: { card: StyleCard; onClick: () => void; index: number }) {
    const [imgErr, setImgErr] = useState(false);
    const hasImg = card.productImage && !imgErr;
    const stockLevel = card.totalQty > 500 ? "high" : card.totalQty > 0 ? "low" : "none";

    return (
        <motion.button
            type="button"
            onClick={onClick}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.025, 0.25), duration: 0.2, ease: "easeOut" }}
            className="text-left bg-white rounded-3xl ring-1 ring-black/5 shadow-sm hover:shadow-xl hover:ring-violet-200/80 hover:-translate-y-1 transition-all duration-200 group overflow-hidden"
            style={{ isolation: "isolate" }}
        >
            <div className="relative bg-gradient-to-br from-slate-50 to-slate-100 aspect-[4/5] overflow-hidden">
                {hasImg ? (
                    <img src={card.productImage} alt={card.title ?? card.style}
                        onError={() => setImgErr(true)}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-200">
                        <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="text-[10px] font-mono text-slate-300">{card.style}</span>
                    </div>
                )}
                <div className={`absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full ring-2 ring-white shadow ${
                    stockLevel === "high" ? "bg-emerald-400" : stockLevel === "low" ? "bg-amber-400" : "bg-red-400"
                }`} />
                <div className="absolute bottom-0 left-0 right-0 px-3 pb-3 pt-8 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <span className="text-xs font-mono font-bold text-white/90">{card.style}</span>
                </div>
            </div>
            <div className="p-3.5">
                <p className="font-bold text-slate-900 text-sm leading-snug line-clamp-1">{card.title ?? card.style}</p>
                {card.brand && <p className="text-xs text-slate-400 mt-0.5 truncate">{card.brand}</p>}
                <div className="mt-2.5 flex items-end justify-between gap-2">
                    <div>
                        <p className="text-base font-black text-slate-900">
                            {card.priceCents > 0 ? fmt(card.priceCents) : "—"}
                        </p>
                        <p className="text-xs text-slate-400">{card.colorCount} color{card.colorCount !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="flex -space-x-1.5">
                        {card.colors.slice(0, 5).map(c => (
                            <div key={c} className="w-4 h-4 rounded-full ring-[1.5px] ring-white shrink-0 shadow-sm"
                                style={{ backgroundColor: colorHex(c) }} />
                        ))}
                        {card.colorCount > 5 && (
                            <div className="w-4 h-4 rounded-full bg-slate-100 ring-[1.5px] ring-white flex items-center justify-center shrink-0 shadow-sm">
                                <span className="text-[8px] font-black text-slate-500">+{card.colorCount - 5}</span>
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
    const hasImg = card.productImage && !imgErr;
    return (
        <motion.button
            type="button"
            onClick={onClick}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(index * 0.015, 0.2), duration: 0.18 }}
            className="w-full flex items-center gap-4 px-5 py-4 hover:bg-violet-50/40 transition-colors border-b border-slate-50 last:border-0 text-left group"
        >
            <div className="w-14 h-14 rounded-2xl bg-slate-50 overflow-hidden shrink-0 ring-1 ring-black/5">
                {hasImg ? (
                    <img src={card.productImage} alt="" onError={() => setImgErr(true)}
                        className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </div>
                )}
            </div>
            <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 text-sm truncate">{card.title ?? card.style}</p>
                <p className="text-xs text-slate-400 mt-0.5">{[card.brand, card.style].filter(Boolean).join(" · ")}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
                    {card.colors.slice(0, 10).map(c => (
                        <div key={c} className="w-3.5 h-3.5 rounded-full ring-1 ring-white shadow-sm shrink-0"
                            style={{ backgroundColor: colorHex(c) }} />
                    ))}
                    {card.colorCount > 10 && <span className="text-[10px] text-slate-400">+{card.colorCount - 10}</span>}
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

function HealthCard({ title, sub, log, syncing, onSync }: {
    title: string; sub: string; log?: SyncLog; syncing: boolean; onSync: () => void;
}) {
    const ok = log?.status === "SUCCESS";
    const running = syncing || log?.status === "RUNNING";
    return (
        <div className="bg-white rounded-2xl ring-1 ring-black/5 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="font-bold text-slate-800 text-sm">{title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
                </div>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${running ? "bg-amber-50" : ok ? "bg-emerald-50" : "bg-slate-100"}`}>
                    {running ? (
                        <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                    ) : ok ? (
                        <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    ) : (
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    )}
                </div>
            </div>
            {log ? (
                <p className="text-xs text-slate-500">
                    {log.rowsProcessed != null && <span className="font-medium text-slate-700">{log.rowsProcessed.toLocaleString()} items · </span>}
                    {timeAgo(log.startedAt)}
                </p>
            ) : <p className="text-xs text-slate-400">Never synced</p>}
            <button type="button" onClick={onSync} disabled={running}
                className="w-full py-2.5 text-xs font-bold rounded-xl bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {running ? "Updating…" : "Refresh Now"}
            </button>
        </div>
    );
}

/* ─── Filter Chip ─────────────────────────────────────────────────────────── */

function FilterChip({ label, color, onRemove }: { label: string; color?: string; onRemove: () => void }) {
    return (
        <span className="flex items-center gap-1.5 bg-violet-100 text-violet-700 text-xs font-semibold px-3 py-1.5 rounded-full">
            {color && <div className="w-3 h-3 rounded-full ring-1 ring-white/60 shrink-0" style={{ backgroundColor: color }} />}
            {label}
            <button type="button" aria-label={`Remove ${label} filter`} onClick={onRemove}
                className="hover:text-violet-900 ml-0.5">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </span>
    );
}

/* ─── Main Page ───────────────────────────────────────────────────────────── */

export default function SanMarPage() {
    const { toast } = useToast();

    const [status, setStatus]     = useState<Status | null>(null);
    const [catMeta, setCatMeta]   = useState<CatMeta>({ categories: [], subcategories: [], brands: [], colors: [] });
    const [catalog, setCatalog]   = useState<CatalogRow[]>([]);
    const [catTotal, setCatTotal] = useState(0);
    const [catPage, setCatPage]   = useState(1);
    const [catLoading, setCatLoading] = useState(false);
    const [view, setView]         = useState<"grid" | "list">("grid");
    const [showHealth, setShowHealth] = useState(false);

    const [filters, setFilters]   = useState<Filters>(EMPTY_FILTERS);
    const searchTimer             = useRef<ReturnType<typeof setTimeout>>();

    // Hover nav state
    const [hoveredCat, setHoveredCat] = useState<string | null>(null);
    const hideTimer = useRef<ReturnType<typeof setTimeout>>();

    // Facet expand state
    const [expandedFacets, setExpandedFacets] = useState<Record<string, boolean>>({
        category: true, brand: false, subcategory: false,
        color: false, size: false, price: false,
    });

    // Panel state
    const [panelStyle, setPanelStyle]       = useState<string | null>(null);
    const [detail, setDetail]               = useState<StyleDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [selectedColor, setColor]         = useState<string | null>(null);

    // Import state
    const [collections, setCollections]   = useState<Collection[]>([]);
    const [collectionId, setCollectionId] = useState("");
    const [priceVal, setPriceVal]         = useState("");
    const [importing, setImporting]       = useState(false);
    const [importDone, setImportDone]     = useState(false);

    // Sync state
    const [syncing, setSyncing] = useState<Record<string, boolean>>({});

    /* ── Boot ── */
    useEffect(() => {
        api("/sanmar/status").then(setStatus).catch(console.error);
        api("/sanmar/catalog/meta").then(setCatMeta).catch(() => {});
        api("/collections").then((c: any) => setCollections(Array.isArray(c) ? c : c?.data ?? [])).catch(console.error);
    }, []);

    /* ── Derived category tree ── */
    const categoryTree = useMemo(() => buildCategoryTree(catMeta.categories), [catMeta.categories]);

    // The root node name of the active selection (first segment of path)
    const activeRootName = filters.category ? filters.category.split(";")[0] : null;

    // The selected node in the tree (for showing its children in facets)
    const selectedNode = useMemo(() =>
        filters.category ? findCatNode(categoryTree, filters.category) : null,
        [categoryTree, filters.category]
    );

    // The hovered root node (for the flyout)
    const hoveredNode = useMemo(() =>
        hoveredCat ? findCatNode(categoryTree, hoveredCat) : null,
        [categoryTree, hoveredCat]
    );

    // Subcategory field values relevant to the current category selection
    const relevantSubcats = useMemo(() => {
        if (!filters.category) return [];
        const prefix = filters.category;
        const vals = catMeta.subcategories
            .filter(s => s.category === prefix || s.category.startsWith(prefix + ";"))
            .map(s => s.subcategory)
            .filter(Boolean);
        return [...new Set(vals)].sort() as string[];
    }, [catMeta.subcategories, filters.category]);

    /* ── Load catalog ── */
    const loadCatalog = useCallback(() => {
        setCatLoading(true);
        const p = new URLSearchParams({ limit: "200", page: String(catPage) });
        if (filters.q)           p.set("q",           filters.q);
        if (filters.category)    p.set("category",    filters.category);
        if (filters.subcategory) p.set("subcategory", filters.subcategory);
        if (filters.brand)       p.set("brand",       filters.brand);
        if (filters.inStock)     p.set("inStock",     "true");
        if (filters.size)        p.set("size",        filters.size);
        if (filters.priceRange) {
            if (filters.priceRange.endsWith("+")) {
                p.set("priceMin", String(parseInt(filters.priceRange) * 100));
            } else {
                const [lo, hi] = filters.priceRange.split("-");
                if (lo) p.set("priceMin", String(parseInt(lo) * 100));
                if (hi) p.set("priceMax", String(parseInt(hi) * 100));
            }
        }
        if (filters.colorName) {
            const family = COLOR_FAMILIES.find(f => f.label === filters.colorName);
            p.set("colorName", family ? family.keywords[0] : filters.colorName);
        }
        api(`/sanmar/catalog?${p}`)
            .then((r: any) => { setCatalog(r.data ?? []); setCatTotal(r.total ?? 0); })
            .catch(console.error)
            .finally(() => setCatLoading(false));
    }, [filters, catPage]);

    useEffect(() => { loadCatalog(); }, [loadCatalog]);

    function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
        setFilters(f => ({ ...f, [key]: value }));
        if (key !== "q") setCatPage(1);
    }

    function clearAll() {
        setFilters(EMPTY_FILTERS);
        setCatPage(1);
        setHoveredCat(null);
    }

    function toggleFacet(key: string) {
        setExpandedFacets(f => ({ ...f, [key]: !f[key] }));
    }

    /* Navigate to a category path — clears subcategory field filter */
    function selectCategoryPath(path: string) {
        setFilters(f => ({ ...f, category: path, subcategory: "" }));
        setCatPage(1);
        setHoveredCat(null);
    }

    /* Hover handlers with delay so mouse can travel from nav to flyout */
    function handleNavMouseEnter(path: string) {
        clearTimeout(hideTimer.current);
        setHoveredCat(path);
    }
    function handleNavMouseLeave() {
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setHoveredCat(null), 150);
    }
    function handleFlyoutMouseEnter() {
        clearTimeout(hideTimer.current);
    }

    /* ── Derived ── */
    const availableSizes = useMemo(() => {
        const seen = new Set<string>();
        catalog.forEach(r => { if (r.sizeName) seen.add(r.sizeName); });
        return Array.from(seen).sort((a, b) => {
            const ai = SIZE_ORDER.indexOf(a), bi = SIZE_ORDER.indexOf(b);
            if (ai >= 0 && bi >= 0) return ai - bi;
            if (ai >= 0) return -1;
            if (bi >= 0) return 1;
            return a.localeCompare(b);
        });
    }, [catalog]);

    const activeFilterCount = [
        filters.category, filters.subcategory, filters.brand, filters.colorName,
        filters.inStock ? "y" : "", filters.size, filters.priceRange,
    ].filter(Boolean).length;

    const activeFamilyHex = filters.colorName
        ? COLOR_FAMILIES.find(f => f.label === filters.colorName)?.hex
        : undefined;

    const styleCards = groupToStyleCards(catalog);
    const totalPages = Math.ceil(catTotal / 200);
    const lastSDL    = status?.lastSync["CATALOG_SDL"];
    const lastEPDD   = status?.lastSync["CATALOG_EPDD"];
    const lastDIP    = status?.lastSync["INVENTORY_DIP"];

    /* ── Panel ── */
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
        } catch { /* ignore */ } finally { setDetailLoading(false); }
    }

    function closePanel() { setPanelStyle(null); setDetail(null); setImportDone(false); }

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") closePanel(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, []);

    /* ── Sync ── */
    async function triggerSync(key: string, endpoint: string) {
        setSyncing(s => ({ ...s, [key]: true }));
        try {
            const r = await api(endpoint, { method: "POST" });
            toast(r.message ?? "Update started — check back in a few minutes");
            if (r.logId) pollLog(r.logId, key);
        } catch (err: any) {
            toast(err.message || "Failed to start", "error");
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
                api("/sanmar/status").then(setStatus).catch(console.error);
                if (log.status === "SUCCESS") {
                    toast(`Done! ${log.rowsProcessed?.toLocaleString() ?? 0} items updated`);
                    if (key !== "dip") { loadCatalog(); api("/sanmar/catalog/meta").then(setCatMeta).catch(() => {}); }
                } else {
                    toast("Update encountered an error", "error");
                }
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
                body: JSON.stringify({ style: panelStyle, collectionId, priceCents: Math.round(parseFloat(priceVal) * 100) }),
            });
            setImportDone(true);
            toast(`${res.action === "created" ? "Added" : "Updated"}: ${res.product.name}`);
        } catch (err: any) {
            toast(err.message || "Could not add product", "error");
        } finally { setImporting(false); }
    }

    /* ──────────────────────────────────────────────────────────────────────── */

    return (
        <div className="space-y-5 pb-16">

            {/* ── Hero ────────────────────────────────────────────────────── */}
            <div className="relative overflow-hidden rounded-3xl p-7 text-white"
                style={{ background: "linear-gradient(135deg,#6d28d9 0%,#4f46e5 50%,#2563eb 100%)" }}>
                <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-white/10 blur-3xl pointer-events-none" />
                <div className="absolute -bottom-12 -left-12 w-72 h-72 rounded-full bg-white/5 blur-3xl pointer-events-none" />
                <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                    <div>
                        <div className="flex items-center gap-2 mb-1.5">
                            <div className={`w-2 h-2 rounded-full ${status?.sftpEnabled ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                            <p className="text-violet-200 text-xs font-bold uppercase tracking-widest">SanMar Wholesale</p>
                        </div>
                        <h1 className="text-3xl font-black tracking-tight">Product Catalog</h1>
                        <p className="text-violet-200 text-sm mt-1">Browse wholesale products and add them to your store</p>
                    </div>
                    <div className="flex gap-3 flex-wrap">
                        {[
                            { label: "Products",   val: status?.catalogCount != null ? (status.catalogCount >= 1000 ? `${(status.catalogCount / 1000).toFixed(0)}K` : `${status.catalogCount}`) : "—" },
                            { label: "Brands",     val: catMeta.brands.length     || "—" },
                            { label: "Categories", val: categoryTree.length       || "—" },
                        ].map(s => (
                            <div key={s.label} className="bg-white/15 backdrop-blur-sm border border-white/20 rounded-2xl px-4 py-3 text-center min-w-[80px]">
                                <p className="text-xl font-black tabular-nums">{s.val}</p>
                                <p className="text-xs text-violet-200 mt-0.5">{s.label}</p>
                            </div>
                        ))}
                    </div>
                </div>
                {lastSDL?.completedAt && (
                    <div className="relative mt-5 pt-4 border-t border-white/20 flex items-center justify-between text-xs text-violet-200">
                        <span><span className="text-white font-semibold">Catalog updated</span> · {timeAgo(lastSDL.completedAt)}</span>
                        <span>Inventory refreshes hourly</span>
                    </div>
                )}
            </div>

            {/* ── Search + view toggle ─────────────────────────────────────── */}
            <div className="flex gap-3 items-center">
                <div className="relative flex-1">
                    <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        className="w-full pl-11 pr-4 py-3 text-sm border border-slate-200 rounded-2xl outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-400/10 bg-white shadow-sm transition-all placeholder:text-slate-400"
                        placeholder="Search by name, style number, or brand…"
                        value={filters.q}
                        onChange={e => {
                            const v = e.target.value;
                            setFilter("q", v);
                            clearTimeout(searchTimer.current);
                            searchTimer.current = setTimeout(() => setCatPage(1), 350);
                        }}
                    />
                    {filters.q && (
                        <button type="button" aria-label="Clear search"
                            onClick={() => { setFilter("q", ""); setCatPage(1); }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 transition-colors">
                            <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 shrink-0">
                    <button type="button" aria-label="Grid view" onClick={() => setView("grid")}
                        className={`px-2.5 py-1.5 rounded-lg transition-all ${view === "grid" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M1 2.5A1.5 1.5 0 012.5 1h3A1.5 1.5 0 017 2.5v3A1.5 1.5 0 015.5 7h-3A1.5 1.5 0 011 5.5v-3zm8 0A1.5 1.5 0 0110.5 1h3A1.5 1.5 0 0115 2.5v3A1.5 1.5 0 0113.5 7h-3A1.5 1.5 0 019 5.5v-3zm-8 8A1.5 1.5 0 012.5 9h3A1.5 1.5 0 017 10.5v3A1.5 1.5 0 015.5 15h-3A1.5 1.5 0 011 13.5v-3zm8 0A1.5 1.5 0 0110.5 9h3A1.5 1.5 0 0115 10.5v3A1.5 1.5 0 0113.5 15h-3A1.5 1.5 0 019 13.5v-3z" />
                        </svg>
                    </button>
                    <button type="button" aria-label="List view" onClick={() => setView("list")}
                        className={`px-2.5 py-1.5 rounded-lg transition-all ${view === "list" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                            <path fillRule="evenodd" d="M2.5 12a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5zm0-4a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5zm0-4a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5z" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* ── Two-column layout ────────────────────────────────────────── */}
            <div className="flex gap-6 items-start">

                {/* ══ LEFT SIDEBAR ══
                    z-30 ensures this stacking context renders above product cards
                    that create their own stacking contexts via Framer Motion transforms */}
                <div className="w-56 shrink-0 sticky top-4 space-y-3" style={{ zIndex: 30 }}>

                    {/* ── Category nav with hover flyout ── */}
                    {/*
                        The flyout is absolute-positioned to the right of this relative
                        wrapper. Because it is a DOM child of the wrapper (not a child of
                        the overflow-hidden card), it is NOT clipped.
                        onMouseLeave on the wrapper fires only when the cursor leaves
                        BOTH the category list AND the flyout panel.
                    */}
                    <div className="relative" onMouseLeave={handleNavMouseLeave}>

                        {/* Category list card */}
                        <div className="bg-white rounded-2xl ring-1 ring-black/5">

                            {/* All Products */}
                            <button type="button" onClick={clearAll}
                                className={`flex items-center gap-2.5 w-full px-4 py-3 text-sm font-bold border-b transition-colors ${
                                    !filters.category
                                        ? "bg-violet-50 text-violet-700 border-violet-100"
                                        : "text-slate-600 hover:bg-slate-50 border-slate-100"
                                }`}>
                                <svg className="w-4 h-4 shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                                All Products
                            </button>

                            {/* Top-level category nodes */}
                            {categoryTree.map(rootNode => {
                                const isActive = activeRootName === rootNode.name;
                                return (
                                    <button key={rootNode.path} type="button"
                                        onMouseEnter={() => handleNavMouseEnter(rootNode.path)}
                                        onClick={() => selectCategoryPath(rootNode.path)}
                                        className={`flex items-center justify-between w-full px-4 py-2.5 text-sm transition-colors border-b border-slate-50 last:border-0 ${
                                            isActive
                                                ? "bg-violet-50 text-violet-700 font-bold"
                                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                        }`}>
                                        <span>{rootNode.name}</span>
                                        {rootNode.children.length > 0 && (
                                            <svg className={`w-4 h-4 shrink-0 transition-colors ${isActive ? "text-violet-400" : "text-slate-300"}`}
                                                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                            </svg>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* ── Hover flyout — appears to the right ── */}
                        <AnimatePresence>
                            {hoveredNode && (
                                <motion.div
                                    key={hoveredNode.path}
                                    initial={{ opacity: 0, x: -6 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -6 }}
                                    transition={{ duration: 0.12, ease: "easeOut" }}
                                    className="absolute top-0 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"
                                    style={{ left: "calc(100% + 8px)", width: 220, zIndex: 50 }}
                                    onMouseEnter={handleFlyoutMouseEnter}
                                    onMouseLeave={handleNavMouseLeave}
                                >
                                    {/* Flyout header */}
                                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                                            {hoveredNode.name}
                                        </p>
                                    </div>

                                    {/* "All [Category]" + children */}
                                    <div className="py-1.5 max-h-80 overflow-y-auto">
                                        <button type="button"
                                            onClick={() => selectCategoryPath(hoveredNode.path)}
                                            className={`flex items-center w-full px-4 py-2 text-sm font-semibold transition-colors ${
                                                filters.category === hoveredNode.path && !filters.subcategory
                                                    ? "text-violet-700 bg-violet-50"
                                                    : "text-slate-700 hover:bg-slate-50"
                                            }`}>
                                            All {hoveredNode.name}
                                        </button>
                                        {hoveredNode.children.map(child => (
                                            <button key={child.path} type="button"
                                                onClick={() => selectCategoryPath(child.path)}
                                                className={`flex items-center justify-between w-full px-4 py-2 text-sm transition-colors ${
                                                    filters.category === child.path
                                                        ? "text-violet-700 bg-violet-50 font-semibold"
                                                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                                }`}>
                                                <span>{child.name}</span>
                                                {child.children.length > 0 && (
                                                    <svg className="w-3.5 h-3.5 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                                    </svg>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* ── Filter facets (shown when a category is selected) ── */}
                    {filters.category && (
                        <div className="bg-white rounded-2xl ring-1 ring-black/5 px-4">

                            {/* ── Deeper category navigation ── */}
                            {selectedNode && selectedNode.children.length > 0 && (
                                <FacetSection title="Subcategory" expanded={expandedFacets.category} onToggle={() => toggleFacet("category")}>
                                    <div className="space-y-0.5">
                                        {/* "All [parent]" resets to the parent path */}
                                        <button type="button"
                                            onClick={() => {
                                                /* If we're already at a child, go back to parent */
                                                const parts = filters.category.split(";");
                                                selectCategoryPath(parts.slice(0, -1).join(";") || parts[0]);
                                            }}
                                            className="flex items-center justify-between w-full py-1.5 px-2 text-sm rounded-lg text-slate-500 hover:text-slate-700 transition-colors">
                                            <span className="flex items-center gap-1.5">
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                                                </svg>
                                                All {selectedNode.name}
                                            </span>
                                        </button>
                                        {selectedNode.children.map(child => (
                                            <button key={child.path} type="button"
                                                onClick={() => selectCategoryPath(child.path)}
                                                className={`flex items-center justify-between w-full py-1.5 px-2 text-sm rounded-lg transition-colors ${
                                                    filters.category === child.path
                                                        ? "text-violet-700 font-semibold bg-violet-50"
                                                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                                                }`}>
                                                <span>{child.name}</span>
                                                {filters.category === child.path && (
                                                    <svg className="w-3.5 h-3.5 text-violet-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                    </svg>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </FacetSection>
                            )}

                            {/* ── For leaf nodes or no children: show breadcrumb nav ── */}
                            {selectedNode && selectedNode.children.length === 0 && (
                                <div className="py-3 border-b border-slate-100">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Category</p>
                                    <div className="flex flex-wrap gap-1 items-center text-xs text-slate-500">
                                        {filters.category.split(";").map((seg, idx, arr) => {
                                            const path = arr.slice(0, idx + 1).join(";");
                                            const isLast = idx === arr.length - 1;
                                            return (
                                                <span key={path} className="flex items-center gap-1">
                                                    {idx > 0 && <span className="text-slate-300">›</span>}
                                                    {isLast
                                                        ? <span className="font-bold text-violet-600">{seg}</span>
                                                        : <button type="button" onClick={() => selectCategoryPath(path)}
                                                            className="hover:text-violet-600 transition-colors">{seg}</button>
                                                    }
                                                </span>
                                            );
                                        })}
                                    </div>
                                    <button type="button"
                                        onClick={() => {
                                            const parts = filters.category.split(";");
                                            if (parts.length > 1) selectCategoryPath(parts.slice(0, -1).join(";"));
                                            else clearAll();
                                        }}
                                        className="mt-2 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition-colors">
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                                        </svg>
                                        Back
                                    </button>
                                </div>
                            )}

                            {/* ── Subcategory field filter (separate SUBCATEGORY_NAME DB field) ── */}
                            {relevantSubcats.length > 0 && (
                                <FacetSection title="Type" expanded={expandedFacets.subcategory} onToggle={() => toggleFacet("subcategory")}>
                                    {relevantSubcats.map(sub => (
                                        <label key={sub}
                                            className="flex items-center gap-2.5 py-1 cursor-pointer text-sm text-slate-600 hover:text-slate-900 transition-colors">
                                            <input type="checkbox"
                                                checked={filters.subcategory === sub}
                                                onChange={() => setFilter("subcategory", filters.subcategory === sub ? "" : sub)}
                                                className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 focus:ring-offset-0 cursor-pointer" />
                                            {sub}
                                        </label>
                                    ))}
                                </FacetSection>
                            )}

                            {/* ── Brand ── */}
                            {catMeta.brands.length > 0 && (
                                <FacetSection title="Brand" expanded={expandedFacets.brand} onToggle={() => toggleFacet("brand")}>
                                    {catMeta.brands.map(brand => (
                                        <label key={brand}
                                            className="flex items-center gap-2.5 py-1 cursor-pointer text-sm text-slate-600 hover:text-slate-900 transition-colors">
                                            <input type="checkbox"
                                                checked={filters.brand === brand}
                                                onChange={() => setFilter("brand", filters.brand === brand ? "" : brand)}
                                                className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 focus:ring-offset-0 cursor-pointer" />
                                            {brand}
                                        </label>
                                    ))}
                                </FacetSection>
                            )}

                            {/* ── Color ── */}
                            <FacetSection title="Color" expanded={expandedFacets.color} onToggle={() => toggleFacet("color")}>
                                {COLOR_FAMILIES.map(fam => {
                                    const isLight = fam.hex === "#f3f4f6" || fam.hex === "#f9fafb";
                                    return (
                                        <label key={fam.label}
                                            className="flex items-center gap-2.5 py-1 cursor-pointer text-sm text-slate-600 hover:text-slate-900 transition-colors">
                                            <input type="checkbox"
                                                checked={filters.colorName === fam.label}
                                                onChange={() => setFilter("colorName", filters.colorName === fam.label ? "" : fam.label)}
                                                className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 focus:ring-offset-0 cursor-pointer" />
                                            <div className={`w-4 h-4 rounded-full shrink-0 shadow-sm ${isLight ? "ring-1 ring-slate-200" : ""}`}
                                                style={{ backgroundColor: fam.hex }} />
                                            {fam.label}
                                        </label>
                                    );
                                })}
                            </FacetSection>

                            {/* ── Size ── */}
                            {availableSizes.length > 0 && (
                                <FacetSection title="Size" expanded={expandedFacets.size} onToggle={() => toggleFacet("size")}>
                                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                                        {availableSizes.map(size => (
                                            <button key={size} type="button"
                                                onClick={() => setFilter("size", filters.size === size ? "" : size)}
                                                className={`px-2.5 py-1 text-xs font-semibold rounded-lg border-2 transition-all ${
                                                    filters.size === size
                                                        ? "border-violet-600 bg-violet-50 text-violet-700"
                                                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                                                }`}>
                                                {size}
                                            </button>
                                        ))}
                                    </div>
                                </FacetSection>
                            )}

                            {/* ── Price ── */}
                            <FacetSection title="Price" expanded={expandedFacets.price} onToggle={() => toggleFacet("price")}>
                                {PRICE_RANGES.map(range => (
                                    <label key={range.key}
                                        className="flex items-center gap-2.5 py-1 cursor-pointer text-sm text-slate-600 hover:text-slate-900 transition-colors">
                                        <input type="checkbox"
                                            checked={filters.priceRange === range.key}
                                            onChange={() => setFilter("priceRange", filters.priceRange === range.key ? "" : range.key)}
                                            className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 focus:ring-offset-0 cursor-pointer" />
                                        {range.label}
                                    </label>
                                ))}
                            </FacetSection>

                            {/* ── In Stock ── */}
                            <div className="py-3.5 border-t border-slate-100">
                                <button type="button"
                                    onClick={() => setFilter("inStock", !filters.inStock)}
                                    className="flex items-center gap-3 w-full text-sm font-semibold text-slate-700 hover:text-slate-900 transition-colors">
                                    <div className="relative shrink-0" style={{ width: 32, height: 18 }}>
                                        <div className="absolute inset-0 rounded-full transition-colors duration-200"
                                            style={{ backgroundColor: filters.inStock ? "#7c3aed" : "#d1d5db" }} />
                                        <div className={`absolute top-[3px] w-3 h-3 bg-white rounded-full shadow transition-all duration-200 ${filters.inStock ? "left-[17px]" : "left-[3px]"}`} />
                                    </div>
                                    In Stock Only
                                </button>
                            </div>

                            {/* ── Clear filters ── */}
                            {activeFilterCount > 0 && (
                                <div className="pb-3.5">
                                    <button type="button" onClick={clearAll}
                                        className="w-full py-2 text-xs font-bold text-slate-400 hover:text-slate-700 border border-slate-200 rounded-xl transition-colors hover:border-slate-300">
                                        Clear All Filters
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ══ RIGHT CONTENT ══ */}
                <div className="flex-1 min-w-0 space-y-4">

                    {/* Active filter chips */}
                    {activeFilterCount > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                            {filters.category && (
                                <FilterChip
                                    label={formatCatPath(filters.category)}
                                    onRemove={() => { setFilters(f => ({ ...f, category: "", subcategory: "" })); setCatPage(1); }}
                                />
                            )}
                            {filters.subcategory && (
                                <FilterChip label={filters.subcategory} onRemove={() => setFilter("subcategory", "")} />
                            )}
                            {filters.brand && (
                                <FilterChip label={filters.brand} onRemove={() => setFilter("brand", "")} />
                            )}
                            {filters.colorName && (
                                <FilterChip label={filters.colorName} color={activeFamilyHex}
                                    onRemove={() => setFilter("colorName", "")} />
                            )}
                            {filters.size && (
                                <FilterChip label={`Size: ${filters.size}`} onRemove={() => setFilter("size", "")} />
                            )}
                            {filters.priceRange && (
                                <FilterChip
                                    label={PRICE_RANGES.find(r => r.key === filters.priceRange)?.label ?? filters.priceRange}
                                    onRemove={() => setFilter("priceRange", "")}
                                />
                            )}
                            {filters.inStock && (
                                <span className="flex items-center gap-1.5 bg-emerald-100 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                                    In Stock Only
                                    <button type="button" onClick={() => setFilter("inStock", false)}
                                        aria-label="Remove in-stock filter"
                                        className="hover:text-emerald-900 ml-0.5">
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </span>
                            )}
                            <button type="button" onClick={clearAll}
                                className="text-xs text-slate-400 hover:text-slate-700 font-semibold underline underline-offset-2 transition-colors">
                                Clear all
                            </button>
                        </div>
                    )}

                    {/* Result count */}
                    <p className="text-sm text-slate-500 tabular-nums">
                        {catLoading
                            ? "Loading…"
                            : `${catTotal.toLocaleString()} variants · ${styleCards.length} styles shown`}
                    </p>

                    {/* Product grid / list */}
                    {catLoading ? (
                        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                            {Array.from({ length: 12 }).map((_, i) => (
                                <div key={i} className="animate-pulse bg-slate-100 rounded-3xl aspect-[4/5]" />
                            ))}
                        </div>
                    ) : styleCards.length === 0 ? (
                        <div className="flex flex-col items-center py-24 gap-4">
                            <div className="w-16 h-16 rounded-2xl bg-violet-50 flex items-center justify-center">
                                <svg className="w-8 h-8 text-violet-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                            <div className="text-center">
                                <p className="font-bold text-slate-500 text-lg">
                                    {catTotal === 0 ? "Catalog is empty" : "No results"}
                                </p>
                                <p className="text-sm text-slate-400 mt-1">
                                    {catTotal === 0
                                        ? "Use Catalog Health below to load products"
                                        : "Try a different filter or search term"}
                                </p>
                            </div>
                            {activeFilterCount > 0 && (
                                <button type="button" onClick={clearAll}
                                    className="px-4 py-2 text-sm font-bold text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-xl transition-colors">
                                    Clear Filters
                                </button>
                            )}
                        </div>
                    ) : view === "grid" ? (
                        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
                            <button type="button" disabled={catPage <= 1} onClick={() => setCatPage(p => p - 1)}
                                className="px-5 py-2.5 text-sm font-bold rounded-xl border border-slate-200 bg-white hover:shadow-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                                ← Previous
                            </button>
                            <span className="text-sm text-slate-500 tabular-nums">Page {catPage} of {totalPages}</span>
                            <button type="button" disabled={catPage >= totalPages} onClick={() => setCatPage(p => p + 1)}
                                className="px-5 py-2.5 text-sm font-bold rounded-xl border border-slate-200 bg-white hover:shadow-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                                Next →
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Catalog Health ───────────────────────────────────────────── */}
            <div className="border-t border-slate-100 pt-6">
                <button type="button"
                    onClick={() => setShowHealth(h => !h)}
                    className="flex items-center gap-3 text-slate-500 hover:text-slate-800 transition-colors w-full">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${lastSDL?.status === "SUCCESS" ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
                        <span className="text-sm font-bold">Catalog Health</span>
                    </div>
                    {lastSDL?.completedAt && <span className="text-xs text-slate-400">Updated {timeAgo(lastSDL.completedAt)}</span>}
                    <svg className={`w-4 h-4 ml-auto transition-transform duration-200 ${showHealth ? "rotate-180" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
                <AnimatePresence initial={false}>
                    {showHealth && (
                        <motion.div key="health"
                            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.22, ease: "easeInOut" }} className="overflow-hidden">
                            <div className="pt-5 grid sm:grid-cols-3 gap-4">
                                <HealthCard title="Product Catalog" sub="Names, images, prices & descriptions"
                                    log={lastSDL} syncing={!!syncing["sdl"]}
                                    onSync={() => triggerSync("sdl", "/sanmar/sync/catalog-sdl")} />
                                <HealthCard title="Extended Data" sub="Bulk inventory, extra images & categories"
                                    log={lastEPDD} syncing={!!syncing["epdd"]}
                                    onSync={() => triggerSync("epdd", "/sanmar/sync/catalog-epdd")} />
                                <HealthCard title="Live Inventory" sub="Real-time stock levels · auto-updates hourly"
                                    log={lastDIP} syncing={!!syncing["dip"]}
                                    onSync={() => triggerSync("dip", "/sanmar/sync/inventory-dip")} />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ── Product Detail Side Panel ────────────────────────────────── */}
            <AnimatePresence>
                {panelStyle && (
                    <>
                        <motion.div key="backdrop"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
                            onClick={closePanel} />

                        <motion.div key="panel"
                            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
                            transition={{ type: "spring", damping: 28, stiffness: 280, mass: 0.9 }}
                            className="fixed right-0 top-0 h-full w-full max-w-[480px] bg-white z-50 shadow-2xl shadow-black/20 flex flex-col overflow-y-auto">

                            <button type="button" aria-label="Close panel" onClick={closePanel}
                                className="absolute top-4 right-4 z-10 w-8 h-8 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center shadow hover:bg-slate-100 transition-colors">
                                <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>

                            {detailLoading ? (
                                <div className="flex-1 flex items-center justify-center">
                                    <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : detail ? (
                                <div>
                                    <div className="relative bg-gradient-to-br from-slate-50 to-slate-100 h-72 overflow-hidden">
                                        {(() => {
                                            const v = detail.variants.find(v => v.colorName === selectedColor);
                                            const src = isUrl(v?.productImage) ? v!.productImage
                                                : isUrl(detail.variants[0]?.productImage) ? detail.variants[0].productImage
                                                : null;
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
                                        <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm text-white text-xs font-mono font-bold px-3 py-1.5 rounded-full">
                                            {panelStyle}
                                        </div>
                                        {(() => {
                                            const totalQty = detail.variants.reduce((a, v) => a + v.inventoryQty, 0);
                                            return (
                                                <div className={`absolute bottom-3 right-3 text-xs font-bold px-3 py-1.5 rounded-full backdrop-blur-sm ${
                                                    totalQty > 500 ? "bg-emerald-500/90 text-white" : totalQty > 0 ? "bg-amber-500/90 text-white" : "bg-red-500/90 text-white"
                                                }`}>
                                                    {totalQty > 0 ? `${totalQty.toLocaleString()} in stock` : "Out of stock"}
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    <div className="p-6 space-y-6">
                                        <div>
                                            {detail.brand && <p className="text-xs font-bold text-violet-500 uppercase tracking-widest mb-1">{detail.brand}</p>}
                                            <h2 className="text-xl font-black text-slate-900 leading-tight">{detail.title ?? panelStyle}</h2>
                                            {detail.category && (
                                                <p className="text-xs text-slate-400 mt-1">
                                                    {formatCatPath(detail.category)}{detail.subcategory ? ` · ${detail.subcategory}` : ""}
                                                </p>
                                            )}
                                            <p className="text-2xl font-black text-slate-900 mt-3">
                                                {detail.priceCents > 0 ? `From ${fmt(detail.priceCents)}` : "Price on request"}
                                                <span className="text-sm font-normal text-slate-400 ml-2">wholesale</span>
                                            </p>
                                        </div>

                                        {detail.description && (
                                            <p className="text-sm text-slate-600 leading-relaxed">{detail.description}</p>
                                        )}

                                        {/* Colors */}
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                                    Colors <span className="font-normal">({detail.colors.length})</span>
                                                </p>
                                                {selectedColor && <p className="text-xs text-slate-500 font-medium">{selectedColor}</p>}
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {detail.colors.map(color => {
                                                    const qty = detail.variants.filter(v => v.colorName === color).reduce((a, v) => a + v.inventoryQty, 0);
                                                    const hex = colorHex(color);
                                                    const isLight = ["#f9fafb","#e5e7eb","#bfdbfe","#d1d5db","#c4b5fd","#f3f4f6"].includes(hex);
                                                    return (
                                                        <button key={color} type="button" title={color} aria-label={color}
                                                            onClick={() => setColor(color)}
                                                            className={`relative w-8 h-8 rounded-full transition-all duration-150 ${
                                                                selectedColor === color ? "ring-2 ring-offset-2 ring-violet-500 scale-110 shadow-lg" : "hover:scale-105"
                                                            } ${isLight ? "ring-1 ring-slate-200" : ""}`}
                                                            style={{ backgroundColor: hex }}>
                                                            {qty === 0 && (
                                                                <div className="absolute inset-0 rounded-full flex items-center justify-center">
                                                                    <div className="w-6 h-px bg-white/70 rotate-45" />
                                                                </div>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Sizes */}
                                        <div>
                                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                                                Sizes <span className="font-normal">({detail.sizes.length})</span>
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                {detail.sizes.map(size => {
                                                    const qty = detail.variants
                                                        .filter(v => v.sizeName === size && (!selectedColor || v.colorName === selectedColor))
                                                        .reduce((a, v) => a + v.inventoryQty, 0);
                                                    return (
                                                        <span key={size}
                                                            className={`px-3 py-1.5 text-xs font-bold rounded-xl border-2 ${qty > 0 ? "border-slate-200 text-slate-700 bg-white" : "border-slate-100 text-slate-300 bg-slate-50"}`}>
                                                            {size}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Add to Store */}
                                        <div className="border-t border-slate-100 pt-5 space-y-4">
                                            <p className="font-bold text-slate-900">Add to Your Store</p>
                                            {importDone ? (
                                                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                                                    className="flex flex-col items-center gap-3 py-8 text-center">
                                                    <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                                                        <svg className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-slate-900">Added to your store!</p>
                                                        <p className="text-sm text-slate-500 mt-0.5">{detail.title ?? panelStyle} is now in your products</p>
                                                    </div>
                                                    <button type="button" onClick={() => setImportDone(false)}
                                                        className="text-sm text-violet-600 hover:text-violet-800 font-semibold underline underline-offset-2">
                                                        Add to another collection
                                                    </button>
                                                </motion.div>
                                            ) : (
                                                <>
                                                    <div>
                                                        <label className="text-xs text-slate-500 font-bold mb-1.5 block">Collection</label>
                                                        <select aria-label="Choose a collection"
                                                            value={collectionId} onChange={e => setCollectionId(e.target.value)}
                                                            className="w-full px-3.5 py-3 text-sm border border-slate-200 rounded-xl outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 bg-white">
                                                            <option value="">Choose a collection…</option>
                                                            {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="text-xs text-slate-500 font-bold mb-1.5 block">Your Selling Price</label>
                                                        <div className="relative">
                                                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm pointer-events-none">$</span>
                                                            <input type="number" step="0.01" min="0"
                                                                value={priceVal} onChange={e => setPriceVal(e.target.value)}
                                                                className="w-full pl-8 pr-4 py-3 text-sm border border-slate-200 rounded-xl outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20"
                                                                placeholder="0.00" />
                                                        </div>
                                                        {detail.priceCents > 0 && (
                                                            <p className="text-xs text-slate-400 mt-1.5">
                                                                Wholesale: {fmt(detail.priceCents)}
                                                                {priceVal && parseFloat(priceVal) > detail.priceCents / 100 && (
                                                                    <span className="ml-2 text-emerald-500 font-semibold">
                                                                        +{fmt((parseFloat(priceVal) * 100) - detail.priceCents)} margin
                                                                    </span>
                                                                )}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <button type="button"
                                                        disabled={!collectionId || importing || !priceVal}
                                                        onClick={doImport}
                                                        className="w-full py-3.5 text-sm font-black rounded-xl text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
                                                        style={{ background: "linear-gradient(135deg,#7c3aed 0%,#4f46e5 50%,#2563eb 100%)", boxShadow: "0 4px 20px rgba(109,40,217,0.3)" }}>
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

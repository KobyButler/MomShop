"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/app/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { motion } from "framer-motion";

/* ─── Types ───────────────────────────────────────────────────────────────── */

type Status = {
    sftpEnabled: boolean; soapEnabled: boolean;
    sftpHost: string; sftpPort: number; sftpRemoteDir: string;
    catalogCount: number;
    lastSync: Record<string, SyncLog>;
};

type SftpFile = { name: string; size: number; modifyTime: number };

type SyncLog = {
    id: string; type: string; status: string;
    rowsProcessed?: number; rowsTotal?: number; fileSizeBytes?: number;
    error?: string; startedAt: string; completedAt?: string;
};

type CatalogProduct = {
    id: string; style: string; colorName: string; sizeName: string;
    title?: string; description?: string; brand?: string;
    category?: string; subcategory?: string; priceCents: number;
    inventoryQty: number; colorSwatchImage?: string; productImage?: string;
    inventoryKey?: string;
};

type StyleDetail = {
    style: string; title?: string; description?: string; brand?: string;
    category?: string; subcategory?: string; colors: string[]; sizes: string[];
    priceCents: number; variants: CatalogProduct[];
};

type Collection = { id: string; name: string };

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

const fmt = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

const fmtBytes = (n: number) =>
    n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${(n / 1024).toFixed(0)} KB`;

const fmtDate = (d: string) =>
    new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const fmtDuration = (start: string, end?: string) => {
    if (!end) return "—";
    const ms = new Date(end).getTime() - new Date(start).getTime();
    return ms < 60000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
};

const STATUS_COLOR: Record<string, string> = {
    SUCCESS: "success", ERROR: "danger", RUNNING: "warning"
};

const TYPE_LABEL: Record<string, string> = {
    CATALOG_SDL: "SDL Catalog", CATALOG_EPDD: "EPDD Catalog",
    INVENTORY_DIP: "Inventory DIP", SOAP_CHECK: "SOAP Check"
};

/* ─── Sub-components ──────────────────────────────────────────────────────── */

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
    return (
        <div className="bg-white rounded-2xl ring-1 ring-black/5 shadow-card p-5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{label}</p>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
            {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        </div>
    );
}

function SyncCard({ title, logKey, log, onSync, syncing }: {
    title: string; logKey: string; log?: SyncLog;
    onSync: () => void; syncing: boolean;
}) {
    return (
        <div className="bg-white rounded-2xl ring-1 ring-black/5 shadow-card p-5 space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800">{title}</h3>
                <Button size="sm" loading={syncing} onClick={onSync}>Sync Now</Button>
            </div>
            {log ? (
                <div className="space-y-1 text-xs text-slate-500">
                    <div className="flex items-center gap-2">
                        <Badge variant={STATUS_COLOR[log.status] as any} size="sm">{log.status}</Badge>
                        <span>{fmtDate(log.startedAt)}</span>
                        <span className="text-slate-300">·</span>
                        <span>{fmtDuration(log.startedAt, log.completedAt)}</span>
                    </div>
                    {log.rowsProcessed != null && (
                        <p>{log.rowsProcessed.toLocaleString()} / {log.rowsTotal?.toLocaleString() ?? "?"} rows</p>
                    )}
                    {log.fileSizeBytes != null && <p>File: {fmtBytes(log.fileSizeBytes)}</p>}
                    {log.error && <p className="text-red-500 font-mono break-all">{log.error.slice(0, 200)}</p>}
                </div>
            ) : (
                <p className="text-xs text-slate-400 italic">Never synced</p>
            )}
        </div>
    );
}

/* ─── Import modal ────────────────────────────────────────────────────────── */

function ImportModal({ style, detail, collections, onClose, onDone }: {
    style: string; detail: StyleDetail | null; collections: Collection[];
    onClose: () => void; onDone: (msg: string) => void;
}) {
    const { toast } = useToast();
    const [collectionId, setCollectionId] = useState("");
    const [priceDollars, setPriceDollars] = useState(
        detail ? (detail.priceCents / 100).toFixed(2) : ""
    );
    const [saving, setSaving] = useState(false);

    async function handleImport(e: React.FormEvent) {
        e.preventDefault();
        if (!collectionId) { toast("Select a collection", "error"); return; }
        setSaving(true);
        try {
            const res = await api("/sanmar/import", {
                method: "POST",
                body: JSON.stringify({ style, collectionId, priceCents: Math.round(parseFloat(priceDollars) * 100) }),
            });
            onDone(`${res.action === "created" ? "Created" : "Updated"} product: ${res.product.name}`);
            onClose();
        } catch (err: any) {
            toast(err.message || "Import failed", "error");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal open onClose={onClose} title={`Import Style ${style}`} size="sm">
            {detail && (
                <div className="mb-4 p-3 bg-slate-50 rounded-xl text-sm space-y-1">
                    <p className="font-semibold text-slate-800">{detail.title ?? style}</p>
                    {detail.brand && <p className="text-slate-500">{detail.brand}</p>}
                    <div className="flex gap-3 text-xs text-slate-500">
                        <span>{detail.colors.length} colors</span>
                        <span>{detail.sizes.length} sizes</span>
                        <span>From {fmt(detail.priceCents)}</span>
                    </div>
                </div>
            )}
            <form onSubmit={handleImport} className="space-y-4">
                <div>
                    <label className="field-label">Collection</label>
                    <Select required value={collectionId} onChange={e => setCollectionId(e.target.value)}>
                        <option value="">Select a collection…</option>
                        {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                </div>
                <Input label="Price ($)" type="number" step="0.01" min="0" required
                    value={priceDollars} onChange={e => setPriceDollars(e.target.value)} />
                <ModalFooter>
                    <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                    <Button type="submit" loading={saving}>Import to Products</Button>
                </ModalFooter>
            </form>
        </Modal>
    );
}

/* ─── Inventory checker ───────────────────────────────────────────────────── */

function InventoryChecker() {
    const { toast } = useToast();
    const [style, setStyle] = useState("");
    const [color, setColor] = useState("");
    const [size, setSize] = useState("");
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    async function check(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true); setResult(null);
        try {
            const r = await api(`/sanmar/inventory?style=${encodeURIComponent(style)}&color=${encodeURIComponent(color)}&size=${encodeURIComponent(size)}`);
            setResult(r);
        } catch (err: any) {
            toast(err.message || "Check failed", "error");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="bg-white rounded-2xl ring-1 ring-black/5 shadow-card p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-800">Real-time SOAP Inventory Check</h3>
            <form onSubmit={check} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <Input label="Style #" placeholder="PC61" required value={style} onChange={e => setStyle(e.target.value)} />
                <Input label="Color" placeholder="Black" required value={color} onChange={e => setColor(e.target.value)} />
                <Input label="Size" placeholder="L" required value={size} onChange={e => setSize(e.target.value)} />
                <Button type="submit" loading={loading}>Check</Button>
            </form>
            {result && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${result.qty > 0 ? "bg-green-100 text-green-700" : "bg-red-50 text-red-500"}`}>
                        {result.dryRun ? "—" : result.qty}
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-slate-800">
                            {result.dryRun ? "Dry run (SANMAR_ENABLE=false)" : `${result.qty} units available`}
                        </p>
                        <p className="text-xs text-slate-400">{result.style} · {result.color} · {result.size}</p>
                    </div>
                    <Badge variant={result.qty > 0 ? "success" : "danger"} size="sm" className="ml-auto">
                        {result.qty > 0 ? "In Stock" : "Out of Stock"}
                    </Badge>
                </motion.div>
            )}
        </div>
    );
}

/* ─── Main page ───────────────────────────────────────────────────────────── */

export default function SanMarPage() {
    const { toast } = useToast();
    const [tab, setTab] = useState<"overview" | "catalog" | "inventory" | "logs">("overview");

    // Overview
    const [status, setStatus]         = useState<Status | null>(null);
    const [statusLoading, setStatusLoading] = useState(true);
    const [sftpFiles, setSftpFiles]   = useState<SftpFile[] | null>(null);
    const [testingConn, setTestingConn] = useState(false);
    const [syncing, setSyncing]       = useState<Record<string, boolean>>({});

    // Catalog
    const [catalog, setCatalog]       = useState<CatalogProduct[]>([]);
    const [catTotal, setCatTotal]     = useState(0);
    const [catPage, setCatPage]       = useState(1);
    const [catQ, setCatQ]             = useState("");
    const [catCategory, setCatCategory] = useState("");
    const [catBrand, setCatBrand]     = useState("");
    const [catMeta, setCatMeta]       = useState<{ categories: string[]; brands: string[] }>({ categories: [], brands: [] });
    const [catLoading, setCatLoading] = useState(false);

    // Style detail / import
    const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
    const [styleDetail, setStyleDetail]     = useState<StyleDetail | null>(null);
    const [importStyle, setImportStyle]     = useState<string | null>(null);
    const [collections, setCollections]     = useState<Collection[]>([]);

    // Logs
    const [logs, setLogs]             = useState<SyncLog[]>([]);
    const [logsTotal, setLogsTotal]   = useState(0);
    const [logsPage, setLogsPage]     = useState(1);
    const [logsLoading, setLogsLoading] = useState(false);

    /* ── Load status on mount ── */
    useEffect(() => {
        api("/sanmar/status").then(setStatus).catch(console.error).finally(() => setStatusLoading(false));
        api("/collections").then((c: any) => setCollections(Array.isArray(c) ? c : c?.data ?? [])).catch(console.error);
    }, []);

    /* ── Load catalog meta ── */
    useEffect(() => {
        api("/sanmar/catalog/meta").then(setCatMeta).catch(() => {});
    }, []);

    /* ── Load catalog when tab opens or filters change ── */
    const loadCatalog = useCallback(() => {
        setCatLoading(true);
        const params = new URLSearchParams({ limit: "50", page: String(catPage) });
        if (catQ)        params.set("q", catQ);
        if (catCategory) params.set("category", catCategory);
        if (catBrand)    params.set("brand", catBrand);

        api(`/sanmar/catalog?${params}`)
            .then((r: any) => { setCatalog(r.data ?? []); setCatTotal(r.total ?? 0); })
            .catch(console.error)
            .finally(() => setCatLoading(false));
    }, [catQ, catCategory, catBrand, catPage]);

    useEffect(() => {
        if (tab === "catalog") loadCatalog();
    }, [tab, loadCatalog]);

    /* ── Load logs ── */
    const loadLogs = useCallback(() => {
        setLogsLoading(true);
        api(`/sanmar/sync-logs?limit=20&offset=${(logsPage - 1) * 20}`)
            .then((r: any) => { setLogs(r.logs ?? []); setLogsTotal(r.total ?? 0); })
            .catch(console.error)
            .finally(() => setLogsLoading(false));
    }, [logsPage]);

    useEffect(() => {
        if (tab === "logs") loadLogs();
    }, [tab, loadLogs]);

    /* ── Test SFTP connection ── */
    async function testConnection() {
        setTestingConn(true); setSftpFiles(null);
        try {
            const r = await api("/sanmar/sftp/test", { method: "POST" });
            if (r.ok) {
                toast(`Connected! ${r.files?.length ?? 0} files found`);
                setSftpFiles(r.files ?? []);
            } else {
                toast(r.error || "Connection failed", "error");
            }
        } catch (err: any) {
            toast(err.message || "Connection failed", "error");
        } finally {
            setTestingConn(false);
        }
    }

    /* ── Trigger a sync (fire-and-forget — poll until done) ── */
    async function triggerSync(key: string, endpoint: string) {
        setSyncing(s => ({ ...s, [key]: true }));
        try {
            const r = await api(endpoint, { method: "POST" });
            // Server returns immediately with RUNNING status; poll until complete
            toast(r.message ?? "Sync started — check Sync Logs tab for progress");
            api("/sanmar/status").then(setStatus).catch(console.error);

            if (r.logId) {
                pollSyncLog(r.logId, key);
            }
        } catch (err: any) {
            toast(err.message || "Sync failed", "error");
            setSyncing(s => ({ ...s, [key]: false }));
        }
    }

    /* ── Poll a sync log until it's no longer RUNNING ── */
    function pollSyncLog(logId: string, key: string) {
        const interval = setInterval(async () => {
            try {
                const logs = await api(`/sanmar/sync-logs?limit=1&offset=0`);
                const log = (logs.logs ?? []).find((l: SyncLog) => l.id === logId);
                if (!log) return;
                if (log.status !== "RUNNING") {
                    clearInterval(interval);
                    setSyncing(s => ({ ...s, [key]: false }));
                    if (log.status === "SUCCESS") {
                        toast(`Sync complete — ${log.rowsProcessed?.toLocaleString()} rows processed`);
                    } else {
                        toast(`Sync failed: ${log.error?.slice(0, 100)}`, "error");
                    }
                    api("/sanmar/status").then(setStatus).catch(console.error);
                }
            } catch { /* ignore poll errors */ }
        }, 5000); // check every 5 seconds
    }

    /* ── Load style detail ── */
    async function openStyle(style: string) {
        setSelectedStyle(style);
        setStyleDetail(null);
        try {
            const r = await api(`/sanmar/catalog/${encodeURIComponent(style)}`);
            setStyleDetail(r);
        } catch { /* ignore */ }
    }

    /* ── Tabs ── */
    const TABS = [
        { key: "overview",  label: "Overview"         },
        { key: "catalog",   label: "Catalog Browser"  },
        { key: "inventory", label: "Inventory Checker" },
        { key: "logs",      label: "Sync Logs"        },
    ] as const;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="page-title">SanMar Integration</h1>
                    <p className="page-subtitle">SFTP catalog sync, real-time inventory, and product import</p>
                </div>
                <div className="flex items-center gap-2">
                    {status && (
                        <>
                            <Badge variant={status.sftpEnabled ? "success" : "default"} size="sm">
                                SFTP {status.sftpEnabled ? "Enabled" : "Disabled"}
                            </Badge>
                            <Badge variant={status.soapEnabled ? "success" : "default"} size="sm">
                                SOAP {status.soapEnabled ? "Enabled" : "Disabled"}
                            </Badge>
                        </>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-slate-200">
                {TABS.map(t => (
                    <button key={t.key} type="button" onClick={() => setTab(t.key)}
                        className={`relative px-4 py-2.5 text-sm font-medium transition-colors -mb-px ${tab === t.key ? "text-brand-700" : "text-slate-500 hover:text-slate-700"}`}>
                        {tab === t.key && (
                            <motion.div layoutId="sanmar-tab-bar"
                                className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 rounded-full"
                                transition={{ duration: 0.2 }} />
                        )}
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ─── Overview Tab ──────────────────────────────────────────────── */}
            {tab === "overview" && (
                <div className="space-y-6">
                    {/* Stats */}
                    {statusLoading ? (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
                            {[1,2,3,4].map(i => <div key={i} className="h-24 bg-slate-100 rounded-2xl" />)}
                        </div>
                    ) : status ? (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <StatCard label="Catalog Products" value={status.catalogCount.toLocaleString()} sub="rows in local DB" />
                            <StatCard label="SFTP Host" value={status.sftpHost || "Not set"} sub={`port ${status.sftpPort}`} />
                            <StatCard label="Remote Folder" value={status.sftpRemoteDir} sub="SanMar data files" />
                            <StatCard label="Last DIP Sync"
                                value={status.lastSync["INVENTORY_DIP"]
                                    ? fmtDate(status.lastSync["INVENTORY_DIP"].startedAt)
                                    : "Never"}
                                sub="inventory quantities" />
                        </div>
                    ) : null}

                    {/* SFTP Connection Test */}
                    <div className="bg-white rounded-2xl ring-1 ring-black/5 shadow-card p-5 space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-slate-800">SFTP Connection</h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {status?.sftpHost ? `${status.sftpHost}:${status.sftpPort}` : "Configure SANMAR_SFTP_* in .env"}
                                </p>
                            </div>
                            <Button size="sm" variant="outline" loading={testingConn} onClick={testConnection}>
                                Test Connection
                            </Button>
                        </div>

                        {sftpFiles !== null && (
                            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                                className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-100">
                                            <th className="text-left py-1.5 px-2 font-semibold text-slate-500">Filename</th>
                                            <th className="text-right py-1.5 px-2 font-semibold text-slate-500">Size</th>
                                            <th className="text-right py-1.5 px-2 font-semibold text-slate-500">Modified</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sftpFiles.map(f => (
                                            <tr key={f.name} className="border-b border-slate-50">
                                                <td className="py-1.5 px-2 font-mono text-slate-700">{f.name}</td>
                                                <td className="py-1.5 px-2 text-right text-slate-500">{fmtBytes(f.size)}</td>
                                                <td className="py-1.5 px-2 text-right text-slate-500">
                                                    {new Date(f.modifyTime).toLocaleDateString()}
                                                </td>
                                            </tr>
                                        ))}
                                        {sftpFiles.length === 0 && (
                                            <tr><td colSpan={3} className="py-3 px-2 text-slate-400 text-center italic">No files found</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </motion.div>
                        )}
                    </div>

                    {/* Sync cards */}
                    <div className="grid sm:grid-cols-3 gap-4">
                        <SyncCard
                            title="SDL Catalog"
                            logKey="CATALOG_SDL"
                            log={status?.lastSync["CATALOG_SDL"]}
                            onSync={() => triggerSync("sdl", "/sanmar/sync/catalog-sdl")}
                            syncing={!!syncing["sdl"]}
                        />
                        <SyncCard
                            title="EPDD Catalog"
                            logKey="CATALOG_EPDD"
                            log={status?.lastSync["CATALOG_EPDD"]}
                            onSync={() => triggerSync("epdd", "/sanmar/sync/catalog-epdd")}
                            syncing={!!syncing["epdd"]}
                        />
                        <SyncCard
                            title="Inventory DIP (Hourly)"
                            logKey="INVENTORY_DIP"
                            log={status?.lastSync["INVENTORY_DIP"]}
                            onSync={() => triggerSync("dip", "/sanmar/sync/inventory-dip")}
                            syncing={!!syncing["dip"]}
                        />
                    </div>

                    {/* Setup instructions */}
                    <div className="bg-brand-50/60 border border-brand-100 rounded-2xl p-5 text-sm space-y-2">
                        <h3 className="font-bold text-brand-800 text-sm">Setup Checklist</h3>
                        <ol className="list-decimal list-inside space-y-1 text-brand-700 text-xs">
                            <li>Retrieve your SFTP credentials from the secure Bitwarden link in the SanMar onboarding email</li>
                            <li>Add <code className="font-mono bg-brand-100 px-1 rounded">SANMAR_SFTP_USER</code> and <code className="font-mono bg-brand-100 px-1 rounded">SANMAR_SFTP_PASSWORD</code> to <code className="font-mono bg-brand-100 px-1 rounded">server/.env</code></li>
                            <li>Set <code className="font-mono bg-brand-100 px-1 rounded">SANMAR_SFTP_ENABLE=true</code> in your .env</li>
                            <li>Click "Test Connection" to verify access to <code className="font-mono bg-brand-100 px-1 rounded">ftp.sanmar.com:2200</code></li>
                            <li>Run "SDL Catalog" sync to import the base product catalog</li>
                            <li>Run "EPDD Catalog" sync for extended data (categories, bulk inventory)</li>
                            <li>Inventory DIP will auto-sync hourly while the server is running</li>
                        </ol>
                    </div>
                </div>
            )}

            {/* ─── Catalog Browser Tab ───────────────────────────────────────── */}
            {tab === "catalog" && (
                <div className="space-y-4">
                    {/* Filters */}
                    <div className="flex flex-wrap gap-3 items-end">
                        <div className="relative flex-1 min-w-[180px] max-w-xs">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                            <input className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 bg-white shadow-sm transition-all"
                                placeholder="Search style, name, brand…"
                                value={catQ}
                                onChange={e => { setCatQ(e.target.value); setCatPage(1); }} />
                        </div>
                        <Select value={catCategory} onChange={e => { setCatCategory(e.target.value); setCatPage(1); }} className="w-full sm:w-44">
                            <option value="">All categories</option>
                            {catMeta.categories.map(c => <option key={c!} value={c!}>{c}</option>)}
                        </Select>
                        <Select value={catBrand} onChange={e => { setCatBrand(e.target.value); setCatPage(1); }} className="w-full sm:w-40">
                            <option value="">All brands</option>
                            {catMeta.brands.map(b => <option key={b!} value={b!}>{b}</option>)}
                        </Select>
                        {(catQ || catCategory || catBrand) && (
                            <button type="button" onClick={() => { setCatQ(""); setCatCategory(""); setCatBrand(""); setCatPage(1); }}
                                className="text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors">
                                Clear
                            </button>
                        )}
                        <span className="ml-auto text-xs text-slate-400 tabular-nums">{catTotal.toLocaleString()} rows</span>
                    </div>

                    {/* Table */}
                    <div className="bg-white rounded-2xl ring-1 ring-black/5 shadow-card overflow-hidden">
                        {catLoading ? (
                            <div className="p-6 space-y-3 animate-pulse">
                                {[1,2,3,4,5].map(i => (
                                    <div key={i} className="flex gap-3 items-center">
                                        <div className="w-8 h-8 bg-slate-100 rounded-lg shrink-0" />
                                        <div className="flex-1 space-y-1.5">
                                            <div className="h-3 w-24 bg-slate-200 rounded" />
                                            <div className="h-2.5 w-40 bg-slate-100 rounded" />
                                        </div>
                                        <div className="h-4 w-14 bg-slate-100 rounded" />
                                    </div>
                                ))}
                            </div>
                        ) : catalog.length === 0 ? (
                            <div className="flex flex-col items-center py-16 text-slate-300">
                                <svg className="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                                <p className="text-sm text-slate-400 font-medium">
                                    {catTotal === 0 ? "Catalog is empty — run a sync first" : "No results"}
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-100 bg-slate-50/50">
                                            <th className="text-left py-3 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Style</th>
                                            <th className="text-left py-3 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Product</th>
                                            <th className="text-left py-3 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide hidden md:table-cell">Color</th>
                                            <th className="text-left py-3 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide hidden md:table-cell">Size</th>
                                            <th className="text-right py-3 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Price</th>
                                            <th className="text-right py-3 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Qty</th>
                                            <th className="text-right py-3 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {catalog.map((row, idx) => (
                                            <motion.tr key={row.id}
                                                initial={{ opacity: 0, y: 3 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: idx * 0.01, duration: 0.15 }}
                                                className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors group">
                                                <td className="py-3 px-4">
                                                    <button type="button" onClick={() => openStyle(row.style)}
                                                        className="font-mono text-xs font-bold text-brand-600 hover:text-brand-800 hover:underline">
                                                        {row.style}
                                                    </button>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <div>
                                                        <p className="font-medium text-slate-800 text-xs">{row.title ?? "—"}</p>
                                                        {row.brand && <p className="text-xs text-slate-400">{row.brand}</p>}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-xs text-slate-500 hidden md:table-cell">{row.colorName || "—"}</td>
                                                <td className="py-3 px-4 text-xs text-slate-500 hidden md:table-cell">{row.sizeName || "—"}</td>
                                                <td className="py-3 px-4 text-right text-xs font-bold tabular-nums text-slate-900">
                                                    {row.priceCents > 0 ? fmt(row.priceCents) : "—"}
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    <span className={`text-xs font-bold tabular-nums ${row.inventoryQty > 0 ? "text-green-600" : "text-slate-300"}`}>
                                                        {row.inventoryQty.toLocaleString()}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    <button type="button"
                                                        onClick={() => { setImportStyle(row.style); openStyle(row.style); }}
                                                        className="opacity-0 group-hover:opacity-100 transition-opacity px-2.5 py-1 text-xs font-medium rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100">
                                                        Import
                                                    </button>
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Pagination */}
                    {catTotal > 50 && (
                        <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>Page {catPage} of {Math.ceil(catTotal / 50)}</span>
                            <div className="flex gap-2">
                                <Button size="sm" variant="outline" disabled={catPage <= 1}
                                    onClick={() => setCatPage(p => p - 1)}>Previous</Button>
                                <Button size="sm" variant="outline" disabled={catPage >= Math.ceil(catTotal / 50)}
                                    onClick={() => setCatPage(p => p + 1)}>Next</Button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ─── Inventory Checker Tab ────────────────────────────────────── */}
            {tab === "inventory" && (
                <div className="space-y-4">
                    <InventoryChecker />
                    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-xs text-amber-700 space-y-1">
                        <p className="font-semibold">About this checker</p>
                        <p>This makes a live SOAP call to SanMar's Web Services API for real-time inventory. For bulk checks on the catalog, use the SFTP DIP file instead (synced hourly).</p>
                    </div>
                </div>
            )}

            {/* ─── Sync Logs Tab ────────────────────────────────────────────── */}
            {tab === "logs" && (
                <div className="space-y-4">
                    <div className="bg-white rounded-2xl ring-1 ring-black/5 shadow-card overflow-hidden">
                        {logsLoading ? (
                            <div className="p-6 space-y-3 animate-pulse">
                                {[1,2,3].map(i => <div key={i} className="h-10 bg-slate-100 rounded-xl" />)}
                            </div>
                        ) : logs.length === 0 ? (
                            <div className="flex flex-col items-center py-16 text-slate-300">
                                <svg className="w-10 h-10 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                                <p className="text-sm text-slate-400 font-medium">No sync logs yet</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-100 bg-slate-50/50">
                                            <th className="text-left py-3 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Type</th>
                                            <th className="text-left py-3 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Status</th>
                                            <th className="text-right py-3 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide hidden sm:table-cell">Rows</th>
                                            <th className="text-right py-3 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide hidden md:table-cell">File</th>
                                            <th className="text-right py-3 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Duration</th>
                                            <th className="text-right py-3 px-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Started</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((log, idx) => (
                                            <motion.tr key={log.id}
                                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                                transition={{ delay: idx * 0.02 }}
                                                className="border-b border-slate-50">
                                                <td className="py-3 px-4">
                                                    <span className="text-xs font-semibold text-slate-700">
                                                        {TYPE_LABEL[log.type] ?? log.type}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <Badge variant={STATUS_COLOR[log.status] as any} size="sm">{log.status}</Badge>
                                                </td>
                                                <td className="py-3 px-4 text-right text-xs tabular-nums text-slate-500 hidden sm:table-cell">
                                                    {log.rowsProcessed != null
                                                        ? `${log.rowsProcessed.toLocaleString()} / ${log.rowsTotal?.toLocaleString() ?? "?"}`
                                                        : "—"}
                                                </td>
                                                <td className="py-3 px-4 text-right text-xs text-slate-500 hidden md:table-cell">
                                                    {log.fileSizeBytes ? fmtBytes(log.fileSizeBytes) : "—"}
                                                </td>
                                                <td className="py-3 px-4 text-right text-xs tabular-nums text-slate-500">
                                                    {fmtDuration(log.startedAt, log.completedAt)}
                                                </td>
                                                <td className="py-3 px-4 text-right text-xs text-slate-400">
                                                    {fmtDate(log.startedAt)}
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Error details expansion */}
                    {logs.some(l => l.error) && (
                        <div className="space-y-2">
                            {logs.filter(l => l.error).map(log => (
                                <div key={log.id} className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs">
                                    <p className="font-semibold text-red-700 mb-1">{TYPE_LABEL[log.type] ?? log.type} error — {fmtDate(log.startedAt)}</p>
                                    <p className="font-mono text-red-500 break-all">{log.error}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Logs pagination */}
                    {logsTotal > 20 && (
                        <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>{logsTotal} total entries</span>
                            <div className="flex gap-2">
                                <Button size="sm" variant="outline" disabled={logsPage <= 1}
                                    onClick={() => setLogsPage(p => p - 1)}>Previous</Button>
                                <Button size="sm" variant="outline" disabled={logsPage >= Math.ceil(logsTotal / 20)}
                                    onClick={() => setLogsPage(p => p + 1)}>Next</Button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ─── Style detail modal ────────────────────────────────────────── */}
            <Modal open={!!selectedStyle && !importStyle} onClose={() => setSelectedStyle(null)}
                title={selectedStyle ? `Style ${selectedStyle}` : ""} size="lg">
                {styleDetail ? (
                    <div className="space-y-4">
                        <div className="flex gap-4 items-start">
                            {styleDetail.variants[0]?.productImage && (
                                <img src={styleDetail.variants[0].productImage} alt={styleDetail.title ?? selectedStyle!}
                                    className="w-24 h-24 object-contain rounded-xl border border-slate-100 shrink-0" />
                            )}
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">{styleDetail.title ?? selectedStyle}</h3>
                                {styleDetail.brand && <p className="text-sm text-slate-500">{styleDetail.brand}</p>}
                                {styleDetail.category && (
                                    <p className="text-xs text-slate-400">{styleDetail.category}{styleDetail.subcategory ? ` › ${styleDetail.subcategory}` : ""}</p>
                                )}
                                <p className="text-lg font-bold text-brand-700 mt-2">From {fmt(styleDetail.priceCents)}</p>
                            </div>
                        </div>

                        {styleDetail.description && (
                            <p className="text-sm text-slate-600 leading-relaxed">{styleDetail.description}</p>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Colors ({styleDetail.colors.length})</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {styleDetail.colors.map(c => (
                                        <span key={c} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{c}</span>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Sizes ({styleDetail.sizes.length})</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {styleDetail.sizes.map(s => (
                                        <span key={s} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{s}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-center py-12">
                        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                )}
                <ModalFooter>
                    <Button type="button" variant="outline" onClick={() => setSelectedStyle(null)}>Close</Button>
                    <Button type="button" onClick={() => { setImportStyle(selectedStyle); }}>
                        Import to Products
                    </Button>
                </ModalFooter>
            </Modal>

            {/* ─── Import modal ─────────────────────────────────────────────── */}
            {importStyle && (
                <ImportModal
                    style={importStyle}
                    detail={styleDetail}
                    collections={collections}
                    onClose={() => { setImportStyle(null); setSelectedStyle(null); }}
                    onDone={msg => { toast(msg); setImportStyle(null); setSelectedStyle(null); }}
                />
            )}
        </div>
    );
}

"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ToastProvider } from "@/components/ui/toast";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import Image from "next/image";

/* ─── Nav definition ──────────────────────────────────────────────────────── */
type NavChild = { href: string; label: string };
type NavItem  = { href: string; label: string; icon: React.ReactNode; children?: NavChild[] };

const NAV: NavItem[] = [
    {
        href: "/", label: "Dashboard",
        icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" /></svg>
    },
    {
        href: "/admin/orders", label: "Orders",
        icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" /></svg>,
        children: [
            { href: "/admin/orders/drafts",          label: "Drafts"          },
            { href: "/admin/orders/shipping-labels",  label: "Shipping Labels" },
            { href: "/admin/checkouts",               label: "Abandoned Carts" },
        ]
    },
    {
        href: "/admin/products", label: "Products",
        icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
    },
    {
        href: "/admin/shops", label: "Group Shops",
        icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" /></svg>
    },
    {
        href: "/admin/customers", label: "Customers",
        icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" /></svg>
    },
    {
        href: "/admin/discounts", label: "Discounts",
        icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
    },
    {
        href: "/admin/finance", label: "Finance",
        icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" /></svg>
    },
    {
        href: "/admin/analytics", label: "Analytics",
        icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" /></svg>
    },
    {
        href: "/admin/marketing", label: "Marketing",
        icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/></svg>
    },
];

/* ─── Sidebar ─────────────────────────────────────────────────────────────── */
function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [userEmail, setUserEmail] = useState<string | null>(null);

    useEffect(() => {
        try {
            const t = localStorage.getItem("auth_token");
            if (!t) return;
            const payload = JSON.parse(atob(t.split(".")[1]));
            setUserEmail(payload?.email ?? null);
        } catch { /* ignore */ }
    }, []);

    function handleLogout() {
        localStorage.removeItem("auth_token");
        document.cookie = "auth_token=; path=/; max-age=0";
        router.replace("/login");
    }

    return (
        <aside className="sidebar-root w-[220px] shrink-0 flex flex-col sticky top-0 h-screen overflow-y-auto scrollbar-none">
            {/* Brand */}
            <div className="px-4 py-4 flex flex-col items-start gap-1">
                <Image
                    src="/logo.png"
                    alt="Crossroads Custom Apparel"
                    width={140}
                    height={56}
                    className="object-contain"
                    priority
                />
                <div className="sidebar-brand-sub text-[10px]">Admin Dashboard</div>
            </div>

            <div className="sidebar-divider" />

            {/* Navigation */}
            <nav className="flex-1 px-3 py-1 space-y-0.5">
                {NAV.map(item => {
                    const isActive = pathname === item.href ||
                        (item.href !== "/" && pathname?.startsWith(item.href));
                    const showSubs = isActive && item.children;

                    return (
                        <div key={item.href}>
                            <Link href={item.href} className={cn("nav-item", isActive && "active")}>
                                <span className={cn(
                                    "shrink-0 transition-colors duration-200",
                                    isActive ? "text-brand-400" : "text-ink-400"
                                )}>
                                    {item.icon}
                                </span>
                                <span className="leading-none">{item.label}</span>
                            </Link>

                            <AnimatePresence>
                                {showSubs && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                                        className="overflow-hidden"
                                    >
                                        <div className="sidebar-subnav-rail ml-4 pl-3 mt-0.5 mb-1 space-y-0.5">
                                            {item.children!.map(sub => {
                                                const subActive = pathname === sub.href;
                                                return (
                                                    <Link
                                                        key={sub.href}
                                                        href={sub.href}
                                                        className={cn(
                                                            "flex items-center px-3 py-2 rounded-lg text-xs font-medium",
                                                            "transition-colors duration-150",
                                                            subActive
                                                                ? "text-brand-300 bg-brand-600/10"
                                                                : "sidebar-subnav-text hover:text-white hover:bg-white-8"
                                                        )}
                                                    >
                                                        {sub.label}
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    );
                })}
            </nav>

            {/* Footer / user */}
            <div className="sidebar-footer">
                {userEmail && (
                    <p className="sidebar-user-email text-[11px] font-medium truncate px-2 py-1 mb-1">
                        {userEmail}
                    </p>
                )}
                <button
                    type="button"
                    onClick={handleLogout}
                    className="sidebar-logout-text w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 hover:bg-red-500/10 hover:text-red-400"
                >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 shrink-0">
                        <path fillRule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Sign out
                </button>
            </div>
        </aside>
    );
}

/* ─── Shell ───────────────────────────────────────────────────────────────── */
export default function AdminShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    if (pathname?.startsWith("/shop/") || pathname === "/login") {
        return <ToastProvider><main>{children}</main></ToastProvider>;
    }

    return (
        <ToastProvider>
            <div className="app-bg min-h-screen flex">
                <Sidebar />
                <main className="flex-1 min-w-0 overflow-y-auto">
                    <motion.div
                        key={pathname}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                        className="p-7 max-w-[1200px]"
                    >
                        {children}
                    </motion.div>
                </main>
            </div>
        </ToastProvider>
    );
}

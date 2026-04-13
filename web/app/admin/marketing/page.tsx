"use client";
import Link from "next/link";
import { motion } from "framer-motion";

const cards = [
    {
        href: "/admin/discounts",
        emoji: "🏷️",
        title: "Discount Codes",
        desc: "Create percent-off or fixed-amount codes for customers to apply at checkout.",
        cta: "Manage discounts",
        color: "from-violet-500/10 to-purple-500/10",
        border: "border-violet-200/60",
        badge: "bg-violet-100 text-violet-700",
    },
    {
        href: "/admin/shops",
        emoji: "🏪",
        title: "Group Shops",
        desc: "Share a unique link with a team or group so everyone can order at the same time.",
        cta: "Manage shops",
        color: "from-emerald-500/10 to-teal-500/10",
        border: "border-emerald-200/60",
        badge: "bg-emerald-100 text-emerald-700",
    },
    {
        href: "/admin/orders",
        emoji: "📬",
        title: "Order Follow-ups",
        desc: "Review orders that may need follow-up. Emails are automatically sent on order placement.",
        cta: "View orders",
        color: "from-blue-500/10 to-sky-500/10",
        border: "border-blue-200/60",
        badge: "bg-blue-100 text-blue-700",
    },
    {
        href: "/admin/analytics",
        emoji: "📊",
        title: "Performance Insights",
        desc: "Track revenue, top products, and daily order trends to find what works.",
        cta: "View analytics",
        color: "from-amber-500/10 to-orange-500/10",
        border: "border-amber-200/60",
        badge: "bg-amber-100 text-amber-700",
    },
];

export default function MarketingPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="page-title">Marketing</h1>
                <p className="page-subtitle">Promote your shop with discount codes, group links, and insights</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
                {cards.map((c, i) => (
                    <motion.div key={c.href} initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.08 }}
                        className={`bg-gradient-to-br ${c.color} border ${c.border} rounded-2xl p-6 flex flex-col gap-4 hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-300`}>
                        <div className="flex items-start justify-between">
                            <span className="text-3xl">{c.emoji}</span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.badge}`}>Active</span>
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-slate-900 mb-1">{c.title}</h3>
                            <p className="text-xs text-slate-500 leading-relaxed">{c.desc}</p>
                        </div>
                        <Link href={c.href}>
                            <motion.span whileHover={{ x:2 }} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-brand-700 transition-colors">
                                {c.cta}
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                            </motion.span>
                        </Link>
                    </motion.div>
                ))}
            </div>

            <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.4 }}
                className="bg-gradient-to-r from-brand-50 to-violet-50 border border-brand-100 rounded-2xl p-5">
                <div className="flex items-start gap-3">
                    <span className="text-2xl">🚀</span>
                    <div>
                        <p className="text-sm font-bold text-slate-800 mb-1">Coming soon</p>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            Email export lists, UTM campaign tracking, abandoned checkout reminders, and bulk SMS notifications for group shop deadlines.
                        </p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [showPass, setShowPass] = useState(false);

    useEffect(() => {
        if (typeof window !== "undefined" && localStorage.getItem("auth_token")) {
            router.replace("/");
        }
    }, [router]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000/api";
            const res = await fetch(`${base}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error ?? "Login failed"); return; }
            localStorage.setItem("auth_token", data.token);
            document.cookie = `auth_token=${data.token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
            router.replace("/");
        } catch {
            setError("Could not connect to the server. Is the API running?");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="login-page min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
            {/* Animated background orbs */}
            <div className="login-orb-1 orb w-[500px] h-[500px] opacity-30" />
            <div className="login-orb-2 orb w-[400px] h-[400px] opacity-20" />

            <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0,  scale: 1    }}
                transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                className="relative w-full max-w-sm z-10"
            >
                {/* Card */}
                <div className="login-card rounded-3xl p-8 shadow-modal ring-1 ring-white/20">
                    {/* Logo */}
                    <div className="flex flex-col items-center mb-8">
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.1, duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
                            className="mb-4 flex justify-center"
                        >
                            <Image
                                src="/logo.png"
                                alt="Crossroads Custom Apparel"
                                width={160}
                                height={80}
                                className="object-contain mx-auto"
                                priority
                            />
                        </motion.div>
                        <h1 className="text-lg font-bold text-white text-center leading-snug">Crossroads Custom Apparel</h1>
                        <p className="login-subtitle text-sm mt-1">Sign in to your dashboard</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Email */}
                        <div>
                            <label htmlFor="email" className="login-label block text-xs font-semibold mb-1.5">
                                Email address
                            </label>
                            <input
                                id="email"
                                type="email"
                                autoComplete="email"
                                required
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                className="login-input w-full rounded-xl px-3.5 py-3 text-sm transition-all duration-200 outline-none"
                            />
                        </div>

                        {/* Password */}
                        <div>
                            <label htmlFor="password" className="login-label block text-xs font-semibold mb-1.5">
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPass ? "text" : "password"}
                                    autoComplete="current-password"
                                    required
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="login-input w-full rounded-xl px-3.5 py-3 pr-10 text-sm transition-all duration-200 outline-none"
                                />
                                <button
                                    type="button"
                                    aria-label={showPass ? "Hide password" : "Show password"}
                                    onClick={() => setShowPass(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 login-eye-btn transition-colors"
                                >
                                    {showPass ? (
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                        </svg>
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Error */}
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="login-error rounded-xl px-4 py-3 text-sm font-medium"
                            >
                                {error}
                            </motion.div>
                        )}

                        {/* Submit */}
                        <motion.button
                            type="submit"
                            disabled={loading}
                            whileTap={{ scale: 0.97 }}
                            whileHover={{ y: -1 }}
                            className="login-btn w-full py-3 rounded-xl text-white text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 mt-2 btn-shine disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {loading && (
                                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            )}
                            {loading ? "Signing in…" : "Sign in"}
                        </motion.button>
                    </form>
                </div>

                <p className="login-footer text-center text-xs mt-6">
                    Crossroads Custom Apparel &mdash; Admin Portal
                </p>
            </motion.div>
        </div>
    );
}

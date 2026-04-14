// Lightweight fetch helper used across admin + shop

/**
 * Resolve a product image URL.
 * - Absolute URLs (Shopify CDN, https://...) are returned as-is.
 * - Relative paths (/uploads/...) are prefixed with the API server base.
 */
export function imgUrl(url: string): string {
    if (!url) return "";
    if (/^https?:\/\//.test(url)) return url;
    const base = (process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000/api").replace(/\/api$/, "");
    return `${base}${url}`;
}

function getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("auth_token");
}

export async function api(
    path: string,
    init?: RequestInit
): Promise<any> {
    const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000/api";
    const token = getToken();
    const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    const res = await fetch(`${base}${path}`, {
        headers: {
            "Content-Type": "application/json",
            ...authHeader,
            ...(init?.headers || {})
        },
        ...init
    });

    if (res.status === 401) {
        // Token expired or invalid — clear and redirect to login
        if (typeof window !== "undefined") {
            localStorage.removeItem("auth_token");
            window.location.href = "/login";
        }
        throw new Error("unauthorized");
    }

    if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
            const j = await res.json();
            msg += j?.error ? `: ${j.error}` : j?.message ? `: ${j.message}` : "";
        } catch {
            // ignore
        }
        throw new Error(msg);
    }
    if (res.status === 204 || init?.method === "HEAD") return null;
    const text = await res.text();
    try { return text ? JSON.parse(text) : null; } catch { return text; }
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    // Only protect admin routes (and root dashboard)
    const isAdminRoute = pathname === "/" || pathname.startsWith("/admin");

    if (!isAdminRoute) return NextResponse.next();

    // Check for auth token in cookie (set after login)
    const token = req.cookies.get("auth_token")?.value;

    if (!token) {
        const loginUrl = req.nextUrl.clone();
        loginUrl.pathname = "/login";
        loginUrl.searchParams.set("from", pathname);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all paths except:
         * - /login
         * - /shop/* (public storefront)
         * - /_next/* (Next.js internals)
         * - /api/* (API routes if any)
         * - Static files (favicon, images, etc.)
         */
        "/((?!login|shop|_next/|_next/static|_next/image|api/|favicon\\.ico|robots\\.txt|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.svg|.*\\.ico|.*\\.webp).*)"
    ]
};

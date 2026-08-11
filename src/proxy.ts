import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic redirect only.
 *
 * This checks for the *presence* of a session cookie — it does not validate it,
 * and it cannot see whether the account is active. That is deliberate: the real
 * enforcement lives in `src/app/(app)/layout.tsx` and in `authorize()` on every
 * server action, both of which hit the database. This proxy exists purely so a
 * signed-out visitor bounces to /login without paying for a render first.
 *
 * Never add authorization logic here.
 */
export function proxy(request: NextRequest) {
  const hasSessionCookie = Boolean(getSessionCookie(request));

  if (!hasSessionCookie) {
    const loginUrl = new URL("/login", request.url);
    const { pathname, search } = request.nextUrl;

    // Preserve where they were heading so login can send them back.
    if (pathname !== "/dashboard") {
      loginUrl.searchParams.set("next", `${pathname}${search}`);
    }

    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};

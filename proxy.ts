import { NextRequest, NextResponse } from "next/server";

const ADMIN_SESSION_COOKIE = "dbd_admin_session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAdminPage = pathname.startsWith("/admin");
  const isAdminLoginPage = pathname === "/admin/login";
  const isAdminLoginApi = pathname === "/api/admin/login";
  const isAdminLogoutApi = pathname === "/api/admin/logout";

  if (!isAdminPage || isAdminLoginPage || isAdminLoginApi || isAdminLogoutApi) {
    return NextResponse.next();
  }

  const session = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;

  if (session !== "authenticated") {
    const loginUrl = new URL("/admin/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
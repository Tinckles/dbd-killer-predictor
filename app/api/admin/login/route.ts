import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/app/lib/admin-auth";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const password = String(formData.get("password") || "");
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  // Check if the password matches the one defined in .env.local
  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.redirect(new URL("/admin/login?error=invalid", baseUrl));
  }

  // If password is correct, set the session cookie
  const response = NextResponse.redirect(new URL("/admin", baseUrl));

  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: "authenticated",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8, // Cookie will expire in 8 hours
  });

  return response;
}
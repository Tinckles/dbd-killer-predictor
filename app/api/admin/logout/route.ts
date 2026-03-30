import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/app/lib/admin-auth";

export async function POST() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const response = NextResponse.redirect(new URL("/admin/login", baseUrl));

  // Clear the session cookie on logout
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}
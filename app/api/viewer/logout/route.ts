import { NextResponse } from "next/server";
import { VIEWER_SESSION_COOKIE } from "@/lib/viewer-session";

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const response = NextResponse.redirect(new URL("/", baseUrl));

  response.cookies.set({
    name: VIEWER_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 0,
  });

  return response;
}
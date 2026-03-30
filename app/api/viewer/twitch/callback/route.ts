import { NextRequest, NextResponse } from "next/server";
import {
  VIEWER_SESSION_COOKIE,
  encodeViewerSession,
} from "@/lib/viewer-session";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  if (error) {
    return NextResponse.redirect(new URL("/?viewer=error", baseUrl));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/?viewer=missing_code", baseUrl));
  }

  const clientId = process.env.TWITCH_CLIENT_ID!;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET!;
  const redirectUri = process.env.TWITCH_VIEWER_REDIRECT_URI!;

  const tokenRes = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  const tokenData = await tokenRes.json();

  if (!tokenRes.ok || !tokenData.access_token) {
    console.error("Viewer Twitch token exchange failed:", tokenData);
    return NextResponse.redirect(new URL("/?viewer=token_error", baseUrl));
  }

  const userRes = await fetch("https://api.twitch.tv/helix/users", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "Client-Id": clientId,
    },
  });

  const userData = await userRes.json();
  const user = userData?.data?.[0];

  if (!userRes.ok || !user?.id || !user?.login) {
    console.error("Viewer Twitch user fetch failed:", userData);
    return NextResponse.redirect(new URL("/?viewer=user_error", baseUrl));
  }

  const response = NextResponse.redirect(new URL("/?viewer=connected", baseUrl));

  response.cookies.set({
    name: VIEWER_SESSION_COOKIE,
    value: encodeViewerSession({
      id: user.id,
      username: user.login,
      displayName: user.display_name,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      savedAt: new Date().toISOString(),
    }),
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
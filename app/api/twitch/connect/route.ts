import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.TWITCH_CLIENT_ID!;
  const redirectUri = process.env.TWITCH_REDIRECT_URI!;

  const scopes = [
    "user:bot",
    "user:read:chat",
    "user:write:chat",
    "channel:read:subscriptions",
  ].join(" ");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    force_verify: "false",
    state: crypto.randomUUID(),
  });

  return NextResponse.redirect(
    `https://id.twitch.tv/oauth2/authorize?${params.toString()}`
  );
}
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL("/admin?twitch=error", request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/admin?twitch=missing_code", request.url)
    );
  }

  const clientId = process.env.TWITCH_CLIENT_ID!;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET!;
  const redirectUri = process.env.TWITCH_REDIRECT_URI!;

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

  if (!tokenRes.ok) {
    console.error("Failed to exchange Twitch code for token:", tokenData);

    return NextResponse.redirect(
      new URL("/admin?twitch=token_error", request.url)
    );
  }

  const validateRes = await fetch("https://id.twitch.tv/oauth2/validate", {
    headers: {
      Authorization: `OAuth ${tokenData.access_token}`,
    },
  });

  const validateData = await validateRes.json();

  if (!validateRes.ok || !validateData?.user_id) {
    console.error("Failed to validate Twitch token:", validateData);

    return NextResponse.redirect(
      new URL("/admin?twitch=validate_error", request.url)
    );
  }

  const supabase = createServerSupabaseClient();

  const { error: upsertError } = await supabase
    .from("twitch_connections")
    .upsert(
      {
        channel_user_id: validateData.user_id,
        channel_username: validateData.login ?? null,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token ?? null,
        expires_in: tokenData.expires_in ?? null,
        scope: tokenData.scope ?? [],
        token_type: tokenData.token_type ?? null,
        saved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "channel_user_id" }
    );

  if (upsertError) {
    console.error("Failed to save Twitch connection:", upsertError);

    return NextResponse.redirect(
      new URL("/admin?twitch=save_error", request.url)
    );
  }

  return NextResponse.redirect(
    new URL("/admin?twitch=connected", request.url)
  );
}
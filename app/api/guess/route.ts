import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  VIEWER_SESSION_COOKIE,
  decodeViewerSession,
} from "@/lib/viewer-session";

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  const formData = await request.formData();

  const killerId = Number(formData.get("killerId"));
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const cookieStore = await cookies();
  const viewerSession = decodeViewerSession(
    cookieStore.get(VIEWER_SESSION_COOKIE)?.value
  );

  if (!viewerSession) {
    return NextResponse.redirect(
      new URL("/?guess=not_signed_in", baseUrl),
      303
    );
  }

  if (!killerId) {
    return NextResponse.redirect(
      new URL("/?guess=missing_data", baseUrl),
      303
    );
  }

  const { data: round } = await supabase
    .from("rounds")
    .select("id, status")
    .in("status", ["open", "locked"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!round) {
    return NextResponse.redirect(
      new URL("/?guess=no_open_round", baseUrl),
      303
    );
  }

  if (round.status !== "open") {
    return NextResponse.redirect(
      new URL("/?guess=locked", baseUrl),
      303
    );
  }

  const { error } = await supabase
    .from("guesses")
    .upsert(
      {
        round_id: round.id,
        twitch_user_id: viewerSession.id,
        twitch_username: viewerSession.username,
        killer_id: killerId,
      },
      {
        onConflict: "round_id,twitch_user_id",
      }
    );

  if (error) {
    console.error("Failed to save browser guess:", error);
    return NextResponse.redirect(
      new URL("/?guess=error", baseUrl),
      303
    );
  }

  return NextResponse.redirect(
    new URL(`/?guess=success&killerId=${killerId}`, baseUrl),
    303
  );
}
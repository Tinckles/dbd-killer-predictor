import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { fetchWithBroadcasterToken } from "@/app/lib/twitch-connection";
import { isAdminAuthenticated } from "@/app/lib/admin-auth";

const SUBSCRIBER_BONUS_POINTS = 1;

async function isSubscribedToBroadcaster(userId: string) {
  try {
const broadcasterId = process.env.TWITCH_CHANNEL_USER_ID!;

const res = await fetchWithBroadcasterToken(
  `https://api.twitch.tv/helix/subscriptions?broadcaster_id=${encodeURIComponent(
    broadcasterId
  )}&user_id=${encodeURIComponent(userId)}`
);

    if (res.status === 404) {
      return false;
    }

    const data = await res.json();

    if (!res.ok) {
      console.error("Subscription check failed:", data);
      return false;
    }

    return Array.isArray(data?.data) && data.data.length > 0;
  } catch (error) {
    console.error("Subscription check error:", error);
    return false;
  }
}

export async function POST(request: Request) {
  const authenticated = await isAdminAuthenticated();

  if (!authenticated) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const formData = await request.formData();
  const killerId = Number(formData.get("killerId"));

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  if (!killerId) {
    return NextResponse.redirect(new URL("/admin?resolve=missing_killer", baseUrl));
  }

  const { data: round } = await supabase
    .from("rounds")
    .select("id, status")
    .in("status", ["open", "locked"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!round) {
    return NextResponse.redirect(new URL("/admin?resolve=no_round", baseUrl));
  }

  const { error: roundUpdateError } = await supabase
    .from("rounds")
    .update({
      status: "resolved",
      actual_killer_id: killerId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", round.id);

  if (roundUpdateError) {
    console.error("Failed to resolve round:", roundUpdateError);
    return NextResponse.redirect(new URL("/admin?resolve=error", baseUrl));
  }

  const { data: guesses, error: guessesError } = await supabase
    .from("guesses")
    .select("twitch_user_id, twitch_username, killer_id")
    .eq("round_id", round.id);

  if (guessesError || !guesses) {
    console.error("Failed to load guesses:", guessesError);
    return NextResponse.redirect(new URL("/admin?resolve=error", baseUrl));
  }

  for (const guess of guesses) {
    const isCorrect = guess.killer_id === killerId;
    const isSubscriber = isCorrect
      ? await isSubscribedToBroadcaster(guess.twitch_user_id)
      : false;

    const awardedPoints = isCorrect ? 1 + (isSubscriber ? SUBSCRIBER_BONUS_POINTS : 0) : 0;

    const { data: existingStats } = await supabase
      .from("user_stats")
      .select(
        "twitch_user_id, twitch_username, points, correct_guesses, total_guesses, current_streak, best_streak"
      )
      .eq("twitch_user_id", guess.twitch_user_id)
      .maybeSingle();

    const currentPoints = existingStats?.points ?? 0;
    const currentCorrect = existingStats?.correct_guesses ?? 0;
    const currentTotal = existingStats?.total_guesses ?? 0;
    const currentStreak = existingStats?.current_streak ?? 0;
    const bestStreak = existingStats?.best_streak ?? 0;

    const newCurrentStreak = isCorrect ? currentStreak + 1 : 0;
    const newBestStreak = Math.max(bestStreak, newCurrentStreak);

    const payload = {
      twitch_user_id: guess.twitch_user_id,
      twitch_username: guess.twitch_username,
      points: currentPoints + awardedPoints,
      correct_guesses: currentCorrect + (isCorrect ? 1 : 0),
      total_guesses: currentTotal + 1,
      current_streak: newCurrentStreak,
      best_streak: newBestStreak,
    };

    const { error: statsError } = await supabase
      .from("user_stats")
      .upsert(payload, { onConflict: "twitch_user_id" });

    if (statsError) {
      console.error("Failed updating user_stats:", statsError);
    }
  }

  return NextResponse.redirect(new URL("/admin", baseUrl));
}
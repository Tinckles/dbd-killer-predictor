import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = createServerSupabaseClient();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const authenticated = await isAdminAuthenticated();

if (!authenticated) {
  return new Response("Unauthorized", { status: 401 });
}
  try {
    // 1. Delete all guesses
    await supabase.from("guesses").delete().neq("id", 0);

    // 2. Delete all rounds
    await supabase.from("rounds").delete().neq("id", 0);

    // 3. Reset all user stats
    await supabase
      .from("user_stats")
      .update({
        points: 0,
        correct_guesses: 0,
        total_guesses: 0,
        current_streak: 0,
        best_streak: 0,
      })
      .neq("twitch_user_id", "");

    return NextResponse.redirect(new URL("/admin?reset=all_success", baseUrl));
  } catch (error) {
    console.error("Reset ALL error:", error);
    return NextResponse.redirect(new URL("/admin?reset=error", baseUrl));
  }
}
import { isAdminAuthenticated } from "@/app/lib/admin-auth";
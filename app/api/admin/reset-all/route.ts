import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/app/lib/admin-auth";

export async function POST() {
  const authenticated = await isAdminAuthenticated();

  if (!authenticated) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  try {
    await supabase.from("guesses").delete().neq("id", 0);

    await supabase.from("rounds").delete().neq("id", 0);

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

    await supabase
      .from("redemptions")
      .delete()
      .neq("id", 0);

    return NextResponse.redirect(
      new URL("/admin?reset=all_success", baseUrl),
      303
    );
  } catch (error) {
    console.error("Reset ALL error:", error);

    return NextResponse.redirect(
      new URL("/admin?reset=error", baseUrl),
      303
    );
  }
}
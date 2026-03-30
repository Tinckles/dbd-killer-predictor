import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = createServerSupabaseClient();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const authenticated = await isAdminAuthenticated();

if (!authenticated) {
  return new Response("Unauthorized", { status: 401 });
}
  const { data: activeRounds } = await supabase
    .from("rounds")
    .select("id")
    .in("status", ["open", "locked"]);

  if (activeRounds && activeRounds.length > 0) {
    const activeRoundIds = activeRounds.map((round) => round.id);

    await supabase
      .from("guesses")
      .delete()
      .in("round_id", activeRoundIds);

    await supabase
      .from("rounds")
      .update({
        status: "resolved",
        actual_killer_id: null,
        locked_at: null,
        resolved_at: new Date().toISOString(),
      })
      .in("id", activeRoundIds);
  }

  return NextResponse.redirect(new URL("/admin?reset=success", baseUrl));
}
import { isAdminAuthenticated } from "@/app/lib/admin-auth";
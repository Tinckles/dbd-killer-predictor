import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = createServerSupabaseClient();
const authenticated = await isAdminAuthenticated();

if (!authenticated) {
  return new Response("Unauthorized", { status: 401 });
}
  const { data: currentRound } = await supabase
    .from("rounds")
    .select("id")
    .eq("status", "open")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (currentRound) {
    await supabase
      .from("rounds")
      .update({
        status: "locked",
        locked_at: new Date().toISOString(),
      })
      .eq("id", currentRound.id);
  }

  return NextResponse.redirect(new URL("/admin", process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"));
}
import { isAdminAuthenticated } from "@/app/lib/admin-auth";
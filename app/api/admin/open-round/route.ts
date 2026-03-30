import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = createServerSupabaseClient();
const authenticated = await isAdminAuthenticated();

if (!authenticated) {
  return new Response("Unauthorized", { status: 401 });
}
  const { data: existingRound } = await supabase
    .from("rounds")
    .select("id")
    .in("status", ["open", "locked"])
    .limit(1)
    .maybeSingle();

  if (existingRound) {
    return NextResponse.redirect(new URL("/admin", process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"));
  }

  await supabase.from("rounds").insert({
    status: "open",
  });

  return NextResponse.redirect(new URL("/admin", process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"));
}
import { isAdminAuthenticated } from "@/app/lib/admin-auth";
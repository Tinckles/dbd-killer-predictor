import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdminAuthenticated } from "@/app/lib/admin-auth";

export async function POST(request: Request) {
  const authenticated = await isAdminAuthenticated();

  if (!authenticated) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const formData = await request.formData();

  const code = String(formData.get("code") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const cost = Number(formData.get("cost"));
  const active = formData.get("active") === "on";

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  if (!code || !title || !Number.isFinite(cost) || cost < 0) {
    return NextResponse.redirect(new URL("/admin?reward=error", baseUrl));
  }

  const { error } = await supabase
    .from("reward_types")
    .update({
      title,
      cost,
      active,
      updated_at: new Date().toISOString(),
    })
    .eq("code", code);

  if (error) {
    console.error("Failed to update reward:", error);
    return NextResponse.redirect(new URL("/admin?reward=error", baseUrl));
  }

  return NextResponse.redirect(new URL("/admin?reward=saved", baseUrl));
}
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const formData = await request.formData();
const authenticated = await isAdminAuthenticated();

if (!authenticated) {
  return new Response("Unauthorized", { status: 401 });
}
  const redemptionId = Number(formData.get("redemptionId"));
  const status = String(formData.get("status") || "");
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  if (!redemptionId || !status) {
    return NextResponse.redirect(
      new URL("/admin?redemption=missing_data", baseUrl)
    );
  }

  const { data, error } = await supabase.rpc("update_redemption_status", {
    p_redemption_id: redemptionId,
    p_new_status: status,
  });

  if (error) {
    console.error("Update redemption status error:", error);
    return NextResponse.redirect(
      new URL("/admin?redemption=error", baseUrl)
    );
  }

  const result = data?.[0];

  if (!result?.success) {
    return NextResponse.redirect(
      new URL(`/admin?redemption=${encodeURIComponent(status)}_failed`, baseUrl)
    );
  }

  return NextResponse.redirect(
    new URL(`/admin?redemption=${encodeURIComponent(status)}_success`, baseUrl)
  );
}
import { isAdminAuthenticated } from "@/app/lib/admin-auth";
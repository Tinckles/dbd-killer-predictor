import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("reward_types")
    .select("*")
    .order("cost", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to load rewards" }, { status: 500 });
  }

  return NextResponse.json({ rewards: data });
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();

  const body = await request.json();
  const { code, title, cost, active } = body;

  if (!code || !title || typeof cost !== "number") {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
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
    return NextResponse.json({ error: "Failed to update reward" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
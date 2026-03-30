import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  fetchWithBroadcasterToken,
  loadBroadcasterConnection,
} from "@/app/lib/twitch-connection";
import {
  VIEWER_SESSION_COOKIE,
  decodeViewerSession,
} from "@/lib/viewer-session";

type RewardTypeRow = {
  code: string;
  title: string;
  cost: number;
  active: boolean;
};

async function sendChatMessage(message: string) {
  try {
    const connection = await loadBroadcasterConnection();

    const broadcasterId =
      process.env.TWITCH_CHANNEL_USER_ID || connection.channel_user_id;

    const senderId =
      process.env.TWITCH_BOT_USER_ID || connection.channel_user_id;

    if (!broadcasterId || !senderId) {
      console.error("Missing Twitch chat config:", {
        broadcasterId,
        senderId,
      });
      return {
        ok: false,
        error: "Missing Twitch chat config.",
      };
    }

    const res = await fetchWithBroadcasterToken(
      "https://api.twitch.tv/helix/chat/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          broadcaster_id: broadcasterId,
          sender_id: senderId,
          message,
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      console.error("Failed to send redemption chat message:", {
        status: res.status,
        statusText: res.statusText,
        response: data,
        broadcasterId,
        senderId,
      });

      return {
        ok: false,
        error: data?.message || "Unknown Twitch chat error.",
      };
    }

    return {
      ok: true,
      error: null,
    };
  } catch (error) {
    console.error("Redemption chat message error:", error);
    return {
      ok: false,
      error: "Exception while sending Twitch chat message.",
    };
  }
}

function buildRewardPayload(
  rewardType: string,
  body: any
): { valid: true; payload: Record<string, unknown> } | { valid: false; message: string } {
  if (rewardType === "join_game") {
    return {
      valid: true,
      payload: {
        note: "Wants to join next game",
      },
    };
  }

  if (rewardType === "build_request") {
    const survivor = String(body.survivor || "").trim();
    const perks = Array.isArray(body.perks) ? body.perks : [];

    if (!survivor) {
      return {
        valid: false,
        message: "Please choose a survivor.",
      };
    }

    if (perks.length !== 4 || perks.some((p: unknown) => !String(p).trim())) {
      return {
        valid: false,
        message: "Please enter exactly 4 perks.",
      };
    }

    return {
      valid: true,
      payload: {
        survivor,
        perks,
      },
    };
  }

  return {
    valid: false,
    message: "Invalid reward type.",
  };
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const cookieStore = await cookies();

  const session = decodeViewerSession(
    cookieStore.get(VIEWER_SESSION_COOKIE)?.value
  );

  if (!session) {
    return NextResponse.json(
      { success: false, message: "You must sign in with Twitch first." },
      { status: 401 }
    );
  }

  const body = await request.json();
  const rewardType = String(body.rewardType || "").trim();

  if (!rewardType) {
    return NextResponse.json(
      { success: false, message: "Invalid reward type." },
      { status: 400 }
    );
  }

  const { data: reward, error: rewardError } = await supabase
    .from("reward_types")
    .select("code, title, cost, active")
    .eq("code", rewardType)
    .maybeSingle();

  if (rewardError) {
    console.error("Failed to load reward type:", rewardError);
    return NextResponse.json(
      { success: false, message: "Failed to load reward settings." },
      { status: 500 }
    );
  }

  const rewardRow = reward as RewardTypeRow | null;

  if (!rewardRow || !rewardRow.active) {
    return NextResponse.json(
      { success: false, message: "That reward is not available right now." },
      { status: 400 }
    );
  }

  const payloadResult = buildRewardPayload(rewardType, body);

  if (!payloadResult.valid) {
    return NextResponse.json(
      { success: false, message: payloadResult.message },
      { status: 400 }
    );
  }

  const cost = rewardRow.cost;
  const payload = payloadResult.payload;

  const { data, error } = await supabase.rpc("redeem_reward", {
    p_twitch_user_id: session.id,
    p_twitch_username: session.username,
    p_reward_type: rewardType,
    p_cost: cost,
    p_payload: payload,
  });

  if (error) {
    console.error("Redemption RPC error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to redeem reward." },
      { status: 500 }
    );
  }

  const result = data?.[0];

  if (!result?.success) {
    return NextResponse.json(
      {
        success: false,
        message: result?.message || "Redemption failed.",
        remainingPoints: result?.remaining_points ?? 0,
      },
      { status: 400 }
    );
  }

  let chatMessage = `@${session.username} redeemed ${cost} points for ${rewardRow.title}. Remaining points: ${result.remaining_points}`;

  if (rewardType === "build_request") {
    const survivorName =
      typeof payload.survivor === "string"
        ? payload.survivor
        : "Unknown Survivor";

    chatMessage = `@${session.username} redeemed ${cost} points for ${rewardRow.title}: ${survivorName}. Remaining points: ${result.remaining_points}`;
  }

  const chatResult = await sendChatMessage(chatMessage);

  return NextResponse.json({
    success: true,
    message: result.message,
    redemptionId: result.redemption_id,
    remainingPoints: result.remaining_points,
    chatPosted: chatResult.ok,
    chatError: chatResult.error,
  });
}
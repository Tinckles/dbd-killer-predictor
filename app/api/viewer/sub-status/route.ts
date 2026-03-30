import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { fetchWithBroadcasterToken } from "@/app/lib/twitch-connection";
import {
  VIEWER_SESSION_COOKIE,
  decodeViewerSession,
} from "@/lib/viewer-session";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const viewerSession = decodeViewerSession(
      cookieStore.get(VIEWER_SESSION_COOKIE)?.value
    );

    if (!viewerSession) {
      return NextResponse.json({ subscribed: false }, { status: 200 });
    }

    const broadcasterId = process.env.TWITCH_CHANNEL_USER_ID!;

    const res = await fetchWithBroadcasterToken(
      `https://api.twitch.tv/helix/subscriptions?broadcaster_id=${encodeURIComponent(
        broadcasterId
      )}&user_id=${encodeURIComponent(viewerSession.id)}`
    );

    if (res.status === 404) {
      return NextResponse.json({ subscribed: false }, { status: 200 });
    }

    const data = await res.json();

    if (!res.ok) {
      console.error("Viewer sub-status check failed:", data);
      return NextResponse.json({ subscribed: false }, { status: 200 });
    }

    const subscribed = Array.isArray(data?.data) && data.data.length > 0;

    return NextResponse.json({ subscribed }, { status: 200 });
  } catch (error) {
    console.error("Viewer sub-status route error:", error);
    return NextResponse.json({ subscribed: false }, { status: 200 });
  }
}
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  VIEWER_SESSION_COOKIE,
  decodeViewerSession,
} from "@/lib/viewer-session";

export async function GET() {
  const cookieStore = await cookies();
  const session = decodeViewerSession(
    cookieStore.get(VIEWER_SESSION_COOKIE)?.value
  );

  if (!session) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  return NextResponse.json(
    {
      user: {
        id: session.id,
        username: session.username,
        displayName: session.displayName ?? session.username,
      },
    },
    { status: 200 }
  );
}
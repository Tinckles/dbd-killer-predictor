export type ViewerSession = {
  id: string;
  username: string;
  displayName?: string;
  accessToken: string;
  refreshToken?: string;
  savedAt: string;
};

export const VIEWER_SESSION_COOKIE = "dbd_viewer_session";

export function encodeViewerSession(session: ViewerSession): string {
  return Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
}

export function decodeViewerSession(value?: string | null): ViewerSession | null {
  if (!value) return null;

  try {
    const json = Buffer.from(value, "base64url").toString("utf8");
    return JSON.parse(json) as ViewerSession;
  } catch {
    return null;
  }
}
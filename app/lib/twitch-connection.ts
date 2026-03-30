import { createServerSupabaseClient } from "@/lib/supabase/server";

export type BroadcasterConnection = {
  channel_user_id: string;
  channel_username: string | null;
  access_token: string;
  refresh_token: string | null;
  expires_in: number | null;
  scope: string[];
  token_type: string | null;
  saved_at: string;
};

async function getStoredBroadcasterConnection() {
  const supabase = createServerSupabaseClient();
  const channelUserId = process.env.TWITCH_CHANNEL_USER_ID;

  let query = supabase
    .from("twitch_connections")
    .select(
      "channel_user_id, channel_username, access_token, refresh_token, expires_in, scope, token_type, saved_at"
    )
    .order("saved_at", { ascending: false })
    .limit(1);

  if (channelUserId) {
    query = supabase
      .from("twitch_connections")
      .select(
        "channel_user_id, channel_username, access_token, refresh_token, expires_in, scope, token_type, saved_at"
      )
      .eq("channel_user_id", channelUserId)
      .limit(1);
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data) {
    throw new Error("No Twitch broadcaster connection found.");
  }

  return data as BroadcasterConnection;
}

function isConnectionLikelyExpired(connection: BroadcasterConnection) {
  if (!connection.expires_in || !connection.saved_at) return false;

  const savedAtMs = new Date(connection.saved_at).getTime();
  const expiresAtMs = savedAtMs + connection.expires_in * 1000;

  return Date.now() >= expiresAtMs - 5 * 60 * 1000;
}

export async function refreshBroadcasterConnection(
  connection: BroadcasterConnection
) {
  if (!connection.refresh_token) {
    throw new Error("No refresh token available for Twitch connection.");
  }

  const clientId = process.env.TWITCH_CLIENT_ID!;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET!;

  const tokenRes = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: connection.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const tokenData = await tokenRes.json();

  if (!tokenRes.ok || !tokenData?.access_token) {
    console.error("Failed to refresh Twitch token:", tokenData);
    throw new Error("Failed to refresh Twitch broadcaster token.");
  }

  const supabase = createServerSupabaseClient();

  const { error: updateError } = await supabase
    .from("twitch_connections")
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token ?? connection.refresh_token,
      expires_in: tokenData.expires_in ?? null,
      scope: tokenData.scope ?? connection.scope ?? [],
      token_type: tokenData.token_type ?? connection.token_type ?? null,
      saved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("channel_user_id", connection.channel_user_id);

  if (updateError) {
    console.error("Failed to save refreshed Twitch token:", updateError);
    throw new Error("Failed to persist refreshed Twitch broadcaster token.");
  }

  return {
    ...connection,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token ?? connection.refresh_token,
    expires_in: tokenData.expires_in ?? null,
    scope: tokenData.scope ?? connection.scope ?? [],
    token_type: tokenData.token_type ?? connection.token_type ?? null,
    saved_at: new Date().toISOString(),
  } as BroadcasterConnection;
}

export async function loadBroadcasterConnection() {
  const connection = await getStoredBroadcasterConnection();

  if (isConnectionLikelyExpired(connection)) {
    return await refreshBroadcasterConnection(connection);
  }

  return connection;
}

export async function fetchWithBroadcasterToken(
  input: string,
  init: RequestInit = {}
) {
  const clientId = process.env.TWITCH_CLIENT_ID!;

  let connection = await loadBroadcasterConnection();

  const makeRequest = async (accessToken: string) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    headers.set("Client-Id", clientId);

    return fetch(input, {
      ...init,
      headers,
    });
  };

  let response = await makeRequest(connection.access_token);

  if (response.status === 401) {
    connection = await refreshBroadcasterConnection(connection);
    response = await makeRequest(connection.access_token);
  }

  return response;
}
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";

type KillerRow = {
  id: number;
  name: string;
  slug: string;
};

type RoundRow = {
  id: number;
  status: "open" | "locked" | "resolved";
  actual_killer_id?: number | null;
  started_at?: string | null;
};

type TwitchConnectionRow = {
  channel_user_id: string;
  channel_username: string | null;
  access_token: string;
  refresh_token: string | null;
  expires_in: number | null;
  scope: string[];
  token_type: string | null;
  saved_at: string;
};

const requiredEnvVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TWITCH_CLIENT_ID",
  "TWITCH_CLIENT_SECRET",
  "TWITCH_BOT_USER_ID",
  "TWITCH_CHANNEL_USER_ID",
] as const;

for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID!;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET!;
const TWITCH_BOT_USER_ID = process.env.TWITCH_BOT_USER_ID!;
const TWITCH_CHANNEL_USER_ID = process.env.TWITCH_CHANNEL_USER_ID!;
const ROUND_DURATION_SECONDS = 5 * 60;

// Set to true only if you want to allow testing commands from the same account as the bot.
const ALLOW_BOT_ACCOUNT_COMMANDS = true;

let sessionId: string | null = null;
let ws: WebSocket | null = null;
let keepaliveTimer: NodeJS.Timeout | null = null;
let keepaliveTimeoutMs = 15000;

const announceState = {
  lastRoundStatus: null as string | null,
  lastResolvedRoundId: null as number | null,
};

function resetKeepaliveTimer() {
  if (keepaliveTimer) {
    clearTimeout(keepaliveTimer);
  }

  keepaliveTimer = setTimeout(() => {
    console.error("EventSub keepalive timeout reached. Reconnecting...");
    process.exit(1);
  }, keepaliveTimeoutMs + 5000);
}

function normalizeGuess(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^the\s+/i, "")
    .replace(/\s+/g, "-");
}

function shortenMessage(message: string, maxLength = 450) {
  if (message.length <= maxLength) return message;
  return `${message.slice(0, maxLength - 3)}...`;
}

async function getBroadcasterConnection(): Promise<TwitchConnectionRow> {
  const { data, error } = await supabase
    .from("twitch_connections")
    .select(
      "channel_user_id, channel_username, access_token, refresh_token, expires_in, scope, token_type, saved_at"
    )
    .eq("channel_user_id", TWITCH_CHANNEL_USER_ID)
    .maybeSingle();

  if (error || !data) {
    throw new Error("No Twitch broadcaster connection found.");
  }

  return data as TwitchConnectionRow;
}

async function refreshBroadcasterToken(connection: TwitchConnectionRow) {
  if (!connection.refresh_token) {
    throw new Error("Missing refresh token.");
  }

  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: connection.refresh_token,
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
    }),
  });

  const tokenData = await res.json();

  if (!res.ok || !tokenData?.access_token) {
    console.error("Failed to refresh Twitch token:", tokenData);
    throw new Error("Failed to refresh Twitch token.");
  }

  const updated = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token ?? connection.refresh_token,
    expires_in: tokenData.expires_in ?? null,
    scope: tokenData.scope ?? connection.scope ?? [],
    token_type: tokenData.token_type ?? connection.token_type ?? null,
    saved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("twitch_connections")
    .update(updated)
    .eq("channel_user_id", connection.channel_user_id);

  if (error) {
    throw error;
  }

  return {
    ...connection,
    ...updated,
  } as TwitchConnectionRow;
}

function isLikelyExpired(connection: TwitchConnectionRow) {
  if (!connection.expires_in || !connection.saved_at) return false;
  const savedAt = new Date(connection.saved_at).getTime();
  const expiresAt = savedAt + connection.expires_in * 1000;
  return Date.now() >= expiresAt - 5 * 60 * 1000;
}

async function loadValidConnection() {
  let connection = await getBroadcasterConnection();
  if (isLikelyExpired(connection)) {
    connection = await refreshBroadcasterToken(connection);
  }
  return connection;
}

async function validateTokenIdentity() {
  const connection = await loadValidConnection();

  const res = await fetch("https://id.twitch.tv/oauth2/validate", {
    headers: {
      Authorization: `OAuth ${connection.access_token}`,
    },
  });

  const data = await res.json();

  console.log("Twitch token validate response:", data);

  if (!res.ok) {
    throw new Error("Stored Twitch token failed validation.");
  }

  if (data.user_id !== TWITCH_BOT_USER_ID) {
    throw new Error(
      `Stored Twitch token belongs to user ${data.user_id}, but TWITCH_BOT_USER_ID is ${TWITCH_BOT_USER_ID}. Reconnect Twitch in /admin using the bot account.`
    );
  }

  return data;
}

async function twitchFetch(
  url: string,
  init: RequestInit = {},
  retry = true
) {
  let connection = await loadValidConnection();

  const doFetch = async (accessToken: string) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    headers.set("Client-Id", TWITCH_CLIENT_ID);
    return fetch(url, { ...init, headers });
  };

  let res = await doFetch(connection.access_token);

  if (res.status === 401 && retry) {
    connection = await refreshBroadcasterToken(connection);
    res = await doFetch(connection.access_token);
  }

  return res;
}

async function sendChatMessage(message: string) {
  const safeMessage = shortenMessage(message);

  const res = await twitchFetch("https://api.twitch.tv/helix/chat/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      broadcaster_id: TWITCH_CHANNEL_USER_ID,
      sender_id: TWITCH_BOT_USER_ID,
      message: safeMessage,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("Failed to send chat message:", {
      status: res.status,
      body: data,
    });
    return false;
  }

  const isSent = data?.data?.[0]?.is_sent;
  const dropReason = data?.data?.[0]?.drop_reason;

  if (!isSent) {
    console.error("Chat message not sent:", dropReason);
    return false;
  }

  return true;
}

async function getOpenRound(): Promise<RoundRow | null> {
  const { data } = await supabase
    .from("rounds")
    .select("id, status, actual_killer_id")
    .in("status", ["open", "locked"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as RoundRow | null) ?? null;
}

async function getKillers(): Promise<KillerRow[]> {
  const { data, error } = await supabase
    .from("killers")
    .select("id, name, slug")
    .eq("active", true)
    .order("name");

  if (error) {
    throw error;
  }

  return (data ?? []) as KillerRow[];
}

async function findKillerByGuess(rawGuess: string) {
  const killers = await getKillers();
  const normalized = normalizeGuess(rawGuess);

  return (
    killers.find((killer) => killer.slug === normalized) ||
    killers.find((killer) => normalizeGuess(killer.name) === normalized) ||
    null
  );
}

async function getExistingGuess(roundId: number, twitchUserId: string) {
  const { data } = await supabase
    .from("guesses")
    .select("killer_id")
    .eq("round_id", roundId)
    .eq("twitch_user_id", twitchUserId)
    .maybeSingle();

  return data ?? null;
}

async function getPointsForUser(twitchUserId: string) {
  const { data } = await supabase
    .from("user_stats")
    .select("points")
    .eq("twitch_user_id", twitchUserId)
    .maybeSingle();

  return data?.points ?? 0;
}

async function saveChatGuess(
  twitchUserId: string,
  twitchUsername: string,
  rawGuess: string
) {
  const round = await getOpenRound();

  if (!round) {
    await sendChatMessage(`@${twitchUsername} there is no active round right now.`);
    return;
  }

  if (round.status !== "open") {
    await sendChatMessage(`@${twitchUsername} voting is locked for this round.`);
    return;
  }

  const killer = await findKillerByGuess(rawGuess);

  if (!killer) {
    await sendChatMessage(
      `@${twitchUsername} I couldn't match that killer. Try !guess nurse`
    );
    return;
  }

  const existingGuess = await getExistingGuess(round.id, twitchUserId);

  const { error } = await supabase
    .from("guesses")
    .upsert(
      {
        round_id: round.id,
        twitch_user_id: twitchUserId,
        twitch_username: twitchUsername,
        killer_id: killer.id,
      },
      { onConflict: "round_id,twitch_user_id" }
    );

  if (error) {
    console.error("Failed to save chat guess:", error);
    await sendChatMessage(`@${twitchUsername} I couldn't save that guess.`);
    return;
  }

  if (existingGuess) {
    await sendChatMessage(
      `@${twitchUsername} updated your vote to ${killer.name}.`
    );
  } else {
    await sendChatMessage(
      `@${twitchUsername} locked in ${killer.name}.`
    );
  }
}

async function sendPointsToUser(twitchUserId: string, twitchUsername: string) {
  const points = await getPointsForUser(twitchUserId);
  await sendChatMessage(`@${twitchUsername} you currently have ${points} point${points === 1 ? "" : "s"}.`);
}

async function handleChatCommand(
  twitchUserId: string,
  twitchUsername: string,
  messageText: string
) {
  const trimmed = messageText.trim();
  const lower = trimmed.toLowerCase();

  if (lower === "!points") {
    await sendPointsToUser(twitchUserId, twitchUsername);
    return;
  }

  if (lower.startsWith("!guess ")) {
    const rawGuess = trimmed.slice("!guess ".length).trim();

    if (!rawGuess) {
      await sendChatMessage(`@${twitchUsername} usage: !guess nurse`);
      return;
    }

    await saveChatGuess(twitchUserId, twitchUsername, rawGuess);
  }
}

async function subscribeToChatMessages() {
  if (!sessionId) {
    throw new Error("Missing EventSub session ID.");
  }

  const res = await twitchFetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "channel.chat.message",
      version: "1",
      condition: {
        broadcaster_user_id: TWITCH_CHANNEL_USER_ID,
        user_id: TWITCH_BOT_USER_ID,
      },
      transport: {
        method: "websocket",
        session_id: sessionId,
      },
    }),
  });

  const data = await res.json();
  console.log("EventSub subscribe response:", { status: res.status, body: data });

  if (!res.ok) {
    throw new Error(`Failed to subscribe to channel.chat.message: ${JSON.stringify(data)}`);
  }

  console.log("Subscribed to channel.chat.message");
}

function handleNotification(payload: any) {
  const subscriptionType = payload?.metadata?.subscription_type;
  const event = payload?.payload?.event;

  if (subscriptionType !== "channel.chat.message" || !event) {
    return;
  }

  const chatterId = event.chatter_user_id as string;
  const chatterName = event.chatter_user_login as string;
  const messageText = event.message?.text as string;

  console.log("Chat event received:", {
    chatterId,
    chatterName,
    messageText,
  });

  if (!messageText) return;

  if (chatterId === TWITCH_BOT_USER_ID && !ALLOW_BOT_ACCOUNT_COMMANDS) {
    console.log("Ignoring bot/self message");
    return;
  }

  if (!messageText.trim().startsWith("!")) return;

  void handleChatCommand(chatterId, chatterName, messageText);
}

async function connectEventSubWebSocket() {
  ws = new WebSocket("wss://eventsub.wss.twitch.tv/ws");

  ws.on("open", () => {
    console.log("Connected to Twitch EventSub WebSocket");
  });

  ws.on("message", async (raw) => {
    resetKeepaliveTimer();

    const payload = JSON.parse(raw.toString());
    const messageType = payload?.metadata?.message_type;

    if (messageType === "session_welcome") {
      sessionId = payload?.payload?.session?.id ?? null;
      console.log("EventSub session welcome:", payload?.payload?.session);

      keepaliveTimeoutMs =
        Number(payload?.payload?.session?.keepalive_timeout_seconds ?? 10) * 1000;

      resetKeepaliveTimer();
      await subscribeToChatMessages();
      return;
    }

    if (messageType === "session_keepalive") {
      console.log("EventSub keepalive");
      return;
    }

    if (messageType === "notification") {
      handleNotification(payload);
      return;
    }

    if (messageType === "session_reconnect") {
      console.log("Reconnect requested by Twitch:", payload);
      process.exit(0);
    }

    if (messageType === "revocation") {
      console.error("EventSub subscription revoked:", payload);
    }
  });

  ws.on("close", (code, reason) => {
    console.error("EventSub WebSocket closed:", code, reason.toString());
    process.exit(1);
  });

  ws.on("error", (error) => {
    console.error("EventSub WebSocket error:", error);
  });
}

async function pollRoundAnnouncements() {
const { data: latestRound } = await supabase
  .from("rounds")
  .select("id, status, actual_killer_id, started_at")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestRound) {
    announceState.lastRoundStatus = null;
    return;
  }

  const round = latestRound as RoundRow;

  if (round.status === "open" && announceState.lastRoundStatus !== "open") {
    await sendChatMessage(
      "A new killer prediction round is OPEN. Use !guess <killer> in chat to vote."
    );
  }

  if (round.status === "locked" && announceState.lastRoundStatus !== "locked") {
    await sendChatMessage(
      "Voting is now LOCKED. No more guesses for this round."
    );
  }

  if (
    round.status === "resolved" &&
    announceState.lastResolvedRoundId !== round.id &&
    round.actual_killer_id
  ) {
    const { data: killer } = await supabase
      .from("killers")
      .select("name")
      .eq("id", round.actual_killer_id)
      .maybeSingle();

    const { data: winners } = await supabase
      .from("guesses")
      .select("twitch_username")
      .eq("round_id", round.id)
      .eq("killer_id", round.actual_killer_id);

    const winnerNames =
      winners?.map((g) => g.twitch_username).filter(Boolean).slice(0, 5) ?? [];

    const winnerText =
      winnerNames.length > 0
        ? ` Winners: ${winnerNames.join(", ")}`
        : " No one guessed it correctly.";

    await sendChatMessage(
      `Round resolved. The killer was ${killer?.name ?? "Unknown Killer"}.${winnerText}`
    );

    announceState.lastResolvedRoundId = round.id;
  }

  announceState.lastRoundStatus = round.status;
}

async function main() {
  console.log("Starting chat bot...");
  await validateTokenIdentity();
  await connectEventSubWebSocket();
async function autoLockExpiredRound() {
  const { data: openRound, error: fetchError } = await supabase
    .from("rounds")
    .select("id, status, started_at")
    .eq("status", "open")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    console.error("Failed to load open round for auto-lock:", fetchError);
    return;
  }

  if (!openRound?.started_at) return;

  const startedAtMs = new Date(openRound.started_at).getTime();
  const lockAtMs = startedAtMs + ROUND_DURATION_SECONDS * 1000;

  if (Date.now() < lockAtMs) return;

  const { data: lockedRound, error: lockError } = await supabase
    .from("rounds")
    .update({
      status: "locked",
      locked_at: new Date().toISOString(),
    })
    .eq("id", openRound.id)
    .eq("status", "open")
    .select("id")
    .maybeSingle();

  if (lockError) {
    console.error("Failed to auto-lock round:", lockError);
    return;
  }

  if (lockedRound) {
    console.log(`Auto-locked round ${openRound.id}`);
  }
}

setInterval(() => {
  void (async () => {
    await autoLockExpiredRound();
    await pollRoundAnnouncements();
  })();
}, 5000);
}

void main();
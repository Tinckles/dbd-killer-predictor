import { createServerSupabaseClient } from "@/lib/supabase/server";
import AdminRealtimeRefresh from "@/app/components/adminrealtimerefresh";

type RedemptionPayload = {
  note?: string;
  survivor?: string;
  perks?: string[];
};

type Redemption = {
  id: number;
  twitch_user_id: string;
  twitch_username: string;
  reward_type: "join_game" | "build_request";
  cost: number;
  status: "pending" | "approved" | "rejected" | "fulfilled";
  payload: RedemptionPayload | null;
  created_at: string;
  resolved_at?: string | null;
  refunded?: boolean;
};

type RewardType = {
  id: number;
  code: string;
  title: string;
  cost: number;
  active: boolean;
};

function getRewardTitle(rewardType: Redemption["reward_type"]) {
  switch (rewardType) {
    case "join_game":
      return "Join Next Game Queue";
    case "build_request":
      return "Next Survivor Build";
    default:
      return rewardType;
  }
}

async function getTwitchConnection() {
  const supabase = createServerSupabaseClient();

  const channelUserId = process.env.TWITCH_CHANNEL_USER_ID;

  let query = supabase
    .from("twitch_connections")
    .select("channel_user_id, channel_username, saved_at")
    .order("saved_at", { ascending: false })
    .limit(1);

  if (channelUserId) {
    query = supabase
      .from("twitch_connections")
      .select("channel_user_id, channel_username, saved_at")
      .eq("channel_user_id", channelUserId)
      .limit(1);
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data) {
    return {
      connected: false,
      twitchUser: null,
      twitchUserId: null,
      savedAt: null,
    };
  }

  return {
    connected: true,
    twitchUser: data.channel_username ?? null,
    twitchUserId: data.channel_user_id ?? null,
    savedAt: data.saved_at ?? null,
  };
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{
    twitch?: string;
    reset?: string;
    redemption?: string;
    reward?: string;
  }>;
}) {
  const supabase = createServerSupabaseClient();
  const params = await searchParams;
  const twitchStatus = params?.twitch;
  const resetStatus = params?.reset;
  const redemptionStatus = params?.redemption;
  const rewardStatus = params?.reward;

  const twitchConnection = await getTwitchConnection();

  const { data: currentRound } = await supabase
    .from("rounds")
    .select("id, status, started_at")
    .in("status", ["open", "locked"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: killers } = await supabase
    .from("killers")
    .select("id, name")
    .order("name");

  const { data: redemptionsData } = await supabase
    .from("redemptions")
    .select("*")
    .in("status", ["pending", "approved"])
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: rewardTypesData } = await supabase
    .from("reward_types")
    .select("id, code, title, cost, active")
    .order("cost", { ascending: true });

  const redemptions = (redemptionsData ?? []) as Redemption[];
  const rewardTypes = (rewardTypesData ?? []) as RewardType[];

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <AdminRealtimeRefresh />

      <h1 className="text-3xl font-bold mb-6">Admin Panel</h1>

      <form action="/api/admin/logout" method="post" className="mb-6">
        <button className="rounded bg-gray-800 px-4 py-2 font-semibold hover:bg-gray-700">
          Logout
        </button>
      </form>

      {twitchStatus === "connected" && (
        <div className="mb-4 rounded border border-green-700 bg-green-950 p-3 text-green-300">
          Twitch connected successfully.
        </div>
      )}

      {twitchStatus === "error" && (
        <div className="mb-4 rounded border border-red-700 bg-red-950 p-3 text-red-300">
          Twitch authorization failed.
        </div>
      )}

      {resetStatus === "success" && (
        <div className="mb-4 rounded border border-yellow-700 bg-yellow-950 p-3 text-yellow-200">
          Round data reset. Leaderboard preserved.
        </div>
      )}

      {resetStatus === "all_success" && (
        <div className="mb-4 rounded border border-red-700 bg-red-950 p-3 text-red-200">
          ALL stats wiped. Fresh start.
        </div>
      )}

      {resetStatus === "error" && (
        <div className="mb-4 rounded border border-red-700 bg-red-950 p-3 text-red-300">
          Error during reset.
        </div>
      )}

      {redemptionStatus === "approved_success" && (
        <div className="mb-4 rounded border border-green-700 bg-green-950 p-3 text-green-300">
          Redemption approved.
        </div>
      )}

      {redemptionStatus === "fulfilled_success" && (
        <div className="mb-4 rounded border border-blue-700 bg-blue-950 p-3 text-blue-300">
          Redemption marked fulfilled.
        </div>
      )}

      {redemptionStatus === "rejected_success" && (
        <div className="mb-4 rounded border border-yellow-700 bg-yellow-950 p-3 text-yellow-200">
          Redemption rejected and refunded.
        </div>
      )}

      {redemptionStatus === "missing_data" && (
        <div className="mb-4 rounded border border-red-700 bg-red-950 p-3 text-red-300">
          Missing redemption data.
        </div>
      )}

      {redemptionStatus === "error" && (
        <div className="mb-4 rounded border border-red-700 bg-red-950 p-3 text-red-300">
          Error updating redemption.
        </div>
      )}

      {rewardStatus === "saved" && (
        <div className="mb-4 rounded border border-green-700 bg-green-950 p-3 text-green-300">
          Reward updated successfully.
        </div>
      )}

      {rewardStatus === "error" && (
        <div className="mb-4 rounded border border-red-700 bg-red-950 p-3 text-red-300">
          Failed to update reward.
        </div>
      )}

      <div className="mb-6 rounded border border-gray-700 p-4">
        <h2 className="text-xl font-semibold mb-3">Twitch Connection</h2>

        {twitchConnection.connected ? (
          <div className="space-y-2">
            <p>
              <strong>Status:</strong> Connected
            </p>

            {twitchConnection.twitchUser && (
              <p>
                <strong>User:</strong> {twitchConnection.twitchUser}
              </p>
            )}

            {twitchConnection.twitchUserId && (
              <p>
                <strong>User ID:</strong> {twitchConnection.twitchUserId}
              </p>
            )}

            {twitchConnection.savedAt && (
              <p>
                <strong>Last saved:</strong>{" "}
                {new Date(twitchConnection.savedAt).toLocaleString()}
              </p>
            )}

            <a
              href="/api/twitch/connect"
              className="inline-block rounded bg-purple-600 px-4 py-2 font-semibold hover:bg-purple-500"
            >
              Reconnect Twitch
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            <p>Not connected yet.</p>

            <a
              href="/api/twitch/connect"
              className="inline-block rounded bg-purple-600 px-4 py-2 font-semibold hover:bg-purple-500"
            >
              Connect Twitch
            </a>
          </div>
        )}
      </div>

      <div className="mb-6 rounded border border-gray-700 p-4">
        <h2 className="text-xl mb-2">Current Round</h2>

        {currentRound ? (
          <div className="space-y-1">
            <p>ID: {currentRound.id}</p>
            <p>Status: {currentRound.status}</p>
            {currentRound.started_at && (
              <p>Started: {new Date(currentRound.started_at).toLocaleString()}</p>
            )}
          </div>
        ) : (
          <p>No active round</p>
        )}
      </div>

      <div className="flex flex-wrap gap-4 mb-8">
        <form action="/api/admin/open-round" method="post">
          <button className="bg-green-600 px-4 py-2 rounded font-semibold hover:bg-green-500">
            Open Round
          </button>
        </form>

        <form action="/api/admin/lock-round" method="post">
          <button className="bg-yellow-600 px-4 py-2 rounded font-semibold hover:bg-yellow-500">
            Lock Round
          </button>
        </form>

        <form action="/api/admin/reset-round-state" method="post">
          <button className="bg-gray-600 px-4 py-2 rounded font-semibold hover:bg-gray-500">
            Reset Round Data
          </button>
        </form>

        <form action="/api/admin/reset-all" method="post">
          <button className="bg-red-700 px-4 py-2 rounded font-semibold hover:bg-red-600">
            ⚠ Reset ALL Stats
          </button>
        </form>
      </div>

      <div className="rounded border border-gray-700 p-4">
        <h2 className="text-xl mb-2">Resolve Round</h2>

        <form action="/api/admin/resolve-round" method="post">
          <select
            name="killerId"
            className="bg-gray-800 p-2 rounded mr-2"
            required
          >
            <option value="">Select killer</option>
            {killers?.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>

          <button className="bg-red-600 px-4 py-2 rounded font-semibold hover:bg-red-500">
            Resolve
          </button>
        </form>
      </div>

      <section className="mt-10 rounded-2xl border border-blue-900/60 bg-black/40 p-6">
        <h2 className="text-2xl font-black text-blue-200 mb-6">
          Reward Configuration
        </h2>

        <div className="space-y-4">
          {rewardTypes.map((reward) => (
            <form
              key={reward.code}
              action="/api/admin/rewards/update"
              method="post"
              className="rounded-xl border border-gray-800 bg-black/50 p-4 space-y-3"
            >
              <input type="hidden" name="code" value={reward.code} />

              <div className="grid gap-3 md:grid-cols-[1fr_120px_auto_auto] md:items-center">
                <input
                  name="title"
                  defaultValue={reward.title}
                  className="rounded-lg bg-gray-900 px-3 py-2 text-white"
                />

                <input
                  type="number"
                  name="cost"
                  min="0"
                  defaultValue={reward.cost}
                  className="rounded-lg bg-gray-900 px-3 py-2 text-white"
                />

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={reward.active}
                  />
                  Active
                </label>

                <button className="rounded-lg bg-blue-700 px-4 py-2 font-bold text-white hover:bg-blue-600">
                  Save
                </button>
              </div>

              <p className="text-xs text-gray-400">
                Code: <span className="font-mono">{reward.code}</span>
              </p>
            </form>
          ))}
        </div>
      </section>

      <div className="mt-8 rounded border border-gray-700 p-4">
        <h2 className="text-xl mb-4">Active Reward Redemptions</h2>

        {redemptions.length > 0 ? (
          <div className="space-y-3">
            {redemptions.map((redemption) => (
              <div
                key={redemption.id}
                className="rounded border border-gray-700 bg-gray-900 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p><strong>User:</strong> {redemption.twitch_username}</p>
                    <p><strong>Reward:</strong> {getRewardTitle(redemption.reward_type)}</p>
                    <p><strong>Cost:</strong> {redemption.cost}</p>
                    <p><strong>Status:</strong> {redemption.status}</p>
                    <p><strong>Created:</strong> {new Date(redemption.created_at).toLocaleString()}</p>

                    {redemption.refunded && (
                      <p className="text-yellow-300"><strong>Refunded:</strong> Yes</p>
                    )}
                  </div>

                  {redemption.status === "pending" && (
                    <div className="rounded-full border border-red-500 bg-red-950 px-3 py-1 text-xs font-bold uppercase tracking-wider text-red-300">
                      New
                    </div>
                  )}
                </div>

                <div className="mt-3 rounded bg-black/40 p-3 text-sm text-gray-300">
                  {redemption.reward_type === "join_game" && (
                    <div>
                      <p className="text-white font-semibold">Queue Request</p>
                      <p>{redemption.payload?.note || "Wants to join next game"}</p>
                    </div>
                  )}

                  {redemption.reward_type === "build_request" && (
                    <div className="space-y-2">
                      <div>
                        <p className="text-white font-semibold">Survivor</p>
                        <p>{redemption.payload?.survivor || "Not provided"}</p>
                      </div>

                      <div>
                        <p className="text-white font-semibold">Perks</p>
                        {redemption.payload?.perks && redemption.payload.perks.length > 0 ? (
                          <ul className="list-disc pl-5 space-y-1">
                            {redemption.payload.perks.map((perk) => (
                              <li key={perk}>{perk}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>No perks provided</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {redemption.status === "pending" && (
                    <>
                      <form action="/api/admin/update-redemption" method="post">
                        <input type="hidden" name="redemptionId" value={redemption.id} />
                        <input type="hidden" name="status" value="approved" />
                        <button className="rounded bg-green-600 px-4 py-2 font-semibold hover:bg-green-500">
                          Approve
                        </button>
                      </form>

                      <form action="/api/admin/update-redemption" method="post">
                        <input type="hidden" name="redemptionId" value={redemption.id} />
                        <input type="hidden" name="status" value="rejected" />
                        <button className="rounded bg-yellow-600 px-4 py-2 font-semibold hover:bg-yellow-500">
                          Reject + Refund
                        </button>
                      </form>
                    </>
                  )}

                  {redemption.status === "approved" && (
                    <form action="/api/admin/update-redemption" method="post">
                      <input type="hidden" name="redemptionId" value={redemption.id} />
                      <input type="hidden" name="status" value="fulfilled" />
                      <button className="rounded bg-blue-600 px-4 py-2 font-semibold hover:bg-blue-500">
                        Mark Fulfilled
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p>No redemptions yet.</p>
        )}
      </div>
    </main>
  );
}
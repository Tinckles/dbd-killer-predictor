import type { Viewer, ViewerRedemption } from "@/app/components/types";

type MyRedemptionsPanelProps = {
  viewer: Viewer | null;
  viewerRedemptions: ViewerRedemption[];
};

function getRewardTitle(rewardType: ViewerRedemption["reward_type"]) {
  switch (rewardType) {
    case "join_game":
      return "Join Next Game Queue";
    case "build_request":
      return "Next Survivor Build";
    default:
      return rewardType;
  }
}

function getStatusClasses(status: ViewerRedemption["status"]) {
  switch (status) {
    case "pending":
      return "border-yellow-700 bg-yellow-950/30 text-yellow-200";
    case "approved":
      return "border-green-700 bg-green-950/30 text-green-200";
    case "fulfilled":
      return "border-blue-700 bg-blue-950/30 text-blue-200";
    case "rejected":
      return "border-red-700 bg-red-950/30 text-red-200";
    default:
      return "border-gray-700 bg-gray-900/30 text-gray-200";
  }
}

export default function MyRedemptionsPanel({
  viewer,
  viewerRedemptions,
}: MyRedemptionsPanelProps) {
  if (!viewer) return null;

  return (
    <div className="rounded-xl border border-indigo-900/60 bg-black/40 p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-indigo-300 mb-3">
        My Redemptions
      </p>

      {viewerRedemptions.length > 0 ? (
        <div className="space-y-3">
          {viewerRedemptions.map((redemption) => (
            <div
              key={redemption.id}
              className="rounded-xl border border-gray-800 bg-black/40 p-4"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-sm font-bold text-white">
                    {getRewardTitle(redemption.reward_type)}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(redemption.created_at).toLocaleString()}
                  </p>
                </div>

                <span
                  className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${getStatusClasses(
                    redemption.status
                  )}`}
                >
                  {redemption.status}
                </span>
              </div>

              <div className="text-sm text-gray-300 space-y-2">
                <p>
                  <span className="text-gray-500">Cost:</span> {redemption.cost} points
                </p>

                {redemption.reward_type === "join_game" && (
                  <p>
                    <span className="text-gray-500">Request:</span>{" "}
                    {redemption.payload?.note || "Wants to join next game"}
                  </p>
                )}

                {redemption.reward_type === "build_request" && (
                  <>
                    <p>
                      <span className="text-gray-500">Survivor:</span>{" "}
                      {redemption.payload?.survivor || "Not provided"}
                    </p>

                    <div>
                      <p className="text-gray-500 mb-1">Perks:</p>
                      {redemption.payload?.perks &&
                      redemption.payload.perks.length > 0 ? (
                        <ul className="list-disc pl-5 space-y-1">
                          {redemption.payload?.perks.map((perk, index) => (
  <li key={`${redemption.id}-${index}-${perk}`}>{perk}</li>
))}
                        </ul>
                      ) : (
                        <p>No perks provided</p>
                      )}
                    </div>
                  </>
                )}

                {redemption.status === "rejected" && redemption.refunded && (
                  <p className="text-yellow-300 font-semibold">
                    Points refunded
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">No redemptions yet.</p>
      )}
    </div>
  );
}
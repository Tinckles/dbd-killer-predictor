import type { Viewer } from "@/app/components/types";

type RewardType = {
  code: string;
  title: string;
  cost: number;
  active: boolean;
};

type RewardsPanelProps = {
  viewer: Viewer | null;
  viewerPoints: number;
  redeemMessage: string;
  redeeming: boolean;
  survivorChoice: string;
  setSurvivorChoice: (value: string) => void;
  perkInputs: string[];
  setPerkInputs: (value: string[]) => void;
  redeemJoinGame: () => void;
  redeemBuildRequest: () => void;
  rewardTypes: RewardType[];
};

export default function RewardsPanel({
  viewer,
  viewerPoints,
  redeemMessage,
  redeeming,
  survivorChoice,
  setSurvivorChoice,
  perkInputs,
  setPerkInputs,
  redeemJoinGame,
  redeemBuildRequest,
  rewardTypes,
}: RewardsPanelProps) {
  const joinGameReward =
    rewardTypes.find((reward) => reward.code === "join_game" && reward.active) || null;

  const buildRequestReward =
    rewardTypes.find((reward) => reward.code === "build_request" && reward.active) || null;

  return (
    <div className="rounded-xl border border-blue-900/60 bg-black/40 p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-blue-300 mb-3">
        Rewards
      </p>

      <div className="mb-4 rounded-xl border border-gray-800 bg-black/40 p-4">
        <p className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-2">
          Your Points
        </p>
        <p className="text-3xl font-black text-blue-300">{viewerPoints}</p>
      </div>

      {redeemMessage && (
        <div className="mb-4 rounded-xl border border-blue-800 bg-blue-950/30 p-3 text-sm text-blue-200">
          {redeemMessage}
        </div>
      )}

      <div className="space-y-4">
        {joinGameReward && (
          <div className="rounded-xl border border-gray-800 bg-black/40 p-4">
            <p className="text-lg font-bold text-white">{joinGameReward.title}</p>
            <p className="mt-1 text-sm text-gray-400 mb-3">
              Cost: {joinGameReward.cost} points
            </p>

            <button
              type="button"
              onClick={redeemJoinGame}
              disabled={!viewer || redeeming || viewerPoints < joinGameReward.cost}
              className={`w-full rounded-xl py-3 font-black uppercase tracking-widest transition ${
                !viewer || redeeming || viewerPoints < joinGameReward.cost
                  ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                  : "bg-blue-700 text-white hover:bg-blue-600"
              }`}
            >
              Redeem {joinGameReward.title}
            </button>
          </div>
        )}

        {buildRequestReward && (
          <div className="rounded-xl border border-gray-800 bg-black/40 p-4">
            <p className="text-lg font-bold text-white">{buildRequestReward.title}</p>
            <p className="mt-1 text-sm text-gray-400 mb-3">
              Cost: {buildRequestReward.cost} points
            </p>

            <input
              type="text"
              placeholder="Survivor name"
              value={survivorChoice}
              onChange={(e) => setSurvivorChoice(e.target.value)}
              className="mb-3 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            />

            {perkInputs.map((perk, index) => (
              <input
                key={index}
                type="text"
                placeholder={`Perk ${index + 1}`}
                value={perk}
                onChange={(e) => {
                  const updated = [...perkInputs];
                  updated[index] = e.target.value;
                  setPerkInputs(updated);
                }}
                className="mb-2 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
              />
            ))}

            <button
              type="button"
              onClick={redeemBuildRequest}
              disabled={!viewer || redeeming || viewerPoints < buildRequestReward.cost}
              className={`mt-2 w-full rounded-xl py-3 font-black uppercase tracking-widest transition ${
                !viewer || redeeming || viewerPoints < buildRequestReward.cost
                  ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                  : "bg-purple-700 text-white hover:bg-purple-600"
              }`}
            >
              Redeem {buildRequestReward.title}
            </button>
          </div>
        )}

        {!joinGameReward && !buildRequestReward && (
          <div className="rounded-xl border border-gray-800 bg-black/40 p-4 text-sm text-gray-400">
            No rewards are currently active.
          </div>
        )}
      </div>
    </div>
  );
}
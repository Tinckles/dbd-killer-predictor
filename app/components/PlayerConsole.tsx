import RewardsPanel from "@/app/components/RewardsPanel";
import MyRedemptionsPanel from "@/app/components/MyRedemptionsPanel";
import type { Killer, Viewer, ViewerRedemption } from "@/app/components/types";

type RewardType = {
  code: string;
  title: string;
  cost: number;
  active: boolean;
};

type PlayerConsoleProps = {
  viewer: Viewer | null;
  isSubscriber: boolean;
  secondsRemaining: number;
  isRoundOpen: boolean;
  viewerPoints: number;
  redeemMessage: string;
  redeeming: boolean;
  survivorChoice: string;
  setSurvivorChoice: (value: string) => void;
  perkInputs: string[];
  setPerkInputs: (value: string[]) => void;
  redeemJoinGame: () => void;
  redeemBuildRequest: () => void;
  viewerRedemptions: ViewerRedemption[];
  selectedKillerId: number | null;
  killers: Killer[];
  subscriberBonusPoints: number;
  rewardTypes: RewardType[];
};

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function PlayerConsole({
  viewer,
  isSubscriber,
  secondsRemaining,
  isRoundOpen,
  viewerPoints,
  redeemMessage,
  redeeming,
  survivorChoice,
  setSurvivorChoice,
  perkInputs,
  setPerkInputs,
  redeemJoinGame,
  redeemBuildRequest,
  viewerRedemptions,
  selectedKillerId,
  killers,
  subscriberBonusPoints,
  rewardTypes,
}: PlayerConsoleProps) {
  return (
    <section className="rounded-2xl border border-red-900/60 bg-black/40 p-6 shadow-[0_0_30px_rgba(255,0,0,0.08)]">
      <h2 className="text-2xl font-black uppercase tracking-wide text-red-200 mb-6">
        Player Console
      </h2>

      <div className="space-y-5">
        <div>
          <label className="block mb-2 text-xs font-bold tracking-[0.2em] text-gray-400 uppercase">
            Player Identity
          </label>

          {viewer ? (
            <div className="rounded-xl border border-green-700 bg-green-950/40 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-400">Signed in as</p>
                  <p className="text-lg font-bold text-white">
                    {viewer.displayName || viewer.username}
                  </p>
                </div>

                {isSubscriber && (
                  <span className="rounded-full border border-yellow-500 bg-yellow-950 px-3 py-1 text-xs font-black uppercase tracking-wider text-yellow-300 shadow-[0_0_12px_rgba(234,179,8,0.25)]">
                    SUB BONUS
                  </span>
                )}
              </div>
            </div>
          ) : (
            <a
              href="/api/viewer/twitch/connect"
              className="block text-center rounded-xl border border-purple-700 bg-purple-900/40 px-4 py-3 font-bold text-purple-200 hover:bg-purple-800"
            >
              Connect with Twitch
            </a>
          )}
        </div>

        <div className="rounded-xl border border-gray-800 bg-black/40 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-2">
            Selection Mode
          </p>
          <p className="text-lg font-bold text-white">Click a card to select</p>
          <p className="mt-1 text-sm text-gray-400">
            Then lock in directly from that killer card.
          </p>
        </div>

        <div className="rounded-xl border border-gray-800 bg-black/40 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-2">
            Round Timer
          </p>
          <p className="text-3xl font-black text-red-300">
            {isRoundOpen ? formatCountdown(secondsRemaining) : "00:00"}
          </p>
          <p className="mt-1 text-sm text-gray-400">
            Voting locks automatically after 5 minutes.
          </p>
        </div>

        <RewardsPanel
          viewer={viewer}
          viewerPoints={viewerPoints}
          redeemMessage={redeemMessage}
          redeeming={redeeming}
          survivorChoice={survivorChoice}
          setSurvivorChoice={setSurvivorChoice}
          perkInputs={perkInputs}
          setPerkInputs={setPerkInputs}
          redeemJoinGame={redeemJoinGame}
          redeemBuildRequest={redeemBuildRequest}
          rewardTypes={rewardTypes}
        />

        <MyRedemptionsPanel
          viewer={viewer}
          viewerRedemptions={viewerRedemptions}
        />

        {viewer && isSubscriber && (
          <div className="rounded-xl border border-yellow-700 bg-yellow-950/30 p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-yellow-300 mb-2">
              Subscriber Perk
            </p>
            <p className="text-lg font-bold text-white">
              +{subscriberBonusPoints} bonus point on correct guesses
            </p>
          </div>
        )}

        {selectedKillerId && (
          <div className="rounded-xl border border-green-800 bg-green-950/40 p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-green-300 mb-2">
              Current Selection
            </p>
            <p className="text-lg font-bold text-white">
              {killers.find((killer) => killer.id === selectedKillerId)?.name}
            </p>
          </div>
        )}

        {viewer && (
          <a
            href="/api/viewer/logout"
            className="block text-center rounded-xl border border-gray-700 bg-gray-900/60 px-4 py-3 font-bold text-gray-200 hover:bg-gray-800"
          >
            Disconnect Twitch
          </a>
        )}
      </div>
    </section>
  );
}
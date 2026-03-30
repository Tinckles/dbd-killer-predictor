"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import KillerGrid from "@/app/components/KillerGrid";
import PlayerConsole from "@/app/components/PlayerConsole";
import type { Killer, ViewerRedemption } from "@/app/components/types";

type Round = {
  id: number;
  status: string;
  actual_killer_id?: number | null;
  started_at?: string;
};

type GuessRow = {
  killer_id: number;
  twitch_username?: string;
};

type LeaderboardUser = {
  twitch_user_id: string;
  twitch_username: string;
  points: number;
  correct_guesses: number;
  total_guesses: number;
  best_streak: number;
};

type LastRoundSummary = {
  killerName: string | null;
  winners: string[];
  correctCount: number;
};

type RewardType = {
  code: string;
  title: string;
  cost: number;
  active: boolean;
};

const ROUND_DURATION_SECONDS = 5 * 60;
const SUBSCRIBER_BONUS_POINTS = 1;

function getSecondsRemaining(startedAt?: string) {
  if (!startedAt) return 0;
  const end = new Date(startedAt).getTime() + ROUND_DURATION_SECONDS * 1000;
  return Math.max(0, Math.floor((end - Date.now()) / 1000));
}

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function Home() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [killers, setKillers] = useState<Killer[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [votes, setVotes] = useState<Record<number, number>>({});
  const [message, setMessage] = useState("");
  const [selectedKillerId, setSelectedKillerId] = useState<number | null>(null);
  const [loadingCurrentGuess, setLoadingCurrentGuess] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [viewerPoints, setViewerPoints] = useState(0);
  const [redeemMessage, setRedeemMessage] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [survivorChoice, setSurvivorChoice] = useState("");
  const [perkInputs, setPerkInputs] = useState(["", "", "", ""]);
  const [viewerRedemptions, setViewerRedemptions] = useState<ViewerRedemption[]>([]);
  const [rewardTypes, setRewardTypes] = useState<RewardType[]>([]);

  const [viewer, setViewer] = useState<null | {
    id: string;
    username: string;
    displayName?: string;
  }>(null);

  const [isSubscriber, setIsSubscriber] = useState(false);

  const [lastRoundSummary, setLastRoundSummary] = useState<LastRoundSummary | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);

  async function loadRewardTypes() {
    const { data } = await supabase
      .from("reward_types")
      .select("code, title, cost, active")
      .eq("active", true)
      .order("cost", { ascending: true });

    setRewardTypes((data || []) as RewardType[]);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const guessStatus = params.get("guess");
    const killerIdFromUrl = params.get("killerId");
    const viewerStatus = params.get("viewer");

    if (guessStatus === "success") {
      setMessage("LOCKED IN.");
    } else if (guessStatus === "missing_data") {
      setMessage("SELECT A KILLER.");
    } else if (guessStatus === "not_signed_in") {
      setMessage("CONNECT TWITCH FIRST.");
    } else if (guessStatus === "no_open_round") {
      setMessage("NO ACTIVE ROUND.");
    } else if (guessStatus === "error") {
      setMessage("SAVE ERROR.");
    } else if (guessStatus === "locked") {
      setMessage("GUESSES ARE LOCKED.");
    }

    if (viewerStatus === "connected") {
      setMessage("TWITCH CONNECTED.");
    } else if (
      viewerStatus === "error" ||
      viewerStatus === "missing_code" ||
      viewerStatus === "token_error" ||
      viewerStatus === "user_error"
    ) {
      setMessage("TWITCH SIGN-IN FAILED.");
    }

    if (killerIdFromUrl) {
      setSelectedKillerId(Number(killerIdFromUrl));
    }

    if (guessStatus || killerIdFromUrl || viewerStatus) {
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
    }
  }, []);

  useEffect(() => {
    loadData();
    loadViewer();
  }, []);

  useEffect(() => {
    if (!viewer?.id) {
      setSelectedKillerId(null);
      setIsSubscriber(false);
      setViewerPoints(0);
      setViewerRedemptions([]);
      return;
    }

    loadSubscriberStatus();
    loadViewerPoints(viewer.id);
    loadViewerRedemptions(viewer.id);

    if (!round) return;

    loadCurrentUserGuess(viewer.id, round.id);
  }, [viewer?.id, round]);

  useEffect(() => {
    if (!round?.started_at || round.status !== "open") {
      setSecondsRemaining(0);
      return;
    }

    const update = () => {
      setSecondsRemaining(getSecondsRemaining(round.started_at));
    };

    update();
    const interval = setInterval(update, 1000);

    return () => clearInterval(interval);
  }, [round]);

  async function loadViewer() {
    try {
      const res = await fetch("/api/viewer/me");
      if (!res.ok) {
        setViewer(null);
        return;
      }

      const data = await res.json();

      if (data?.user) {
        setViewer({
          id: data.user.id,
          username: data.user.username,
          displayName: data.user.displayName,
        });
      } else {
        setViewer(null);
      }
    } catch {
      setViewer(null);
    }
  }

  async function loadSubscriberStatus() {
    try {
      const res = await fetch("/api/viewer/sub-status");
      if (!res.ok) {
        setIsSubscriber(false);
        return;
      }

      const data = await res.json();
      setIsSubscriber(Boolean(data?.subscribed));
    } catch {
      setIsSubscriber(false);
    }
  }

  async function loadViewerPoints(viewerId: string) {
    const { data } = await supabase
      .from("user_stats")
      .select("points")
      .eq("twitch_user_id", viewerId)
      .maybeSingle();

    setViewerPoints(data?.points ?? 0);
  }

  async function loadViewerRedemptions(viewerId: string) {
    const { data } = await supabase
      .from("redemptions")
      .select("id, reward_type, cost, status, payload, created_at, refunded")
      .eq("twitch_user_id", viewerId)
      .order("created_at", { ascending: false })
      .limit(3);

    setViewerRedemptions((data || []) as ViewerRedemption[]);
  }

  async function loadData() {
    const { data: roundData } = await supabase
      .from("rounds")
      .select("id, status, actual_killer_id, started_at")
      .in("status", ["open", "locked"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setRound((roundData as Round | null) ?? null);

    const { data: killersData } = await supabase
      .from("killers")
      .select("id, name")
      .order("name");

    await loadRewardTypes();

    setKillers((killersData || []) as Killer[]);

    if (roundData) {
      const { data: guesses } = await supabase
        .from("guesses")
        .select("killer_id")
        .eq("round_id", roundData.id);

      updateVoteCounts((guesses || []) as GuessRow[]);
      setLastRoundSummary(null);
    } else {
      setVotes({});
      await loadLastResolvedRound();
    }

    await loadLeaderboard();
  }

  async function loadLastResolvedRound() {
    const { data: resolvedRound } = await supabase
      .from("rounds")
      .select("id, actual_killer_id, resolved_at")
      .eq("status", "resolved")
      .order("resolved_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!resolvedRound || !resolvedRound.actual_killer_id) {
      setLastRoundSummary(null);
      return;
    }

    const { data: killer } = await supabase
      .from("killers")
      .select("name")
      .eq("id", resolvedRound.actual_killer_id)
      .maybeSingle();

    const { data: winningGuesses } = await supabase
      .from("guesses")
      .select("twitch_username")
      .eq("round_id", resolvedRound.id)
      .eq("killer_id", resolvedRound.actual_killer_id);

    const winners =
      winningGuesses
        ?.map((g) => g.twitch_username)
        .filter(Boolean)
        .slice(0, 10) || [];

    setLastRoundSummary({
      killerName: killer?.name || null,
      winners,
      correctCount: winningGuesses?.length || 0,
    });
  }

  async function loadLeaderboard() {
    const { data } = await supabase
      .from("user_stats")
      .select("twitch_user_id, twitch_username, points, correct_guesses, total_guesses, best_streak")
      .order("points", { ascending: false })
      .order("correct_guesses", { ascending: false })
      .limit(10);

    setLeaderboard((data || []) as LeaderboardUser[]);
  }

  async function loadCurrentUserGuess(viewerId: string, roundId: number) {
    setLoadingCurrentGuess(true);

    const { data } = await supabase
      .from("guesses")
      .select("killer_id")
      .eq("round_id", roundId)
      .eq("twitch_user_id", viewerId)
      .maybeSingle();

    setSelectedKillerId(data?.killer_id ?? null);
    setLoadingCurrentGuess(false);
  }

  function updateVoteCounts(guesses: GuessRow[]) {
    const counts: Record<number, number> = {};

    guesses.forEach((g) => {
      counts[g.killer_id] = (counts[g.killer_id] || 0) + 1;
    });

    setVotes(counts);
  }

  useEffect(() => {
    if (!round) return;

    const guessesChannel = supabase
      .channel(`guesses-live-${round.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "guesses",
          filter: `round_id=eq.${round.id}`,
        },
        async () => {
          const { data } = await supabase
            .from("guesses")
            .select("killer_id")
            .eq("round_id", round.id);

          updateVoteCounts((data || []) as GuessRow[]);

          if (viewer?.id) {
            await loadCurrentUserGuess(viewer.id, round.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(guessesChannel);
    };
  }, [round, supabase, viewer?.id]);

  useEffect(() => {
    if (!viewer?.id) return;

    const redemptionsChannel = supabase
      .channel(`viewer-redemptions-${viewer.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "redemptions",
          filter: `twitch_user_id=eq.${viewer.id}`,
        },
        async () => {
          await loadViewerRedemptions(viewer.id);
          await loadViewerPoints(viewer.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(redemptionsChannel);
    };
  }, [viewer?.id, supabase]);

  useEffect(() => {
    const roundsChannel = supabase
      .channel("round-status-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rounds",
        },
        async () => {
          await loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(roundsChannel);
    };
  }, [supabase]);

  const isRoundOpen = round?.status === "open";
  const isRoundLocked = round?.status === "locked";
  const hasActiveRound = !!round;

  async function redeemJoinGame() {
    setRedeeming(true);
    setRedeemMessage("");

    try {
      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rewardType: "join_game",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setRedeemMessage(data.message || "Redemption failed.");
        return;
      }

      setRedeemMessage("Join game request submitted.");
      setViewerPoints(data.remainingPoints ?? viewerPoints);

      if (viewer?.id) {
        await loadViewerRedemptions(viewer.id);
      }
    } catch {
      setRedeemMessage("Something went wrong.");
    } finally {
      setRedeeming(false);
    }
  }

  async function redeemBuildRequest() {
    setRedeeming(true);
    setRedeemMessage("");

    try {
      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rewardType: "build_request",
          survivor: survivorChoice,
          perks: perkInputs,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setRedeemMessage(data.message || "Redemption failed.");
        return;
      }

      setRedeemMessage("Build request submitted.");
      setViewerPoints(data.remainingPoints ?? viewerPoints);

      if (viewer?.id) {
        await loadViewerRedemptions(viewer.id);
      }

      setSurvivorChoice("");
      setPerkInputs(["", "", "", ""]);
    } catch {
      setRedeemMessage("Something went wrong.");
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#2a0d0d_0%,#120707_35%,#050505_100%)] text-white p-6 md:p-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex justify-end">
          <a
            href="/admin"
            className="rounded-lg border border-red-800 bg-black/40 px-4 py-2 text-sm font-bold uppercase tracking-wider text-red-200 hover:bg-red-950/40 hover:text-white"
          >
            Admin
          </a>
        </div>

        <div className="mb-8 text-center">
          <p className="text-red-500 tracking-[0.4em] text-xs md:text-sm mb-3">
            DEAD BY DAYLIGHT PREDICTION SYSTEM
          </p>
          <h1 className="text-4xl md:text-6xl font-black uppercase tracking-wider text-red-100 drop-shadow-[0_0_12px_rgba(255,0,0,0.35)]">
            Choose Your Killer
          </h1>
          <p className="mt-3 text-gray-400 text-sm md:text-base">
            Lock in your prediction before the Entity decides your fate.
          </p>
        </div>

        {message && hasActiveRound && (
          <div className="mb-6 rounded-xl border border-red-800 bg-black/50 p-4 text-center text-red-200 shadow-[0_0_20px_rgba(255,0,0,0.12)]">
            <div className="font-bold tracking-widest">{message}</div>
            {viewer && selectedKillerId && (
              <div className="mt-2 text-sm text-gray-300">
                Active player: <span className="text-white font-semibold">{viewer.displayName || viewer.username}</span>
              </div>
            )}
          </div>
        )}

        {hasActiveRound ? (
          <>
            <div className="mb-6 flex justify-center gap-3 flex-wrap">
              <span
                className={`inline-block rounded-full px-5 py-2 text-sm font-bold tracking-widest border ${
                  isRoundOpen
                    ? "bg-green-950 text-green-300 border-green-700"
                    : "bg-yellow-950 text-yellow-300 border-yellow-700"
                }`}
              >
                {isRoundOpen ? "ROUND OPEN" : "GUESSES LOCKED"}
              </span>

              {isRoundOpen && (
                <span className="inline-block rounded-full px-5 py-2 text-sm font-bold tracking-widest border border-red-700 bg-red-950 text-red-200">
                  TIME LEFT: {formatCountdown(secondsRemaining)}
                </span>
              )}
            </div>

            <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
              <PlayerConsole
                viewer={viewer}
                isSubscriber={isSubscriber}
                secondsRemaining={secondsRemaining}
                isRoundOpen={isRoundOpen}
                viewerPoints={viewerPoints}
                redeemMessage={redeemMessage}
                redeeming={redeeming}
                survivorChoice={survivorChoice}
                setSurvivorChoice={setSurvivorChoice}
                perkInputs={perkInputs}
                setPerkInputs={setPerkInputs}
                redeemJoinGame={redeemJoinGame}
                redeemBuildRequest={redeemBuildRequest}
                viewerRedemptions={viewerRedemptions}
                selectedKillerId={selectedKillerId}
                killers={killers}
                subscriberBonusPoints={SUBSCRIBER_BONUS_POINTS}
                rewardTypes={rewardTypes}
              />

              <KillerGrid
                killers={killers}
                selectedKillerId={selectedKillerId}
                votes={votes}
                isRoundLocked={isRoundLocked}
                isRoundOpen={isRoundOpen}
                viewer={viewer}
                loadingCurrentGuess={loadingCurrentGuess}
                setSelectedKillerId={setSelectedKillerId}
              />
            </div>
          </>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-2xl border border-red-900/60 bg-black/40 p-6 shadow-[0_0_30px_rgba(255,0,0,0.08)]">
              <h2 className="text-2xl md:text-3xl font-black uppercase tracking-wide text-red-200 mb-6">
                Last Match Result
              </h2>

              {lastRoundSummary ? (
                <div className="space-y-5">
                  <div className="rounded-xl border border-gray-800 bg-black/50 p-5">
                    <p className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-2">
                      Correct Killer
                    </p>
                    <p className="text-3xl font-black text-green-300">
                      {lastRoundSummary.killerName}
                    </p>
                  </div>

                  <div className="rounded-xl border border-gray-800 bg-black/50 p-5">
                    <p className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-2">
                      Correct Guesses
                    </p>
                    <p className="text-2xl font-bold text-white">
                      {lastRoundSummary.correctCount}
                    </p>
                  </div>

                  <div className="rounded-xl border border-gray-800 bg-black/50 p-5">
                    <p className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-3">
                      Winners
                    </p>
                    {lastRoundSummary.winners.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {lastRoundSummary.winners.map((winner) => (
                          <span
                            key={winner}
                            className="rounded-full bg-green-900 px-3 py-1 text-sm font-semibold text-green-200"
                          >
                            {winner}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500">No one guessed correctly last round.</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-gray-500">No completed round data yet.</p>
              )}
            </section>

            <section className="rounded-2xl border border-red-900/60 bg-black/40 p-6 shadow-[0_0_30px_rgba(255,0,0,0.08)]">
              <h2 className="text-2xl md:text-3xl font-black uppercase tracking-wide text-red-200 mb-6">
                Top Predictors
              </h2>

              {leaderboard.length > 0 ? (
                <div className="space-y-3">
                  {leaderboard.map((user, index) => {
                    const isViewerRow = viewer?.id === user.twitch_user_id;

                    return (
                      <div
                        key={user.twitch_user_id}
                        className="rounded-xl border border-gray-800 bg-black/50 px-4 py-4 flex items-center justify-between gap-4"
                      >
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-black text-white uppercase tracking-wide">
                              #{index + 1} {user.twitch_username}
                            </p>

                            {isViewerRow && isSubscriber && (
                              <span className="rounded-full border border-yellow-500 bg-yellow-950 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-yellow-300">
                                SUB BONUS
                              </span>
                            )}
                          </div>

                          <p className="text-sm text-gray-400">
                            {user.correct_guesses}/{user.total_guesses} correct • best streak {user.best_streak}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-2xl font-black text-red-300">{user.points}</p>
                          <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                            points
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-500">No leaderboard data yet.</p>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
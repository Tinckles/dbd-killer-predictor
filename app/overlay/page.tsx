"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Killer = {
  id: number;
  name: string;
};

type Round = {
  id: number;
  status: string;
  started_at?: string;
  actual_killer_id?: number | null;
};

type GuessRow = {
  killer_id: number;
};

const ROUND_DURATION_SECONDS = 5 * 60;

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

function getKillerSlug(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^the\s+/i, "")
    .replace(/\s+/g, "-");
}

export default function OverlayPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [killers, setKillers] = useState<Killer[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [votes, setVotes] = useState<Record<number, number>>({});
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  const [reveal, setReveal] = useState<null | {
    killerName: string;
    winners: string[];
  }>(null);

  const [lastResult, setLastResult] = useState<null | {
    killerName: string;
    winners: string[];
  }>(null);

  useEffect(() => {
    loadData();
    loadLastResult();
  }, []);

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

  async function loadData() {
    const { data: roundData } = await supabase
      .from("rounds")
      .select("id, status, started_at, actual_killer_id")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setRound((roundData as Round | null) ?? null);

    const { data: killersData } = await supabase
      .from("killers")
      .select("id, name")
      .order("name");

    setKillers((killersData || []) as Killer[]);

    if (roundData && roundData.status !== "resolved") {
      const { data: guesses } = await supabase
        .from("guesses")
        .select("killer_id")
        .eq("round_id", roundData.id);

      updateVotes((guesses || []) as GuessRow[]);
    } else {
      setVotes({});
    }
  }

  function updateVotes(guesses: GuessRow[]) {
    const counts: Record<number, number> = {};
    guesses.forEach((g) => {
      counts[g.killer_id] = (counts[g.killer_id] || 0) + 1;
    });
    setVotes(counts);
  }

  async function triggerReveal(roundId: number, killerId: number) {
    const { data: killer } = await supabase
      .from("killers")
      .select("name")
      .eq("id", killerId)
      .maybeSingle();

    const { data: winners } = await supabase
      .from("guesses")
      .select("twitch_username")
      .eq("round_id", roundId)
      .eq("killer_id", killerId);

    setReveal({
      killerName: killer?.name || "Unknown",
      winners: winners?.map((w) => w.twitch_username).filter(Boolean).slice(0, 5) || [],
    });

    setTimeout(() => {
      setReveal(null);
    }, 8000);
  }

  async function loadLastResult() {
    const { data: lastRound } = await supabase
      .from("rounds")
      .select("*")
      .eq("status", "resolved")
      .order("resolved_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastRound?.actual_killer_id) {
      setLastResult(null);
      return;
    }

    const { data: killer } = await supabase
      .from("killers")
      .select("name")
      .eq("id", lastRound.actual_killer_id)
      .maybeSingle();

    const { data: winners } = await supabase
      .from("guesses")
      .select("twitch_username")
      .eq("round_id", lastRound.id)
      .eq("killer_id", lastRound.actual_killer_id);

    setLastResult({
      killerName: killer?.name || "Unknown",
      winners: winners?.map((w) => w.twitch_username).filter(Boolean).slice(0, 5) || [],
    });
  }

  useEffect(() => {
    const roundChannel = supabase
      .channel("round-reveal")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rounds",
        },
        async (payload) => {
          const updated = payload.new as Round | undefined;

          if (updated?.status === "resolved" && updated.actual_killer_id) {
            triggerReveal(updated.id, updated.actual_killer_id);
          }

          await loadData();
          await loadLastResult();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(roundChannel);
    };
  }, [supabase]);

  useEffect(() => {
    if (!round || round.status === "resolved") return;

    const guessesChannel = supabase
      .channel(`overlay-${round.id}`)
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

          updateVotes((data || []) as GuessRow[]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(guessesChannel);
    };
  }, [round, supabase]);

  const sortedKillers = [...killers].sort((a, b) => {
    return (votes[b.id] || 0) - (votes[a.id] || 0);
  });

  const leaderId = sortedKillers[0]?.id;
  const topVoteCount = sortedKillers.length > 0 ? votes[sortedKillers[0].id] || 0 : 0;

  return (
    <main className="min-h-screen bg-transparent text-white p-6">
      {reveal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95">
          <div className="absolute inset-0 animate-pulse bg-red-900/25" />
          <div className="absolute inset-0 animate-[flicker_0.4s_linear]" />

          <div className="relative mx-auto max-w-4xl text-center">
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.5em] text-red-300">
              Match Result
            </p>

            <h1 className="mb-6 animate-[slam_0.5s_ease-out] text-6xl font-black text-red-500 drop-shadow-[0_0_18px_rgba(255,0,0,0.45)]">
              KILLER REVEALED
            </h1>

            <img
              src={`/killers/${getKillerSlug(reveal.killerName)}.jpg`}
              className="mx-auto mb-6 h-[280px] w-[460px] rounded-2xl object-cover shadow-[0_0_60px_red]"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.src.includes("default.jpg")) {
                  target.src = "/killers/default.jpg";
                }
              }}
            />

            <h2 className="mb-4 text-5xl font-black text-green-400">
              {reveal.killerName}
            </h2>

            {reveal.winners.length > 0 ? (
              <div className="rounded-2xl border border-green-500/40 bg-green-950/30 px-6 py-4">
                <p className="mb-2 text-sm font-bold uppercase tracking-[0.35em] text-green-300">
                  Winners
                </p>
                <p className="text-xl font-bold text-green-100">
                  {reveal.winners.join(", ")}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-red-500/40 bg-red-950/30 px-6 py-4">
                <p className="text-xl font-bold text-red-300">
                  No one guessed correctly
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {!reveal && (!round || round.status === "resolved") && lastResult && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" />

          <div className="relative text-center">
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.45em] text-red-300">
              Last Match
            </p>

            <h1 className="mb-5 text-3xl font-black text-red-400">
              LAST KILLER
            </h1>

            <img
              src={`/killers/${getKillerSlug(lastResult.killerName)}.jpg`}
              className="mx-auto mb-4 h-[220px] w-[360px] rounded-xl object-cover shadow-[0_0_30px_red]"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.src.includes("default.jpg")) {
                  target.src = "/killers/default.jpg";
                }
              }}
            />

            <h2 className="text-3xl font-bold text-green-400">
              {lastResult.killerName}
            </h2>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between rounded-2xl border border-red-900/40 bg-black/35 px-6 py-4 backdrop-blur-sm">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.45em] text-red-300">
              Dead by Daylight
            </p>
            <h1 className="mt-1 text-3xl font-black text-red-100">
              Killer Prediction
            </h1>
          </div>

          <div className="flex items-center gap-5">
            {round?.status === "open" && (
              <>
                <span className="rounded-full border border-green-500/50 bg-green-950/50 px-4 py-2 text-sm font-bold tracking-[0.2em] text-green-300 animate-pulse">
                  ● ROUND OPEN
                </span>
                <div className="rounded-xl border border-red-700/50 bg-red-950/40 px-4 py-2 text-2xl font-black text-red-200">
                  {formatCountdown(secondsRemaining)}
                </div>
              </>
            )}

            {round?.status === "locked" && (
              <span className="rounded-full border border-yellow-500/50 bg-yellow-950/50 px-4 py-2 text-sm font-bold tracking-[0.2em] text-yellow-300">
                ● LOCKED
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {sortedKillers.slice(0, 9).map((killer, index) => {
            const voteCount = votes[killer.id] || 0;
            const isLeader = killer.id === leaderId && voteCount > 0;
            const barPercent =
              topVoteCount > 0 ? Math.max(8, (voteCount / topVoteCount) * 100) : 0;

            return (
              <div
                key={killer.id}
                className={`group relative overflow-hidden rounded-2xl border ${
                  isLeader
                    ? "border-green-400 shadow-[0_0_28px_rgba(74,222,128,0.38)]"
                    : "border-gray-800/80"
                }`}
              >
                {isLeader && (
                  <div className="absolute right-3 top-3 z-10 rounded-full bg-green-400 px-3 py-1 text-xs font-black tracking-[0.15em] text-black shadow-[0_0_18px_rgba(74,222,128,0.6)]">
                    #1 LEADER
                  </div>
                )}

                <img
                  src={`/killers/${getKillerSlug(killer.name)}.jpg`}
                  className={`absolute inset-0 h-full w-full object-cover transition-transform duration-500 ${
                    isLeader ? "scale-105" : "group-hover:scale-110"
                  }`}
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (!target.src.includes("default.jpg")) {
                      target.src = "/killers/default.jpg";
                    }
                  }}
                />

                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/10" />

                <div className="relative flex h-[220px] flex-col justify-between p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="rounded-full bg-black/50 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-gray-300 backdrop-blur-sm">
                      #{index + 1}
                    </div>
                  </div>

                  <div>
                    <p className="mb-1 text-xl font-black text-white drop-shadow-lg">
                      {killer.name}
                    </p>

                    <div className="mb-2 flex items-end justify-between gap-3">
                      <p className="text-4xl font-black text-red-300">
                        {voteCount}
                      </p>
                      <p className="text-xs font-bold uppercase tracking-[0.25em] text-gray-300">
                        votes
                      </p>
                    </div>

                    <div className="h-3 overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isLeader ? "bg-green-400" : "bg-red-400"
                        }`}
                        style={{ width: `${barPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
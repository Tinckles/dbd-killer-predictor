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
      winners: winners?.map((w) => w.twitch_username).slice(0, 5) || [],
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
      winners: winners?.map((w) => w.twitch_username).slice(0, 5) || [],
    });
  }

  // Always listen for round changes, even when there is no active round
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

  // Listen for guess changes only when there is an active non-resolved round
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

  return (
    <main className="min-h-screen bg-transparent text-white p-6">
      {reveal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95">
          <div className="absolute inset-0 bg-red-900/30 animate-pulse" />
          <div className="absolute inset-0 animate-[flicker_0.4s_linear]" />

          <div className="relative text-center space-y-6">
            <h1 className="text-6xl font-black text-red-500 animate-[slam_0.5s_ease-out]">
              KILLER REVEALED
            </h1>

            <img
              src={`/killers/${getKillerSlug(reveal.killerName)}.jpg`}
              className="w-[420px] h-[260px] object-cover rounded-xl mx-auto shadow-[0_0_60px_red]"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.src.includes("default.jpg")) {
                  target.src = "/killers/default.jpg";
                }
              }}
            />

            <h2 className="text-5xl font-black text-green-400">
              {reveal.killerName}
            </h2>
          </div>
        </div>
      )}

      {!reveal && (!round || round.status === "resolved") && lastResult && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" />

          <div className="relative text-center space-y-4">
            <h1 className="text-3xl font-black text-red-400">
              LAST KILLER
            </h1>

            <img
              src={`/killers/${getKillerSlug(lastResult.killerName)}.jpg`}
              className="w-[300px] mx-auto rounded-lg shadow-[0_0_30px_red]"
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

      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between mb-6">
          <h1 className="text-3xl font-black text-red-400">
            Killer Prediction
          </h1>

          {round?.status === "open" && (
            <div className="text-2xl font-bold text-red-300">
              {formatCountdown(secondsRemaining)}
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {sortedKillers.slice(0, 9).map((killer) => {
            const voteCount = votes[killer.id] || 0;
            const isLeader = killer.id === leaderId && voteCount > 0;

            return (
              <div
                key={killer.id}
                className={`group relative rounded-2xl overflow-hidden border ${
                  isLeader
                    ? "border-green-400 shadow-[0_0_25px_rgba(74,222,128,0.4)] scale-105"
                    : "border-gray-800"
                }`}
              >
                <img
                  src={`/killers/${getKillerSlug(killer.name)}.jpg`}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (!target.src.includes("default.jpg")) {
                      target.src = "/killers/default.jpg";
                    }
                  }}
                />

                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />

                <div className="relative p-4 h-[180px] flex flex-col justify-end">
                  <p className="text-lg font-black">{killer.name}</p>
                  <p className="text-3xl font-black text-red-300">
                    {voteCount}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
import type { Killer, Viewer } from "@/app/components/types";

type KillerGridProps = {
  killers: Killer[];
  selectedKillerId: number | null;
  votes: Record<number, number>;
  isRoundLocked: boolean;
  isRoundOpen: boolean;
  viewer: Viewer | null;
  loadingCurrentGuess: boolean;
  setSelectedKillerId: (id: number) => void;
};

function getKillerSlug(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^the\s+/i, "")
    .replace(/\s+/g, "-");
}

export default function KillerGrid({
  killers,
  selectedKillerId,
  votes,
  isRoundLocked,
  isRoundOpen,
  viewer,
  loadingCurrentGuess,
  setSelectedKillerId,
}: KillerGridProps) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-2xl md:text-3xl font-black uppercase tracking-wide text-red-200">
          Killer Roster
        </h2>
        <div className="text-sm text-gray-400">Select the card. Lock it in.</div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {killers.map((killer) => {
          const isSelected = selectedKillerId === killer.id;
          const voteCount = votes[killer.id] || 0;

          return (
            <div
              key={killer.id}
              className={`group rounded-2xl border p-5 transition-all duration-300 active:scale-[0.98] ${
                isSelected
                  ? "border-green-400 bg-green-950/50 shadow-[0_0_30px_rgba(74,222,128,0.35)] scale-[1.03]"
                  : "border-gray-800 bg-black/40 hover:border-red-700 hover:bg-red-950/20 hover:shadow-[0_0_25px_rgba(255,0,0,0.25)] hover:scale-[1.02]"
              }`}
            >
              <button
                type="button"
                onClick={() => setSelectedKillerId(killer.id)}
                disabled={isRoundLocked}
                className="w-full text-left"
              >
                <div className="relative mb-4 h-[160px] overflow-hidden rounded-2xl border border-gray-800">
                  <img
                    src={`/killers/${getKillerSlug(killer.name)}.jpg`}
                    alt={killer.name}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                    onError={(e) => {
                      const target = e.currentTarget as HTMLImageElement;
                      if (!target.src.includes("default.jpg")) {
                        target.src = "/killers/default.jpg";
                      }
                    }}
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent transition-all duration-300 group-hover:from-red-950/70" />

                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <p className="text-lg font-black text-white drop-shadow-lg">
                      {killer.name}
                    </p>
                  </div>

                  {isSelected && (
                    <div className="absolute right-2 top-2 rounded bg-green-500 px-2 py-1 text-xs font-bold text-white shadow-[0_0_10px_rgba(74,222,128,0.8)]">
                      SELECTED
                    </div>
                  )}
                </div>

                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold uppercase tracking-wide text-white">
                      {killer.name}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.25em] text-gray-500">
                      Killer Candidate
                    </p>
                  </div>
                </div>
              </button>

              <div className="mb-4 rounded-xl border border-gray-800 bg-black/40 p-4">
                <p className="mb-2 text-xs uppercase tracking-[0.25em] text-gray-500">
                  Current Votes
                </p>
                <p
                  className={`text-3xl font-black ${
                    isSelected ? "text-green-300" : "text-red-300"
                  }`}
                >
                  {voteCount}
                </p>
              </div>

              {isSelected ? (
                <form action="/api/guess" method="post">
                  <input type="hidden" name="killerId" value={killer.id} />
                  <button
                    type="submit"
                    disabled={!isRoundOpen || !viewer || loadingCurrentGuess}
                    className={`w-full rounded-xl py-3 font-black uppercase tracking-widest transition ${
                      !isRoundOpen || !viewer || loadingCurrentGuess
                        ? "cursor-not-allowed bg-gray-800 text-gray-500"
                        : "bg-green-700 text-white hover:bg-green-600 shadow-[0_0_20px_rgba(74,222,128,0.18)]"
                    }`}
                  >
                    {!viewer
                      ? "Connect Twitch First"
                      : loadingCurrentGuess
                      ? "Loading..."
                      : !isRoundOpen
                      ? "Locked"
                      : "Lock In Guess"}
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setSelectedKillerId(killer.id)}
                  disabled={isRoundLocked}
                  className={`w-full rounded-xl py-3 font-black uppercase tracking-widest transition ${
                    isRoundLocked
                      ? "cursor-not-allowed bg-gray-800 text-gray-500"
                      : "bg-red-900/60 text-red-100 hover:bg-red-800"
                  }`}
                >
                  Select Killer
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
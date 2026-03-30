import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function Leaderboard() {
  const supabase = createServerSupabaseClient();

  const { data: users } = await supabase
    .from("user_stats")
    .select("*")
    .order("points", { ascending: false })
    .limit(20);

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <h1 className="text-3xl font-bold mb-6">
        Leaderboard 🏆
      </h1>

      <div className="space-y-3">
        {users?.map((user, index) => (
          <div
            key={user.twitch_user_id}
            className="border border-gray-700 rounded p-4 flex justify-between"
          >
            <span>
              #{index + 1} — {user.twitch_username}
            </span>
            <span className="text-purple-400">
              {user.points} pts
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}
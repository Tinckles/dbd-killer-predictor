export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = params?.error;

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-red-900/60 bg-black/40 p-6 shadow-[0_0_30px_rgba(255,0,0,0.08)]">
        <h1 className="text-3xl font-black uppercase tracking-wide text-red-200 mb-6">
          Admin Login
        </h1>

        {error === "invalid" && (
          <div className="mb-4 rounded border border-red-700 bg-red-950 p-3 text-red-300">
            Incorrect password.
          </div>
        )}

        <form action="/api/admin/login" method="post" className="space-y-4">
          <div>
            <label className="block mb-2 text-xs font-bold tracking-[0.2em] text-gray-400 uppercase">
              Password
            </label>
            <input
              type="password"
              name="password"
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
              required
            />
          </div>

          <button className="w-full rounded-xl bg-red-700 px-4 py-3 font-black uppercase tracking-widest text-white hover:bg-red-600">
            Enter Admin
          </button>
        </form>
      </div>
    </main>
  );
}
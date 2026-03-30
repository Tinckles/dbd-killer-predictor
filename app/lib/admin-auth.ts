import { cookies } from "next/headers";

export const ADMIN_SESSION_COOKIE = "dbd_admin_session";

export async function isAdminAuthenticated() {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  return session === "authenticated";
}
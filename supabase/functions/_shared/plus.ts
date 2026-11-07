import { createClient } from "jsr:@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

export const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

/** Monthly price of Familiar Plus in Telegram Stars. */
export const PLUS_STARS = Number(Deno.env.get("PLUS_STARS") ?? 150);
export const PAYLOAD_PREFIX = "plus:";

/** The signed-in user behind the request's JWT (null for the bare anon key). */
export async function caller(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await admin().auth.getUser(token);
  return data.user ?? null;
}

export async function hasPlus(userId: string): Promise<boolean> {
  const { data } = await admin().from("subscriptions").select("expires_at").eq("user_id", userId).maybeSingle();
  return !!data && new Date(data.expires_at).getTime() > Date.now();
}

// Returns a download URL for a pack: public for free packs, a short-lived signed URL for paid
// packs the caller owns. POST { "pack_id": "..." } with the user's JWT (paid packs only).
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const { pack_id } = await req.json().catch(() => ({}));
  if (typeof pack_id !== "string" || !/^[a-z0-9][a-z0-9._-]{1,63}$/.test(pack_id)) {
    return json({ error: "bad pack_id" }, 400);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: pack } = await admin
    .from("packs")
    .select("id, file_path, price_cents, size_bytes")
    .eq("id", pack_id)
    .eq("published", true)
    .maybeSingle();
  if (!pack) return json({ error: "pack not found" }, 404);

  if (pack.price_cents === 0) {
    const { data } = admin.storage.from("packs-free").getPublicUrl(pack.file_path);
    return json({ url: data.publicUrl, size: pack.size_bytes });
  }

  // Paid pack: the caller must be signed in and own it.
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!auth.user) return json({ error: "sign in required" }, 401);

  const { data: owned } = await admin
    .from("entitlements")
    .select("pack_id")
    .eq("user_id", auth.user.id)
    .eq("pack_id", pack.id)
    .maybeSingle();
  if (!owned) return json({ error: "not purchased" }, 403);

  const { data: signed, error } = await admin.storage.from("packs-paid").createSignedUrl(pack.file_path, 60);
  if (error || !signed) return json({ error: "storage error" }, 500);
  return json({ url: signed.signedUrl, size: pack.size_bytes });
});

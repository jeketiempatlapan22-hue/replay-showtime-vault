import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { replay_id, password } = await req.json();
    if (!replay_id || !password) {
      return new Response(JSON.stringify({ valid: false }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch full replay row (server-only)
    const { data: replay } = await supabase
      .from("replays")
      .select("password, date, youtube_id, m3u8_url, source_type")
      .eq("id", replay_id)
      .single();

    if (!replay) {
      return new Response(JSON.stringify({ valid: false }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let valid = replay.password === password;

    // Check master password
    if (!valid) {
      const d = new Date(replay.date);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const { data: master } = await supabase
        .from("master_passwords")
        .select("password")
        .eq("month", monthKey)
        .maybeSingle();
      valid = master?.password === password;
    }

    if (!valid) {
      return new Response(JSON.stringify({ valid: false }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Return only source data when authorised
    return new Response(
      JSON.stringify({
        valid: true,
        youtube_id: replay.youtube_id || "",
        m3u8_url: replay.m3u8_url || "",
        source_type: replay.source_type || "youtube",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch {
    return new Response(JSON.stringify({ valid: false }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

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
    const body = await req.json().catch(() => ({}));
    const { replay_id, password, access_token } = body || {};
    if (!replay_id || (!password && !access_token)) {
      return new Response(JSON.stringify({ valid: false }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: replay } = await supabase
      .from("replays")
      .select("password, date, youtube_id, m3u8_url, source_type, sources, access_token")
      .eq("id", replay_id)
      .single();

    if (!replay) {
      return new Response(JSON.stringify({ valid: false }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let valid = false;

    if (access_token) {
      valid = !!replay.access_token && replay.access_token === access_token;
    } else if (password) {
      valid = replay.password === password;
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
    }

    if (!valid) {
      return new Response(JSON.stringify({ valid: false }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        valid: true,
        youtube_id: replay.youtube_id || "",
        m3u8_url: replay.m3u8_url || "",
        source_type: replay.source_type || "youtube",
        sources: Array.isArray(replay.sources) ? replay.sources : [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch {
    return new Response(JSON.stringify({ valid: false }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

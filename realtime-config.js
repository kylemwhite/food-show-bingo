/* ---------------------------------------------------------------------------
   Optional live sync — everyone in a game gets a notification when a player
   calls BINGO, plus a small "N online" indicator.

   Leave both values blank to keep the game fully offline / no-server (default).

   To turn it on:
     1. Create a free project at https://supabase.com  (no schema needed).
     2. Project Settings → Data API  →  copy "Project URL"
        Project Settings → API Keys  →  copy the "anon" / "publishable" key.
     3. Paste them below and commit. Both are safe to commit and ship to the
        browser — the anon key is a public client key, and this app only uses
        Realtime broadcast/presence (ephemeral pub/sub, no database access).
     4. In Supabase: Realtime is on by default. Nothing else to configure.

   Costs nothing on the free tier for this use (a few messages per game).
--------------------------------------------------------------------------- */
window.FSB_CONFIG = {
  supabaseUrl: "",
  supabaseKey: ""
};

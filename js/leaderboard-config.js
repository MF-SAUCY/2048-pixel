/* Leaderboard connection.
 *
 * Fill these in from your Supabase project (Settings -> API). Until both are
 * set, the leaderboard hides itself entirely and the game plays exactly as it
 * does now — nothing else depends on it.
 *
 * The anon key is meant to be public: it ships inside this page, which is
 * served from a public repo, so treat it as readable by anyone. The table it
 * reaches holds two first names and some 2048 scores, and the row policies in
 * README.md stop it doing anything else. Do not put anything here you would
 * mind a stranger seeing.
 */

window.LEADERBOARD_CONFIG = {
  url: "",      // e.g. https://abcdefghijklm.supabase.co
  anonKey: "",  // the "anon / public" key, not the service role key
};

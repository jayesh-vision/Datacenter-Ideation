/* Deployment overrides (set in Vercel → Project → Settings → Environment Variables, then redeploy).
   They are applied AFTER the URL (?persona= / ?geo=) and the browser's saved choice, so they win over
   links that live in someone else's code.

     VITE_PERSONA_OVERRIDE   comma-separated rules, first match wins:
                               colocation              → always colocation
                               network=colocation      → a request for network becomes colocation
                               us:network=colocation   → only when the geography is us
     VITE_GEO_OVERRIDE       the same, for the geography:
                               us                      → always the USA
                               in=us                   → a request for India becomes the USA

   Unset (the default) means no override. Vite inlines these at build time, so a change needs a redeploy. */
type Rule = { scope?: string; from?: string; to: string };
const parse = (raw: string | undefined): Rule[] =>
  (raw ?? '').split(',').map(r => r.trim()).filter(Boolean).map(r => {
    const [scope, rest] = r.includes(':') ? r.split(':', 2) : [undefined, r];
    const [from, to] = rest.includes('=') ? rest.split('=', 2) : [undefined, rest];
    return { scope: scope?.trim().toLowerCase(), from: from?.trim().toLowerCase(), to: (to ?? '').trim().toLowerCase() };
  }).filter(r => r.to);
const env = (k: string): string | undefined => {
  try { return (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[k]; } catch { return undefined; }
};
const PERSONA_RULES = parse(env('VITE_PERSONA_OVERRIDE'));
const GEO_RULES = parse(env('VITE_GEO_OVERRIDE'));
const apply = (rules: Rule[], requested: string, scope?: string) =>
  rules.find(r => (!r.scope || r.scope === scope) && (!r.from || r.from === requested))?.to ?? requested;
/* the persona to use, given what was requested and the (already overridden) geography */
export const overridePersona = (requested: string, geo: string) => apply(PERSONA_RULES, requested, geo);
export const overrideGeo = (requested: string) => apply(GEO_RULES, requested);
export const overridesActive = () => ({ persona: PERSONA_RULES.length > 0, geo: GEO_RULES.length > 0 });

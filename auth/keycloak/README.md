# Synapse — Keycloak login theme

`themes/synapse/` is a copy of the Opstral theme (`KeycloakUICode/`) rebranded as **Synapse**. All 47 login
templates, the password encryption in `login.ftl`, the reload redirect, registration, SSO providers and OTP flows
are unchanged; only the brand and the look change.

What changed
- `login/template.ftl` — Synapse favicon, Poppins + Inter, `synapse.css` + `synapse-shell.css` instead of `opstral.css`,
  a full-page datacenter scene behind everything, the Synapse lockup and pitch on the left, and a
  phone brand row. Every page that uses the layout (reset password, OTP,
  update password, errors …) gets it.
- `login/login.ftl` — only the SSO divider's inline white text colour was removed.
- `login/resources/css/synapse.css` — `opstral.css` in the Synapse palette: navy canvas, brand blue instead of lime
  (same layout as the Opstral page). `opstral.css` is kept, no longer loaded.
- `login/resources/css/synapse-shell.css` — the scene, its shading, the glass card and the brand side; responsive
  (card only, over the scene, under 980 px); motion stops with "reduce motion".
- `login/resources/img/synapse-aisle.svg` — the datacenter scene: a cold aisle between two rack rows, devices with
  blinking status LEDs, lit floor tiles, cable trays. Drawn, not a photo (no licence, works offline, ~400 KB).
  Rebuild with `python3 tools/aisle.py` (seeded; change the seed or the constants at the top for another look).
- `login/resources/img/synapse-logo*.svg`, `synapse-mark*.svg` — the design team's Synapse logo, vectorised from their PNG
  (`tools/trace_logo.py <png>`, needs pillow + numpy + potracer): lockup in ink / white / currentColor, the mark in white / ink, and
  `synapse-mark.svg` = white mark on a brand-blue tile (the favicon). The login uses `synapse-logo-white.svg`.
- `login/messages/messages_en.properties` — brand texts (`opsBrandName=Synapse`, eyebrow, description, welcome line)
  and the new `syn*` keys. Other languages: add the same keys (French has no `ops*` keys today either).

Install
1. Copy `themes/synapse` into Keycloak's `themes/` folder (or your theme JAR / image).
2. Realm settings → Themes → Login theme = `synapse` (the email theme folder is copied unchanged, still Opstral-branded).
3. Restart, or clear the theme cache in dev (`--spi-theme-cache-themes=false --spi-theme-cache-templates=false`).

Preview without Keycloak: open `preview/login.html` and `preview/login-error.html` in a browser (static copies of the
rendered markup that load the theme's real CSS; rebuild with `python3 tools/preview.py` after editing the templates).

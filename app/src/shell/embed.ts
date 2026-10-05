/* Iframe embedding: `?shell=false` hides the left menu and the top header so a screen can sit inside
   another platform; `?shell=true` shows them again. With no parameter the app shows them, unless this
   browser tab (or iframe) was already switched — the choice is remembered for the tab, so links clicked
   inside the iframe keep the same mode. A memory copy covers iframes where storage is blocked. */
const KEY = 'dco.shell';
let shown = true;
function read() {
  try {
    const q = new URLSearchParams(window.location.search).get('shell');
    if (q === 'true' || q === 'false') { shown = q === 'true'; try { sessionStorage.setItem(KEY, q); } catch { /* storage blocked in a third-party iframe */ } return; }
    const saved = sessionStorage.getItem(KEY);
    if (saved === 'true' || saved === 'false') shown = saved === 'true';
  } catch { /* no window or storage */ }
}
read();
export const shellVisible = () => shown;

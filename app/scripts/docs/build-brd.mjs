/* Builds the searchable HTML copy of the BRD (user, 27-Oct-2026: "add HTML copy in Help & FAQ").
   docs/SynapseDC-BRD.md → docs/dco-brd.html + app/public/brd.html. Run from app/: node scripts/docs/build-brd.mjs
   The Markdown is the source; edit it, then rebuild. Supported Markdown: #/##/### headings, paragraphs, tables, bullet and
   numbered lists (one level), fenced code, ---, **bold**, *italic*, `code`, [links](url). Every ### block (and ## block
   without ### children) is a searchable unit; the page offers search (?q=), a contents rail, #<id> links and Print. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const md = readFileSync(resolve(root, 'docs/SynapseDC-BRD.md'), 'utf8');

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = s => esc(s)
  .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:]|$)/g, '$1<i>$2</i>')
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => `<a href="${u}"${/^https?:/.test(u) ? ' target="_blank" rel="noreferrer"' : ''}>${t}</a>`);
const slug = s => s.toLowerCase().replace(/&amp;|&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/* ---- block parser ------------------------------------------------------------------ */
const lines = md.split('\n');
const blocks = []; // { kind: 'h1'|'h2'|'h3'|'p'|'table'|'ul'|'ol'|'code'|'hr', ... }
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (!l.trim()) continue;
  if (l.startsWith('```')) { const b = []; i++; while (i < lines.length && !lines[i].startsWith('```')) b.push(lines[i++]); blocks.push({ kind: 'code', text: b.join('\n') }); continue; }
  if (/^---\s*$/.test(l)) { blocks.push({ kind: 'hr' }); continue; }
  if (l.startsWith('> ')) { blocks.push({ kind: 'quote', text: l.slice(2) }); continue; }
  const h = /^(#{1,4}) (.+)$/.exec(l); if (h) { blocks.push({ kind: 'h' + h[1].length, text: h[2].trim() }); continue; }
  if (l.startsWith('|')) { const rows = []; while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]); i--; blocks.push({ kind: 'table', rows: rows.filter(r => !/^\|\s*-{2,}/.test(r)) }); continue; }
  if (/^\s*[-*] /.test(l)) { const items = []; while (i < lines.length && /^\s*[-*] /.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*] /, '')); i--; blocks.push({ kind: 'ul', items }); continue; }
  if (/^\s*\d+\. /.test(l)) { const items = []; while (i < lines.length && /^\s*\d+\. /.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\. /, '')); i--; blocks.push({ kind: 'ol', items }); continue; }
  const p = [l]; while (i + 1 < lines.length && lines[i + 1].trim() && !/^(#{1,4} |\||\s*[-*] |\s*\d+\. |```|---|> )/.test(lines[i + 1])) p.push(lines[++i]);
  blocks.push({ kind: 'p', text: p.join(' ') });
}

const cells = r => r.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
const render = b => {
  switch (b.kind) {
    case 'p': return `<p>${inline(b.text)}</p>`;
    case 'hr': return '';
    case 'h4': return `<h4>${inline(b.text)}</h4>`;
    case 'quote': return `<p class="quote">${inline(b.text)}</p>`;
    case 'code': return `<pre><code>${esc(b.text)}</code></pre>`;
    case 'ul': return `<ul>${b.items.map(t => `<li>${inline(t)}</li>`).join('')}</ul>`;
    case 'ol': return `<ol>${b.items.map(t => `<li>${inline(t)}</li>`).join('')}</ol>`;
    case 'table': {
      const [head, ...body] = b.rows.map(cells);
      const hasHead = head.some(c => c);
      const thead = hasHead ? `<thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead>` : '';
      const rows = (hasHead ? body : b.rows.map(cells)).map(r => `<tr>${r.map((c, j) => `<td${j === 0 && /^(?:[A-Z]{1,6}-)+[A-Z0-9]*\d[\w.]*$/.test(c) ? ' class="id"' : ''}>${inline(c)}</td>`).join('')}</tr>`).join('');
      return `<div class="tw"><table>${thead}<tbody>${rows}</tbody></table></div>`;
    }
  }
  return '';
};

/* ---- group into sections (##) and units (###) --------------------------------------- */
const num = t => { const m = /^(\d+(?:\.\d+)*|Appendix [A-Z]|[A-Z]\.\d+)\s*[—-]?\s*(.*)$/.exec(t); return m ? [m[1], m[2]] : ['', t]; };
const title = blocks.find(b => b.kind === 'h1')?.text ?? 'BRD';
const sections = []; let cur = null, unit = null, front = [];
const usedIds = new Set(); const uid = s => { const sn = num(s)[0]; let id = (sn ? slug(sn) : slug(s)) || 'x'; let n = 2; while (usedIds.has(id)) id = slug(s) + '-' + n++; usedIds.add(id); return id; };
for (const b of blocks) {
  if (b.kind === 'h1') continue;
  if (b.kind === 'h2') { if (b.text === 'Contents') { cur = { skip: true }; continue; } cur = { id: uid(b.text), title: b.text, units: [], lead: [] }; unit = null; sections.push(cur); continue; }
  if (cur?.skip) continue;
  if (!cur) { front.push(b); continue; }
  if (b.kind === 'h3') { unit = { id: uid(b.text), title: b.text, blocks: [] }; cur.units.push(unit); continue; }
  (unit ? unit.blocks : cur.lead).push(b);
}
const grp = s => { const n = num(s.title)[0]; const c = parseInt(n); if (!c) return /^[A-Z]\./.test(n) ? 'Appendix' : 'Appendix'; if (c <= 6) return 'Business'; if (n.startsWith('7.')) return 'Modules'; if (c === 7) return 'Modules'; if (c === 8) return 'Analytics'; if (c === 9) return 'Integrations'; return 'Delivery and governance'; };

const text = bs => bs.map(b => b.kind === 'table' ? b.rows.join(' ') : b.kind === 'ul' || b.kind === 'ol' ? b.items.join(' ') : b.text ?? '').join(' ');
let main = '';
for (const s of sections) {
  const [n, t] = num(s.title);
  main += `<section id="${s.id}" data-grp="${grp(s)}" data-t="${esc(s.title)}">\n<h2><span class="num">${esc(n)}</span>${inline(t)}</h2>\n`;
  if (s.lead.length) main += `<div class="unit" data-k="${esc(text(s.lead)).slice(0, 4000)}">${s.lead.map(render).join('\n')}</div>\n`;
  for (const u of s.units) {
    const [un, ut] = num(u.title);
    main += `<div class="unit" id="${u.id}"><h3><span class="num">${esc(un)}</span>${inline(ut)}</h3>${u.blocks.map(render).join('\n')}</div>\n`;
  }
  main += '</section>\n';
}
const frontHtml = front.map(render).join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>SynapseDC BRD</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
/* GENERATED from docs/SynapseDC-BRD.md by app/scripts/docs/build-brd.mjs — edit the Markdown, then rebuild. */
:root { --bg:#f8fafc; --surface:#fff; --line:#e2e8f0; --line-2:#cbd5e1; --fg:#0f172a; --fg-2:#334155; --muted:#64748b; --accent:#1c81ef; --accent-ink:#1d4ed8; --accent-soft:#dbeafe;
  --warn:#b45309; --warn-soft:#fef3c7; --mark:#fde68a; --code-bg:#f1f5f9; --f-display:"Poppins","Segoe UI",system-ui,sans-serif; --f-body:"Inter","Segoe UI",system-ui,sans-serif; --f-mono:"JetBrains Mono",ui-monospace,Menlo,monospace; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#0b1220; --surface:#111a2e; --line:#1f2b44; --line-2:#2c3b5a; --fg:#e6edf7; --fg-2:#c3cfe0; --muted:#8a9ab3; --accent:#5aa6ff; --accent-ink:#8cc2ff; --accent-soft:#15284a; --warn:#fbbf24; --warn-soft:#33270b; --mark:#5b4a12; --code-bg:#0d1628; color-scheme:dark; } }
:root[data-theme="dark"] { --bg:#0b1220; --surface:#111a2e; --line:#1f2b44; --line-2:#2c3b5a; --fg:#e6edf7; --fg-2:#c3cfe0; --muted:#8a9ab3; --accent:#5aa6ff; --accent-ink:#8cc2ff; --accent-soft:#15284a; --warn:#fbbf24; --warn-soft:#33270b; --mark:#5b4a12; --code-bg:#0d1628; color-scheme:dark; }
* { box-sizing:border-box; } [hidden] { display:none !important; }
html { scroll-padding-top:76px; }
body { margin:0; background:var(--bg); color:var(--fg); font-family:var(--f-body); font-size:14.5px; line-height:1.6; }
h1,h2,h3 { font-family:var(--f-display); font-weight:500; margin:0; color:var(--fg); text-wrap:balance; }
p { margin:0 0 10px; } a { color:var(--accent-ink); } button { font:inherit; color:inherit; cursor:pointer; }
button:focus-visible,input:focus-visible,a:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
code { font-family:var(--f-mono); background:var(--code-bg); border:1px solid var(--line); border-radius:4px; padding:0 4px; font-size:.84em; overflow-wrap:anywhere; }
pre { font-family:var(--f-mono); background:var(--code-bg); border:1px solid var(--line); border-radius:8px; padding:12px 14px; font-size:12.5px; line-height:1.5; overflow-x:auto; margin:8px 0 14px; } pre code { background:none; border:0; padding:0; font-size:inherit; }
mark { background:var(--mark); color:inherit; border-radius:2px; padding:0 1px; }
ul,ol { margin:0 0 10px; padding-left:20px; } li { margin:2px 0; }
.wrap { max-width:1360px; margin:0 auto; padding:0 20px 56px; }
.top { padding:26px 0 14px; display:grid; gap:8px; }
.eyebrow { font-family:var(--f-display); font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--accent-ink); font-weight:600; }
.top h1 { font-size:26px; } .top .front { color:var(--fg-2); max-width:1000px; font-size:13.5px; }
.top .front .tw { margin:4px 0 8px; } .tag { display:inline-block; font-size:11px; font-weight:600; border-radius:999px; padding:1px 8px; background:var(--warn-soft); color:var(--warn); }
.bar { position:sticky; top:0; z-index:5; background:var(--bg); padding:10px 0; border-bottom:1px solid var(--line); }
.search { display:flex; gap:8px; align-items:center; } .search .box { flex:1; position:relative; }
.search input { width:100%; height:42px; border:1px solid var(--line-2); border-radius:10px; background:var(--surface); color:var(--fg); padding:0 40px; font:inherit; font-size:15px; }
.search .ico { position:absolute; left:13px; top:11px; width:18px; height:18px; color:var(--muted); }
.search .clr { position:absolute; right:7px; top:7px; width:28px; height:28px; border:0; background:none; color:var(--muted); border-radius:6px; font-size:18px; line-height:1; } .search .clr:hover { background:var(--code-bg); }
.hits { font-size:12.5px; color:var(--muted); white-space:nowrap; min-width:110px; text-align:right; }
.btn { height:36px; padding:0 12px; border:1px solid var(--line-2); background:var(--surface); border-radius:8px; font-size:13px; white-space:nowrap; } .btn:hover { border-color:var(--accent); color:var(--accent-ink); }
.quick { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; } .chip { border:1px solid var(--line-2); background:var(--surface); border-radius:999px; padding:2px 10px; font-size:12.5px; color:var(--fg-2); } .chip:hover { border-color:var(--accent); color:var(--accent-ink); }
.layout { display:grid; grid-template-columns:270px minmax(0,1fr); gap:28px; margin-top:18px; align-items:start; }
.toc { position:sticky; top:76px; max-height:calc(100vh - 92px); overflow:auto; font-size:13px; padding-right:4px; }
.toc a { display:block; text-decoration:none; color:var(--fg-2); padding:3px 8px; border-radius:6px; border-left:2px solid transparent; } .toc a:hover { background:var(--code-bg); }
.toc a.on { color:var(--accent-ink); border-left-color:var(--accent); background:var(--accent-soft); } .toc a.dim { opacity:.35; }
.toc .grp { font-family:var(--f-display); font-size:10.5px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); margin:12px 8px 4px; font-weight:600; }
main section { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:20px 22px; margin-bottom:14px; }
main section > h2 { font-size:19px; margin-bottom:10px; display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; }
.unit { padding:6px 0; } .unit h3 { font-size:15px; margin:12px 0 8px; display:flex; gap:8px; align-items:baseline; } .unit + .unit { border-top:1px solid var(--line); }
h4 { font-family:var(--f-display); font-weight:500; font-size:13.5px; margin:14px 0 6px; color:var(--fg); } .quote { border-left:3px solid var(--accent); background:var(--accent-soft); padding:8px 12px; border-radius:6px; }
.num { font-family:var(--f-mono); font-size:12px; color:var(--muted); font-weight:500; }
.tw { overflow-x:auto; margin:6px 0 14px; border:1px solid var(--line); border-radius:8px; }
table { width:100%; border-collapse:collapse; font-size:13px; } th { text-align:left; font-weight:500; color:var(--fg-2); background:var(--code-bg); padding:8px 10px; border-bottom:1px solid var(--line); white-space:nowrap; }
td { padding:7px 10px; border-bottom:1px solid var(--line); vertical-align:top; } tr:last-child td { border-bottom:0; } td:first-child code, td code { white-space:nowrap; }
td.id { white-space:nowrap; font-family:var(--f-mono); font-size:12px; }
.empty { padding:30px; text-align:center; color:var(--muted); }
body.embed .top { display:none; } body.embed .bar { padding-top:12px; }
@media (max-width:900px) { .layout { grid-template-columns:minmax(0,1fr); } .toc { position:static; max-height:none; border:1px solid var(--line); border-radius:10px; padding:8px; background:var(--surface); } .wrap { padding:0 16px 40px; } main section { padding:16px; } .hits { display:none; } td.id { white-space:normal; } }
@media print { .bar,.toc { display:none !important; } .layout { display:block; } main section { break-inside:avoid-page; border:0; padding:0 0 14px; } body { background:#fff; } }
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <div class="eyebrow">SynapseDC · Business Requirements Document</div>
    <h1>${esc(title.replace(/^SynapseDC\s*[—-]\s*/, ''))}</h1>
    <div class="front">${frontHtml}</div>
  </header>
  <div class="bar">
    <div class="search">
      <div class="box">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input id="q" type="text" autocomplete="off" placeholder="Search a requirement id, module, rule, system or term (REV-004, ride-through, ServiceNow, tenant, Xid…)" aria-label="Search the BRD">
        <button class="clr" id="clr" aria-label="Clear search" hidden>×</button>
      </div>
      <span class="hits" id="hits"></span>
      <button class="btn" id="print" type="button">Print</button>
    </div>
    <div class="quick" id="quick"></div>
  </div>
  <div class="layout">
    <nav class="toc" id="toc" aria-label="Contents"></nav>
    <main id="main">
${main}
      <div class="empty" id="empty" hidden>Nothing matches. Try a requirement id (CC-001, BRULE-REV-04), a module, a system name or a term.</div>
    </main>
  </div>
</div>
<script>
(function () {
  const params = new URLSearchParams(location.search);
  const framed = (() => { try { return window.self !== window.top; } catch { return true; } })();
  if (params.get('embed') === '1') document.documentElement.dataset.theme = 'light';
  if (framed || params.get('embed') === '1') document.body.classList.add('embed');
  const secs = [...document.querySelectorAll('main section')];
  const toc = document.getElementById('toc'); const links = new Map(); let grp = '';
  for (const s of secs) {
    if (s.dataset.grp !== grp) { grp = s.dataset.grp; const g = document.createElement('div'); g.className = 'grp'; g.textContent = grp; toc.appendChild(g); }
    const a = document.createElement('a'); a.href = '#' + s.id; a.textContent = s.dataset.t; toc.appendChild(a); links.set(s.id, a);
  }
  const QUICK = ['colocation', 'NeoCloud', 'P1', 'to discuss', 'GPU time lost', 'ride-through', 'change request', 'ServiceNow', 'tenant', 'credits', 'collector', 'DCGM', 'Inventory', 'approval'];
  const quick = document.getElementById('quick');
  for (const w of QUICK) { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = w; b.onclick = () => { q.value = w; run(); }; quick.appendChild(b); }
  const units = [...document.querySelectorAll('.unit')];
  const originals = new Map(units.map(u => [u, u.innerHTML]));
  const q = document.getElementById('q'), clr = document.getElementById('clr'), hits = document.getElementById('hits'), empty = document.getElementById('empty');
  const esc = t => t.replace(/[.*+?^$\{\}()|[\\]\\\\]/g, '\\\\$&');
  function mark(node, re) {
    const walk = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentNode.closest('script, mark') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    const list = []; while (walk.nextNode()) list.push(walk.currentNode);
    for (const t of list) {
      if (!re.test(t.data)) continue; re.lastIndex = 0;
      const f = document.createDocumentFragment(); let last = 0;
      t.data.replace(re, (m, i) => { f.append(t.data.slice(last, i)); const mk = document.createElement('mark'); mk.textContent = m; f.append(mk); last = i + m.length; return m; });
      f.append(t.data.slice(last)); t.replaceWith(f);
    }
  }
  function run() {
    const v = q.value.trim(); clr.hidden = !v;
    const terms = v.toLowerCase().split(/\\s+/).filter(Boolean); let n = 0;
    for (const u of units) {
      u.innerHTML = originals.get(u);
      const text = (u.textContent + ' ' + (u.dataset.k || '')).toLowerCase();
      const ok = !terms.length || terms.every(t => text.includes(t));
      u.hidden = !ok; if (ok) { n++; if (terms.length) mark(u, new RegExp(terms.map(esc).join('|'), 'gi')); }
    }
    let ns = 0;
    for (const s of secs) { const any = [...s.querySelectorAll('.unit')].some(u => !u.hidden); s.hidden = !any; links.get(s.id).classList.toggle('dim', !any); if (any) ns++; }
    empty.hidden = n > 0;
    hits.textContent = terms.length ? n + ' blocks in ' + ns + ' sections' : '';
    const u = new URL(location.href); if (v) u.searchParams.set('q', v); else u.searchParams.delete('q'); history.replaceState(null, '', u);
  }
  let tm; q.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(run, 150); });
  clr.onclick = () => { q.value = ''; run(); q.focus(); };
  document.getElementById('print').onclick = () => window.print();
  document.addEventListener('keydown', e => { if (e.key === '/' && document.activeElement !== q) { e.preventDefault(); q.focus(); } if (e.key === 'Escape' && document.activeElement === q) { q.value = ''; run(); } });
  const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { for (const a of links.values()) a.classList.remove('on'); links.get(e.target.id)?.classList.add('on'); } }, { rootMargin: '-80px 0px -70% 0px' });
  secs.forEach(s => io.observe(s));
  if (params.get('q')) { q.value = params.get('q'); run(); }
  const jump = () => { const id = location.hash.slice(1); const el = id && document.getElementById(id); if (el) { el.hidden = false; el.closest('section').hidden = false; el.scrollIntoView(); } };
  window.addEventListener('hashchange', jump); jump();
})();
</script>
</body>
</html>
`;
for (const out of ['docs/dco-brd.html', 'app/public/brd.html']) writeFileSync(resolve(root, out), html);
console.log(`BRD html: ${sections.length} sections, ${sections.reduce((n, s) => n + s.units.length, 0)} units, ${Math.round(html.length / 1024)} KB → docs/dco-brd.html, app/public/brd.html`);

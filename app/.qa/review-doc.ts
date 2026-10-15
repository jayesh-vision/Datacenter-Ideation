/* Review document check (node): build the ReviewDoc for plans, lint it (NaN, undefined, raw keys, empty sections / tables, row widths),
   write the text dump and every drawing SVG to OUT (default .qa/out/review).
   usage: npx tsx --tsconfig tsconfig.app.json --import ./.qa/lib/css-hook.mjs .qa/review-doc.ts [persona] [geo] [PLN-0001 …]   (no ids = every plan) */
import { mkdirSync, writeFileSync } from 'node:fs';
import { allPlans, docFor, docText, lint, setup } from './lib/reviewNode';

const [persona = 'neocloud', geo = 'us', ...ids] = process.argv.slice(2);
setup(persona, geo);
const out = process.env.OUT ?? '.qa/out/review';
mkdirSync(out, { recursive: true });
const list = ids.length ? ids : allPlans().map(p => p.plnId).sort();
let bad = 0;
for (const id of list) {
  const t0 = Date.now();
  const doc = docFor(id);
  const t1 = Date.now();
  const svgs = doc.drawings.map(d => ({ d, svg: d.svg() }));
  const t2 = Date.now();
  writeFileSync(`${out}/${geo}-${id}.md`, docText(doc));
  for (const { d, svg } of svgs) writeFileSync(`${out}/${geo}-${d.number}.svg`, svg);
  const problems = lint(doc);
  for (const { d, svg } of svgs) { if (/var\(--|NaN|undefined/.test(svg)) problems.push(`svg ${d.number}: ${svg.match(/.{0,40}(var\(--|NaN|undefined).{0,40}/)?.[0]}`); }
  if (problems.length) bad++;
  console.log(`${id} ${doc.meta.status.padEnd(12)} ${doc.sections.filter(s => !s.number.includes('.')).length} sections / ${doc.sections.length} with subs · ${doc.drawings.length} drawings · ${doc.sheets.length} sheets · build ${t1 - t0} ms · svg ${t2 - t1} ms${problems.length ? `\n   ${problems.join('\n   ')}` : ''}`);
}
console.log(bad ? `${bad} plan(s) with problems` : 'all review documents clean');
process.exit(bad ? 1 : 0);

// Builds docs/dco-integration-guide.html (and its served copy app/public/integration-guide.html) from
// the template beside this file + the markdown source docs/dco-data-sources-and-integration-guide.md.
// The data-path figure is embedded as a data URI so the page is one file. Run from app/:
//   node scripts/docs/build-integration-guide.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const docs = join(root, 'docs');
const md = readFileSync(join(docs, 'dco-data-sources-and-integration-guide.md'), 'utf8')
  .replace(/^# [^\n]*\n+[^\n]*@[^\n]*\n+/, '') // title + byline: the page has its own header
  .replace('(dco-data-path.png)', `(data:image/png;base64,${readFileSync(join(docs, 'dco-data-path.png')).toString('base64')})`);
const html = readFileSync(join(here, 'integration-guide.template.html'), 'utf8')
  .replace('/*__MD__*/""', () => JSON.stringify(md).replace(/<\/script/gi, '<\\/script'));
for (const out of [join(docs, 'dco-integration-guide.html'), join(root, 'app/public/integration-guide.html')]) writeFileSync(out, html);
console.log(`integration guide: ${(html.length / 1024).toFixed(0)} KB`);

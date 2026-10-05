/* Fingerprint of one persona's generated estate — proves a change left a persona's data untouched.
   usage: npx tsx .qa/fingerprint.ts [persona]  → prints a hash per collection */
import { createHash } from 'node:crypto';
import { generate } from '../src/mock/generate';
const p = (process.argv[2] ?? 'network') as Parameters<typeof generate>[0];
const db = generate(p) as unknown as Record<string, unknown>;
const h = (x: unknown) => createHash('sha1').update(JSON.stringify(x, (_k, v) => (v instanceof Map ? [...v.entries()] : v))).digest('hex').slice(0, 10);
for (const k of ['datacenters', 'nes', 'links', 'services', 'customers', 'alerts', 'incidents', 'changes']) console.log(k.padEnd(12), h(db[k]));

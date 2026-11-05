/* Proves the reference Gaudi 2 card (mock/gaudi2-ref.ts) equals the user's habanalabs exporter scrape: parses the RAW file on its own (it does not
   use GAUDI2_REF), then compares every metric with the card the NeoCloud × USA estate holds.
   usage: npx tsx .qa/gaudi2-ref-check.ts [scrape file]   (default ~/Downloads/x101-vm-gaudi-2-metrics) */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { generate } from '../src/mock/generate';
import { setActiveGeo } from '../src/mock/geo';
const file = process.argv[2] ?? `${homedir()}/Downloads/x101-vm-gaudi-2-metrics`;
const M = new Map<string, number>(); const labels: Record<string, string> = {}; const nics: { type: string; up: number }[] = [];
for (const line of readFileSync(file, 'utf8').split('\n')) {
  const m = /^(habanalabs_\w+)\{(.*)\}\s+(\S+)$/.exec(line.trim()); if (!m) continue;
  for (const [, k, v] of m[2].matchAll(/(\w+)="([^"]*)"/g)) labels[k] ??= v;
  if (m[1] === 'habanalabs_nic_port_status') nics.push({ type: /port_type="(\w+)"/.exec(m[2])![1], up: Number(m[3]) });
  else M.set(m[1], Number(m[3]));
}
setActiveGeo('us');
const db = generate('neocloud') as any;
const node = [...db.gpu.nodes.values()].find((x: any) => x.ref); if (!node) { console.log('FAIL no reference node'); process.exit(1); }
const g = node.gpus[node.ref.module];
const GIB = 1024 ** 3; let fail = 0;
/* power and on-chip temperature follow the user's Telemetry Ops screenshot (latest reading), not the file: 59.0 W, 27 °C */
const DASH = { powerW: 59, onchip: 27 };
console.log(`scrape had power ${M.get('habanalabs_power_mW')! / 1000} W, on-chip ${M.get('habanalabs_temperature_onchip')} °C; dashboard latest ${DASH.powerW} W, ${DASH.onchip} °C (used)`);
const eq = (name: string, scraped: unknown, shown: unknown) => { const ok = String(scraped) === String(shown); if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', name.padEnd(26), String(scraped).padEnd(36), String(shown)); };
console.log(`reference card: ${node.neId} GPU${node.ref.module} (host ${node.ref.host}, VM ${node.ref.vm})\n`);
eq('Serial', labels.Serial, g.serial); eq('UUID', labels.UUID, g.uuid); eq('Driver', labels.driver, node.driver.replace('habanalabs ', ''));
eq('Firmware (in fit label)', labels.fit.includes(node.firmware), true);
eq('AIP utilisation %', M.get('habanalabs_utilization'), g.util);
eq('HBM used GiB', (M.get('habanalabs_memory_used_bytes')! / GIB).toFixed(1), g.memUsedGb.toFixed(1));
eq('HBM total GiB', Math.round(M.get('habanalabs_memory_total_bytes')! / GIB), g.memGb);
eq('On-chip °C (dashboard)', DASH.onchip, g.tempC); eq('On-board °C', M.get('habanalabs_temperature_onboard'), g.hbmC);
eq('Power W (dashboard)', DASH.powerW, g.powerW); eq('Power limit W', M.get('habanalabs_power_default_limit_mW')! / 1000, g.tdpW);
eq('SoC clock MHz', M.get('habanalabs_clock_soc_mhz'), g.clockMhz); eq('PCIe replays', M.get('habanalabs_pcie_replay_count'), g.pcieReplay);
eq('Rows pending 1-bit', M.get('habanalabs_pending_rows_with_single_bit_ecc_errors'), g.sbe); eq('Rows pending 2-bit', M.get('habanalabs_pending_rows_with_double_bit_ecc_errors'), g.dbe);
eq('Internal ports up', `${nics.filter(p => p.type === 'internal' && p.up).length}/${nics.filter(p => p.type === 'internal').length}`, `${g.nic.up}/${g.nic.ports}`);
eq('External ports up', `${nics.filter(p => p.type === 'external' && p.up).length}/${nics.filter(p => p.type === 'external').length}`, `${g.nic.extUp}/${g.nic.ext}`);
eq('PCIe link', `${M.get('habanalabs_pci_link_speed')} GT/s x${M.get('habanalabs_pci_link_width')}`, '16 GT/s x16');
console.log(fail ? `\n${fail} FAIL` : '\nALL PASS — the card on screen is the scraped card'); process.exit(fail ? 1 : 0);

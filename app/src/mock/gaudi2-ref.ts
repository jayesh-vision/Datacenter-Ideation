/* The reference Gaudi 2 card (05-Nov-2026, user: "not exactly same as my exported GPU data … serial, model, IP, host … how can I be sure
   the other info is correct"). One card in the estate IS the user's card: the values below are copied from the habanalabs exporter scrape
   (`curl <vm>:41611/metrics | grep ^habanalabs_`, file x101-vm-gaudi-2-metrics, 05-Nov-2026 15:58) — nothing here is generated. The rest of
   the Gaudi 2 fleet is modelled on the same limits; its serials, hosts and addresses are the mock's. NeoCloud × USA only. */
import type { Gpu, GpuNode } from '../api/types';

export const GAUDI2_REF = {
  host: 'g2-wyn101', vm: 'x101-vm', module: 5, exporter: '192.168.122.13:41611', scrapedAt: '05-Nov-2026 15:58',
  serial: 'AN30019288', uuid: '01P0-HL2080A0-15-THRY61-10-06-03', driver: '1.24.2-52a555d',
  firmware: 'hl-gaudi2-1.24.0-fw-62.6.2-sec-11', kernel: 'Linux gaudi2 5.10.248-hl-gaudi2-1.24.0-fw-62.6.2-sec-11 aarch64',
  /* raw metric values as scraped */
  raw: {
    habanalabs_utilization: 0, habanalabs_memory_used_bytes: 92649159552, habanalabs_memory_total_bytes: 103079215104, habanalabs_memory_free_bytes: 10430055552,
    habanalabs_temperature_onchip: 26, habanalabs_temperature_onboard: 26, habanalabs_temperature_threshold_slowdown: 90, habanalabs_temperature_threshold_shutdown: 90,
    habanalabs_power_mW: 139000, habanalabs_power_default_limit_mW: 550000, habanalabs_energy: 20933552013, habanalabs_clock_soc_mhz: 1650, habanalabs_clock_soc_max_mhz: 1650,
    habanalabs_pcie_rx: 324710, habanalabs_pcie_tx: 195, habanalabs_pcie_replay_count: 0, habanalabs_pci_link_speed: 16, habanalabs_pci_link_width: 16,
    habanalabs_pending_rows_with_single_bit_ecc_errors: 0, habanalabs_pending_rows_with_double_bit_ecc_errors: 0, habanalabs_pending_rows_state: 0, habanalabs_ecc_feature_mode: 1,
    nic_internal_up: 21, nic_internal: 21, nic_external_up: 0, nic_external: 3
  },
  /* the latest reading on the user's Telemetry Ops dashboard (screenshot, 05-Nov-2026; user: "match the power and temp to my screenshot values"):
     power draw 59.0 W (11% of 550 W), on-chip 27 °C. These two win over the scrape; the board temperature is not on the dashboard, so it stays scraped. */
  latest: { at: 'Telemetry Ops · latest', habanalabs_power_mW: 59000, habanalabs_temperature_onchip: 27 }
};
const GIB = 1024 ** 3;

/* lay the scraped card over card `module` of a Gaudi 2 spare node (idle, like the scraped card: 0% AIP utilisation) */
export function applyGaudi2Ref(node: GpuNode) {
  const R = GAUDI2_REF, r = R.raw, g: Gpu = node.gpus[R.module];
  g.serial = R.serial; g.uuid = R.uuid; g.util = r.habanalabs_utilization;
  g.memGb = Math.round(r.habanalabs_memory_total_bytes / GIB); g.memUsedGb = Math.round(r.habanalabs_memory_used_bytes / GIB * 10) / 10;
  g.tempC = R.latest.habanalabs_temperature_onchip; g.hbmC = r.habanalabs_temperature_onboard;
  g.powerW = R.latest.habanalabs_power_mW / 1000; g.tdpW = r.habanalabs_power_default_limit_mW / 1000; g.energyKwh24 = Math.round(g.powerW * 24 / 100) / 10;
  g.clockMhz = r.habanalabs_clock_soc_mhz; g.throttle = 'none'; g.health = 'healthy'; g.xid = null;
  g.pcieRxGbs = 0; g.pcieTxGbs = 0; g.pcieReplay = r.habanalabs_pcie_replay_count;
  g.sbe = r.habanalabs_pending_rows_with_single_bit_ecc_errors; g.dbe = r.habanalabs_pending_rows_with_double_bit_ecc_errors; g.remapPending = r.habanalabs_pending_rows_state > 0; g.retiredPages = 0;
  g.nic = { up: r.nic_internal_up, ports: r.nic_internal, extUp: r.nic_external_up, ext: r.nic_external };
  g.nvlinkErr = 0; g.nvlinkRxGbs = 0; g.nvlinkTxGbs = 0;
  node.driver = `habanalabs ${R.driver}`; node.firmware = R.firmware;
  node.ref = { host: R.host, vm: R.vm, module: R.module, exporter: R.exporter, scrapedAt: R.scrapedAt };
}

/* field by field: the scraped value (converted the way the screen shows it) next to what the estate holds for that card — the reconciliation
   the node drawer shows and `.qa/gaudi2-ref-check.ts` repeats against the raw file */
/* power and on-chip temperature are compared with the dashboard's latest reading (`latest`), every other field with the scrape */
export interface RefRow { field: string; metric: string; scraped: string; shown: string; ok: boolean }
export function gaudi2RefCheck(node: GpuNode): RefRow[] {
  const R = GAUDI2_REF, r = R.raw, g = node.gpus[R.module];
  const row = (field: string, metric: string, scraped: string | number, shown: string | number | undefined): RefRow => ({ field, metric, scraped: String(scraped), shown: String(shown ?? '—'), ok: String(scraped) === String(shown ?? '') });
  return [
    row('Serial', 'label Serial', R.serial, g.serial), row('UUID', 'label UUID', R.uuid, g.uuid),
    row('Driver', 'label driver', R.driver, node.driver.replace('habanalabs ', '')), row('Firmware', 'label fit', R.firmware, node.firmware),
    row('AIP utilisation %', 'habanalabs_utilization', r.habanalabs_utilization, g.util),
    row('HBM used GiB', 'habanalabs_memory_used_bytes', (r.habanalabs_memory_used_bytes / GIB).toFixed(1), g.memUsedGb.toFixed(1)),
    row('HBM total GiB', 'habanalabs_memory_total_bytes', Math.round(r.habanalabs_memory_total_bytes / GIB), g.memGb),
    row('On-chip °C', 'habanalabs_temperature_onchip · dashboard latest', R.latest.habanalabs_temperature_onchip, g.tempC), row('On-board °C', 'habanalabs_temperature_onboard', r.habanalabs_temperature_onboard, g.hbmC),
    row('Power W', 'habanalabs_power_mW · dashboard latest', (R.latest.habanalabs_power_mW / 1000).toFixed(1), g.powerW.toFixed(1)), row('Power limit W', 'habanalabs_power_default_limit_mW', r.habanalabs_power_default_limit_mW / 1000, g.tdpW),
    row('SoC clock MHz', 'habanalabs_clock_soc_mhz', r.habanalabs_clock_soc_mhz, g.clockMhz),
    row('PCIe replays', 'habanalabs_pcie_replay_count', r.habanalabs_pcie_replay_count, g.pcieReplay),
    row('Rows pending (1-bit)', 'habanalabs_pending_rows_with_single_bit_ecc_errors', r.habanalabs_pending_rows_with_single_bit_ecc_errors, g.sbe),
    row('Rows pending (2-bit)', 'habanalabs_pending_rows_with_double_bit_ecc_errors', r.habanalabs_pending_rows_with_double_bit_ecc_errors, g.dbe),
    row('NIC ports up', 'habanalabs_nic_port_status', `${r.nic_internal_up + r.nic_external_up} of ${r.nic_internal + r.nic_external}`, g.nic ? `${g.nic.up + g.nic.extUp} of ${g.nic.ports + g.nic.ext}` : undefined),
    row('PCIe link', 'habanalabs_pci_link_speed / width', `Gen4 x${r.habanalabs_pci_link_width}`, 'Gen4 x16'),
    row('Slowdown at °C', 'habanalabs_temperature_threshold_slowdown', r.habanalabs_temperature_threshold_slowdown, 90)
  ];
}

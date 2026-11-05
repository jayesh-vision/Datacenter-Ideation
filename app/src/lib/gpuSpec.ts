/* GPU catalogue (user, 08-Oct-2026: "different NVIDIA GPUs — H100, H200, T4, A100 — and other vendors like Intel").
   One entry per accelerator model the mock fleet installs: the datasheet figures the telemetry is scaled to
   (memory, TDP, clocks), the scale-up link, the server it ships in, the software stack and the telemetry source.
   A pod (cluster) is one model; which model each site runs is set in mock/gpu.ts (SITE_PLAN). */
import type { GpuModel, GpuVendor } from '../api/types';

export interface GpuSpec {
  model: GpuModel; vendor: GpuVendor;
  short: string;                    // 'H100', 'Gaudi 3'
  arch: string;                     // Hopper · Ampere · Gaudi 3 …
  memGb: number; memType: string; tdpW: number; form: string;
  link: string;                     // scale-up link, '' = PCIe only
  linkShort: string;                // column header: NVLink · Xe Link · RoCE
  clock: [number, number];          // busy SM / core clock range, MHz
  idleW: [number, number];
  memClockMhz: number; memIdleMhz: number;
  fabric: string;                   // scale-out network of a pod
  use: 'training' | 'inference';    // inference parts host inference jobs only
  rateX: number;                    // price per GPU-hour relative to an H100 (H100 = H200 = 1)
  telemetry: string;                // where the per-GPU counters come from
  driver: string; driverOld?: string; firmware: string; os: string;
  servers: Record<string, string>;  // by host vendor (the generator's NVIDIA / SUPERMICRO / DELL pick)
  launched: number;
  counters?: 'habana';              // reported by the habanalabs exporter: no SM / tensor / fan / P-state counters, fixed SoC clock, NIC ports per card
}

const NV_DRIVER = '550.127.05', NV_DRIVER_OLD = '535.183.01';
export const GPU_SPECS: GpuSpec[] = [
  { model: 'B200 SXM 192 GB', vendor: 'NVIDIA', short: 'B200', arch: 'Blackwell', memGb: 192, memType: 'HBM3e', tdpW: 1000, form: 'SXM6', link: 'NVLink 5 · 1.8 TB/s', linkShort: 'NVLink', clock: [1785, 1965], idleW: [90, 110], memClockMhz: 3996, memIdleMhz: 1593,
    fabric: 'InfiniBand XDR 800G · 8 rails', use: 'training', rateX: 1.45, telemetry: 'NVIDIA DCGM', driver: '570.86.15', firmware: 'VBIOS 97.00.4B.00.01', os: 'DGX OS 7', servers: { NVIDIA: 'DGX B200', SUPERMICRO: 'SYS-A21GE-NBRT (8×B200)', DELL: 'PowerEdge XE9680L (8×B200)' }, launched: 2025 },
  { model: 'H200 SXM 141 GB', vendor: 'NVIDIA', short: 'H200', arch: 'Hopper', memGb: 141, memType: 'HBM3e', tdpW: 700, form: 'SXM5', link: 'NVLink 4 · 900 GB/s', linkShort: 'NVLink', clock: [1755, 1980], idleW: [68, 82], memClockMhz: 2619, memIdleMhz: 1593,
    fabric: 'InfiniBand NDR 400G · 8 rails', use: 'training', rateX: 1, telemetry: 'NVIDIA DCGM', driver: NV_DRIVER, driverOld: NV_DRIVER_OLD, firmware: 'VBIOS 96.00.A5.00.01', os: 'DGX OS 6', servers: { NVIDIA: 'DGX H200', SUPERMICRO: 'SYS-821GE-TNHR (8×H200)', DELL: 'PowerEdge XE9680 (8×H200)' }, launched: 2024 },
  { model: 'H100 SXM 80 GB', vendor: 'NVIDIA', short: 'H100', arch: 'Hopper', memGb: 80, memType: 'HBM3', tdpW: 700, form: 'SXM5', link: 'NVLink 4 · 900 GB/s', linkShort: 'NVLink', clock: [1755, 1980], idleW: [68, 82], memClockMhz: 2619, memIdleMhz: 1593,
    fabric: 'InfiniBand NDR 400G · 8 rails', use: 'training', rateX: 1, telemetry: 'NVIDIA DCGM', driver: NV_DRIVER, driverOld: NV_DRIVER_OLD, firmware: 'VBIOS 96.00.89.00.01', os: 'DGX OS 6', servers: { NVIDIA: 'DGX H100', SUPERMICRO: 'SYS-821GE-TNHR (8×H100)', DELL: 'PowerEdge XE9680 (8×H100)' }, launched: 2023 },
  { model: 'A100 SXM 80 GB', vendor: 'NVIDIA', short: 'A100', arch: 'Ampere', memGb: 80, memType: 'HBM2e', tdpW: 400, form: 'SXM4', link: 'NVLink 3 · 600 GB/s', linkShort: 'NVLink', clock: [1275, 1410], idleW: [52, 64], memClockMhz: 1593, memIdleMhz: 1593,
    fabric: 'InfiniBand HDR 200G · 8 rails', use: 'training', rateX: 0.55, telemetry: 'NVIDIA DCGM', driver: NV_DRIVER, driverOld: NV_DRIVER_OLD, firmware: 'VBIOS 92.00.36.00.01', os: 'DGX OS 6', servers: { NVIDIA: 'DGX A100', SUPERMICRO: 'AS-4124GO-NART (8×A100)', DELL: 'PowerEdge XE8545 (8×A100)' }, launched: 2020 },
  { model: 'L40S PCIe 48 GB', vendor: 'NVIDIA', short: 'L40S', arch: 'Ada Lovelace', memGb: 48, memType: 'GDDR6', tdpW: 350, form: 'PCIe Gen4', link: '', linkShort: 'NVLink', clock: [2250, 2520], idleW: [32, 40], memClockMhz: 9001, memIdleMhz: 405,
    fabric: 'Ethernet 100G RoCE · 2 ports per node', use: 'inference', rateX: 0.38, telemetry: 'NVIDIA DCGM', driver: NV_DRIVER, driverOld: NV_DRIVER_OLD, firmware: 'VBIOS 95.02.66.00.02', os: 'Ubuntu 22.04', servers: { NVIDIA: 'OVX L40S (8×L40S)', SUPERMICRO: 'SYS-421GE-TNRT (8×L40S)', DELL: 'PowerEdge XE8640 (8×L40S)' }, launched: 2023 },
  { model: 'T4 PCIe 16 GB', vendor: 'NVIDIA', short: 'T4', arch: 'Turing', memGb: 16, memType: 'GDDR6', tdpW: 70, form: 'PCIe Gen3 · low profile', link: '', linkShort: 'NVLink', clock: [1350, 1590], idleW: [9, 14], memClockMhz: 5001, memIdleMhz: 405,
    fabric: 'Ethernet 25G · 2 ports per node', use: 'inference', rateX: 0.08, telemetry: 'NVIDIA DCGM', driver: NV_DRIVER, driverOld: NV_DRIVER_OLD, firmware: 'VBIOS 90.04.96.00.A0', os: 'Ubuntu 22.04', servers: { NVIDIA: 'EGX T4 (8×T4)', SUPERMICRO: 'SYS-4029GP-TRT2 (8×T4)', DELL: 'PowerEdge R750xa (8×T4)' }, launched: 2018 },
  { model: 'Gaudi 3 OAM 128 GB', vendor: 'Intel', short: 'Gaudi 3', arch: 'Gaudi 3 (HL-325L)', memGb: 128, memType: 'HBM2e', tdpW: 900, form: 'OAM', link: 'On-chip RoCE · 24 × 200 GbE', linkShort: 'RoCE', clock: [1500, 1600], idleW: [95, 120], memClockMhz: 3700, memIdleMhz: 1600,
    fabric: 'Ethernet RoCE 200G · scale-out on the accelerator', use: 'training', rateX: 0.6, telemetry: 'Intel Gaudi (hl-smi · habanalabs exporter)', driver: 'habanalabs 1.18.0', firmware: 'Gaudi FW 1.18.0-fw-53.1.1', os: 'Ubuntu 22.04', servers: { NVIDIA: 'Gaudi 3 HLB-325L baseboard (8×Gaudi 3)', SUPERMICRO: 'SYS-822GA-NGR3 (8×Gaudi 3)', DELL: 'PowerEdge XE9680 (8×Gaudi 3)' }, launched: 2024 },
  /* Gaudi 2 (05-Nov-2026, user: real habanalabs exporter output of an HL-225 card): 96 GB HBM2e (memory_total 103,079,215,104 B), default power
     limit 550 W, SoC clock fixed at 1650 MHz (clock_soc = clock_soc_max), ~139 W idle, slowdown / shutdown at 90 °C, PCIe Gen4 x16, 24 × 100 GbE
     on the card (21 internal = 3 to each of the other 7 cards, 3 external for scale-out), driver 1.24.2, firmware 1.24.0-fw-62.6.2 */
  { model: 'Gaudi 2 OAM 96 GB', vendor: 'Intel', short: 'Gaudi 2', arch: 'Gaudi 2 (HL-225)', memGb: 96, memType: 'HBM2e', tdpW: 550, form: 'OAM', link: 'On-chip RoCE · 21 × 100 GbE in the node', linkShort: 'RoCE', clock: [1650, 1650], idleW: [128, 148], memClockMhz: 3270, memIdleMhz: 3270,
    fabric: 'Ethernet RoCE 100G · 3 ports per card on the accelerator', use: 'training', rateX: 0.42, telemetry: 'Intel Gaudi (hl-smi · habanalabs exporter)', driver: 'habanalabs 1.24.2-52a555d', firmware: 'hl-gaudi2-1.24.0-fw-62.6.2-sec-11', os: 'Ubuntu 24.04', servers: { WIWYNN: 'HLS-2H (8×Gaudi 2)' }, launched: 2022, counters: 'habana' },
  { model: 'Max 1550 OAM 128 GB', vendor: 'Intel', short: 'Max 1550', arch: 'Xe HPC (Ponte Vecchio)', memGb: 128, memType: 'HBM2e', tdpW: 600, form: 'OAM', link: 'Xe Link · 16 links', linkShort: 'Xe Link', clock: [1450, 1600], idleW: [70, 90], memClockMhz: 3200, memIdleMhz: 1600,
    fabric: 'InfiniBand HDR 200G · 8 rails', use: 'training', rateX: 0.45, telemetry: 'Intel XPU Manager', driver: 'i915 · Level Zero 1.3.29735', firmware: 'GFX FW 2024.18', os: 'RHEL 9.4', servers: { NVIDIA: 'Data Center GPU Max x8 (8×Max 1550)', SUPERMICRO: 'SYS-821GV-TNR (8×Max 1550)', DELL: 'PowerEdge XE9640 (8×Max 1550)' }, launched: 2023 }
];
const BY_MODEL = new Map(GPU_SPECS.map(s => [s.model, s]));
export const gpuSpec = (m: GpuModel): GpuSpec => BY_MODEL.get(m) ?? GPU_SPECS[2];
/* 'NVIDIA H100 SXM 80 GB' */
export const gpuName = (m: GpuModel) => `${gpuSpec(m).vendor} ${m}`;
export const GPU_VENDORS: GpuVendor[] = ['NVIDIA', 'Intel'];
/* node power is known for this model (05-Nov-2026, user): Gaudi 2 has no node power source yet, so it stays out of every power and occupancy total */
export const powerKnown = (m: GpuModel) => gpuSpec(m).counters !== 'habana';

/* What one node of each model is sold as (30-Oct-2026): the host behind the 8 accelerators (instance type), and the figures a node
   must reach before it is sold — HBM bandwidth and the in-node all-reduce bus bandwidth as the acceptance benchmark measures them. */
export const GPU_HOST: Record<GpuModel, { vcpu: number; ramGb: number; nvmeTb: number; netGbps: number }> = {
  'B200 SXM 192 GB': { vcpu: 224, ramGb: 4096, nvmeTb: 30, netGbps: 3200 }, 'H200 SXM 141 GB': { vcpu: 224, ramGb: 2048, nvmeTb: 30, netGbps: 3200 },
  'H100 SXM 80 GB': { vcpu: 224, ramGb: 2048, nvmeTb: 30, netGbps: 3200 }, 'A100 SXM 80 GB': { vcpu: 256, ramGb: 2048, nvmeTb: 30, netGbps: 1600 },
  'L40S PCIe 48 GB': { vcpu: 192, ramGb: 1024, nvmeTb: 15, netGbps: 200 }, 'T4 PCIe 16 GB': { vcpu: 80, ramGb: 384, nvmeTb: 7.6, netGbps: 50 },
  'Gaudi 3 OAM 128 GB': { vcpu: 192, ramGb: 2048, nvmeTb: 30, netGbps: 4800 }, 'Gaudi 2 OAM 96 GB': { vcpu: 160, ramGb: 1024, nvmeTb: 30, netGbps: 2400 }, 'Max 1550 OAM 128 GB': { vcpu: 224, ramGb: 2048, nvmeTb: 30, netGbps: 1600 }
};
export const GPU_BENCH: Record<GpuModel, { hbmTbs: number; busGbs: number }> = {
  'B200 SXM 192 GB': { hbmTbs: 8.0, busGbs: 1400 }, 'H200 SXM 141 GB': { hbmTbs: 4.8, busGbs: 740 }, 'H100 SXM 80 GB': { hbmTbs: 3.35, busGbs: 740 }, 'A100 SXM 80 GB': { hbmTbs: 2.0, busGbs: 480 },
  'L40S PCIe 48 GB': { hbmTbs: 0.86, busGbs: 48 }, 'T4 PCIe 16 GB': { hbmTbs: 0.32, busGbs: 24 }, 'Gaudi 3 OAM 128 GB': { hbmTbs: 3.7, busGbs: 1200 }, 'Gaudi 2 OAM 96 GB': { hbmTbs: 2.45, busGbs: 260 }, 'Max 1550 OAM 128 GB': { hbmTbs: 3.3, busGbs: 420 }
};
export const instanceType = (m: GpuModel) => { const h = GPU_HOST[m]; return `8× ${gpuSpec(m).short} · ${h.vcpu} vCPU · ${h.ramGb >= 1000 ? `${h.ramGb / 1024} TB` : `${h.ramGb} GB`} RAM · ${h.nvmeTb} TB NVMe`; };

/* the habanalabs exporter's per-card metrics (Gaudi 2, from a real scrape, 05-Nov-2026), shown beside the DCGM fields on GPU Fleet → Telemetry */
export const HABANA_FIELDS: { field: string; what: string }[] = [
  { field: 'habanalabs_utilization', what: 'Accelerator (AIP) utilisation %' }, { field: 'habanalabs_memory_used_bytes / total_bytes', what: 'HBM used / total' },
  { field: 'habanalabs_temperature_onchip / onboard', what: 'Chip and board temperature °C' }, { field: 'habanalabs_temperature_threshold_slowdown / shutdown', what: 'Slowdown and shutdown limits °C' },
  { field: 'habanalabs_power_mW · power_default_limit_mW', what: 'Board power and its limit' }, { field: 'habanalabs_energy', what: 'Energy since boot (shown per 24 h)' },
  { field: 'habanalabs_clock_soc_mhz / soc_max_mhz', what: 'SoC clock MHz (fixed on Gaudi 2)' }, { field: 'habanalabs_ecc_feature_mode · pending_rows_*', what: 'ECC on; rows waiting for a remap (single / double bit)' },
  { field: 'habanalabs_pcie_rx / tx · pcie_replay_count', what: 'PCIe traffic and link retries' }, { field: 'habanalabs_pci_link_speed / width', what: 'PCIe generation and lanes (Gen4 x16)' },
  { field: 'habanalabs_nic_port_status{port_type}', what: 'Each of the 24 on-chip 100 GbE ports up / down: internal (scale-up) and external (scale-out)' }
];

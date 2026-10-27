/* Security Ops read model (26-Oct-2026, user: "Security Ops module as a new menu in Datacenter … use the industry standards datacenter
   Security Ops uses"). Derived per data version from the estate, never changes generated collections (every fingerprint holds):
   - assets = the devices (network gear, hosts, GPU nodes, operator servers), a BMC per host, the facility plant's controllers (OT) and the doors;
   - sensors / data sources = what a datacenter SOC collects (device AAA + syslog + config backups, Redfish, osquery, Falco, Trivy, Suricata,
     Zeek, a passive OT sensor, PACS, VMS) through OTel into OCSF tables in ClickHouse; devices not discovered send nothing (coverage gaps);
   - detections = Sigma rules tagged with MITRE ATT&CK Enterprise / ICS. Physical detections ARE the access log's security exceptions
     (mock/access.ts), unauthorised-change detections ARE the config drifts with no change request, so both reconcile with their screens;
   - cases follow NIST SP 800-61 (detection & analysis → containment → eradication → recovery → post-incident), five seeded stories per persona;
   - vulnerabilities: illustrative advisories (a live NVD / CISA KEV / FIRST EPSS / vendor PSIRT feed replaces them) matched to firmware, OS and
     packages, prioritised CVSS v4 + EPSS + KEV → CISA SSVC (Act / Attend / Track* / Track);
   - hardening = CIS Benchmark / DISA STIG / vendor guide checks; drift = running config vs the last approved one, authorised by a change or not;
   - OT = IEC 62443 zones and conduits with target vs achieved security level; physical = defence-in-depth layers (EN 50600-2-5 protection classes);
   - posture rolls up to the six NIST CSF 2.0 functions. */
import type {
  Datacenter, NetworkElement, SecAdvisory, SecBaseline, SecCase, SecCaseStep, SecContext, SecCsf, SecDetection, SecDisposition, SecDomain, SecDrift,
  SecHardening, SecOpsView, SecOtAsset, SecOtZone, SecPhase, SecPhysLayer, SecPhysSite, SecPlaybook, SecRule, SecSensor, SecSev, SecSite, SecSource, SecSsvc, SecTechnique,
  SecVuln, SecZone, SecException, AccessVisit
} from '../api/types';
import type { Db } from './generate';
import { activeGeo, dcAt } from './geo';
import { edgeId } from './personas';
import { siteSafety } from './safety';
import { accessOf } from './access';
import { sitePhys } from './physical';
import { modelDates } from './lifecycle';
import { changeRegister } from './changemgmt';
import { mulberry32, seedOf, intBetween, chance, pick, type Rnd } from '../lib/rng';
import { DAY, HOUR, MIN } from './seed';

/* ------------------------------------------------------------------ the user's moves (reset on regenerate) */
const ov = {
  det: new Map<string, { state?: SecDetection['state']; disposition?: SecDisposition; assignee?: string; caseId?: string }>(),
  cases: new Map<string, { phase?: SecPhase; done: Set<number>; notes: { at: number; by: string; text: string }[]; closed?: number; outcome?: string }>(),
  newCases: [] as SecCase[],
  vuln: new Map<string, { state: SecVuln['state']; note?: string; changeId?: string }>(),
  rules: new Map<string, boolean>(),
  /* rule edits and rules written by hand (27-Oct-2026, user: "add a new rule or edit an existing one") */
  ruleEdits: new Map<string, RuleEdit>(), newRules: [] as RuleDef[],
  seq: 0
};
let cache: SecOpsView | null = null, cacheDb: Db | null = null;
export const clearSecOps = () => { cache = null; };
export const resetSecOps = () => { ov.det.clear(); ov.cases.clear(); ov.newCases.length = 0; ov.vuln.clear(); ov.rules.clear(); ov.ruleEdits.clear(); ov.newRules.length = 0; ov.seq = 0; cache = null; };
export function secopsView(db: Db): SecOpsView {
  if (cache && cacheDb === db) return cache;
  cacheDb = db; cache = build(db); return cache;
}

/* ------------------------------------------------------------------ catalogues */
export const SENSORS: SecSensor[] = [
  { id: 'tacacs', name: 'TACACS+ accounting', kind: 'Device AAA', collector: 'OTel syslog receiver' },
  { id: 'netsyslog', name: 'Network device syslog', kind: 'Syslog (RFC 5424)', collector: 'OTel syslog receiver' },
  { id: 'configs', name: 'Config backup & drift (Oxidized)', kind: 'Running-config archive', collector: 'OTel filelog receiver' },
  { id: 'redfish', name: 'BMC Redfish events', kind: 'Redfish event subscription', collector: 'OTel webhook receiver' },
  { id: 'osquery', name: 'osquery (Fleet)', kind: 'Host agent', collector: 'OTel filelog receiver' },
  { id: 'falco', name: 'Falco', kind: 'Kubernetes runtime (eBPF)', collector: 'OTel OTLP receiver' },
  { id: 'k8saudit', name: 'Kubernetes audit log', kind: 'API server audit', collector: 'OTel k8s receiver' },
  { id: 'trivy', name: 'Trivy', kind: 'Image & host scanner', collector: 'OTel OTLP receiver' },
  { id: 'suricata', name: 'Suricata IDS', kind: 'Network IDS (mirror ports)', collector: 'OTel filelog receiver' },
  { id: 'zeek', name: 'Zeek', kind: 'Network metadata (mirror ports)', collector: 'OTel filelog receiver' },
  { id: 'netflow', name: 'NetFlow / IPFIX', kind: 'Flow records', collector: 'OTel netflow receiver' },
  { id: 'ot', name: 'Passive OT sensor', kind: 'Modbus / BACnet / SNMP deep packet inspection', collector: 'OTel OTLP receiver' },
  { id: 'pacs', name: 'Access control (PACS)', kind: 'Badge readers, mantraps, cage doors', collector: 'OTel webhook receiver' },
  { id: 'vms', name: 'Video management (VMS)', kind: 'CCTV analytics + clips', collector: 'OTel webhook receiver' },
  { id: 'itsm', name: 'Change & ticket context', kind: 'Change register, on-call, tickets', collector: 'ClickHouse dictionary' },
  { id: 'dcim', name: 'Asset context (DCIM / IPAM)', kind: 'Site, room, rack, owner, tenant', collector: 'ClickHouse dictionary' }
];
/* the techniques relevant to a datacenter (modelled coverage scope); ones without a rule are the coverage gaps */
const TECH: [string, string, string, 'Enterprise' | 'ICS'][] = [
  ['T1190', 'Exploit Public-Facing Application', 'Initial Access', 'Enterprise'], ['T1133', 'External Remote Services', 'Initial Access', 'Enterprise'],
  ['T1200', 'Hardware Additions', 'Initial Access', 'Enterprise'], ['T1078', 'Valid Accounts', 'Initial Access', 'Enterprise'],
  ['T1059.004', 'Command and Scripting Interpreter: Unix Shell', 'Execution', 'Enterprise'], ['T1609', 'Container Administration Command', 'Execution', 'Enterprise'], ['T1610', 'Deploy Container', 'Execution', 'Enterprise'],
  ['T1136.001', 'Create Account: Local Account', 'Persistence', 'Enterprise'], ['T1098', 'Account Manipulation', 'Persistence', 'Enterprise'], ['T1542', 'Pre-OS Boot', 'Persistence', 'Enterprise'],
  ['T1611', 'Escape to Host', 'Privilege Escalation', 'Enterprise'], ['T1548.003', 'Abuse Elevation Control: Sudo and Sudo Caching', 'Privilege Escalation', 'Enterprise'],
  ['T1562.004', 'Impair Defenses: Disable or Modify System Firewall', 'Defense Evasion', 'Enterprise'], ['T1070.002', 'Indicator Removal: Clear Linux or Mac System Logs', 'Defense Evasion', 'Enterprise'],
  ['T1601.002', 'Modify System Image: Downgrade System Image', 'Defense Evasion', 'Enterprise'], ['T1599', 'Network Boundary Bridging', 'Defense Evasion', 'Enterprise'],
  ['T1110.001', 'Brute Force: Password Guessing', 'Credential Access', 'Enterprise'], ['T1110.003', 'Brute Force: Password Spraying', 'Credential Access', 'Enterprise'],
  ['T1552.001', 'Unsecured Credentials: Credentials In Files', 'Credential Access', 'Enterprise'], ['T1040', 'Network Sniffing', 'Credential Access', 'Enterprise'],
  ['T1046', 'Network Service Discovery', 'Discovery', 'Enterprise'], ['T1018', 'Remote System Discovery', 'Discovery', 'Enterprise'], ['T1613', 'Container and Resource Discovery', 'Discovery', 'Enterprise'],
  ['T1021.004', 'Remote Services: SSH', 'Lateral Movement', 'Enterprise'], ['T1210', 'Exploitation of Remote Services', 'Lateral Movement', 'Enterprise'],
  ['T1602.001', 'Data from Configuration Repository: SNMP (MIB Dump)', 'Collection', 'Enterprise'], ['T1602.002', 'Data from Configuration Repository: Network Device Configuration Dump', 'Collection', 'Enterprise'],
  ['T1071.001', 'Application Layer Protocol: Web Protocols', 'Command and Control', 'Enterprise'], ['T1572', 'Protocol Tunneling', 'Command and Control', 'Enterprise'],
  ['T1048', 'Exfiltration Over Alternative Protocol', 'Exfiltration', 'Enterprise'],
  ['T1496', 'Resource Hijacking', 'Impact', 'Enterprise'], ['T1485', 'Data Destruction', 'Impact', 'Enterprise'], ['T1489', 'Service Stop', 'Impact', 'Enterprise'], ['T1529', 'System Shutdown/Reboot', 'Impact', 'Enterprise'],
  ['T0866', 'Exploitation of Remote Services', 'Initial Access', 'ICS'], ['T0883', 'Internet Accessible Device', 'Initial Access', 'ICS'], ['T0886', 'Remote Services', 'Initial Access', 'ICS'],
  ['T0807', 'Command-Line Interface', 'Execution', 'ICS'], ['T0858', 'Change Operating Mode', 'Execution', 'ICS'],
  ['T0839', 'Module Firmware', 'Persistence', 'ICS'], ['T0859', 'Valid Accounts', 'Persistence', 'ICS'],
  ['T0846', 'Remote System Discovery', 'Discovery', 'ICS'], ['T0888', 'Remote System Information Discovery', 'Discovery', 'ICS'], ['T0842', 'Network Sniffing', 'Discovery', 'ICS'],
  ['T0812', 'Default Credentials', 'Lateral Movement', 'ICS'], ['T0867', 'Lateral Tool Transfer', 'Lateral Movement', 'ICS'],
  ['T0801', 'Monitor Process State', 'Collection', 'ICS'], ['T0861', 'Point & Tag Identification', 'Collection', 'ICS'],
  ['T0814', 'Denial of Service', 'Inhibit Response Function', 'ICS'], ['T0816', 'Device Restart/Shutdown', 'Inhibit Response Function', 'ICS'], ['T0838', 'Modify Alarm Settings', 'Inhibit Response Function', 'ICS'],
  ['T0836', 'Modify Parameter', 'Impair Process Control', 'ICS'], ['T0855', 'Unauthorized Command Message', 'Impair Process Control', 'ICS'],
  ['T0831', 'Manipulation of Control', 'Impact', 'ICS'], ['T0826', 'Loss of Availability', 'Impact', 'ICS'], ['T0827', 'Loss of Control', 'Impact', 'ICS']
];

/* rule = a Sigma rule compiled to ClickHouse SQL. `kinds` = the asset kinds it runs on; `rate` = background detections per matching site per week */
interface RuleDef { id: string; title: string; description: string; domain: SecDomain; sensors: string[]; techniques: string[]; control?: string; level: SecSev; status: SecRule['status'];
  context?: boolean; kinds: string[]; rate: number; ocsf: string; product: string; service: string; sel: string[]; cond: string; sql: string; playbookId?: string; burst?: [number, number];
  /* hand-written Sigma source (edited or new rules), version, who changed it last */
  sigma?: string; version?: number; custom?: boolean; updated?: number; by?: string }
export interface RuleEdit { title: string; description: string; domain: SecDomain; level: SecSev; status: SecRule['status']; sensors: string[]; techniques: string[]; control?: string; context: boolean; playbookId?: string; sigma: string; sql: string }
const R = (x: RuleDef) => x;
const NET_KINDS = ['Router', 'Switch', 'Firewall', 'DWDM', 'Access'];
const RULES: RuleDef[] = [
  R({ id: 'SR-001', title: 'Network device login outside a change window', description: 'A privileged TACACS+ session on a router, switch or firewall when no approved change covers the device.', domain: 'Network', sensors: ['tacacs', 'itsm'], techniques: ['T1078'], level: 'Medium', status: 'Stable', context: true, kinds: NET_KINDS, rate: 0.5, ocsf: 'Authentication [3002]',
    product: 'network', service: 'tacacs', sel: ['action: login', 'priv_lvl: 15'], cond: 'selection and not change_window', playbookId: 'PB-02',
    sql: "SELECT device, user, src_ip, time FROM sec.ocsf_authentication a\nLEFT ANY JOIN dict_change_windows w ON w.asset = a.device AND a.time BETWEEN w.start AND w.end\nWHERE a.product = 'tacacs' AND a.priv_lvl = 15 AND w.change_id = ''" }),
  R({ id: 'SR-002', title: 'Configuration committed with no approved change request', description: 'The running configuration differs from the last approved backup and no change request covers the device in that window.', domain: 'Network', sensors: ['configs', 'itsm'], techniques: ['T1562.004'], level: 'High', status: 'Stable', context: true, kinds: NET_KINDS, rate: 0, ocsf: 'Device Config State [5002]',
    product: 'network', service: 'config_backup', sel: ['event: config_changed'], cond: 'selection and not change_window', playbookId: 'PB-02',
    sql: "SELECT device, diff_lines, committed_by, time FROM sec.ocsf_device_config_state c\nLEFT ANY JOIN dict_change_windows w ON w.asset = c.device AND c.time BETWEEN w.start AND w.end\nWHERE c.diff_lines > 0 AND w.change_id = ''" }),
  R({ id: 'SR-003', title: 'Brute force on device management', description: '20 or more failed TACACS+ logins to one device from one source in 10 minutes.', domain: 'Network', sensors: ['tacacs'], techniques: ['T1110.001'], level: 'High', status: 'Stable', kinds: NET_KINDS, rate: 0.25, ocsf: 'Authentication [3002]', burst: [20, 140],
    product: 'network', service: 'tacacs', sel: ['action: login', 'status: failure'], cond: 'selection | count() by src_ip, device > 20 (10m)',
    sql: "SELECT src_ip, device, count() AS fails FROM sec.ocsf_authentication\nWHERE product = 'tacacs' AND status = 'Failure' AND time > now() - INTERVAL 10 MINUTE\nGROUP BY src_ip, device HAVING fails > 20" }),
  R({ id: 'SR-004', title: 'SNMP v1/v2c query with a default community', description: 'An SNMP request using "public" or "private" reached a managed device.', domain: 'Network', sensors: ['suricata'], techniques: ['T1602.001'], level: 'Medium', status: 'Stable', kinds: NET_KINDS, rate: 0.3, ocsf: 'Network Activity [4001]',
    product: 'suricata', service: 'snmp', sel: ['app_proto: snmp', "community|contains: ['public', 'private']"], cond: 'selection',
    sql: "SELECT src_ip, dst_ip, community FROM sec.ocsf_network_activity\nWHERE app_proto = 'snmp' AND snmp_version < 3 AND community IN ('public', 'private')" }),
  R({ id: 'SR-005', title: 'Device configuration copied to an unknown host', description: 'A TFTP / SCP transfer of a running configuration to a host outside the backup servers.', domain: 'Network', sensors: ['zeek', 'dcim'], techniques: ['T1602.002'], level: 'High', status: 'Test', context: true, kinds: NET_KINDS, rate: 0.06, ocsf: 'Network Activity [4001]',
    product: 'zeek', service: 'files', sel: ["proto|in: ['tftp', 'scp']", 'filename|contains: running-config'], cond: 'selection and not dst_ip in backup_hosts',
    sql: "SELECT src_ip, dst_ip, filename FROM sec.ocsf_network_activity\nWHERE proto IN ('tftp', 'scp') AND positionCaseInsensitive(filename, 'config') > 0\n  AND dictGetOrDefault('dict_assets', 'role', dst_ip, '') != 'Backup'" }),
  R({ id: 'SR-006', title: 'Image downgrade or unsigned image booted', description: 'A network OS image older than the approved baseline, or one failing signature verification, was loaded.', domain: 'Network', sensors: ['netsyslog'], techniques: ['T1601.002'], level: 'Critical', status: 'Stable', kinds: NET_KINDS, rate: 0.02, ocsf: 'Device Config State [5002]',
    product: 'network', service: 'syslog', sel: ["msg|contains: ['image verification failed', 'downgrade']"], cond: 'selection',
    sql: "SELECT device, msg FROM sec.ocsf_device_config_state\nWHERE image_signed = 0 OR version_rank(image) < version_rank(dictGet('dict_baselines', 'image', device))" }),
  R({ id: 'SR-008', title: 'Port scan across the management network', description: 'One source touched 50 or more management addresses or ports in 5 minutes and is not a monitoring host.', domain: 'Management', sensors: ['zeek', 'dcim'], techniques: ['T1046'], level: 'Medium', status: 'Stable', context: true, kinds: ['Router', 'Switch', 'Server'], rate: 0.25, ocsf: 'Network Activity [4001]', burst: [50, 900],
    product: 'zeek', service: 'conn', sel: ['zone: management'], cond: 'selection | count(dst_ip) by src_ip > 50 (5m)',
    sql: "SELECT src_ip, uniqExact(dst_ip, dst_port) AS targets FROM sec.ocsf_network_activity\nWHERE zone = 'Management' AND time > now() - INTERVAL 5 MINUTE\n  AND dictGetOrDefault('dict_assets', 'role', src_ip, '') NOT IN ('NMS', 'Monitoring')\nGROUP BY src_ip HAVING targets > 50" }),
  R({ id: 'SR-010', title: 'BMC login failures burst', description: '10 or more failed Redfish / IPMI logins on a server management controller in 10 minutes.', domain: 'Management', sensors: ['redfish'], techniques: ['T1110.001'], level: 'High', status: 'Stable', kinds: ['BMC'], rate: 0.15, ocsf: 'Authentication [3002]', burst: [10, 360],
    product: 'redfish', service: 'event', sel: ['MessageId|startswith: Security.1.0.LoginFailure'], cond: 'selection | count() by bmc > 10 (10m)', playbookId: 'PB-03',
    sql: "SELECT bmc, src_ip, count() AS fails FROM sec.ocsf_authentication\nWHERE product = 'redfish' AND status = 'Failure' AND time > now() - INTERVAL 10 MINUTE\nGROUP BY bmc, src_ip HAVING fails >= 10" }),
  R({ id: 'SR-011', title: 'Unknown device on an out-of-band switch port', description: 'A MAC address not in DCIM appeared on an OOB / management switch port.', domain: 'Management', sensors: ['netsyslog', 'dcim'], techniques: ['T1200'], level: 'High', status: 'Stable', context: true, kinds: ['Switch', 'Access'], rate: 0.04, ocsf: 'Network Activity [4001]',
    product: 'network', service: 'port_security', sel: ['event: mac_learned', 'vlan: oob'], cond: 'selection and not mac in dcim',
    sql: "SELECT switch, port, mac FROM sec.ocsf_network_activity\nWHERE event = 'mac_learned' AND zone = 'Out-of-band'\n  AND NOT dictHas('dict_assets_by_mac', mac)", playbookId: 'PB-03' }),
  R({ id: 'SR-012', title: 'BMC firmware changed outside a campaign', description: 'A BMC firmware update with no firmware campaign or change request covering the host.', domain: 'Management', sensors: ['redfish', 'itsm'], techniques: ['T1542'], level: 'High', status: 'Test', context: true, kinds: ['BMC'], rate: 0.02, ocsf: 'Device Config State [5002]',
    product: 'redfish', service: 'event', sel: ['MessageId|startswith: Update.1.0.UpdateSuccessful'], cond: 'selection and not change_window',
    sql: "SELECT bmc, version, time FROM sec.ocsf_device_config_state c\nLEFT ANY JOIN dict_change_windows w ON w.asset = c.host AND c.time BETWEEN w.start AND w.end\nWHERE c.component = 'BMC' AND w.change_id = ''" }),
  R({ id: 'SR-020', title: 'SSH password spraying', description: 'One source failed SSH logins on five or more hosts with different accounts in 15 minutes.', domain: 'Compute', sensors: ['osquery'], techniques: ['T1110.003'], level: 'Medium', status: 'Stable', kinds: ['Server'], rate: 0.3, ocsf: 'Authentication [3002]', burst: [25, 300],
    product: 'linux', service: 'auth', sel: ['process: sshd', 'outcome: failure'], cond: 'selection | count(user) by src_ip > 5 (15m)',
    sql: "SELECT src_ip, uniqExact(user) AS users, uniqExact(host) AS hosts FROM sec.ocsf_authentication\nWHERE product = 'osquery' AND service = 'sshd' AND status = 'Failure' AND time > now() - INTERVAL 15 MINUTE\nGROUP BY src_ip HAVING users >= 5 AND hosts >= 5" }),
  R({ id: 'SR-021', title: 'New local administrator account', description: 'A local account was created and added to sudo / wheel outside the directory.', domain: 'Compute', sensors: ['osquery'], techniques: ['T1136.001'], level: 'Medium', status: 'Stable', kinds: ['Server', 'GPU', 'Storage'], rate: 0.06, ocsf: 'Account Change [3001]',
    product: 'linux', service: 'osquery', sel: ['table: users', 'action: added', "groups|contains: ['sudo', 'wheel']"], cond: 'selection',
    sql: "SELECT host, user, time FROM sec.ocsf_account_change\nWHERE activity = 'Create' AND has(groups, 'sudo') AND directory = ''" }),
  R({ id: 'SR-022', title: 'System logs cleared', description: 'auth.log / journal truncated or deleted on a host.', domain: 'Compute', sensors: ['osquery'], techniques: ['T1070.002'], level: 'High', status: 'Stable', kinds: ['Server', 'GPU', 'Storage'], rate: 0.02, ocsf: 'File System Activity [1001]',
    product: 'linux', service: 'osquery_fim', sel: ["path|startswith: ['/var/log/', '/run/log/journal']", "action|in: ['DELETED', 'TRUNCATED']"], cond: 'selection',
    sql: "SELECT host, path, actor FROM sec.ocsf_file_activity\nWHERE (startsWith(path, '/var/log/') OR startsWith(path, '/run/log/journal')) AND activity IN ('Delete', 'Truncate')" }),
  R({ id: 'SR-023', title: 'Sudo to root by a non-admin account', description: 'sudo to root by an account outside the platform admin groups.', domain: 'Compute', sensors: ['osquery'], techniques: ['T1548.003'], level: 'Low', status: 'Stable', kinds: ['Server', 'GPU', 'Storage'], rate: 0.4, ocsf: 'Process Activity [1007]',
    product: 'linux', service: 'osquery', sel: ['process: sudo', 'target_user: root'], cond: 'selection and not user in admins',
    sql: "SELECT host, user, cmdline FROM sec.ocsf_process_activity\nWHERE process = 'sudo' AND target_user = 'root' AND NOT dictHas('dict_admins', user)" }),
  R({ id: 'SR-030', title: 'Terminal shell in a container', description: 'An interactive shell started inside a running container (Falco rule "Terminal shell in container").', domain: 'Kubernetes', sensors: ['falco'], techniques: ['T1059.004'], level: 'Medium', status: 'Stable', kinds: ['GPU'], rate: 0.12, ocsf: 'Process Activity [1007]',
    product: 'falco', service: 'syscall', sel: ['rule: Terminal shell in container'], cond: 'selection',
    sql: "SELECT node, namespace, pod, cmdline FROM sec.ocsf_process_activity\nWHERE product = 'falco' AND rule = 'Terminal shell in container'" }),
  R({ id: 'SR-031', title: 'Privileged container or host mount on a GPU node', description: 'A pod with privileged: true or a hostPath mount of / or the container runtime socket started on a GPU node.', domain: 'Kubernetes', sensors: ['falco', 'k8saudit'], techniques: ['T1611'], level: 'High', status: 'Stable', kinds: ['GPU'], rate: 0.05, ocsf: 'Process Activity [1007]',
    product: 'kubernetes', service: 'audit', sel: ['verb: create', 'objectRef.resource: pods', 'requestObject.spec.containers.securityContext.privileged: true'], cond: 'selection', playbookId: 'PB-04',
    sql: "SELECT namespace, pod, user, node FROM sec.ocsf_api_activity\nWHERE resource = 'pods' AND verb = 'create' AND (privileged = 1 OR has(host_paths, '/'))" }),
  R({ id: 'SR-032', title: 'Crypto-mining on GPU nodes', description: 'A known miner process or a connection to a mining pool (stratum) from a GPU node.', domain: 'Kubernetes', sensors: ['falco', 'zeek'], techniques: ['T1496'], level: 'Critical', status: 'Stable', kinds: ['GPU'], rate: 0.0, ocsf: 'Network Activity [4001]',
    product: 'falco', service: 'syscall', sel: ["proc.name|in: ['xmrig', 'nbminer', 't-rex', 'lolminer']", "or dst_port|in: [3333, 4444, 5555, 14444]"], cond: 'selection', playbookId: 'PB-04',
    sql: "SELECT node, pod, process, dst_ip FROM sec.ocsf_process_activity\nWHERE process IN ('xmrig', 'nbminer', 't-rex', 'lolminer')\nUNION ALL SELECT src_host, '', '', dst_ip FROM sec.ocsf_network_activity WHERE dst_port IN (3333, 4444, 5555, 14444)" }),
  R({ id: 'SR-033', title: 'kubectl exec into a production pod', description: 'An exec session into a pod in a production namespace.', domain: 'Kubernetes', sensors: ['k8saudit'], techniques: ['T1609'], level: 'Low', status: 'Stable', kinds: ['GPU'], rate: 0.35, ocsf: 'API Activity [6003]',
    product: 'kubernetes', service: 'audit', sel: ['verb: create', 'objectRef.subresource: exec'], cond: 'selection and namespace in production',
    sql: "SELECT user, namespace, pod FROM sec.ocsf_api_activity\nWHERE subresource = 'exec' AND dictGet('dict_namespaces', 'tier', namespace) = 'production'" }),
  R({ id: 'SR-040', title: 'Modbus write to a UPS or cooling controller from a non-BMS host', description: 'A Modbus/TCP write (function 5, 6, 15 or 16) to a facility controller from a host that is not the BMS / EPMS.', domain: 'Facility OT', sensors: ['ot', 'dcim'], techniques: ['T0855'], level: 'Critical', status: 'Stable', context: true, kinds: ['OT'], rate: 0.01, ocsf: 'Network Activity [4001]',
    product: 'ot_sensor', service: 'modbus', sel: ['modbus.function|in: [5, 6, 15, 16]'], cond: 'selection and not src_ip in bms_hosts', playbookId: 'PB-05',
    sql: "SELECT src_ip, dst_ip, modbus_function, register FROM sec.ocsf_network_activity\nWHERE app_proto = 'modbus' AND modbus_function IN (5, 6, 15, 16)\n  AND dictGetOrDefault('dict_assets', 'role', src_ip, '') NOT IN ('BMS', 'EPMS')" }),
  R({ id: 'SR-041', title: 'Setpoint changed outside a maintenance window', description: 'A cooling or power setpoint written while no maintenance change covers the unit.', domain: 'Facility OT', sensors: ['ot', 'itsm'], techniques: ['T0836'], level: 'High', status: 'Stable', context: true, kinds: ['OT'], rate: 0.05, ocsf: 'Device Config State [5002]',
    product: 'ot_sensor', service: 'bacnet', sel: ['bacnet.service: writeProperty', 'object|contains: setpoint'], cond: 'selection and not change_window', playbookId: 'PB-05',
    sql: "SELECT dst_ip, object, old_value, new_value FROM sec.ocsf_device_config_state c\nLEFT ANY JOIN dict_change_windows w ON w.asset = c.unit AND c.time BETWEEN w.start AND w.end\nWHERE c.app_proto IN ('bacnet', 'modbus') AND c.object LIKE '%setpoint%' AND w.change_id = ''" }),
  R({ id: 'SR-042', title: 'Login with default credentials on a UPS card or PDU', description: 'A web / SNMP login to a UPS network card or rack PDU using the vendor default account.', domain: 'Facility OT', sensors: ['ot'], techniques: ['T0812'], level: 'High', status: 'Stable', kinds: ['OT'], rate: 0.03, ocsf: 'Authentication [3002]',
    product: 'ot_sensor', service: 'http', sel: ["user|in: ['apc', 'admin', 'localadmin']", 'outcome: success'], cond: 'selection and dst in facility_controllers', playbookId: 'PB-05',
    sql: "SELECT src_ip, dst_ip, user FROM sec.ocsf_authentication\nWHERE zone = 'Facility OT' AND status = 'Success' AND user IN ('apc', 'admin', 'localadmin')" }),
  R({ id: 'SR-043', title: 'New host speaking Modbus or BACnet', description: 'A host never seen before on the facility network started Modbus/TCP or BACnet/IP sessions.', domain: 'Facility OT', sensors: ['ot'], techniques: ['T0846'], level: 'Medium', status: 'Stable', kinds: ['OT'], rate: 0.06, ocsf: 'Network Activity [4001]',
    product: 'ot_sensor', service: 'conn', sel: ["app_proto|in: ['modbus', 'bacnet']"], cond: 'selection and src_ip first seen < 24h',
    sql: "SELECT src_ip, min(time) AS first_seen FROM sec.ocsf_network_activity\nWHERE app_proto IN ('modbus', 'bacnet') GROUP BY src_ip HAVING first_seen > now() - INTERVAL 1 DAY" }),
  R({ id: 'SR-044', title: 'Alarm thresholds changed on the BMS', description: 'A temperature, humidity or leak alarm limit was raised or disabled on the BMS.', domain: 'Facility OT', sensors: ['ot', 'itsm'], techniques: ['T0838'], level: 'Medium', status: 'Test', context: true, kinds: ['OT'], rate: 0.04, ocsf: 'Device Config State [5002]',
    product: 'ot_sensor', service: 'bacnet', sel: ["object|contains: ['high_limit', 'low_limit', 'event_enable']"], cond: 'selection and not change_window',
    sql: "SELECT unit, object, old_value, new_value FROM sec.ocsf_device_config_state\nWHERE app_proto = 'bacnet' AND match(object, 'limit|event_enable')" }),
  /* physical: each one is raised by the access-control system (mock/access.ts security exceptions) */
  R({ id: 'SR-050', title: 'Tailgating at a mantrap or entry', description: 'Two people passed on one badge read (mantrap weight / CCTV people count).', domain: 'Physical', sensors: ['pacs', 'vms'], techniques: [], control: 'ISO 27001 A.7.2', level: 'High', status: 'Stable', kinds: [], rate: 0, ocsf: 'Authentication [3002]', product: 'pacs', service: 'door', sel: ['event: tailgate'], cond: 'selection', playbookId: 'PB-06', sql: "SELECT door, badge, time FROM sec.ocsf_physical_access WHERE event = 'Tailgate'" }),
  R({ id: 'SR-051', title: 'Door forced open', description: 'A door opened with no valid read or request-to-exit.', domain: 'Physical', sensors: ['pacs'], techniques: [], control: 'ISO 27001 A.7.1', level: 'High', status: 'Stable', kinds: [], rate: 0, ocsf: 'Authentication [3002]', product: 'pacs', service: 'door', sel: ['event: door_forced'], cond: 'selection', playbookId: 'PB-06', sql: "SELECT door, time FROM sec.ocsf_physical_access WHERE event = 'DoorForced'" }),
  R({ id: 'SR-052', title: 'Door held open', description: 'A door stayed open past its hold time.', domain: 'Physical', sensors: ['pacs'], techniques: [], control: 'ISO 27001 A.7.3', level: 'Low', status: 'Stable', kinds: [], rate: 0, ocsf: 'Authentication [3002]', product: 'pacs', service: 'door', sel: ['event: door_held'], cond: 'selection', sql: "SELECT door, held_s FROM sec.ocsf_physical_access WHERE event = 'DoorHeld' AND held_s > 30" }),
  R({ id: 'SR-053', title: 'Repeated badge denials', description: 'Three or more denied reads for one badge in 10 minutes.', domain: 'Physical', sensors: ['pacs'], techniques: [], control: 'ISO 27001 A.7.2', level: 'Medium', status: 'Stable', kinds: [], rate: 0, ocsf: 'Authentication [3002]', product: 'pacs', service: 'reader', sel: ['result: denied'], cond: 'selection | count() by badge >= 3 (10m)', sql: "SELECT badge, count() FROM sec.ocsf_physical_access WHERE result = 'Denied' AND time > now() - INTERVAL 10 MINUTE GROUP BY badge HAVING count() >= 3" }),
  R({ id: 'SR-054', title: 'After-hours entry without a ticket', description: 'An entry outside staffed hours with no open incident, change or work order naming the person.', domain: 'Physical', sensors: ['pacs', 'itsm'], techniques: [], control: 'ISO 27001 A.7.2', level: 'Medium', status: 'Stable', context: true, kinds: [], rate: 0, ocsf: 'Authentication [3002]', product: 'pacs', service: 'reader', sel: ['result: granted'], cond: 'selection and after_hours and not ticket', sql: "SELECT person, door, time FROM sec.ocsf_physical_access a LEFT ANY JOIN dict_tickets t ON t.person = a.person WHERE toHour(a.time) NOT BETWEEN 7 AND 19 AND t.ref = ''" }),
  R({ id: 'SR-055', title: 'Unescorted visitor', description: 'A visitor badge read with no escort badge at the same door within a minute.', domain: 'Physical', sensors: ['pacs'], techniques: [], control: 'ISO 27001 A.7.2', level: 'Medium', status: 'Stable', kinds: [], rate: 0, ocsf: 'Authentication [3002]', product: 'pacs', service: 'reader', sel: ['badge_kind: visitor'], cond: 'selection and not escort within 60s', playbookId: 'PB-06', sql: "SELECT badge, door, time FROM sec.ocsf_physical_access v WHERE badge_kind = 'Visitor' AND NOT exists_escort(v.door, v.time, 60)" }),
  R({ id: 'SR-056', title: 'Anti-passback violation', description: 'A badge used to enter an area it never left.', domain: 'Physical', sensors: ['pacs'], techniques: [], control: 'ISO 27001 A.7.2', level: 'Low', status: 'Stable', kinds: [], rate: 0, ocsf: 'Authentication [3002]', product: 'pacs', service: 'reader', sel: ['event: anti_passback'], cond: 'selection', sql: "SELECT badge, door FROM sec.ocsf_physical_access WHERE event = 'AntiPassback'" }),
  R({ id: 'SR-057', title: 'Overstay after a change window', description: 'A crew still on site an hour after its change window ended.', domain: 'Physical', sensors: ['pacs', 'itsm'], techniques: [], control: 'ISO 27001 A.7.2', level: 'Low', status: 'Stable', context: true, kinds: [], rate: 0, ocsf: 'Authentication [3002]', product: 'pacs', service: 'reader', sel: ['on_site: true'], cond: 'selection and now > window_end + 1h', sql: "SELECT person, ref FROM sec.ocsf_physical_access a JOIN dict_change_windows w ON w.change_id = a.ref WHERE a.exited = 0 AND now() > w.end + INTERVAL 1 HOUR" }),
  R({ id: 'SR-058', title: 'Badge not returned', description: 'A visitor or contractor badge still active after its holder left.', domain: 'Physical', sensors: ['pacs'], techniques: [], control: 'ISO 27001 A.5.18', level: 'Low', status: 'Stable', kinds: [], rate: 0, ocsf: 'Authentication [3002]', product: 'pacs', service: 'badge', sel: ['event: checkout_missing'], cond: 'selection', sql: "SELECT badge, holder FROM sec.ocsf_physical_access WHERE event = 'CheckoutMissing'" }),
  /* cross-domain: the rule a SIEM cannot write without datacenter context */
  R({ id: 'SR-060', title: 'Badge-in followed by an unapproved change in the same room', description: 'A person badged into a room, then a privileged session on a device in that room committed a change with no approved change request.', domain: 'Cross-domain', sensors: ['pacs', 'tacacs', 'configs', 'itsm', 'dcim'], techniques: ['T1078', 'T1562.004'], level: 'Critical', status: 'Stable', context: true, kinds: [], rate: 0, ocsf: 'Detection Finding [2004]',
    product: 'correlation', service: 'datacenter', sel: ['pacs.room == dcim.room(device)', 'tacacs.user == pacs.person', 'config_changed within 60m'], cond: 'all and not change_window', playbookId: 'PB-02',
    sql: "SELECT p.person, a.device, c.diff_lines, p.time AS badge_in, c.time AS committed\nFROM sec.ocsf_physical_access p\nJOIN sec.ocsf_authentication a ON a.user_person = p.person AND a.time BETWEEN p.time AND p.time + INTERVAL 1 HOUR\nJOIN sec.ocsf_device_config_state c ON c.device = a.device AND c.time BETWEEN a.time AND a.time + INTERVAL 1 HOUR\nLEFT ANY JOIN dict_change_windows w ON w.asset = a.device AND c.time BETWEEN w.start AND w.end\nWHERE dictGet('dict_assets', 'room', a.device) = p.room AND w.change_id = ''" })
];
const EXC_RULE: Record<SecException['kind'], string> = { Tailgating: 'SR-050', 'Door forced': 'SR-051', 'Door held open': 'SR-052', 'Repeated denials': 'SR-053', 'After-hours entry': 'SR-054', 'Unescorted visitor': 'SR-055', 'Anti-passback': 'SR-056', Overstay: 'SR-057', 'Badge not returned': 'SR-058' };

const PLAYBOOKS: Omit<SecPlaybook, 'runs30d' | 'autoPct' | 'medianMin'>[] = [
  { id: 'PB-01', name: 'Triage and enrich', trigger: 'Every new detection', domain: 'Cross-domain', steps: [
    { phase: 'Detection & analysis', title: 'Attach asset context (site, room, rack, owner, tenant)', auto: true, system: 'DCIM / IPAM' },
    { phase: 'Detection & analysis', title: 'Look up the change covering the asset', auto: true, system: 'Change management' },
    { phase: 'Detection & analysis', title: 'List people badged into the site and room', auto: true, system: 'PACS' },
    { phase: 'Detection & analysis', title: 'Count services and customers on the asset', auto: true, system: 'Service inventory' }] },
  { id: 'PB-02', name: 'Unauthorised configuration change', trigger: 'SR-002 · SR-060', domain: 'Network', steps: [
    { phase: 'Detection & analysis', title: 'Pull the config diff against the last approved backup', auto: true, system: 'Oxidized' },
    { phase: 'Detection & analysis', title: 'Confirm no change request covers the device', auto: true, system: 'Change management' },
    { phase: 'Detection & analysis', title: 'Correlate the TACACS+ session with badge reads', auto: true, system: 'PACS · TACACS+' },
    { phase: 'Containment', title: 'Disable the TACACS+ account', auto: true, system: 'ISE / TACACS+' },
    { phase: 'Containment', title: 'Ask site security to locate and escort the person', auto: false, system: 'Site security' },
    { phase: 'Containment', title: 'Roll back the running config to the approved one (approval needed)', auto: false, system: 'Network automation' },
    { phase: 'Eradication', title: 'Rotate local and SNMP credentials on the device', auto: true, system: 'Vault' },
    { phase: 'Eradication', title: 'Review every device the account touched in 30 days', auto: false, system: 'SOC' },
    { phase: 'Recovery', title: 'Verify running config = golden config', auto: true, system: 'Oxidized' },
    { phase: 'Post-incident', title: 'Lessons learned and access review', auto: false, system: 'SOC · Site security' }] },
  { id: 'PB-03', name: 'Rogue device or BMC attack on the out-of-band network', trigger: 'SR-010 · SR-011', domain: 'Management', steps: [
    { phase: 'Detection & analysis', title: 'Locate the switch port, rack and room', auto: true, system: 'DCIM · LLDP' },
    { phase: 'Detection & analysis', title: 'Check who was in the room (PACS) and pull the CCTV clip', auto: true, system: 'PACS · VMS' },
    { phase: 'Containment', title: 'Shut the switch port (approval needed)', auto: false, system: 'Network automation' },
    { phase: 'Containment', title: 'Block the source on the OOB firewall', auto: true, system: 'Firewall' },
    { phase: 'Eradication', title: 'Remove the device on site and bag it as evidence', auto: false, system: 'Site security' },
    { phase: 'Recovery', title: 'Reset BMC passwords on the targeted hosts', auto: true, system: 'Redfish · Vault' },
    { phase: 'Post-incident', title: 'Enable 802.1X / port security on OOB ports', auto: false, system: 'Network' }] },
  { id: 'PB-04', name: 'GPU node compromise (crypto-mining)', trigger: 'SR-031 · SR-032', domain: 'Kubernetes', steps: [
    { phase: 'Detection & analysis', title: 'Identify namespace, workload, image and service account', auto: true, system: 'Kubernetes' },
    { phase: 'Containment', title: 'Cordon and drain the nodes', auto: true, system: 'Kubernetes' },
    { phase: 'Containment', title: 'Block the mining pool domains at the egress firewall', auto: true, system: 'Firewall · DNS' },
    { phase: 'Eradication', title: 'Delete the workload and revoke the service-account token', auto: false, system: 'Kubernetes' },
    { phase: 'Eradication', title: 'Scan the image registry for the same image', auto: true, system: 'Trivy' },
    { phase: 'Recovery', title: 'Re-image the nodes and return them to the pool', auto: false, system: 'Provisioning' },
    { phase: 'Post-incident', title: 'Enforce Pod Security "restricted" on tenant namespaces', auto: false, system: 'Platform' }] },
  { id: 'PB-05', name: 'Facility controller tampering', trigger: 'SR-040 · SR-041 · SR-042', domain: 'Facility OT', steps: [
    { phase: 'Detection & analysis', title: 'Read back the controller registers and setpoints', auto: true, system: 'OT sensor · BMS' },
    { phase: 'Containment', title: 'Block the source at the OT firewall (IEC 62443 conduit)', auto: true, system: 'OT firewall' },
    { phase: 'Containment', title: 'Facilities engineer confirms the plant is in a safe state', auto: false, system: 'Facilities' },
    { phase: 'Eradication', title: 'Change the default password on every controller of that type', auto: false, system: 'Facilities' },
    { phase: 'Recovery', title: 'Restore setpoints from the BMS baseline', auto: false, system: 'BMS' },
    { phase: 'Post-incident', title: 'Raise the zone to its target security level', auto: false, system: 'OT security' }] },
  { id: 'PB-06', name: 'Physical intrusion', trigger: 'SR-050 · SR-051 · SR-055', domain: 'Physical', steps: [
    { phase: 'Detection & analysis', title: 'Pull the CCTV clip for the door and time', auto: true, system: 'VMS' },
    { phase: 'Detection & analysis', title: 'Identify the person from the badge log and visitor register', auto: true, system: 'PACS' },
    { phase: 'Containment', title: 'Guard intercepts and checks the person on site', auto: false, system: 'Site security' },
    { phase: 'Eradication', title: 'Suspend the badge if not authorised', auto: true, system: 'PACS' },
    { phase: 'Recovery', title: 'Check racks and cages in the zones visited', auto: false, system: 'Site security' },
    { phase: 'Post-incident', title: 'Brief the host and record in the access review', auto: false, system: 'Security' }] }
];

/* illustrative advisories (ids are not real CVEs; a live NVD / CISA KEV / FIRST EPSS / vendor PSIRT feed replaces them) */
interface AdvDef { id: string; title: string; vendor: string; product: string; kind: SecAdvisory['kind']; cvss: number; vector: string; epss: number; kev: boolean; ageD: number; fixedIn: string; match: (a: Asset) => boolean; p: number }
const isV = (a: Asset, v: RegExp) => new RegExp(v.source, 'i').test(a.vendor);
const ADVS: AdvDef[] = [
  { id: 'SA-2026-0412', title: 'Web management authentication bypass', vendor: 'Cisco', product: 'IOS XR', kind: 'Firmware', cvss: 9.3, vector: 'AV:N/AC:L/AT:N/PR:N/UI:N', epss: 0.41, kev: true, ageD: 38, fixedIn: '7.11.2', match: a => a.kind === 'Router' && isV(a, /Cisco/), p: 0.55 },
  { id: 'SA-2026-0388', title: 'NX-API command injection', vendor: 'Cisco', product: 'NX-OS', kind: 'Firmware', cvss: 7.4, vector: 'AV:N/AC:L/AT:N/PR:L/UI:N', epss: 0.06, kev: false, ageD: 55, fixedIn: '10.4(3)', match: a => (a.kind === 'Switch' || a.kind === 'Access') && isV(a, /Cisco/), p: 0.4 },
  { id: 'SA-2026-0371', title: 'J-Web remote code execution', vendor: 'Juniper', product: 'Junos OS', kind: 'Firmware', cvss: 9.2, vector: 'AV:N/AC:L/AT:N/PR:N/UI:N', epss: 0.33, kev: true, ageD: 61, fixedIn: '23.4R2', match: a => isV(a, /Juniper/), p: 0.45 },
  { id: 'SA-2026-0417', title: 'SR OS management-plane authentication bypass', vendor: 'Nokia', product: 'SR OS', kind: 'Firmware', cvss: 8.7, vector: 'AV:N/AC:L/AT:N/PR:N/UI:N', epss: 0.11, kev: false, ageD: 44, fixedIn: '24.3.R3', match: a => a.kind === 'Router' && isV(a, /Nokia/), p: 0.4 },
  { id: 'SA-2026-0446', title: 'DWDM controller remote code execution', vendor: 'Ciena / Nokia', product: 'Optical node controller', kind: 'Firmware', cvss: 8.0, vector: 'AV:N/AC:L/AT:N/PR:L/UI:N', epss: 0.03, kev: false, ageD: 58, fixedIn: '13.1', match: a => a.kind === 'DWDM', p: 0.35 },
  { id: 'SA-2026-0455', title: 'eAPI privilege escalation', vendor: 'Arista', product: 'EOS', kind: 'Firmware', cvss: 7.7, vector: 'AV:N/AC:L/AT:N/PR:L/UI:N', epss: 0.03, kev: false, ageD: 22, fixedIn: '4.32.2F', match: a => isV(a, /Arista/), p: 0.4 },
  { id: 'SA-2026-0420', title: 'Switch management-plane denial of service', vendor: 'NVIDIA', product: 'Cumulus Linux / Onyx', kind: 'Firmware', cvss: 6.9, vector: 'AV:N/AC:L/AT:N/PR:N/UI:N', epss: 0.02, kev: false, ageD: 30, fixedIn: '5.9.1', match: a => (a.kind === 'Switch' || a.kind === 'Access') && isV(a, /NVIDIA|Mellanox/), p: 0.35 },
  { id: 'SA-2026-0301', title: 'SSL-VPN heap overflow', vendor: 'Fortinet', product: 'FortiOS', kind: 'Firmware', cvss: 9.6, vector: 'AV:N/AC:L/AT:N/PR:N/UI:N', epss: 0.62, kev: true, ageD: 90, fixedIn: '7.4.5', match: a => a.kind === 'Firewall' && isV(a, /Fortinet/), p: 0.6 },
  { id: 'SA-2026-0442', title: 'GlobalProtect command injection', vendor: 'Palo Alto Networks', product: 'PAN-OS', kind: 'Firmware', cvss: 9.3, vector: 'AV:N/AC:L/AT:N/PR:N/UI:N', epss: 0.55, kev: true, ageD: 46, fixedIn: '11.1.3', match: a => a.kind === 'Firewall' && isV(a, /Palo Alto/), p: 0.5 },
  { id: 'SA-2026-0350', title: 'iDRAC Redfish authentication bypass', vendor: 'Dell', product: 'iDRAC9', kind: 'Firmware', cvss: 8.8, vector: 'AV:A/AC:L/AT:N/PR:N/UI:N', epss: 0.12, kev: false, ageD: 70, fixedIn: '7.10.50', match: a => a.kind === 'BMC' && isV(a, /Dell/), p: 0.35 },
  { id: 'SA-2026-0362', title: 'iLO remote code execution', vendor: 'HPE', product: 'iLO 6', kind: 'Firmware', cvss: 8.6, vector: 'AV:A/AC:L/AT:N/PR:N/UI:N', epss: 0.09, kev: false, ageD: 64, fixedIn: '1.62', match: a => a.kind === 'BMC' && isV(a, /HPE|Hewlett/), p: 0.35 },
  { id: 'SA-2026-0333', title: 'BMC IPMI cipher-zero authentication', vendor: 'Supermicro', product: 'BMC (X13)', kind: 'Firmware', cvss: 8.1, vector: 'AV:A/AC:L/AT:N/PR:N/UI:N', epss: 0.18, kev: true, ageD: 120, fixedIn: '01.04.07', match: a => a.kind === 'BMC' && isV(a, /Supermicro/), p: 0.4 },
  { id: 'SA-2026-0367', title: 'XClarity Controller session fixation', vendor: 'Lenovo', product: 'XCC', kind: 'Firmware', cvss: 6.5, vector: 'AV:A/AC:L/AT:N/PR:N/UI:P', epss: 0.02, kev: false, ageD: 40, fixedIn: '4.10', match: a => a.kind === 'BMC' && isV(a, /Lenovo/), p: 0.35 },
  { id: 'SA-2026-0401', title: 'OpenSSH signal-handler race (remote code execution)', vendor: 'Linux distributions', product: 'openssh-server', kind: 'Package', cvss: 8.1, vector: 'AV:N/AC:H/AT:N/PR:N/UI:N', epss: 0.27, kev: false, ageD: 95, fixedIn: '1:9.6p1-3ubuntu13.5', match: a => a.kind === 'Server' || a.kind === 'GPU' || a.kind === 'Storage', p: 0.12 },
  { id: 'SA-2026-0409', title: 'sudo heap overflow (local privilege escalation)', vendor: 'Linux distributions', product: 'sudo', kind: 'Package', cvss: 7.8, vector: 'AV:L/AC:L/AT:N/PR:L/UI:N', epss: 0.08, kev: true, ageD: 140, fixedIn: '1.9.15p5-3ubuntu5.1', match: a => a.kind === 'Server', p: 0.08 },
  { id: 'SA-2026-0430', title: 'GPU kernel driver out-of-bounds write', vendor: 'NVIDIA', product: 'GPU display driver (Linux)', kind: 'Package', cvss: 7.8, vector: 'AV:L/AC:L/AT:N/PR:L/UI:N', epss: 0.04, kev: false, ageD: 26, fixedIn: '550.127.05', match: a => a.kind === 'GPU', p: 0.22 },
  { id: 'SA-2026-0436', title: 'Container runtime escape (runc file descriptor leak)', vendor: 'Open Container Initiative', product: 'runc', kind: 'Container image', cvss: 8.6, vector: 'AV:L/AC:L/AT:N/PR:N/UI:A', epss: 0.07, kev: false, ageD: 33, fixedIn: '1.1.12', match: a => a.kind === 'GPU', p: 0.14 },
  { id: 'SA-2026-0380', title: 'UPS network card hard-coded credentials', vendor: 'UPS network management cards', product: 'NMC firmware', kind: 'Firmware', cvss: 9.8, vector: 'AV:N/AC:L/AT:N/PR:N/UI:N', epss: 0.21, kev: true, ageD: 150, fixedIn: '3.2.1', match: a => a.kind === 'UPS NMC', p: 0.5 },
  { id: 'SA-2026-0394', title: 'Rack PDU web interface cross-site request forgery', vendor: 'Rack PDU vendors', product: 'PDU controller', kind: 'Firmware', cvss: 6.3, vector: 'AV:N/AC:L/AT:N/PR:N/UI:A', epss: 0.01, kev: false, ageD: 80, fixedIn: '8.4.0', match: a => a.kind === 'PDU fleet', p: 0.6 },
  { id: 'SA-2026-0399', title: 'BACnet controller unauthenticated write', vendor: 'BMS controller vendors', product: 'BACnet/IP controller', kind: 'Firmware', cvss: 8.2, vector: 'AV:N/AC:L/AT:N/PR:N/UI:N', epss: 0.05, kev: false, ageD: 110, fixedIn: '6.3', match: a => a.kind === 'Cooling controller', p: 0.3 }
];

const BASELINES: Omit<SecBaseline, 'assets' | 'passPct'>[] = [
  { id: 'BL-XR', name: 'CIS Cisco IOS XR Benchmark', standard: 'CIS Benchmark', platform: 'Cisco IOS XR routers', checks: [] },
  { id: 'BL-NX', name: 'DISA STIG Cisco NX-OS Switch (NDM)', standard: 'DISA STIG', platform: 'Cisco NX-OS switches', checks: [] },
  { id: 'BL-JUN', name: 'CIS Juniper OS Benchmark', standard: 'CIS Benchmark', platform: 'Juniper Junos', checks: [] },
  { id: 'BL-EOS', name: 'DISA STIG Arista MLS EOS (NDM)', standard: 'DISA STIG', platform: 'Arista EOS switches', checks: [] },
  { id: 'BL-NV', name: 'NVIDIA switch hardening guide', standard: 'Vendor hardening guide', platform: 'NVIDIA Spectrum / Quantum switches', checks: [] },
  { id: 'BL-FW', name: 'CIS firewall benchmark (FortiGate / PAN-OS)', standard: 'CIS Benchmark', platform: 'Firewalls', checks: [] },
  { id: 'BL-SROS', name: 'Nokia SR OS hardening guide', standard: 'Vendor hardening guide', platform: 'Nokia SR OS routers', checks: [] },
  { id: 'BL-NET', name: 'Network device baseline (vendor guide)', standard: 'Vendor hardening guide', platform: 'Other network devices (DWDM, access)', checks: [] },
  { id: 'BL-LNX', name: 'CIS Ubuntu Linux 22.04 LTS Benchmark (Level 1 Server)', standard: 'CIS Benchmark', platform: 'Linux servers, storage and GPU hosts', checks: [] },
  { id: 'BL-BMC', name: 'BMC hardening (Redfish / vendor guides)', standard: 'Vendor hardening guide', platform: 'iDRAC, iLO, XCC, Supermicro BMC', checks: [] }
];
const NET_CHECKS: [string, string, SecSev][] = [['N-01', 'SSH v2 only; Telnet and HTTP management disabled', 'High'], ['N-02', 'AAA through TACACS+ with local fallback only', 'High'], ['N-03', 'SNMPv3 authPriv only; v1 / v2c disabled', 'High'],
  ['N-04', 'Management ACL limits sources to the NOC and jump hosts', 'High'], ['N-05', 'NTP authenticated with two or more servers', 'Medium'], ['N-06', 'Remote syslog to the collector at informational', 'Medium'],
  ['N-07', 'Unused interfaces shut down', 'Low'], ['N-08', 'Control-plane policing applied', 'Medium'], ['N-09', 'Login banner and idle timeout set', 'Low'], ['N-10', 'Strong password hashing (type 8 / 9 or SHA-512)', 'Medium']];
const LNX_CHECKS: [string, string, SecSev][] = [['L-01', 'SSH root login disabled', 'High'], ['L-02', 'SSH password authentication disabled (keys only)', 'High'], ['L-03', 'auditd enabled with immutable rules', 'Medium'],
  ['L-04', 'File integrity monitoring on /etc and /usr/bin', 'Medium'], ['L-05', 'Unattended security updates enabled', 'Medium'], ['L-06', 'Host firewall default-deny inbound', 'Medium'],
  ['L-07', 'Time synchronised (chrony) to site NTP', 'Low'], ['L-08', 'No world-writable files in system paths', 'Low'], ['L-09', 'Core dumps restricted', 'Low']];
const BMC_CHECKS: [string, string, SecSev][] = [['B-01', 'Default password changed', 'Critical'], ['B-02', 'IPMI over LAN disabled', 'High'], ['B-03', 'Redfish / web over TLS 1.2+ only', 'High'],
  ['B-04', 'Accounts from the directory (LDAP / AD), no shared local admin', 'Medium'], ['B-05', 'Firmware signed and current', 'High'], ['B-06', 'Event subscription to the collector', 'Medium'], ['B-07', 'Serial-over-LAN restricted to admins', 'Low']];
const checksOf = (id: string) => (id === 'BL-LNX' ? LNX_CHECKS : id === 'BL-BMC' ? BMC_CHECKS : NET_CHECKS);

/* ------------------------------------------------------------------ assets */
interface Asset { id: string; name: string; kind: string; domain: SecDomain; dcId: string; neId?: string; room?: string; rack?: string; vendor: string; model: string; fw: string; zone: SecZone; owner: string; tenant?: string; crit: SecContext['criticality']; old: boolean; ip: string; units?: number; zoneId?: string; protocols?: string[]; defaultCreds?: number }
const BMC_NAME = (v: string) => (/Dell/i.test(v) ? 'iDRAC9' : /HPE|Hewlett/i.test(v) ? 'iLO 6' : /Lenovo/i.test(v) ? 'XClarity Controller' : /Supermicro/i.test(v) ? 'BMC' : /NVIDIA/i.test(v) ? 'DGX BMC' : 'BMC');
const BMC_VENDOR = (v: string) => (/NVIDIA/i.test(v) ? 'Supermicro' : v);
const ipOf = (r: Rnd, a: number) => `10.${a}.${intBetween(r, 0, 255)}.${intBetween(r, 2, 254)}`;

function siteAssets(db: Db, dc: Datacenter, rackRoom: Map<string, string>): Asset[] {
  const out: Asset[] = [];
  const idx = db.datacenters.indexOf(dc) + 1;
  for (const n of db.nes) {
    if (n.dcId !== dc.id || n.lifecycle === 'Planned' || n.role === 'Tenant gear') continue;
    const r = mulberry32(seedOf(`sa:${n.id}`));
    const room = rackRoom.get(n.rackId), old = modelDates(n.model, db.now).endOfSale < db.now;
    const p = n.purpose ?? '';
    const zone: SecZone = n.role === 'Firewall' || (n.role === 'Router' && (n.isPe || /BDR|PE-/.test(n.name))) ? 'Internet edge'
      : /-OOB-/.test(n.name) ? 'Out-of-band'
      : /BMS|EPMS|DCIM|MON/.test(n.name) ? 'Facility OT' : /ACS|NVR/.test(n.name) ? 'Physical security'
      : p && /Management|NMS|AAA|DNS|Jump|Backup|jump|backup/i.test(p) ? 'Management' : 'Production';
    const crit: SecContext['criticality'] = zone === 'Internet edge' || /AAA|NMS|BMS|ACS/.test(n.name) ? 'Crown jewel' : n.role === 'Router' || n.role === 'Firewall' || n.role === 'GPU' || n.role === 'Storage' ? 'High' : 'Standard';
    const domain: SecDomain = n.role === 'GPU' ? 'Kubernetes' : n.role === 'Server' || n.role === 'Storage' ? 'Compute' : 'Network';
    const owner = n.role === 'GPU' ? 'AI platform' : p ? (/NFV|5GC|UPF|vRAN|CU/i.test(p) ? 'Telco cloud (NFVI)' : /OSS|BSS|IMS/.test(p) ? 'IT applications' : /Access|CCTV|NVR/i.test(p) ? 'Physical security' : /BMS|EPMS|DCIM/i.test(p) ? 'Facility operations' : 'Operations IT') : NE_OWNER[n.role] ?? 'Network operations';
    out.push({ id: n.id, name: n.name, kind: n.role, domain, dcId: dc.id, neId: n.id, room, rack: n.rackId, vendor: n.vendor, model: n.model, fw: n.os, zone, owner, crit, old, ip: n.ip || ipOf(r, idx) });
    if (n.role === 'Server' || n.role === 'Storage' || n.role === 'GPU')
      out.push({ id: `${n.id}-BMC`, name: `${n.name} ${BMC_NAME(n.vendor)}`, kind: 'BMC', domain: 'Management', dcId: dc.id, neId: n.id, room, rack: n.rackId, vendor: BMC_VENDOR(n.vendor), model: BMC_NAME(n.vendor),
        fw: old ? '5.10.50' : '7.00.60', zone: 'Out-of-band', owner, crit: crit === 'Crown jewel' ? 'High' : 'Standard', old, ip: `172.${16 + (idx % 15)}.${intBetween(r, 100, 199)}.${intBetween(r, 2, 254)}` });
  }
  return out;
}
const NE_OWNER: Partial<Record<NetworkElement['role'], string>> = { Router: 'Network operations', Switch: 'Network operations', DWDM: 'Transport', Firewall: 'Network security', Access: 'Network operations', Storage: 'Storage platform', Server: 'Compute platform' };

/* the facility plant's controllers, grouped per IEC 62443 zone */
const OT_ZONES: [string, string, 1 | 2 | 3 | 4][] = [['EL', 'Electrical (EPMS, UPS, PDU, ATS, generator)', 3], ['ME', 'Mechanical (BMS, CRAH / CRAC, CDU)', 2], ['FS', 'Fire & life safety', 3], ['PS', 'Physical security (PACS, CCTV)', 2], ['MON', 'DCIM & monitoring', 2]];
function otAssets(db: Db, dc: Datacenter): Asset[] {
  const out: Asset[] = [];
  const r = mulberry32(seedOf(`ot:${dc.id}`));
  const idx = db.datacenters.indexOf(dc) + 1;
  const ip = () => `10.${200 + (idx % 50)}.${intBetween(r, 1, 40)}.${intBetween(r, 2, 254)}`;
  const upsV = pick(r, ['Vertiv', 'Schneider Electric', 'Eaton']), bmsV = pick(r, ['Siemens Desigo', 'Honeywell', 'Johnson Controls']), pduV = pick(r, ['Vertiv Geist', 'Raritan', 'APC']);
  const add = (x: Omit<Asset, 'domain' | 'dcId' | 'zone' | 'owner' | 'crit' | 'old' | 'ip'> & { ip?: string; crit?: SecContext['criticality'] }) => out.push({ domain: 'Facility OT', dcId: dc.id, zone: 'Facility OT', owner: x.zoneId === 'PS' ? 'Physical security' : 'Facility operations', crit: x.crit ?? 'High', old: false, ip: x.ip ?? ip(), ...x });
  dc.power.ups.forEach(u => add({ id: `${dc.id}-${u.name}-NMC`, name: `${u.name} network card`, kind: 'UPS NMC', vendor: upsV, model: 'Network management card', fw: chance(r, 0.4) ? '2.9.4' : '3.2.1', zoneId: 'EL', protocols: ['SNMP v2c', 'Modbus/TCP', 'HTTPS'], defaultCreds: chance(r, 0.12) ? 1 : 0, units: 1, crit: 'Crown jewel' }));
  add({ id: `${dc.id}-ATS`, name: 'ATS / LV switchboard controller', kind: 'Power controller', vendor: upsV, model: 'PLC', fw: '4.1', zoneId: 'EL', protocols: ['Modbus/TCP'], defaultCreds: 0, units: 2, crit: 'Crown jewel' });
  add({ id: `${dc.id}-DG`, name: 'Generator controller', kind: 'Power controller', vendor: 'Cummins', model: 'PowerCommand', fw: '2.4', zoneId: 'EL', protocols: ['Modbus/TCP'], defaultCreds: 0, units: 1, crit: 'Crown jewel' });
  const ph = sitePhys(db, dc.id); const pdus = ph?.pdus.length ?? dc.racks.length * 2;
  if (pdus) add({ id: `${dc.id}-PDUS`, name: `Rack PDUs (${pdus})`, kind: 'PDU fleet', vendor: pduV, model: 'Metered / switched PDU', fw: '8.2.0', zoneId: 'EL', protocols: ['SNMP v2c', 'HTTPS'], defaultCreds: Math.round(pdus * (chance(r, 0.3) ? intBetween(r, 1, 6) / 100 : 0)), units: pdus });
  dc.cooling.units.forEach(u => add({ id: `${dc.id}-${u.name}-CTL`, name: `${u.name} controller`, kind: 'Cooling controller', vendor: bmsV, model: u.type === 'CDU' ? 'CDU controller' : 'Unit controller', fw: chance(r, 0.35) ? '5.8' : '6.3', zoneId: 'ME', protocols: ['BACnet/IP'], defaultCreds: chance(r, 0.06) ? 1 : 0, units: 1 }));
  add({ id: `${dc.id}-BMS`, name: 'BMS head-end', kind: 'BMS', vendor: bmsV, model: 'Supervisory server', fw: '6.3', zoneId: 'ME', protocols: ['BACnet/IP', 'HTTPS'], defaultCreds: 0, units: 1, crit: 'Crown jewel' });
  add({ id: `${dc.id}-FIRE`, name: 'Fire alarm & suppression panels', kind: 'Fire panel', vendor: pick(r, ['Siemens Cerberus', 'Honeywell Notifier', 'Bosch']), model: 'Addressable panel', fw: '3.0', zoneId: 'FS', protocols: ['BACnet/IP'], defaultCreds: 0, units: Math.max(1, dc.floors.length), crit: 'Crown jewel' });
  add({ id: `${dc.id}-PACS`, name: 'Access-control controllers', kind: 'PACS controller', vendor: pick(r, ['Lenel S2', 'Genetec', 'HID']), model: 'Door controller', fw: '8.1', zoneId: 'PS', protocols: ['OSDP', 'HTTPS'], defaultCreds: 0, units: Math.max(1, (siteSafety(db, dc.id)?.access.length ?? 4)) });
  add({ id: `${dc.id}-CCTV`, name: 'CCTV cameras & NVR', kind: 'VMS', vendor: pick(r, ['Axis', 'Hanwha', 'Bosch']), model: 'IP cameras + NVR', fw: '11.8', zoneId: 'PS', protocols: ['RTSP', 'ONVIF', 'HTTPS'], defaultCreds: chance(r, 0.25) ? intBetween(r, 1, 3) : 0, units: intBetween(r, 40, 140) });
  add({ id: `${dc.id}-DCIMC`, name: 'DCIM / EPMS collectors', kind: 'Monitoring', vendor: 'DCIM', model: 'Collector', fw: '2026.3', zoneId: 'MON', protocols: ['SNMP v3', 'Modbus/TCP', 'BACnet/IP'], defaultCreds: 0, units: 2, crit: 'Standard' });
  return out;
}

/* ------------------------------------------------------------------ build */
function build(db: Db): SecOpsView {
  const now = db.now, persona = db.persona;
  const G = activeGeo();
  const team = G.people.slice(0, 6);
  const live = db.datacenters.filter(d => d.status !== 'planned');
  const reg = changeRegister(db);
  const rackRoom = new Map<string, string>(); db.datacenters.forEach(d => d.racks.forEach(r => rackRoom.set(r.id, r.room)));
  /* services and customers per device (any service whose path crosses it) */
  const svcOf = new Map<string, { s: number; c: Set<string> }>();
  for (const s of db.services) for (const ne of new Set([s.neId, ...s.path])) { const e = svcOf.get(ne) ?? { s: 0, c: new Set<string>() }; e.s++; e.c.add(s.customerId); svcOf.set(ne, e); }
  const assets: Asset[] = [], ot: Asset[] = [];
  const access = new Map<string, ReturnType<typeof accessOf>>();
  for (const d of live) { siteSafety(db, d.id); access.set(d.id, accessOf(d.id)); assets.push(...siteAssets(db, d, rackRoom)); ot.push(...otAssets(db, d)); }
  const byId = new Map([...assets, ...ot].map(a => [a.id, a]));
  const bySite = new Map<string, Asset[]>(); for (const a of [...assets, ...ot]) { const l = bySite.get(a.dcId) ?? []; l.push(a); bySite.set(a.dcId, l); }
  /* change windows per asset (devices or racks named in a change's scope) */
  const changesAt = (a: Asset, at: number) => reg.changes.find(c => c.dcId === a.dcId && at >= c.windowStart - 30 * MIN && at <= c.windowEnd + 30 * MIN && c.status !== 'Draft' && c.status !== 'Rejected' && c.status !== 'Pending approval'
    && (c.scope.includes(a.neId ?? a.id) || (!!a.rack && c.scope.includes(a.rack)) || (a.kind !== 'BMC' && !!a.neId && c.title.includes(a.name))));
  const ctx = (a: Asset, at: number, cr?: SecContext['change']): SecContext => {
    const acc = access.get(a.dcId);
    const inLog = !!acc && at >= acc.from && at <= now;
    const visits = inLog ? acc!.visits.filter(v => v.entered <= at && (v.exited ?? now) >= at) : [];
    const inRoom = a.room ? visits.filter(v => v.zones.some(z => z.includes(a.room!)) || v.where.includes(a.room!)).map(v => v.person) : [];
    const ch = cr !== undefined ? cr : (() => { const c = changesAt(a, at); return c ? { id: c.id, title: c.title, status: c.status } : null; })();
    const sv = a.neId ? svcOf.get(a.neId) : undefined;
    return { room: a.room, rack: a.rack, owner: a.owner, tenant: a.tenant, criticality: a.crit, zone: a.zone, change: ch, onSite: inLog ? visits.length : undefined, inRoom: inRoom.slice(0, 4), services: sv?.s ?? 0, customers: sv?.c.size ?? 0 };
  };
  const rules: RuleDef[] = [...RULES.map(r => { const e = ov.ruleEdits.get(r.id); return e ? { ...r, ...e } : r; }), ...ov.newRules];
  const ruleBy = new Map(rules.map(r => [r.id, r]));

  /* ---- detections */
  const D: SecDetection[] = [];
  const det = (rule: string, a: { name: string; kind: string; dcId: string; neId?: string } & Partial<Asset>, at: number, x: Partial<SecDetection> & { summary: string }) => {
    const rd = ruleBy.get(rule)!;
    const asset = byId.get(a.id ?? '') ?? (a as Asset);
    const d: SecDetection = { id: '', ruleId: rule, title: rd.title, domain: rd.domain, severity: rd.level, state: 'New', at, lastAt: at, count: 1, dcId: a.dcId, asset: a.name, assetKind: a.kind, neId: a.neId,
      techniques: rd.techniques, sensor: rd.sensors[0], ocsf: rd.ocsf, context: asset.owner ? ctx(asset, at) : { owner: 'Site security', criticality: 'High', zone: 'Physical security', onSite: undefined, services: 0, customers: 0 }, event: {}, ...x };
    D.push(d); return d;
  };
  const ipR = mulberry32(seedOf(`secip:${persona}`));
  const someIp = (zone: 'mgmt' | 'prod' | 'ext') => zone === 'ext' ? `${pick(ipR, ['185.220.101', '45.95.147', '103.152.118', '194.26.192'])}.${intBetween(ipR, 2, 250)}` : zone === 'mgmt' ? `172.${intBetween(ipR, 16, 31)}.${intBetween(ipR, 1, 250)}.${intBetween(ipR, 2, 250)}` : `10.${intBetween(ipR, 1, 30)}.${intBetween(ipR, 0, 250)}.${intBetween(ipR, 2, 250)}`;
  const users = ['netops-svc', 'a.rao', 'k.menon', 'ops-automation', 'backup-svc', 'm.chen', 'r.diaz', 'noc-readonly'];

  /* background: per site × rule, seeded on the pair */
  const SUM: Record<string, (a: Asset, n: number) => string> = {
    'SR-001': a => `Privileged login to ${a.name} with no change request open for it`,
    'SR-003': (a, n) => `${n} failed logins to ${a.name} in 10 min from one source`,
    'SR-004': a => `SNMP v2c "public" query reached ${a.name}`,
    'SR-005': a => `Running config of ${a.name} copied by SCP to a host outside the backup servers`,
    'SR-006': a => `${a.name} booted an image older than its baseline`,
    'SR-008': (a, n) => `${n} management ports probed in 5 min, ${a.name} among them`,
    'SR-010': (a, n) => `${n} failed Redfish logins on ${a.name}`,
    'SR-011': a => `Unknown MAC learned on ${a.name}`,
    'SR-012': a => `${a.name} firmware updated with no campaign open`,
    'SR-020': (a, n) => `${n} failed SSH logins across hosts from one source, ${a.name} among them`,
    'SR-021': a => `Local account added to sudo on ${a.name}`,
    'SR-022': a => `/var/log/auth.log truncated on ${a.name}`,
    'SR-023': a => `sudo to root by a non-admin account on ${a.name}`,
    'SR-030': a => `Interactive shell in a container on ${a.name}`,
    'SR-031': a => `Privileged pod with a host mount scheduled on ${a.name}`,
    'SR-033': a => `kubectl exec into a production pod on ${a.name}`,
    'SR-040': a => `Modbus write to ${a.name} from a non-BMS host`,
    'SR-041': a => `Setpoint written on ${a.name} with no maintenance change open`,
    'SR-042': a => `Login with the vendor default account on ${a.name}`,
    'SR-043': a => `New host started BACnet / Modbus sessions towards ${a.name}`,
    'SR-044': a => `Alarm limit changed on ${a.name}`
  };
  for (const d of live) {
    const pool = bySite.get(d.id) ?? [];
    const size = Math.min(3, 0.6 + pool.length / 160);
    for (const rd of rules) {
      if (!rd.rate || !rd.kinds.length) continue;
      const cand = pool.filter(a => rd.kinds.includes(a.kind) || (rd.kinds.includes('OT') && a.domain === 'Facility OT'));
      if (!cand.length) continue;
      const rr = mulberry32(seedOf(`secbg:${d.id}:${rd.id}`));
      const lam = rd.rate * 2 * size;
      let n = 0; { let p = Math.exp(-lam), c = p; const u = rr(); while (u > c && n < 12) { n++; p *= lam / n; c += p; } }
      for (let i = 0; i < n; i++) {
        const a = pick(rr, cand), at = now - Math.floor(Math.pow(rr(), 1.3) * 14 * DAY) - intBetween(rr, 5, 50) * MIN;
        const cnt = rd.burst ? intBetween(rr, rd.burst[0], rd.burst[1]) : 1;
        const recent = at > now - 36 * HOUR;
        const disp: SecDisposition = rr() < 0.4 ? 'False positive' : rr() < 0.86 ? 'Benign' : 'True positive';
        const state: SecDetection['state'] = recent ? (rr() < 0.65 ? 'New' : 'Investigating') : 'Closed';
        const src = rd.domain === 'Facility OT' ? someIp('prod') : a.zone === 'Internet edge' && rr() < 0.5 ? someIp('ext') : someIp(rr() < 0.6 ? 'mgmt' : 'prod');
        const actor = rd.domain === 'Physical' ? undefined : pick(rr, users);
        const x = det(rd.id, a, at, { summary: SUM[rd.id]?.(a, cnt) ?? rd.title, count: cnt, lastAt: at + (cnt > 1 ? intBetween(rr, 2, 9) * MIN : 0), state, disposition: state === 'Closed' ? disp : undefined,
          assignee: state === 'New' ? undefined : pick(rr, team), srcIp: src, dstIp: a.ip, actor });
        x.event = ocsfEvent(x, rd);
      }
    }
  }

  /* ---- config drift: authorised by a change on the device in the last 7 days, or not (each unauthorised one raises SR-002) */
  const drift: SecDrift[] = [];
  const netAssets = assets.filter(a => NET_KINDS.includes(a.kind));
  const netById = new Map(netAssets.map(a => [a.id, a]));
  for (const c of reg.changes) {
    if (c.windowEnd < now - 7 * DAY || c.windowStart > now || !['In progress', 'Completed'].includes(c.status)) continue;
    for (const id of c.scope) { const a = netById.get(id); if (!a) continue; const rr = mulberry32(seedOf(`drift:${c.id}:${id}`));
      drift.push({ id: '', asset: a.name, neId: a.neId, dcId: a.dcId, at: Math.min(now - 10 * MIN, c.windowStart + intBetween(rr, 10, 90) * MIN), lines: intBetween(rr, 2, 40), summary: `Change ${c.id}: ${c.title}`, diff: [], authorised: true, changeId: c.id, who: c.requester }); }
  }
  const DRIFT_KINDS: [string, string[]][] = [['NTP server changed', ['- ntp server 10.0.0.11', '+ ntp server 192.0.2.44']], ['Logging host removed', ['- logging 10.0.0.21 vrf MGMT']], ['Local user added', ['+ username maint privilege 15 secret 9 $9$…']],
    ['SNMP community added', ['+ snmp-server community dcops RO']], ['Interface description and VLAN changed', ['- switchport access vlan 210', '+ switchport access vlan 999']]];
  for (const d of live) {
    const rr = mulberry32(seedOf(`udrift:${d.id}`));
    const cand = netAssets.filter(a => a.dcId === d.id && a.zone !== 'Internet edge');
    if (!cand.length || d.id === dcAt(1)) continue;
    const n = rr() < 0.35 ? 1 : 0;
    for (let i = 0; i < n; i++) { const a = pick(rr, cand), [summary, diff] = pick(rr, DRIFT_KINDS), at = now - intBetween(rr, 2, 6 * 24) * HOUR, who = pick(rr, users);
      const x = det('SR-002', a, at, { summary: `${summary} on ${a.name} with no change request`, actor: who, srcIp: someIp('mgmt'), dstIp: a.ip, state: at > now - 36 * HOUR ? 'Investigating' : 'Closed', disposition: at > now - 36 * HOUR ? undefined : 'Benign', assignee: pick(rr, team) });
      x.event = ocsfEvent(x, ruleBy.get('SR-002')!);
      drift.push({ id: '', asset: a.name, neId: a.neId, dcId: a.dcId, at, lines: diff.length, summary, diff, authorised: false, who }); }
  }

  /* ---- physical: every security exception of the access log is a detection */
  for (const d of live) {
    const acc = access.get(d.id); if (!acc) continue;
    for (const e of acc.exceptions) {
      const x = det(EXC_RULE[e.kind], { name: e.door ?? 'Site', kind: 'Door', dcId: d.id, id: e.doorId }, e.at, {
        summary: `${e.kind}${e.door ? ` at ${e.door}` : ''}${e.person ? ` · ${e.person}${e.company ? ` (${e.company})` : ''}` : ''}`, severity: e.severity, actor: e.person, accessRef: e.id, sensor: 'pacs',
        state: e.status === 'Open' ? 'New' : e.status === 'Under review' ? 'Investigating' : 'Closed', disposition: e.status === 'Closed' ? (e.kind === 'Door forced' || e.kind === 'Tailgating' ? 'True positive' : 'Benign') : undefined, assignee: e.owner });
      x.context = { owner: 'Site security', criticality: 'High', zone: 'Physical security', onSite: acc.totals.onSite, inRoom: [], services: 0, customers: 0, change: e.ref?.startsWith('CHG') ? { id: e.ref, title: 'Change crew visit', status: '' } : null };
      x.event = { class_uid: 3002, class_name: 'Authentication', category_name: 'Identity & Access Management', time: e.at, metadata: { product: { name: 'PACS' } }, door: e.door, person: e.person, company: e.company, kind: e.kind, evidence: e.evidence, ref: e.ref };
    }
  }

  /* ---- the stories (cases) */
  const cases: SecCase[] = [];
  const pb = new Map(PLAYBOOKS.map(p => [p.id, p]));
  const steps = (id: string, done: number, at: number, by: string): SecCaseStep[] => (pb.get(id)?.steps ?? []).map((s, i) => ({ ...s, done: i < done, by: i < done ? (s.auto ? 'Automation' : by) : undefined, at: i < done ? at + (i + 1) * 4 * MIN : undefined }));
  const mkCase = (c: Omit<SecCase, 'notes' | 'acked' | 'slaDue'> & { ackMin: number }) => {
    const sla = { Critical: 4, High: 24, Medium: 72, Low: 168 }[c.severity] * HOUR;
    const cs: SecCase = { ...c, acked: c.opened + c.ackMin * MIN, slaDue: c.opened + sla, notes: [] };
    cases.push(cs); c.detectionIds.forEach(id => { const d = D.find(x => x.id === id); if (d) d.caseId = c.id; }); return cs;
  };
  const tag = (d: SecDetection) => { d.id = `__${D.indexOf(d)}`; return d.id; };

  /* 1. hero site: a person badges into the room of the WAN-edge router, logs in and opens the management ACL with no change request */
  {
    const H = dcAt(1), neId = edgeId(persona, H, 1), a = byId.get(neId) ?? netAssets.find(x => x.dcId === H && x.kind === 'Router');
    const acc = access.get(H);
    if (a && acc) {
      const vs = acc.visits.filter(v => v.type !== 'Security' && v.entered < now - 4 * HOUR && v.entered > now - 20 * HOUR).sort((x, y) => (x.type === 'Contractor' ? -1 : 0) - (y.type === 'Contractor' ? -1 : 0));
      const v: AccessVisit | undefined = vs[0];
      const person = v?.person ?? 'contractor', company = v?.company ?? 'Contractor';
      const tB = v?.entered ?? now - 6 * HOUR, tL = tB + 14 * MIN, tC = tL + 7 * MIN;
      const user = person.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');
      const junos = /Juniper/.test(a.vendor);
      const diff = junos ? ['  firewall family inet filter MGMT-IN term ssh', '-    from source-address 10.255.10.0/24;', '+    from source-address 0.0.0.0/0;', '+  term snmp from protocol udp port 161 then accept;']
        : ['ipv4 access-list MGMT-IN', '- 10 permit tcp 10.255.10.0/24 any eq ssh', '+ 10 permit tcp any any eq ssh', '+ 15 permit udp any any eq snmp'];
      const cr = null;
      const d1 = det('SR-001', a, tL, { summary: `${user} opened a privileged session on ${a.name} — no change request covers it`, actor: user, srcIp: '10.255.10.37', dstIp: a.ip, state: 'Escalated', assignee: team[0] });
      d1.context = { ...ctx(a, tL, cr), inRoom: [person] };
      const d2 = det('SR-002', a, tC, { summary: `Management ACL on ${a.name} opened to any source (SSH + SNMP) with no change request`, actor: user, srcIp: '10.255.10.37', dstIp: a.ip, state: 'Escalated', assignee: team[0] });
      d2.context = { ...ctx(a, tC, cr), inRoom: [person] };
      const d3 = det('SR-060', a, tC + 2 * MIN, { summary: `${person} (${company}) badged into ${a.room ?? 'the room'} at ${hhmm(tB)}, then ${user} changed ${a.name} at ${hhmm(tC)} — no change request`, actor: person, srcIp: '10.255.10.37', dstIp: a.ip, state: 'Escalated', assignee: team[0], sensor: 'pacs' });
      d3.context = { ...ctx(a, tC, cr), inRoom: [person] };
      [d1, d2, d3].forEach(x => { x.event = ocsfEvent(x, ruleBy.get(x.ruleId)!); });
      d3.event = { ...d3.event, badge_in: { time: tB, person, company, door: v ? `${v.where}` : 'Data hall' }, session: { time: tL, user, src_ip: '10.255.10.37', priv_lvl: 15 }, commit: { time: tC, diff_lines: diff.length }, change_request: null };
      drift.push({ id: '', asset: a.name, neId: a.neId, dcId: H, at: tC, lines: diff.length, summary: 'Management ACL opened to any source', diff, authorised: false, who: user, detectionId: '' });
      const dr = drift[drift.length - 1];
      const ids = [tag(d1), tag(d2), tag(d3)]; dr.detectionId = d2.id;
      mkCase({ id: 'SEC-0001', story: true, title: `Unapproved change on ${a.name}: management access opened to any source`, severity: 'Critical', phase: 'Containment', dcId: H, opened: tC + 4 * MIN, firstEvent: tB, ackMin: 6, owner: team[0],
        detectionIds: ids, techniques: ['T1078', 'T1562.004'], domain: 'Cross-domain', playbookId: 'PB-02', steps: steps('PB-02', 5, tC + 4 * MIN, team[0]),
        summary: `${person} (${company}) badged into ${a.room ?? 'the room'} of ${a.name} at ${hhmm(tB)}. Fourteen minutes later the account ${user} opened a privileged session and changed the management ACL so SSH and SNMP accept any source. No change request covers the device; the account is disabled and site security is escorting the person.`,
        impact: `${a.name} is the site's WAN edge${d3.context.services ? `: ${d3.context.services} services for ${d3.context.customers} customers ride it` : ''}. Until the config is rolled back its management plane is reachable from any network.`, assets: [a.name] });
    }
  }
  /* 2. GPU estates: crypto-mining from a sandbox namespace on idle GPU nodes; otherwise password spraying → local admin → logs cleared on a jump host */
  if (db.gpu && db.gpu.clusters.length) {
    const cl = db.gpu.clusters.find(c => c.dcId !== dcAt(1) && c.scheduler === 'Kubernetes') ?? db.gpu.clusters[0];
    const nodes = cl.nodes.map(id => db.gpu!.nodes.get(id)!).filter(n => n && !n.jobId).slice(0, 3);
    const hosts = nodes.map(n => byId.get(n.neId)).filter((x): x is Asset => !!x);
    if (hosts.length) {
      const t0 = now - 9 * HOUR;
      const d1 = det('SR-031', hosts[0], t0, { summary: `Privileged pod "nb-render-7f" with a host mount scheduled on ${hosts[0].name} (namespace research-sandbox)`, actor: 'system:serviceaccount:research-sandbox:ci-runner', srcIp: someIp('prod'), dstIp: hosts[0].ip, state: 'Escalated', assignee: team[1] });
      const d2 = det('SR-032', hosts[0], t0 + 26 * MIN, { summary: `Miner process "xmrig" and stratum connections from ${hosts.length} idle GPU nodes in ${cl.name}`, count: hosts.length * 3, actor: 'ci-runner', srcIp: hosts[0].ip, dstIp: '45.95.147.18', state: 'Escalated', assignee: team[1] });
      const d3 = det('SR-030', hosts[Math.min(1, hosts.length - 1)], t0 + 40 * MIN, { summary: `Interactive shell in container "nb-render-7f" on ${hosts[Math.min(1, hosts.length - 1)].name}`, actor: 'ci-runner', srcIp: someIp('prod'), dstIp: hosts[0].ip, state: 'Escalated', assignee: team[1] });
      [d1, d2, d3].forEach(x => { x.event = ocsfEvent(x, ruleBy.get(x.ruleId)!); });
      mkCase({ id: 'SEC-0002', story: true, title: `Crypto-mining on ${hosts.length} idle GPU nodes in ${cl.name}`, severity: 'High', phase: 'Eradication', dcId: cl.dcId, opened: t0 + 30 * MIN, firstEvent: t0, ackMin: 9, owner: team[1],
        detectionIds: [tag(d1), tag(d2), tag(d3)], techniques: ['T1611', 'T1496', 'T1059.004'], domain: 'Kubernetes', playbookId: 'PB-04', steps: steps('PB-04', 3, t0 + 30 * MIN, team[1]),
        summary: `A CI service account in the research-sandbox namespace scheduled a privileged pod with a host mount on idle GPU nodes and started a miner. The nodes are cordoned and drained and the pool domains are blocked; the workload and the service-account token are next.`,
        impact: `${hosts.length * 8} GPUs were drawing power for no customer job; no customer workload ran on the nodes. GPU time lost and the power cost are shown on the GPU Fleet screen.`, assets: hosts.map(h => h.name) });
    }
  } else {
    const site = live[2] ?? live[0];
    const jmp = assets.find(a => a.dcId === site.id && /JMP/.test(a.name)) ?? assets.find(a => a.dcId === site.id && a.kind === 'Server');
    if (jmp) {
      const t0 = now - 11 * HOUR;
      const d1 = det('SR-020', jmp, t0, { summary: `214 failed SSH logins across 9 hosts with 31 accounts from 10.40.12.88, ${jmp.name} among them`, count: 214, srcIp: '10.40.12.88', dstIp: jmp.ip, state: 'Escalated', assignee: team[1] });
      const d2 = det('SR-021', jmp, t0 + 52 * MIN, { summary: `Local account "svc-backup2" added to sudo on ${jmp.name}`, actor: 'svc-backup2', srcIp: '10.40.12.88', dstIp: jmp.ip, state: 'Escalated', assignee: team[1] });
      const d3 = det('SR-022', jmp, t0 + 58 * MIN, { summary: `/var/log/auth.log truncated on ${jmp.name}`, actor: 'svc-backup2', srcIp: '10.40.12.88', dstIp: jmp.ip, state: 'Escalated', assignee: team[1] });
      [d1, d2, d3].forEach(x => { x.event = ocsfEvent(x, ruleBy.get(x.ruleId)!); });
      mkCase({ id: 'SEC-0002', story: true, title: `Jump host ${jmp.name} compromised: password spraying, new admin, logs cleared`, severity: 'High', phase: 'Containment', dcId: site.id, opened: t0 + 60 * MIN, firstEvent: t0, ackMin: 11, owner: team[1],
        detectionIds: [tag(d1), tag(d2), tag(d3)], techniques: ['T1110.003', 'T1136.001', 'T1070.002'], domain: 'Compute', steps: [
          { phase: 'Detection & analysis', title: 'Collect osquery history and the jump host session recordings', auto: true, done: true, by: 'Automation', at: t0 + 64 * MIN, system: 'osquery' },
          { phase: 'Containment', title: 'Isolate the jump host at the management firewall', auto: true, done: true, by: 'Automation', at: t0 + 70 * MIN, system: 'Firewall' },
          { phase: 'Containment', title: 'Disable "svc-backup2" and force a password reset on the 31 accounts tried', auto: false, done: false, system: 'Directory' },
          { phase: 'Eradication', title: 'Rebuild the jump host from the golden image', auto: false, done: false, system: 'Provisioning' },
          { phase: 'Recovery', title: 'Restore access through the rebuilt host with MFA', auto: false, done: false, system: 'PAM' },
          { phase: 'Post-incident', title: 'Find the source 10.40.12.88 and how it got credentials', auto: false, done: false, system: 'SOC' }],
        summary: 'A source on the production network sprayed SSH passwords across nine hosts, got into the jump host, created a sudo account and truncated the auth log. The host is isolated; account resets are next.',
        impact: 'The jump host reaches the management plane of every device at the site; until it is rebuilt, administrators use the second site\'s jump host.', assets: [jmp.name] });
    }
  }
  /* 3. rogue device on the out-of-band network + BMC brute force */
  {
    const site = live[1] ?? live[0];
    const sw = assets.find(a => a.dcId === site.id && a.zone === 'Out-of-band' && a.kind !== 'BMC') ?? assets.find(a => a.dcId === site.id && (a.kind === 'Switch' || a.kind === 'Access'));
    const bmcs = assets.filter(a => a.dcId === site.id && a.kind === 'BMC').slice(0, 3);
    if (sw && bmcs.length) {
      const t0 = now - 3 * HOUR - 20 * MIN;
      const d1 = det('SR-011', sw, t0, { summary: `Unknown MAC 3c:7c:3f:a1:0e:42 learned on ${sw.name} port 47 (rack ${sw.rack ?? ''})`, srcIp: '172.20.9.250', dstIp: sw.ip, state: 'Investigating', assignee: team[2] });
      const d2 = det('SR-010', bmcs[0], t0 + 9 * MIN, { summary: `${360} failed Redfish logins on ${bmcs.length} BMCs from 172.20.9.250`, count: 360, srcIp: '172.20.9.250', dstIp: bmcs[0].ip, actor: 'root / ADMIN / admin', state: 'Investigating', assignee: team[2] });
      const d3 = det('SR-008', sw, t0 + 4 * MIN, { summary: `172.20.9.250 probed 612 out-of-band addresses on 22, 443 and 623 (IPMI)`, count: 612, srcIp: '172.20.9.250', dstIp: sw.ip, state: 'Investigating', assignee: team[2] });
      [d1, d2, d3].forEach(x => { x.event = ocsfEvent(x, ruleBy.get(x.ruleId)!); });
      mkCase({ id: 'SEC-0003', story: true, title: `Unknown device on the out-of-band network at ${site.id} probing BMCs`, severity: 'High', phase: 'Detection & analysis', dcId: site.id, opened: t0 + 12 * MIN, firstEvent: t0, ackMin: 4, owner: team[2],
        detectionIds: [tag(d1), tag(d3), tag(d2)], techniques: ['T1200', 'T1046', 'T1110.001'], domain: 'Management', playbookId: 'PB-03', steps: steps('PB-03', 2, t0 + 12 * MIN, team[2]),
        summary: `A device that is not in DCIM appeared on port 47 of ${sw.name}, scanned the out-of-band network for SSH, HTTPS and IPMI and then tried default BMC passwords on ${bmcs.length} servers. None succeeded. The port is waiting for approval to be shut.`,
        impact: 'A BMC gives full control of a server below the operating system (power, console, firmware). No login succeeded.', assets: [sw.name, ...bmcs.map(b => b.name)] });
    }
  }
  /* 4. facility OT: default credentials on a UPS network card, then a Modbus write attempt (blocked at the OT conduit) */
  {
    const site = live.find(d => d.id === dcAt(9)) ?? live[3] ?? live[0];
    const nmc = ot.find(a => a.dcId === site.id && a.kind === 'UPS NMC');
    if (nmc) {
      nmc.defaultCreds = 1;
      const t0 = now - 26 * HOUR;
      const d1 = det('SR-042', nmc, t0, { summary: `Login to ${nmc.name} with the vendor default account from 10.31.4.17 (production VLAN)`, actor: 'apc', srcIp: '10.31.4.17', dstIp: nmc.ip, state: 'Escalated', assignee: team[3] });
      const d2 = det('SR-040', nmc, t0 + 6 * MIN, { summary: `Modbus write (function 6) to ${nmc.name} register 40112 from 10.31.4.17 — dropped at the OT firewall`, actor: undefined, srcIp: '10.31.4.17', dstIp: nmc.ip, state: 'Escalated', assignee: team[3] });
      [d1, d2].forEach(x => { x.event = ocsfEvent(x, ruleBy.get(x.ruleId)!); });
      d2.techniques = ['T0855', 'T0836'];
      const others = ot.filter(a => a.kind === 'UPS NMC' && a.defaultCreds).length;
      mkCase({ id: 'SEC-0004', story: true, title: `Default credentials and a Modbus write on ${nmc.name} at ${site.id}`, severity: 'High', phase: 'Containment', dcId: site.id, opened: t0 + 10 * MIN, firstEvent: t0, ackMin: 7, owner: team[3],
        detectionIds: [tag(d1), tag(d2)], techniques: ['T0812', 'T0855', 'T0836'], domain: 'Facility OT', playbookId: 'PB-05', steps: steps('PB-05', 2, t0 + 10 * MIN, team[3]),
        summary: `A host on the production VLAN logged into the UPS network card with the factory account, then sent a Modbus write. The OT firewall dropped the write, so the UPS settings did not change. ${others} UPS cards in the estate still have default credentials.`,
        impact: 'A UPS network card can switch the UPS to bypass or shut it down; a successful write could drop the critical load of the rooms it feeds.', assets: [nmc.name] });
    }
  }
  /* 5. physical: the most serious open exception */
  {
    const open = D.filter(d => d.domain === 'Physical' && d.state !== 'Closed' && d.severity !== 'Low').sort((a, b) => ['High', 'Medium'].indexOf(a.severity) - ['High', 'Medium'].indexOf(b.severity) || b.at - a.at)[0];
    if (open) {
      open.state = 'Escalated';
      mkCase({ id: 'SEC-0005', story: true, title: `${open.title} at ${open.dcId}: ${open.asset}`, severity: open.severity === 'High' ? 'High' : 'Medium', phase: 'Detection & analysis', dcId: open.dcId, opened: open.at + 5 * MIN, firstEvent: open.at, ackMin: 3, owner: open.assignee ?? team[4],
        detectionIds: [tag(open)], techniques: [], domain: 'Physical', playbookId: 'PB-06', steps: steps('PB-06', 2, open.at + 5 * MIN, team[4]),
        summary: `${open.summary}. The CCTV clip and the badge log are attached; the guard is checking the person against the visitor register.`, impact: 'Physical access to the data hall bypasses every logical control on the equipment in it.', assets: [open.asset] });
    }
  }
  /* closed cases from true-positive detections (the last 14 days) */
  const tps = D.filter(d => d.disposition === 'True positive' && !d.caseId).sort((a, b) => b.at - a.at).slice(0, 18);
  tps.forEach((d, i) => { const rr = mulberry32(seedOf(`cc:${d.dcId}:${d.ruleId}:${d.at}`)); const opened = d.at + intBetween(rr, 3, 45) * MIN;
    const rd = ruleBy.get(d.ruleId)!; const phases: SecPhase[] = ['Detection & analysis', 'Containment', 'Eradication', 'Recovery', 'Post-incident'];
    mkCase({ id: `SEC-${String(6 + i).padStart(4, '0')}`, title: `${rd.title}: ${d.asset}`, severity: d.severity, phase: 'Closed', dcId: d.dcId, opened, firstEvent: d.at, ackMin: intBetween(rr, 2, 40), closed: opened + intBetween(rr, 2, 30) * HOUR, owner: d.assignee ?? pick(rr, team),
      detectionIds: [tag(d)], techniques: d.techniques, domain: d.domain, playbookId: rd.playbookId, outcome: pick(rr, ['Contained, no impact', 'Credentials rotated', 'Device rebuilt', 'Access revoked', 'Config restored']),
      steps: (rd.playbookId ? pb.get(rd.playbookId)!.steps : phases.map(p => ({ phase: p, title: `${p}`, auto: false, system: 'SOC' }))).map((s, k) => ({ ...s, done: true, by: s.auto ? 'Automation' : d.assignee ?? team[0], at: opened + (k + 1) * 20 * MIN })),
      summary: d.summary, impact: 'Closed without customer impact.', assets: [d.asset] }); });

  /* ---- ids, sorted newest first */
  D.sort((a, b) => b.at - a.at);
  const idMap = new Map<string, string>();
  [...D].sort((a, b) => a.at - b.at).forEach((d, i) => { const id = `DET-${String(i + 1).padStart(5, '0')}`; if (d.id) idMap.set(d.id, id); d.id = id; });
  cases.forEach(c => { c.detectionIds = c.detectionIds.map(x => idMap.get(x) ?? x); });
  drift.forEach(x => { if (x.detectionId) x.detectionId = idMap.get(x.detectionId) ?? D.find(d => d.ruleId === 'SR-002' && d.asset === x.asset && Math.abs(d.at - x.at) < MIN)?.id; });
  drift.sort((a, b) => b.at - a.at).forEach((x, i) => { x.id = `DRF-${String(drift.length - i).padStart(4, '0')}`; });
  for (const d of D) if (d.ruleId === 'SR-002' && !drift.some(x => x.detectionId === d.id)) { const x = drift.find(y => !y.authorised && y.asset === d.asset && Math.abs(y.at - d.at) < 2 * MIN); if (x) x.detectionId = d.id; }

  /* ---- the user's moves on top */
  for (const d of D) { const o = ov.det.get(d.id); if (o) Object.assign(d, Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))); }
  for (const c of ov.newCases) { cases.push(structuredClone(c)); c.detectionIds.forEach(id => { const d = D.find(x => x.id === id); if (d) { d.caseId = c.id; d.state = 'Escalated'; } }); }
  for (const c of cases) { const o = ov.cases.get(c.id); if (!o) continue; if (o.phase) c.phase = o.phase; o.done.forEach(i => { if (c.steps[i]) Object.assign(c.steps[i], { done: true, by: c.steps[i].auto ? 'Automation' : team[0], at: now }); }); c.notes = [...c.notes, ...o.notes]; if (o.closed) { c.closed = o.closed; c.outcome = o.outcome; } }
  cases.sort((a, b) => (a.phase === 'Closed' ? 1 : 0) - (b.phase === 'Closed' ? 1 : 0) || SEVS.indexOf(a.severity) - SEVS.indexOf(b.severity) || b.opened - a.opened);

  /* ---- vulnerabilities */
  const advisories: SecAdvisory[] = ADVS.map(a => ({ id: a.id, title: a.title, vendor: a.vendor, product: a.product, kind: a.kind, cvss: a.cvss, vector: `CVSS:4.0/${a.vector}`, epss: a.epss, kev: a.kev, published: now - a.ageD * DAY, fixedIn: a.fixedIn, affected: 0 }));
  const vulns: SecVuln[] = [];
  for (const adv of ADVS) {
    for (const a of [...assets, ...ot]) {
      if (!adv.match(a) || a.fw === adv.fixedIn) continue;
      const rr = mulberry32(seedOf(`vu:${adv.id}:${a.id}`)); if (rr() > (a.old ? Math.min(0.95, adv.p * 1.7) : adv.p)) continue;
      const exposure = a.zone === 'Internet edge' ? 'open' : a.zone === 'Physical security' ? 'small' : 'controlled';
      const ssvc: SecSsvc = adv.kev && (exposure === 'open' || a.crit === 'Crown jewel') ? 'Act' : adv.kev ? 'Attend' : adv.epss >= 0.1 && exposure === 'open' ? 'Attend' : adv.epss >= 0.1 || (adv.cvss >= 9 && a.crit !== 'Standard') ? 'Track*' : 'Track';
      const due = { Act: 7, Attend: 30, 'Track*': 90, Track: 180 }[ssvc] * DAY;
      const o = ov.vuln.get(`${adv.id}:${a.id}`);
      vulns.push({ id: `${adv.id}:${a.id}`, advisoryId: adv.id, title: adv.title, asset: a.name, assetKind: a.kind, neId: a.neId, dcId: a.dcId, zone: a.zone, current: a.fw, fixedIn: adv.fixedIn, cvss: adv.cvss, epss: adv.epss, kev: adv.kev, ssvc,
        due: Math.max(now - 3 * DAY, now - adv.ageD * DAY + due), state: o?.state ?? 'Open', changeId: o?.changeId, note: o?.note });
    }
  }
  advisories.forEach(a => { a.affected = vulns.filter(v => v.advisoryId === a.id).length; });

  /* ---- hardening */
  const baseOf = (a: Asset): string | null => a.kind === 'BMC' ? 'BL-BMC' : ['Server', 'GPU', 'Storage'].includes(a.kind) ? 'BL-LNX' : a.kind === 'Firewall' ? 'BL-FW'
    : /Cisco/i.test(a.vendor) ? (a.kind === 'Router' ? 'BL-XR' : 'BL-NX') : /Juniper/i.test(a.vendor) ? 'BL-JUN' : /Arista/i.test(a.vendor) ? 'BL-EOS' : /NVIDIA|Mellanox/i.test(a.vendor) ? 'BL-NV' : /Nokia/i.test(a.vendor) ? 'BL-SROS' : NET_KINDS.includes(a.kind) ? 'BL-NET' : null;
  const hardening: SecHardening[] = [];
  const heroNe = edgeId(persona, dcAt(1), 1);
  for (const a of assets) {
    const b = baseOf(a); if (!b) continue;
    const ne = a.neId ? db.neById.get(a.neId) : undefined; if (ne?.discovery === 'not-discovered') continue;
    const cks = checksOf(b), rr = mulberry32(seedOf(`hd:${a.id}`));
    const failP = a.old ? 0.22 : a.zone === 'Internet edge' ? 0.05 : 0.08;
    const failed = cks.filter(c => rr() < failP * (c[2] === 'Low' ? 1.6 : c[2] === 'Critical' ? 0.4 : 1)).map(c => c[0]);
    if (a.id === heroNe && !failed.includes('N-04')) failed.push('N-04');
    const w = (sev: SecSev) => ({ Critical: 4, High: 3, Medium: 2, Low: 1 }[sev]);
    const tot = cks.reduce((s, c) => s + w(c[2]), 0), bad = cks.filter(c => failed.includes(c[0])).reduce((s, c) => s + w(c[2]), 0);
    hardening.push({ id: a.id, asset: a.name, assetKind: a.kind, neId: a.neId, dcId: a.dcId, baselineId: b, passed: cks.length - failed.length, total: cks.length, failed, score: Math.round(100 * (1 - bad / tot)), scanned: now - intBetween(rr, 1, 30) * HOUR });
  }
  const baselines: SecBaseline[] = BASELINES.map(b => { const rows = hardening.filter(h => h.baselineId === b.id); const p = rows.reduce((s, h) => s + h.passed, 0), t = rows.reduce((s, h) => s + h.total, 0);
    return { ...b, checks: checksOf(b.id).map(([id, title, severity]) => ({ id, title, severity })), assets: rows.length, passPct: t ? Math.round((100 * p) / t) : 100 }; }).filter(b => b.assets);

  /* ---- OT zones + assets */
  const otAssetsOut: SecOtAsset[] = ot.map(a => ({ id: a.id, dcId: a.dcId, zoneId: `${a.dcId}-${a.zoneId}`, name: a.name, kind: a.kind, vendor: a.vendor, protocols: a.protocols ?? [], firmware: a.fw, units: a.units ?? 1,
    defaultCreds: a.defaultCreds ?? 0, cleartext: (a.protocols ?? []).some(p => /Modbus|BACnet|v2c|RTSP/.test(p)), reachableFromIt: mulberry32(seedOf(`it:${a.id}`))() < (a.kind === 'PDU fleet' || a.kind === 'VMS' ? 0.14 : 0.05),
    lastSeen: now - intBetween(mulberry32(seedOf(`ls:${a.id}`)), 1, 40) * MIN, risk: 'Low' }));
  otAssetsOut.forEach(o => { const v = vulns.filter(x => x.asset === byId.get(o.id)?.name && x.dcId === o.dcId); o.risk = o.defaultCreds && o.reachableFromIt ? 'Critical' : o.defaultCreds || v.some(x => x.ssvc === 'Act') ? 'High' : o.cleartext && o.reachableFromIt ? 'Medium' : 'Low'; });
  const otZones: SecOtZone[] = [];
  for (const d of live) for (const [zid, name, slT] of OT_ZONES) {
    const zs = otAssetsOut.filter(a => a.zoneId === `${d.id}-${zid}`); if (!zs.length) continue;
    const rr = mulberry32(seedOf(`otz:${d.id}:${zid}`));
    const findings: string[] = [];
    const dc = zs.reduce((s, a) => s + a.defaultCreds, 0); if (dc) findings.push(`${dc} controller${dc === 1 ? '' : 's'} with default credentials`);
    const reach = zs.filter(a => a.reachableFromIt).length; if (reach) findings.push(`${reach} reachable from IT networks outside the conduit`);
    const act = vulns.filter(v => v.dcId === d.id && v.zone === 'Facility OT' && zs.some(z => byId.get(z.id)?.name === v.asset) && (v.ssvc === 'Act' || v.ssvc === 'Attend')).length; if (act) findings.push(`${act} firmware finding${act === 1 ? '' : 's'} to act on`);
    const anyAny = rr() < 0.1 ? 1 : 0; if (anyAny) findings.push('1 any-any rule on the IT → OT conduit');
    const slA = Math.max(1, slT - (dc ? 1 : 0) - (reach && slT > 2 ? 1 : 0) - (anyAny ? 1 : 0)) as 1 | 2 | 3 | 4;
    otZones.push({ id: `${d.id}-${zid}`, dcId: d.id, name, systems: zs.map(z => z.kind).filter((x, i, xs) => xs.indexOf(x) === i).join(' · '), slT, slA, assets: zs.reduce((s, a) => s + a.units, 0),
      conduits: [{ to: 'IT management', via: 'OT firewall (FW-OT)', rules: intBetween(rr, 6, 24), open: anyAny }, ...(zid === 'MON' ? [] : [{ to: 'DCIM & monitoring', via: 'Read-only data diode / SNMP proxy', rules: intBetween(rr, 2, 6), open: 0 }])], findings });
  }

  /* ---- data sources: what each sensor should see vs what it sees (devices not discovered send nothing) */
  const net = assets.filter(a => NET_KINDS.includes(a.kind)), hosts = assets.filter(a => ['Server', 'Storage', 'GPU'].includes(a.kind)), bmc = assets.filter(a => a.kind === 'BMC'), gpuHosts = assets.filter(a => a.kind === 'GPU');
  const undiscovered = (a: Asset) => !!a.neId && db.neById.get(a.neId)?.discovery === 'not-discovered';
  const cov = (xs: Asset[], extraMissP = 0, key = '') => { let c = 0; xs.forEach(a => { if (!undiscovered(a) && mulberry32(seedOf(`cov:${key}:${a.id}`))() >= extraMissP) c++; }); return c; };
  const otUnits = ot.reduce((s, a) => s + (a.units ?? 1), 0), doors = live.reduce((s, d) => s + (siteSafety(db, d.id)?.access.length ?? 0), 0);
  const otSites = live.filter(d => mulberry32(seedOf(`otsite:${d.id}`))() > 0.12).length;
  const S = (id: string, name: string, sensor: string, domain: SecDomain, ocsf: string[], table: string, covered: number, expected: number, epsPer: number, state: SecSource['state'] = 'Healthy', gap?: string, coldDays = 365): SecSource => {
    const eps = Math.round(covered * epsPer);
    return { id, name, sensor, collector: SENSORS.find(s => s.id === sensor)!.collector, domain, ocsf, table, covered, expected, eps, gbDay: Math.round(eps * 86400 * 650 / 1e9 * 10) / 10, hotDays: 30, coldDays, lastEvent: now - (state === 'Silent' ? 7 * HOUR : state === 'Lagging' ? 14 * MIN : intBetween(mulberry32(seedOf(`le:${id}`)), 2, 40) * 1000), state, gap };
  };
  const netCov = cov(net, 0, 'tac'), bmcCov = cov(bmc, 0.04, 'rf'), hostCov = cov(hosts, 0.015, 'osq');
  const sources: SecSource[] = [
    S('SRC-01', 'Device logins & commands', 'tacacs', 'Network', ['Authentication [3002]', 'API Activity [6003]'], 'sec.ocsf_authentication', netCov, net.length, 0.6, 'Healthy', net.length > netCov ? `${net.length - netCov} network devices not discovered yet send no AAA records` : undefined),
    S('SRC-02', 'Network device syslog', 'netsyslog', 'Network', ['Device Config State [5002]', 'Network Activity [4001]'], 'sec.ocsf_device_config_state', netCov, net.length, 2.4),
    S('SRC-03', 'Config backups & drift', 'configs', 'Network', ['Device Config State [5002]'], 'sec.ocsf_device_config_state', cov(net, 0.03, 'ox'), net.length, 0.01, 'Healthy', 'Devices without a nightly backup cannot be checked for drift'),
    S('SRC-04', 'BMC events (Redfish)', 'redfish', 'Management', ['Authentication [3002]', 'Device Config State [5002]'], 'sec.ocsf_authentication', bmcCov, bmc.length, 0.05, 'Healthy', bmc.length > bmcCov ? `${bmc.length - bmcCov} BMCs have no event subscription` : undefined),
    S('SRC-05', 'Host telemetry (osquery)', 'osquery', 'Compute', ['Process Activity [1007]', 'File System Activity [1001]', 'Account Change [3001]', 'Device Inventory Info [5001]'], 'sec.ocsf_process_activity', hostCov, hosts.length, 4.5),
    ...(gpuHosts.length ? [S('SRC-06', 'Kubernetes runtime (Falco)', 'falco', 'Kubernetes', ['Process Activity [1007]', 'Network Activity [4001]'], 'sec.ocsf_process_activity', cov(gpuHosts, 0.01, 'fal'), gpuHosts.length, 1.2),
      S('SRC-07', 'Kubernetes audit log', 'k8saudit', 'Kubernetes', ['API Activity [6003]'], 'sec.ocsf_api_activity', db.gpu!.clusters.length, db.gpu!.clusters.length, 300)] : []),
    S('SRC-08', 'Vulnerability scans (Trivy)', 'trivy', 'Compute', ['Vulnerability Finding [2002]'], 'sec.ocsf_vulnerability_finding', hostCov, hosts.length, 0.001, 'Healthy', undefined, 730),
    S('SRC-09', 'IDS alerts (Suricata)', 'suricata', 'Network', ['Detection Finding [2004]', 'Network Activity [4001]'], 'sec.ocsf_network_activity', live.length * 2, live.length * 2, 40),
    S('SRC-10', 'Network metadata (Zeek)', 'zeek', 'Network', ['Network Activity [4001]', 'DNS Activity [4003]', 'HTTP Activity [4002]'], 'sec.ocsf_network_activity', live.length * 2, live.length * 2, 900),
    S('SRC-11', 'Flow records (NetFlow / IPFIX)', 'netflow', 'Network', ['Network Activity [4001]'], 'sec.ocsf_network_activity', live.length * 2 - 1, live.length * 2, 4000, 'Lagging', `The flow collector at ${live[live.length - 1]?.id ?? ''} is 14 min behind`, 90),
    S('SRC-12', 'Facility OT sensor', 'ot', 'Facility OT', ['Network Activity [4001]', 'Device Config State [5002]', 'Authentication [3002]'], 'sec.ocsf_network_activity', Math.round(otUnits * otSites / live.length), otUnits, 0.3, 'Healthy', otSites < live.length ? `${live.length - otSites} sites have no OT sensor on the facility network yet` : undefined),
    S('SRC-13', 'Access control (PACS)', 'pacs', 'Physical', ['Authentication [3002] + physical_access extension'], 'sec.ocsf_physical_access', doors, doors, 0.02, 'Healthy', undefined, 365),
    S('SRC-14', 'CCTV analytics (VMS)', 'vms', 'Physical', ['Detection Finding [2004]'], 'sec.ocsf_detection_finding', live.length - 1, live.length, 0.5, 'Silent', `The VMS webhook at ${live[Math.min(5, live.length - 1)]?.id ?? ''} stopped 7 h ago`, 90)
  ];

  /* ---- rules: hits and outcomes in the last 7 days */
  const outRules: SecRule[] = rules.map(rd => {
    const h7 = D.filter(d => d.ruleId === rd.id && d.at > now - 7 * DAY);
    const on = ov.rules.get(rd.id) ?? true;
    return { id: rd.id, title: rd.title, description: rd.description, domain: rd.domain, sensors: rd.sensors, matrix: rd.techniques.length ? (rd.techniques[0].startsWith('T0') ? 'ICS' : 'Enterprise') : 'Physical', techniques: rd.techniques, control: rd.control, level: rd.level, status: rd.status,
      context: !!rd.context, enabled: on, sigma: rd.sigma ?? sigmaOf(rd), sql: rd.sql, version: rd.version ?? 1, custom: !!rd.custom, updated: rd.updated, by: rd.by, ocsf: rd.ocsf, hits7d: h7.length, tp7d: h7.filter(d => d.disposition === 'True positive' || d.caseId).length, fp7d: h7.filter(d => d.disposition === 'False positive').length, playbookId: rd.playbookId };
  });
  const techniques: SecTechnique[] = TECH.map(([id, name, tactic, matrix]) => ({ id, name, tactic, matrix, rules: outRules.filter(r => r.enabled && r.techniques.includes(id)).length, hits: D.filter(d => d.techniques.includes(id)).length }));

  /* ---- playbooks: runs = cases + detections they ran on in 30 days */
  const playbooks: SecPlaybook[] = PLAYBOOKS.map(p => {
    const runs = p.id === 'PB-01' ? D.length : cases.filter(c => c.playbookId === p.id).length + D.filter(d => !d.caseId && ruleBy.get(d.ruleId)?.playbookId === p.id && d.state !== 'New').length;
    return { ...p, runs30d: runs, autoPct: Math.round((100 * p.steps.filter(s => s.auto).length) / p.steps.length), medianMin: p.id === 'PB-01' ? 1 : 12 + p.steps.filter(s => !s.auto).length * 18 };
  });

  /* ---- physical layers per site */
  const physical: SecPhysSite[] = live.map(d => {
    const acc = access.get(d.id)!, sf = siteSafety(db, d.id)!;
    const ex = acc?.exceptions ?? [];
    const kindOf = (k: string) => sf.access.filter(a => a.kind === k);
    const layer = (doorsK: string[], ...kinds: string[]): SecPhysLayer['state'] => {
      const ds = sf.access.filter(a => doorsK.includes(a.kind));
      if (ds.some(a => a.state === 'Forced') || ex.some(e => e.status !== 'Closed' && e.severity === 'High' && ds.some(x => x.id === e.doorId))) return 'Breach';
      if (ds.some(a => a.state === 'Held open') || ex.some(e => e.status !== 'Closed' && kinds.includes(e.kind) && ds.some(x => x.id === e.doorId))) return 'Degraded';
      return 'OK';
    };
    const t2 = d.tier === 'Tier II';
    const layers: SecPhysLayer[] = [
      { layer: 'Perimeter', controls: 'Fence, vehicle barrier, gatehouse, perimeter CCTV, guard patrols', protectionClass: 1, state: 'OK', note: `${acc?.review.byType.find(t => t.type === 'Security')?.n ?? 0} security staff on the roster` },
      { layer: 'Building', controls: `${kindOf('Building entry').length ? 'Card + biometric entry' : 'Card entry'}, ${t2 ? 'turnstile' : 'mantrap with anti-tailgating'}, visitor registration`, protectionClass: 2, state: layer(['Building entry'], 'Tailgating', 'Unescorted visitor', 'Repeated denials'), note: t2 ? 'Tier II: turnstile, no mantrap' : 'Mantrap at the main entry' },
      { layer: 'Data hall', controls: 'Card + PIN, anti-passback, CCTV on every aisle end', protectionClass: 3, state: layer(['Data hall door', 'Plant room door'], 'Door held open', 'Anti-passback', 'After-hours entry'), note: `${kindOf('Data hall door').length + kindOf('Plant room door').length} doors` },
      { layer: 'Cage', controls: kindOf('Cage door').length ? 'Tenant cage doors, card + biometric' : 'Meet-me room door, card + biometric', protectionClass: 4, state: layer(['Cage door', 'Meet-me room door'], 'Door held open'), note: kindOf('Cage door').length ? `${kindOf('Cage door').length} cage doors` : 'No tenant cages' },
      { layer: 'Rack', controls: 'Electronic rack locks on critical and tenant racks, door sensors', protectionClass: 4, state: 'OK', note: 'Lock events in the PACS log' }
    ];
    return { dcId: d.id, live: true, layers, exceptions: ex.length, open: ex.filter(e => e.status !== 'Closed').length, high: ex.filter(e => e.status !== 'Closed' && e.severity === 'High').length,
      correlated: D.filter(x => x.dcId === d.id && x.domain === 'Cross-domain').length, badges: acc?.review.badges ?? 0, unused90: acc?.review.unused90 ?? 0, expiredActive: acc?.review.expiredActive ?? 0, nextReview: acc?.review.nextReview ?? now, cctvDays: 90 };
  });

  /* ---- sites */
  const sites: SecSite[] = live.map(d => {
    const ds = D.filter(x => x.dcId === d.id && x.state !== 'Closed');
    const crit = ds.filter(x => x.severity === 'Critical').length, high = ds.filter(x => x.severity === 'High').length;
    const act = vulns.filter(v => v.dcId === d.id && v.ssvc === 'Act' && v.state === 'Open').length;
    const un = drift.filter(x => x.dcId === d.id && !x.authorised && x.at > now - 7 * DAY).length;
    const ph = ds.filter(x => x.domain === 'Physical').length;
    const hs = hardening.filter(h => h.dcId === d.id); const hard = hs.length ? Math.round(hs.reduce((s, h) => s + h.score, 0) / hs.length) : 100;
    const siteAssetsN = (bySite.get(d.id) ?? []).filter(a => a.domain !== 'Facility OT'); const coverage = siteAssetsN.length ? Math.round((100 * siteAssetsN.filter(a => !undiscovered(a)).length) / siteAssetsN.length) : 100;
    const openCases = cases.filter(c => c.dcId === d.id && c.phase !== 'Closed').length;
    const score = Math.max(0, Math.min(100, Math.round(100 - crit * 9 - high * 3 - Math.min(14, act * 1.2) - un * 6 - ph * 1.5 - (100 - hard) * 0.35 - (100 - coverage) * 0.3)));
    return { dcId: d.id, score, open: ds.length, critical: crit, cases: openCases, act, unauthorised: un, physical: ph, hardening: hard, coverage };
  }).sort((a, b) => a.score - b.score);

  /* ---- metrics */
  const inWin = (c: SecCase) => c.opened > now - 14 * DAY;
  const cs = cases.filter(inWin);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const closedD = D.filter(d => d.state === 'Closed');
  const stepsDone = cases.flatMap(c => c.steps.filter(s => s.done));
  const day0 = Math.floor(now / DAY) * DAY;
  const trend = Array.from({ length: 14 }, (_, i) => { const from = day0 - (13 - i) * DAY, to = from + DAY; const ds = D.filter(d => d.at >= from && d.at < to);
    return { day: from, network: ds.filter(d => ['Network', 'Management', 'Cross-domain'].includes(d.domain)).length, compute: ds.filter(d => d.domain === 'Compute' || d.domain === 'Kubernetes').length, ot: ds.filter(d => d.domain === 'Facility OT').length, physical: ds.filter(d => d.domain === 'Physical').length }; });
  const metrics = { mttdMin: Math.round(avg(cs.map(c => (c.opened - c.firstEvent) / MIN))), mttaMin: Math.round(avg(cs.map(c => (c.acked - c.opened) / MIN))), mttrH: Math.round(avg(cs.filter(c => c.closed).map(c => (c.closed! - c.opened) / HOUR)) * 10) / 10,
    fpPct: closedD.length ? Math.round((100 * closedD.filter(d => d.disposition === 'False positive').length) / closedD.length) : 0, autoPct: stepsDone.length ? Math.round((100 * stepsDone.filter(s => s.auto).length) / stepsDone.length) : 0, closed30d: cases.filter(c => c.phase === 'Closed').length, trend };

  /* ---- NIST CSF 2.0 */
  const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 100);
  const allAssets = [...assets.filter(a => a.domain !== 'Facility OT')];
  const inv = pct(allAssets.filter(a => !undiscovered(a)).length, allAssets.length);
  const reviewsDue = physical.filter(p => p.nextReview < now).length, expired = physical.reduce((s, p) => s + p.expiredActive, 0);
  const hardAvg = hardening.length ? Math.round(hardening.reduce((s, h) => s + h.score, 0) / hardening.length) : 100;
  const actOpen = vulns.filter(v => v.ssvc === 'Act' && v.state === 'Open').length;
  const defCreds = ot.reduce((s, a) => s + (a.defaultCreds ?? 0), 0);
  const techCov = pct(techniques.filter(t => t.rules > 0).length, techniques.length);
  const srcHealthy = pct(sources.reduce((s, x) => s + x.covered, 0), sources.reduce((s, x) => s + x.expected, 0));
  const openCases = cases.filter(c => c.phase !== 'Closed'), inSla = openCases.filter(c => now <= c.slaDue).length;
  const backups = pct(sources.find(s => s.id === 'SRC-03')!.covered, net.length || 1);
  const csf: SecCsf[] = [
    { fn: 'Govern', score: Math.max(0, 100 - reviewsDue * 5 - Math.min(20, expired)), basis: 'Roles, policy and supply-chain oversight: access reviews on time, no expired badges still active, rules owned and versioned.',
      items: [{ label: 'Access reviews overdue', value: `${reviewsDue} of ${physical.length} sites`, bad: reviewsDue > 0 }, { label: 'Expired badges still active', value: String(expired), bad: expired > 0 }, { label: 'Detection rules under version control', value: `${outRules.length} (Sigma)` }] },
    { fn: 'Identify', score: Math.round((inv + 100) / 2), basis: 'Asset management: every device, BMC and facility controller known, located and owned (DCIM, IPAM, OT inventory).',
      items: [{ label: 'IT assets known to the SOC', value: `${inv}%`, bad: inv < 90 }, { label: 'Facility controllers inventoried', value: `${otUnits} units` }, { label: 'Crown-jewel assets', value: String(assets.filter(a => a.crit === 'Crown jewel').length) }] },
    { fn: 'Protect', score: Math.max(0, Math.round(hardAvg - Math.min(25, actOpen * 0.4) - Math.min(10, defCreds * 0.3))), basis: 'Hardening against CIS / STIG baselines, vulnerabilities fixed by SSVC priority, no default credentials on OT.',
      items: [{ label: 'Hardening score', value: `${hardAvg}%`, bad: hardAvg < 85 }, { label: 'Vulnerabilities to act on (SSVC Act)', value: String(actOpen), bad: actOpen > 0 }, { label: 'OT controllers with default credentials', value: String(defCreds), bad: defCreds > 0 }] },
    { fn: 'Detect', score: Math.round((techCov + srcHealthy) / 2), basis: 'Continuous monitoring: ATT&CK techniques covered by an enabled rule and telemetry actually arriving from each source.',
      items: [{ label: 'ATT&CK techniques covered', value: `${techCov}%`, bad: techCov < 80 }, { label: 'Telemetry coverage', value: `${srcHealthy}%`, bad: srcHealthy < 90 }, { label: 'Sources lagging or silent', value: String(sources.filter(s => s.state !== 'Healthy').length), bad: sources.some(s => s.state !== 'Healthy') }] },
    { fn: 'Respond', score: openCases.length ? Math.round((100 * inSla) / openCases.length * 0.7 + Math.max(0, 100 - metrics.mttaMin) * 0.3) : 100, basis: 'Incident management per NIST SP 800-61: cases acknowledged and moved on within their SLA, playbooks automating the first steps.',
      items: [{ label: 'Open cases within SLA', value: `${inSla} of ${openCases.length}`, bad: inSla < openCases.length }, { label: 'Mean time to acknowledge', value: `${metrics.mttaMin} min` }, { label: 'Steps done by automation', value: `${metrics.autoPct}%` }] },
    { fn: 'Recover', score: Math.round((backups + 92) / 2), basis: 'Recovery planning: approved configs backed up nightly and restore-tested, golden images for hosts, setpoint baselines for the plant.',
      items: [{ label: 'Network configs backed up', value: `${backups}%`, bad: backups < 95 }, { label: 'Golden-image restore test', value: 'Passed 12 days ago' }, { label: 'BMS setpoint baseline', value: `${live.length} sites` }] }
  ];

  /* hardening rows only for assets that fail a check (the baselines carry the totals) */
  return { now, sensors: SENSORS, sites, detections: D, cases, playbooks, rules: outRules, techniques, advisories, vulns, baselines, hardening: hardening.filter(h => h.failed.length), drift, otZones, otAssets: otAssetsOut, sources, physical, csf, metrics, team };
}
const SEVS: SecSev[] = ['Critical', 'High', 'Medium', 'Low'];
const hhmm = (t: number) => new Date(t).toISOString().slice(11, 16);

function ocsfEvent(d: SecDetection, rd: RuleDef): Record<string, unknown> {
  const [name, uid] = rd.ocsf.replace(']', '').split(' [');
  return { class_uid: Number(uid), class_name: name, time: d.at, severity: d.severity, count: d.count, metadata: { product: { name: SENSORS.find(s => s.id === d.sensor)?.name ?? d.sensor }, log_source: `${rd.product}/${rd.service}` },
    src_endpoint: d.srcIp ? { ip: d.srcIp } : undefined, dst_endpoint: { ip: d.dstIp, hostname: d.asset, type: d.assetKind }, actor: d.actor ? { user: { name: d.actor } } : undefined,
    finding_info: { title: rd.title, analytic: { uid: rd.id, type: 'Rule' }, attacks: d.techniques.map(t => ({ technique: { uid: t } })) },
    enrichments: [{ name: 'datacenter', value: d.dcId }, { name: 'room', value: d.context.room }, { name: 'rack', value: d.context.rack }, { name: 'owner', value: d.context.owner }, { name: 'change_request', value: d.context.change?.id ?? null }] };
}
function sigmaOf(rd: RuleDef) {
  const tags = rd.techniques.map(t => `  - attack.${t.toLowerCase()}`).concat(rd.control ? [`  - iso27001.${rd.control.replace('ISO 27001 ', '').toLowerCase()}`] : []);
  return `title: ${rd.title}\nid: ${uuidOf(rd.id)}\nstatus: ${rd.status.toLowerCase()}\ndescription: ${rd.description}\nlogsource:\n  product: ${rd.product}\n  service: ${rd.service}\ndetection:\n  selection:\n${rd.sel.map(s => `    ${s}`).join('\n')}\n  condition: ${rd.cond}\nfalsepositives:\n  - ${rd.context ? 'Work under an emergency change raised after the fact' : 'Administrative activity by known operators'}\nlevel: ${rd.level.toLowerCase()}\ntags:\n${tags.join('\n') || '  - datacenter.physical'}`;
}
const uuidOf = (s: string) => { const h = (k: number) => (seedOf(`${s}:${k}`) >>> 0).toString(16).padStart(8, '0'); const a = h(1) + h(2) + h(3) + h(4); return `${a.slice(0, 8)}-${a.slice(8, 12)}-4${a.slice(13, 16)}-a${a.slice(17, 20)}-${a.slice(20, 32)}`; };

/* ------------------------------------------------------------------ the user's moves */
export function secTriage(db: Db, id: string, action: 'assign' | 'investigate' | 'fp' | 'benign' | 'tp', by: string) {
  const v = secopsView(db); const d = v.detections.find(x => x.id === id); if (!d) throw new Error(`${id} not found`);
  const o = ov.det.get(id) ?? {};
  if (action === 'assign') { o.assignee = by; if (d.state === 'New') o.state = 'Investigating'; }
  if (action === 'investigate') { o.state = 'Investigating'; o.assignee = o.assignee ?? d.assignee ?? by; }
  if (action === 'fp' || action === 'benign' || action === 'tp') { if (d.caseId) throw new Error(`${id} belongs to ${d.caseId}; close the case instead`); o.state = 'Closed'; o.disposition = action === 'fp' ? 'False positive' : action === 'benign' ? 'Benign' : 'True positive'; o.assignee = o.assignee ?? d.assignee ?? by; }
  ov.det.set(id, o); cache = null;
}
export function secEscalate(db: Db, ids: string[], by: string): string {
  const v = secopsView(db); const ds = ids.map(id => v.detections.find(x => x.id === id)).filter((x): x is SecDetection => !!x);
  if (!ds.length) throw new Error('Pick at least one detection');
  const taken = ds.find(d => d.caseId); if (taken) throw new Error(`${taken.id} is already in ${taken.caseId}`);
  const top = [...ds].sort((a, b) => SEVS.indexOf(a.severity) - SEVS.indexOf(b.severity))[0];
  const n = v.cases.reduce((m, c) => Math.max(m, Number(c.id.slice(4))), 0) + 1;
  const id = `SEC-${String(n).padStart(4, '0')}`;
  const rd = RULES.find(r => r.id === top.ruleId);
  const pbk = rd?.playbookId ? PLAYBOOKS.find(p => p.id === rd.playbookId) : undefined;
  const sla = { Critical: 4, High: 24, Medium: 72, Low: 168 }[top.severity] * HOUR;
  ov.newCases.push({ id, title: `${top.title}: ${top.asset}`, severity: top.severity, phase: 'Detection & analysis', dcId: top.dcId, opened: db.now, firstEvent: Math.min(...ds.map(d => d.at)), acked: db.now, owner: by,
    detectionIds: ds.map(d => d.id), techniques: [...new Set(ds.flatMap(d => d.techniques))], domain: top.domain, playbookId: pbk?.id,
    steps: (pbk?.steps ?? [{ phase: 'Detection & analysis', title: 'Analyse the detections and scope the case', auto: false, system: 'SOC' }, { phase: 'Containment', title: 'Contain the affected assets', auto: false, system: 'SOC' }, { phase: 'Eradication', title: 'Remove the cause', auto: false, system: 'SOC' }, { phase: 'Recovery', title: 'Return the assets to service', auto: false, system: 'SOC' }, { phase: 'Post-incident', title: 'Lessons learned', auto: false, system: 'SOC' }]).map(s => ({ ...s, done: false })),
    notes: [{ at: db.now, by, text: `Escalated from ${ds.map(d => d.id).join(', ')}` }], summary: ds.map(d => d.summary).join('. '), impact: 'Being assessed.', assets: [...new Set(ds.map(d => d.asset))], slaDue: db.now + sla });
  cache = null; return id;
}
const PHASES: SecPhase[] = ['Detection & analysis', 'Containment', 'Eradication', 'Recovery', 'Post-incident', 'Closed'];
export function secCaseAdvance(db: Db, id: string, outcome?: string) {
  const c = secopsView(db).cases.find(x => x.id === id); if (!c) throw new Error(`${id} not found`);
  const i = PHASES.indexOf(c.phase); if (i >= PHASES.length - 1) throw new Error(`${id} is closed`);
  const open = c.steps.filter(s => s.phase === c.phase && !s.done); if (open.length) throw new Error(`${open.length} step${open.length === 1 ? '' : 's'} of ${c.phase} still open`);
  const o = ov.cases.get(id) ?? { done: new Set<number>(), notes: [] }; o.phase = PHASES[i + 1];
  if (o.phase === 'Closed') { o.closed = db.now; o.outcome = outcome || 'Resolved'; }
  o.notes.push({ at: db.now, by: 'You', text: `Moved to ${o.phase}` }); ov.cases.set(id, o); cache = null;
}
export function secCaseStep(db: Db, id: string, idx: number) {
  const c = secopsView(db).cases.find(x => x.id === id); if (!c) throw new Error(`${id} not found`);
  const s = c.steps[idx]; if (!s) throw new Error('No such step'); if (s.done) return;
  const o = ov.cases.get(id) ?? { done: new Set<number>(), notes: [] }; o.done.add(idx); o.notes.push({ at: db.now, by: s.auto ? 'Automation' : 'You', text: `${s.auto ? 'Ran' : 'Done'}: ${s.title}` }); ov.cases.set(id, o); cache = null;
}
export function secCaseNote(db: Db, id: string, text: string) {
  if (!text.trim()) throw new Error('Write a note first');
  const o = ov.cases.get(id) ?? { done: new Set<number>(), notes: [] }; o.notes.push({ at: db.now, by: 'You', text: text.trim() }); ov.cases.set(id, o); cache = null;
}
export function secVulnSet(db: Db, id: string, state: SecVuln['state'], note?: string) {
  const v = secopsView(db).vulns.find(x => x.id === id); if (!v) throw new Error(`${id} not found`);
  if (state === 'Risk accepted' && !note?.trim()) throw new Error('A risk acceptance needs a reason');
  ov.vuln.set(id, { state, note, changeId: state === 'Remediation planned' ? `CHG-FW-${String(seedOf(id) % 9000 + 1000)}` : undefined }); cache = null;
}
export function secRuleToggle(_db: Db, id: string, on: boolean) { if (!RULES.some(r => r.id === id)) throw new Error(`${id} not found`); ov.rules.set(id, on); cache = null; }

/* create / edit a detection rule: validated like a rule repository would (unique title, at least one sensor, techniques in scope,
   Sigma source with title / logsource / detection / condition); edits bump the version */
export function secRuleSave(db: Db, x: RuleEdit, by: string, id?: string): string {
  const v = secopsView(db);
  if (!x.title.trim()) throw new Error('Give the rule a title');
  if (v.rules.some(r => r.id !== id && r.title.toLowerCase() === x.title.trim().toLowerCase())) throw new Error('Another rule has this title');
  if (!x.sensors.length) throw new Error('Pick at least one sensor the rule reads');
  const bad = x.techniques.filter(t => !TECH.some(k => k[0] === t)); if (bad.length) throw new Error(`Not a technique in scope: ${bad.join(', ')}`);
  if (x.domain !== 'Physical' && !x.techniques.length) throw new Error('Map the rule to at least one ATT&CK technique');
  for (const k of ['title:', 'logsource:', 'detection:', 'condition:']) if (!x.sigma.includes(k)) throw new Error(`The Sigma source needs a "${k}" line`);
  if (!x.sql.trim()) throw new Error('Add the ClickHouse query the rule compiles to');
  const clean: RuleEdit = { ...x, title: x.title.trim(), description: x.description.trim() };
  if (id) {
    const cur = v.rules.find(r => r.id === id); if (!cur) throw new Error(`${id} not found`);
    const nr = ov.newRules.find(r => r.id === id);
    if (nr) Object.assign(nr, clean, { version: (nr.version ?? 1) + 1, updated: db.now, by });
    else ov.ruleEdits.set(id, { ...clean, ...({ version: cur.version + 1, updated: db.now, by } as object) } as RuleEdit);
    cache = null; return id;
  }
  const n = Math.max(...v.rules.map(r => Number(r.id.slice(3)) || 0)) + 1;
  const nid = `SR-${String(Math.max(100, n)).padStart(3, '0')}`;
  ov.newRules.push({ id: nid, ...clean, kinds: [], rate: 0, ocsf: 'Detection Finding [2004]', product: 'custom', service: 'custom', sel: [], cond: '', custom: true, version: 1, updated: db.now, by });
  cache = null; return nid;
}
export function secRuleDelete(_db: Db, id: string) {
  const i = ov.newRules.findIndex(r => r.id === id);
  if (i < 0) throw new Error('Only rules written here can be deleted; disable a built-in rule instead');
  ov.newRules.splice(i, 1); ov.rules.delete(id); cache = null;
}

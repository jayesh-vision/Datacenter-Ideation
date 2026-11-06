"""SynapseDC DC-STORE physical schema generator (MySQL 8.0+).

Source of truth for the tables: BRD 10.4 (docs/SynapseDC-BRD.md). Field lists follow the prototype's types
(app/src/planner/p2b/types.ts, app/src/api/types.ts, app/src/lib/gpuSpec.ts, app/src/mock/*).
Conventions: the organisation's MySQL guidelines (SNAKE_UPPER_CASE, singular table names, UNSIGNED integer keys,
TINYINT(1) booleans, ENUM for small fixed sets, DECIMAL for money, NOT NULL + DEFAULT, explicit FOREIGN KEYs,
indexed FK columns, a comment on every table and column). No AUD tables: the platform keeps the audit trail.

Run:  python3 scripts/db/build_schema.py
Out:  docs/database/synapsedc_dc_store.sql  (DDL)
      docs/database/synapsedc_dc_store.md   (data dictionary)
"""
import os, re, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_SQL = os.path.join(ROOT, 'docs', 'database', 'synapsedc_dc_store.sql')
OUT_MD = os.path.join(ROOT, 'docs', 'database', 'synapsedc_dc_store.md')
UPDATED = '2026-11-06'

# ---------------------------------------------------------------- shared types (one type per concept)
ASCII = 'CHARACTER SET ascii COLLATE ascii_bin'
EXT_ID = f'VARCHAR(64) {ASCII}'      # id of a record owned by a platform module (Inventory, ITSM, BSS ...)
USER_ID = f'VARCHAR(64) {ASCII}'     # Platform Engineering user id
CODE = f'VARCHAR(32) {ASCII}'        # business code shown to users (PLN-0001, MAC-A01 ...)
KEY = f'VARCHAR(64) {ASCII}'         # machine key (input key, rule check key, site type key)
CURRENCY = f'CHAR(3) {ASCII}'        # ISO 4217
NAME = 'VARCHAR(200)'
LABEL = 'VARCHAR(100)'
SHORT = 'VARCHAR(50)'
TEXT1K = 'VARCHAR(1000)'
TEXT2K = 'VARCHAR(2000)'
MONEY = 'DECIMAL(16,2)'
RATE = 'DECIMAL(12,5)'               # price per kWh / per kW-month
KW = 'DECIMAL(12,3)'
PCT = 'DECIMAL(5,2)'
NUM = 'DECIMAL(20,6)'                # generic planner number
TS = 'DATETIME(3)'                   # UTC
DATE = 'DATE'
BOOL = 'TINYINT(1)'
LAT = 'DECIMAL(9,6)'
LNG = 'DECIMAL(9,6)'


def enum(*v):
    return 'ENUM(' + ','.join("'" + x.replace("'", "''") + "'" for x in v) + ')'


PLAN_SCOPE = enum('rack', 'pod', 'hall', 'retrofit', 'plant', 'network', 'expansion', 'new-dc', 'portfolio', 'migration', 'edge',
                  'server-refresh', 'network-refresh', 'rack-replace')
ASPECT = enum('space', 'power', 'cooling', 'network', 'it', 'fire', 'security', 'sustainability', 'resilience', 'operations', 'supply',
              'schedule', 'finance', 'compliance', 'commissioning', 'migration', 'risk')
PLAN_STATUS = enum('Draft', 'In review', 'Approved', 'Executing', 'Completed', 'Rejected', 'On hold', 'Cancelled')
VALUE_SOURCE = enum('user', 'requirement', 'template', 'benchmark', 'actual', 'document', 'ai')
VALUE_TYPE = enum('number', 'text', 'select', 'bool')
CLIMATE = enum('cold', 'temperate', 'hot-dry', 'hot-humid')
COOLING_TYPE = enum('air-crah', 'air-economiser', 'chilled-water', 'in-row', 'rear-door', 'liquid-to-chip', 'immersion')
TIER = enum('Tier I', 'Tier II', 'Tier III', 'Tier IV')
LMH = enum('Low', 'Medium', 'High')
BIZ_MODEL = enum('colocation', 'neocloud', 'cloud', 'enterprise', 'network')
MODULE = enum('INV', 'IPL', 'IPM', 'ITSM', 'ALR', 'BSS', 'PRJ', 'SCM', 'SOC', 'PEN', 'OAP', 'IHB', 'AIF')
FEED_SIDE = enum('A', 'B')
VERSION_STATUS = enum('Draft', 'Awaiting approval', 'Published', 'Superseded', 'Rejected', 'Discarded')

# ---------------------------------------------------------------- model
TABLES, ORDER = {}, []


class Col:
    def __init__(self, name, typ, null=False, default=None, comment='', extra=''):
        self.name, self.typ, self.null, self.default, self.comment, self.extra = name, typ, null, default, comment, extra


def c(name, typ, comment, null=False, default=None, extra=''):
    return Col(name, typ, null, default, comment, extra)


def n(name, typ, comment, default=None):
    """nullable column"""
    return Col(name, typ, True, default, comment)


def table(name, comment, cols, *, pk='BIGINT UNSIGNED', domain='', related='', uniques=(), indexes=(), checks=(), fks=(),
          site=False, std=True):
    """fks: (column, ref_table, on_delete[, ref_column]); the FK column type is taken from the referenced PK when the column
    is listed as ('FK', name, ref_table, comment, null)."""
    t = dict(name=name, comment=comment, pk=pk, domain=domain, related=related, cols=[], uniques=list(uniques), indexes=list(indexes),
             checks=list(checks), fks=list(fks), site=site)
    t['cols'].append(c(f'{name}_ID', f'{pk} AUTO_INCREMENT', f'Surrogate primary key of {name}'))
    if std:
        t['cols'].append(c('TENANT_ID', EXT_ID, 'Operator (tenant) id from Platform Engineering; every query is scoped by it'))
    if site:
        t['cols'].append(c('INV_SITE_ID', EXT_ID, 'Datacenter (site) id in Plan to Build Inventory; row access follows the user\'s site scope'))
    for col in cols:
        if isinstance(col, tuple):  # ('FK', column, ref_table, comment, nullable, on_delete)
            _, cname, ref, cm, nullable, od = col
            rtyp = TABLES[ref]['pk'] if ref in TABLES else PENDING_PK[ref]
            t['cols'].append(Col(cname, rtyp, nullable, None, cm))
            t['fks'].append((cname, ref, od))
        else:
            t['cols'].append(col)
    if std:
        t['cols'] += [c('CREATED_AT', TS, 'Row created (UTC)', default='CURRENT_TIMESTAMP(3)'),
                      c('CREATED_BY', USER_ID, 'User id that created the row (Platform Engineering)'),
                      c('UPDATED_AT', TS, 'Row last changed (UTC)', default='CURRENT_TIMESTAMP(3)', extra='ON UPDATE CURRENT_TIMESTAMP(3)'),
                      c('UPDATED_BY', USER_ID, 'User id that last changed the row (Platform Engineering)')]
    TABLES[name] = t
    ORDER.append(name)
    return t


def fk(col, ref, comment, null=False, od='RESTRICT'):
    return ('FK', col, ref, comment, null, od)


# Primary-key types of every table, so foreign keys can be declared before the referenced table is generated.
PENDING_PK = {}
SMALL = 'SMALLINT UNSIGNED'
INT = 'INT UNSIGNED'
BIG = 'BIGINT UNSIGNED'
for _t, _p in {
    'BUSINESS_MODEL': SMALL, 'GEOGRAPHY': SMALL, 'GEOGRAPHY_REGION': INT, 'LOOKUP_LIST': SMALL, 'GPU_MODEL': SMALL,
    'POWER_CONTRACT': INT, 'PLAN_TEMPLATE': INT, 'PLAN_TEMPLATE_VERSION': INT, 'PLAN_TEMPLATE_INPUT': INT, 'BENCHMARK_MEASURE': SMALL,
    'BENCHMARK': INT, 'PLAN': BIG, 'PLAN_PHASE': BIG, 'PLAN_SCENARIO': BIG, 'PLAN_APPROVAL_ROUND': BIG, 'PLAN_APPROVAL': BIG,
    'APPROVAL_DELEGATION': INT, 'PLAN_WAVE': BIG, 'PLAN_PLANT_LINE': BIG, 'PLAN_CUT_IN_STEP': BIG, 'PLAN_NETWORK_PATH': BIG,
    'PLAN_CONSENT': BIG, 'PLAN_PLACEMENT_RACK': BIG, 'PLAN_EXECUTION': BIG, 'PLAN_CLOSEOUT': BIG, 'PLAN_REVIEW': BIG,
    'PLAN_REVIEW_COMMENT': BIG, 'MACD_CATALOGUE_ITEM': INT, 'MACD_REQUEST': BIG, 'COMPLIANCE_POLICY': INT,
    'COMPLIANCE_POLICY_VERSION': INT, 'COMPLIANCE_FRAMEWORK': SMALL, 'COMPLIANCE_CONTROL': INT, 'IMPORT_BATCH': BIG,
    'IMPORT_BATCH_SHEET': BIG, 'DCIM_WORK_ITEM': BIG, 'INCIDENT_ENRICHMENT': BIG, 'INCIDENT_RCA_HYPOTHESIS': BIG,
    'INCIDENT_ACTION_STEP': BIG, 'PLAN_SITE_TYPE': INT,
}.items():
    PENDING_PK[_t] = _p

# ================================================================ A. Configuration and reference data
D = 'A. Configuration and reference data'
table('BUSINESS_MODEL', 'Vocabulary and service levels per business model (persona); screens read every customer / service / money word from here (BRD DATA-011).', [
    c('BUSINESS_MODEL_CODE', BIZ_MODEL, 'Business model key'),
    c('LABEL', LABEL, 'Display name, e.g. Colocation'),
    c('SHORT_LABEL', SHORT, 'Short name for chips'),
    n('TAGLINE', NAME, 'One-line description'),
    c('EDGE_DEVICE_PREFIX', f'VARCHAR(16) {ASCII}', 'Prefix of WAN-edge device names in this model (e.g. PE, BDR)'),
    c('SLA_PREMIUM_PCT', 'DECIMAL(6,3)', 'Availability target of premium services (%)'),
    c('SLA_STANDARD_PCT', 'DECIMAL(6,3)', 'Availability target of standard services (%)'),
    c('CUSTOMER_WORD', SHORT, 'Word for one customer (customer, tenant, business unit ...)'),
    c('CUSTOMERS_WORD', SHORT, 'Plural of CUSTOMER_WORD'),
    c('SERVICE_WORD', SHORT, 'Word for one service'),
    c('SERVICES_WORD', SHORT, 'Plural of SERVICE_WORD'),
    c('EQUIPMENT_WORD', SHORT, 'Word for customer equipment'),
    c('PREMIUM_WORD', SHORT, 'Word for the premium tier'),
    c('CAPACITY_LABEL', LABEL, 'Label of the capacity measure'),
    c('PRIMARY_UNIT', enum('Mbps', 'kW', 'vCPU', 'TB', 'GPU', 'users', 'cabinets', 'hours'), 'Unit capacity is sold in'),
    c('HANDOFF_WORD', SHORT, 'Word for the customer hand-off point'),
    c('MONEY_NOUN', SHORT, 'Money noun (Revenue, Business value ...)'),
    c('MONEY_IMPACT_WORD', SHORT, 'Money impact phrase (Revenue impact, Business impact ...)'),
    c('MONEY_LOST_WORD', SHORT, 'Lost-money phrase'),
    c('MONEY_CREDITS_WORD', SHORT, 'SLA credit phrase (SLA credits, OLA rebates ...)'),
    c('MONEY_BASE_WORD', SHORT, 'Base charge phrase'),
    c('MONEY_BILLING_WORD', SHORT, 'Billing phrase'),
    c('IS_ENABLED', BOOL, '1 = business model offered to this tenant', default='1'),
], pk=SMALL, domain=D, related='BUSINESS_MODEL ← MACD_CATALOGUE_ITEM_MODEL, IMPORT_BATCH',
    uniques=[('TENANT_ID', 'BUSINESS_MODEL_CODE')],
    checks=['SLA_PREMIUM_PCT BETWEEN 0 AND 100', 'SLA_STANDARD_PCT BETWEEN 0 AND 100'])

table('GEOGRAPHY', 'Country-level formatting and grid factors: currency, number locale, date style, grid carbon factor, map bounds.', [
    c('GEOGRAPHY_CODE', f'VARCHAR(8) {ASCII}', 'Geography key (in, us)'),
    c('NAME', LABEL, 'Display name'),
    c('COUNTRY_CODE', f'CHAR(2) {ASCII}', 'ISO 3166-1 alpha-2 country code'),
    c('CURRENCY_CODE', CURRENCY, 'ISO 4217 currency of money shown in this geography'),
    c('CURRENCY_SYMBOL', 'VARCHAR(4)', 'Currency symbol'),
    c('NUMBER_LOCALE', f'VARCHAR(16) {ASCII}', 'BCP 47 locale for number formatting (en-IN, en-US)'),
    c('DATE_STYLE', enum('dmy', 'mdy'), 'Date order'),
    c('FX_PER_INR', 'DECIMAL(12,6)', 'Conversion from rupee reference constants (1 for India)'),
    c('GRID_CO2_KG_PER_KWH', 'DECIMAL(6,4)', 'National grid emission factor, kg CO2 per kWh'),
    c('GRID_FACTOR_SOURCE', NAME, 'Source of the grid factor (e.g. CEA v19, eGRID 2022)'),
    c('MAP_SOUTH_LAT', LAT, 'Map bounds: south latitude'),
    c('MAP_WEST_LNG', LNG, 'Map bounds: west longitude'),
    c('MAP_NORTH_LAT', LAT, 'Map bounds: north latitude'),
    c('MAP_EAST_LNG', LNG, 'Map bounds: east longitude'),
], pk=SMALL, domain=D, related='GEOGRAPHY ← GEOGRAPHY_REGION, POWER_RATE_CARD',
    uniques=[('TENANT_ID', 'GEOGRAPHY_CODE')],
    checks=['MAP_SOUTH_LAT BETWEEN -90 AND 90', 'MAP_NORTH_LAT BETWEEN -90 AND 90', 'MAP_WEST_LNG BETWEEN -180 AND 180',
            'MAP_EAST_LNG BETWEEN -180 AND 180', 'MAP_SOUTH_LAT < MAP_NORTH_LAT', 'GRID_CO2_KG_PER_KWH >= 0', 'FX_PER_INR > 0'])

table('GEOGRAPHY_REGION', 'Regions and states of a geography; tariffs and regional benchmarks are keyed by them. Sites point at a region through Inventory, not here.', [
    fk('GEOGRAPHY_ID', 'GEOGRAPHY', 'Geography the region belongs to'),
    fk('PARENT_REGION_ID', 'GEOGRAPHY_REGION', 'Parent region (a state inside a region); NULL at the top level', null=True),
    c('REGION_CODE', f'VARCHAR(16) {ASCII}', 'Region or state code (e.g. West, MH, VA)'),
    c('REGION_LEVEL', enum('region', 'state'), 'Level of the row'),
    c('NAME', LABEL, 'Display name'),
], pk=INT, domain=D, related='GEOGRAPHY_REGION → GEOGRAPHY; ← POWER_TARIFF',
    uniques=[('GEOGRAPHY_ID', 'REGION_CODE')], indexes=[('PARENT_REGION_ID',)])

table('LOOKUP_LIST', 'Governing table for configurable word lists (severity words, reasons, alarm scope wording).', [
    c('LIST_CODE', KEY, 'List key, e.g. INCIDENT_SEVERITY, REJECT_REASON'),
    c('NAME', LABEL, 'Display name of the list'),
    n('DESCRIPTION', TEXT1K, 'What the list is used for'),
    c('IS_SYSTEM', BOOL, '1 = codes are fixed by the application (labels may change), 0 = tenant may add codes', default='1'),
], pk=SMALL, domain=D, related='LOOKUP_LIST ← LOOKUP_VALUE', uniques=[('TENANT_ID', 'LIST_CODE')])

table('LOOKUP_VALUE', 'One value of a word list: stable code plus the label and tone the screens show.', [
    fk('LOOKUP_LIST_ID', 'LOOKUP_LIST', 'List the value belongs to', od='CASCADE'),
    c('VALUE_CODE', KEY, 'Stable code stored by other systems (e.g. 1, critical, tailgating)'),
    c('LABEL', LABEL, 'Display word (e.g. Critical)'),
    n('TONE', enum('neutral', 'info', 'success', 'warning', 'danger'), 'Chip colour family'),
    c('SORT_ORDER', 'SMALLINT UNSIGNED', 'Display order in the list', default='0'),
    c('IS_ACTIVE', BOOL, '1 = offered in pickers', default='1'),
], pk=INT, domain=D, related='LOOKUP_VALUE → LOOKUP_LIST', uniques=[('LOOKUP_LIST_ID', 'VALUE_CODE')])

table('GPU_MODEL', 'GPU / accelerator catalogue: hardware facts, telemetry source and counter set, price factor and the instance type sold (BRD BRULE-GPU-02, -19, -20).', [
    c('MODEL_CODE', f'VARCHAR(40) {ASCII}', 'Model key as reported by the exporter, e.g. H100 SXM 80 GB'),
    c('SILICON_VENDOR', enum('NVIDIA', 'Intel'), 'Silicon vendor'),
    c('SHORT_NAME', f'VARCHAR(16)', 'Short name, e.g. H100'),
    c('ARCHITECTURE', SHORT, 'Architecture (Hopper, Blackwell, Gaudi 2 ...)'),
    c('MEMORY_GB', 'SMALLINT UNSIGNED', 'On-package memory, GB'),
    c('MEMORY_TYPE', f'VARCHAR(16)', 'Memory type (HBM3, HBM2e, GDDR6)'),
    c('TDP_W', 'SMALLINT UNSIGNED', 'Board power limit, W'),
    c('FORM_FACTOR', f'VARCHAR(16)', 'SXM, OAM or PCIe'),
    c('SCALE_UP_LINK', SHORT, 'In-node scale-up link (NVLink 4, RoCE on card ...)'),
    c('SCALE_UP_LINK_SHORT', f'VARCHAR(16)', 'Short name of the scale-up link'),
    c('SCALE_OUT_FABRIC', SHORT, 'Scale-out fabric (InfiniBand NDR, RoCE)'),
    c('CLOCK_MIN_MHZ', 'SMALLINT UNSIGNED', 'Lowest core clock, MHz'),
    c('CLOCK_MAX_MHZ', 'SMALLINT UNSIGNED', 'Highest core clock, MHz'),
    c('IDLE_MIN_W', 'SMALLINT UNSIGNED', 'Idle power, low end, W'),
    c('IDLE_MAX_W', 'SMALLINT UNSIGNED', 'Idle power, high end, W'),
    n('MEMORY_CLOCK_MHZ', 'SMALLINT UNSIGNED', 'Memory clock under load, MHz; NULL when the exporter does not report it'),
    n('MEMORY_IDLE_CLOCK_MHZ', 'SMALLINT UNSIGNED', 'Memory clock at idle, MHz'),
    c('PRIMARY_USE', enum('training', 'inference'), 'Workload the model is sold for'),
    c('PRICE_FACTOR', 'DECIMAL(6,3)', 'Price relative to an H100 GPU-hour (H100 = 1)'),
    c('TELEMETRY_SOURCE', LABEL, 'Exporter that reports it (DCGM exporter, habanalabs exporter, XPU Manager)'),
    c('COUNTER_SET', enum('dcgm', 'habana', 'xpu'), 'Counter family the screens expect; missing counters show —'),
    c('IS_POWER_KNOWN', BOOL, '1 = node power is reported and counted in power / occupancy totals (BRULE-GPU-20)', default='1'),
    c('DRIVER_CURRENT', SHORT, 'Current approved driver version'),
    n('DRIVER_OLD', SHORT, 'Previous driver version that counts as drift'),
    n('FIRMWARE', SHORT, 'Approved firmware version'),
    n('OS_IMAGE', SHORT, 'Approved host OS image'),
    c('LAUNCH_YEAR', 'SMALLINT UNSIGNED', 'Year the model launched'),
    c('GPUS_PER_NODE', 'TINYINT UNSIGNED', 'Accelerators per server node', default='8'),
    c('INSTANCE_VCPU', 'SMALLINT UNSIGNED', 'Instance type: vCPUs per node'),
    c('INSTANCE_RAM_GB', 'SMALLINT UNSIGNED', 'Instance type: RAM per node, GB'),
    c('INSTANCE_NVME_TB', 'DECIMAL(6,2)', 'Instance type: local NVMe per node, TB'),
    c('INSTANCE_NET_GBPS', 'SMALLINT UNSIGNED', 'Instance type: front-end network per node, Gbps'),
    c('IS_ACTIVE', BOOL, '1 = offered in pickers and plans', default='1'),
], pk=SMALL, domain=D, related='GPU_MODEL ← GPU_MODEL_SERVER, GPU_MODEL_BENCHMARK',
    uniques=[('TENANT_ID', 'MODEL_CODE')],
    checks=['CLOCK_MIN_MHZ <= CLOCK_MAX_MHZ', 'IDLE_MIN_W <= IDLE_MAX_W', 'IDLE_MAX_W <= TDP_W', 'PRICE_FACTOR > 0', 'GPUS_PER_NODE > 0'])

table('GPU_MODEL_SERVER', 'Server model that carries a GPU model, per OEM (e.g. Dell → XE9680).', [
    fk('GPU_MODEL_ID', 'GPU_MODEL', 'GPU model', od='CASCADE'),
    c('OEM_VENDOR', SHORT, 'Server maker (NVIDIA, Dell, Supermicro, Wiwynn ...)'),
    c('SERVER_MODEL', LABEL, 'Server model name'),
], pk=INT, domain=D, related='GPU_MODEL_SERVER → GPU_MODEL', uniques=[('GPU_MODEL_ID', 'OEM_VENDOR')])

table('GPU_MODEL_BENCHMARK', 'Reference burn-in figures per GPU model; a node below HELD_BACK_BELOW_PCT of the reference is held back from sale (BRULE-GPU-22).', [
    fk('GPU_MODEL_ID', 'GPU_MODEL', 'GPU model', od='CASCADE'),
    c('HBM_TBS', 'DECIMAL(6,2)', 'Reference memory bandwidth, TB/s'),
    c('BUS_GBS', 'DECIMAL(7,1)', 'Reference in-node bus bandwidth, GB/s'),
    c('HELD_BACK_BELOW_PCT', PCT, 'Share of the reference below which a node is held back', default='95.00'),
    c('SOURCE', NAME, 'Where the reference comes from'),
    c('AS_OF', DATE, 'Date of the reference'),
], pk=INT, domain=D, related='GPU_MODEL_BENCHMARK → GPU_MODEL', uniques=[('GPU_MODEL_ID',)],
    checks=['HBM_TBS > 0', 'BUS_GBS > 0'])

table('POWER_RATE_CARD', 'Geography-wide power price defaults used when a site has no contract figure (demand charge, colocation rate, overage multiplier).', [
    fk('GEOGRAPHY_ID', 'GEOGRAPHY', 'Geography'),
    c('CURRENCY_CODE', CURRENCY, 'Currency of the rates'),
    c('DEFAULT_ENERGY_RATE', RATE, 'Default energy price per kWh'),
    c('DEFAULT_SUPPLIER', NAME, 'Supplier name used with the default price'),
    c('DEMAND_CHARGE_RATE', RATE, 'Utility demand charge per kW (kVA) per month'),
    c('COLO_BLOCK_RATE', RATE, 'Colocation all-in rate per committed kW per month'),
    c('OVERAGE_MULTIPLIER', 'DECIMAL(5,2)', 'Price multiple on draw above a colocation block', default='1.50'),
    c('PEAK_OVER_MEAN_FACTOR', 'DECIMAL(5,3)', 'Factor on the prior 12-month peak before a new demand peak is a finding', default='1.060'),
    c('TARIFF_SOURCE', NAME, 'Source of the energy prices'),
    c('DEMAND_SOURCE', NAME, 'Source of the demand charge'),
    c('COLO_SOURCE', NAME, 'Source of the colocation rate'),
    c('AS_OF', DATE, 'Date the rates apply from'),
    c('IS_ILLUSTRATIVE', BOOL, '1 = illustrative figures, marked so on screen', default='1'),
], pk=SMALL, domain=D, related='POWER_RATE_CARD → GEOGRAPHY', uniques=[('GEOGRAPHY_ID', 'AS_OF')],
    checks=['DEFAULT_ENERGY_RATE >= 0', 'DEMAND_CHARGE_RATE >= 0', 'COLO_BLOCK_RATE >= 0', 'OVERAGE_MULTIPLIER >= 1', 'PEAK_OVER_MEAN_FACTOR >= 1'])

table('POWER_TARIFF', 'Energy tariff per state / region (BRD DATA-006); a site uses the tariff of its state unless its contract sets a price.', [
    fk('GEOGRAPHY_REGION_ID', 'GEOGRAPHY_REGION', 'State or region the tariff applies to'),
    c('CURRENCY_CODE', CURRENCY, 'Currency of the price'),
    c('ENERGY_RATE', RATE, 'Energy price per kWh'),
    c('SUPPLIER', NAME, 'Utility / DISCOM'),
    c('SOURCE', NAME, 'Source (e.g. EIA industrial average)'),
    c('AS_OF', DATE, 'Date the price applies from'),
    c('IS_ILLUSTRATIVE', BOOL, '1 = illustrative, replaced by the customer\'s tariff sheet', default='1'),
], pk=INT, domain=D, related='POWER_TARIFF → GEOGRAPHY_REGION', uniques=[('GEOGRAPHY_REGION_ID', 'AS_OF')],
    checks=['ENERGY_RATE >= 0'])

table('POWER_CONTRACT', 'Power supply contract of a site: utility connection with take-or-pay floor and demand charge, or a colocation power block (BRD 7.8).', [
    c('CONTRACT_KIND', enum('utility', 'colocation'), 'utility = connection + demand charge; colocation = committed block'),
    c('SUPPLIER', NAME, 'Utility or colocation provider'),
    n('CONTRACT_REF', SHORT, 'Supplier contract reference'),
    c('CURRENCY_CODE', CURRENCY, 'Currency of the rates'),
    n('ENERGY_RATE', RATE, 'Contract energy price per kWh; NULL = the state tariff applies'),
    c('CAPACITY_RATE', RATE, 'Utility: demand charge per kW-month; colocation: all-in rate per committed kW-month'),
    c('COMMITTED_KW', KW, 'Utility connection size or colocation block, kW'),
    c('FLOOR_PCT', PCT, 'Take-or-pay floor as a share of COMMITTED_KW (colocation = 100)'),
    c('ESCALATOR_PCT', PCT, 'Yearly price escalator', default='0.00'),
    c('TERM_START', DATE, 'Contract start'),
    c('TERM_END', DATE, 'Contract end'),
    c('IS_ILLUSTRATIVE', BOOL, '1 = seeded illustrative contract', default='0'),
], pk=INT, domain=D, site=True, related='POWER_CONTRACT ← POWER_FINDING',
    uniques=[('TENANT_ID', 'INV_SITE_ID', 'TERM_START')],
    checks=['TERM_START < TERM_END', 'COMMITTED_KW > 0', 'CAPACITY_RATE >= 0', "CONTRACT_KIND = 'utility' OR FLOOR_PCT = 100"])

table('METRIC_DEFINITION', 'Metric catalogue sent to the OAP telemetry ingestion service (INTG-057): name, unit, labels and expected interval per source.', [
    c('METRIC_NAME', f'VARCHAR(128) {ASCII}', 'Metric name as stored in OAP (e.g. DCGM_FI_DEV_POWER_USAGE)'),
    c('LABEL', LABEL, 'Display name'),
    c('UNIT', f'VARCHAR(16)', 'Unit (W, °C, %, kWh ...)'),
    c('METRIC_DOMAIN', enum('power', 'cooling', 'environment', 'network', 'compute', 'gpu', 'storage', 'security'), 'Domain the metric belongs to'),
    c('SOURCE_KIND', enum('snmp', 'modbus', 'bacnet', 'redfish', 'dcgm', 'habana', 'xpu', 'gnmi', 'syslog', 'bms', 'pacs', 'other'), 'Protocol / exporter that delivers it'),
    c('EXPECTED_INTERVAL_S', 'INT UNSIGNED', 'Expected sampling interval, seconds; stale after 3 intervals'),
    n('LABEL_KEYS', 'VARCHAR(500)', 'Label keys the series carries, as documentation for OAP (not parsed by SynapseDC)'),
    n('DESCRIPTION', TEXT1K, 'Meaning of the metric'),
    c('IS_ACTIVE', BOOL, '1 = collected', default='1'),
], pk=INT, domain=D, uniques=[('TENANT_ID', 'METRIC_NAME')], checks=['EXPECTED_INTERVAL_S > 0'])

# ================================================================ B. DCIM work waiting for approval
D = 'B. DCIM work waiting for approval'
DCIM_OPS = enum('createRack', 'installDevice', 'setDeviceStatus', 'connect', 'disconnect', 'editInterface', 'installModule', 'removeModule',
                'swapModule', 'editRack', 'retireRack', 'moveDevice', 'reserveU', 'releaseU', 'createPanel', 'createFeed')
table('DCIM_WORK_ITEM', 'A DCIM edit saved under a change request that is not approved yet. Executing it writes to Inventory / Inventory Planning (W-18…21, W-38) and marks it Done (BRD 7.10, OD-01).', [
    c('WORK_ITEM_CODE', CODE, 'Business code, e.g. DWI-000123'),
    c('ITSM_CHANGE_ID', EXT_ID, 'Change request id in ITSM Change management'),
    c('CR_MODE', enum('standard', 'existing', 'raised'), 'How the change request was chosen: standard pre-approved, an open CR, or raised for this edit'),
    c('OPERATION', DCIM_OPS, 'DCIM operation to replay against the Inventory write API'),
    c('LABEL', NAME, 'What the edit does, in words'),
    n('INV_HALL_ID', EXT_ID, 'Hall (room) id in Inventory, when the edit is in a hall'),
    n('INV_RACK_ID', EXT_ID, 'Rack id in Inventory, when the edit is on a rack'),
    n('INV_DEVICE_ID', EXT_ID, 'Device id in Inventory, when the edit is on a device'),
    c('ARGUMENTS', 'JSON', 'Arguments of the operation exactly as the write API takes them (replayed on execution)'),
    c('STATUS', enum('Planned', 'Done', 'Failed', 'Cancelled'), 'Planned until executed', default="'Planned'"),
    n('EXECUTED_AT', TS, 'When it was executed'),
    n('EXECUTED_BY', USER_ID, 'Who executed it'),
    n('RESULT_MESSAGE', TEXT1K, 'Result returned by the write API'),
    n('ERROR_MESSAGE', TEXT1K, 'Error when STATUS = Failed'),
], domain=D, site=True, related='DCIM_WORK_ITEM ← DCIM_WORK_ITEM_TARGET, WRITEBACK_REQUEST',
    uniques=[('TENANT_ID', 'WORK_ITEM_CODE')],
    indexes=[('TENANT_ID', 'ITSM_CHANGE_ID'), ('TENANT_ID', 'INV_SITE_ID', 'STATUS'), ('INV_RACK_ID',), ('INV_DEVICE_ID',)],
    checks=["STATUS <> 'Done' OR EXECUTED_AT IS NOT NULL", "STATUS <> 'Failed' OR ERROR_MESSAGE IS NOT NULL"])

table('DCIM_WORK_ITEM_TARGET', 'Records a planned DCIM edit touches (rack, device, interface, module, hold, panel, feed), so racks and devices can show "N planned changes".', [
    fk('DCIM_WORK_ITEM_ID', 'DCIM_WORK_ITEM', 'Work item', od='CASCADE'),
    c('TARGET_KIND', enum('rack', 'device', 'interface', 'module', 'reservation', 'panel', 'feed'), 'Kind of Inventory record'),
    c('TARGET_ID', EXT_ID, 'Record id in Inventory / Inventory Planning (interface = device id + port)'),
], domain=D, related='DCIM_WORK_ITEM_TARGET → DCIM_WORK_ITEM',
    uniques=[('DCIM_WORK_ITEM_ID', 'TARGET_KIND', 'TARGET_ID')], indexes=[('TENANT_ID', 'TARGET_KIND', 'TARGET_ID')])

# ================================================================ C. Operations enrichment
D = 'C. Operations enrichment'
table('ALARM_TAG', 'SynapseDC tags on a System Alerts alarm: scope against the site, placement and correlation. Used only while System Alerts cannot store these tags.', [
    c('ALR_ALARM_ID', EXT_ID, 'Alarm id in System Alerts'),
    c('SCOPE', enum('site', 'edge', 'dependency', 'downstream'), 'Scope against the site; downstream alarms never count against it'),
    n('NODE_NAME', NAME, 'Node the alarm is about, as placed by SynapseDC'),
    n('NODE_LOCATION', NAME, 'Where the node is (room / rack / remote site)'),
    n('HOPS', 'TINYINT UNSIGNED', 'Hops from the site for edge / dependency / downstream alarms'),
    n('CORRELATION_KEY', f'VARCHAR(64) {ASCII}', 'Physical fault the alarm belongs to; alarms with the same key are one fault'),
    n('FAULT_LOCATION', NAME, 'Where that fault is'),
    n('SYMPTOM_OF_ALARM_ID', EXT_ID, 'Alarm id (System Alerts) this alarm is a symptom of'),
    c('TAGGED_AT', TS, 'When SynapseDC tagged it'),
], domain=D, site=True, uniques=[('TENANT_ID', 'ALR_ALARM_ID')],
    indexes=[('TENANT_ID', 'INV_SITE_ID', 'SCOPE'), ('TENANT_ID', 'CORRELATION_KEY'), ('SYMPTOM_OF_ALARM_ID',)])

table('INCIDENT_ENRICHMENT', 'SynapseDC additions to an ITSM incident: impact and money snapshots, RCA feedback. Used only where ITSM has no extension fields (W-05, W-07).', [
    c('ITSM_INCIDENT_ID', EXT_ID, 'Incident id in ITSM'),
    c('IMPACT_LEVEL', LMH, 'Impact level at the last snapshot'),
    c('IMPACTED_SERVICES', 'INT UNSIGNED', 'Services impacted at the last snapshot', default='0'),
    c('IMPACTED_CUSTOMERS', 'INT UNSIGNED', 'Customers impacted at the last snapshot', default='0'),
    c('PREMIUM_CUSTOMERS', 'INT UNSIGNED', 'Premium customers impacted at the last snapshot', default='0'),
    c('CURRENCY_CODE', CURRENCY, 'Currency of the money columns'),
    c('REVENUE_AT_RISK', MONEY, 'Money at risk at the last snapshot', default='0.00'),
    n('IMPACT_SUMMARY', TEXT1K, 'Impact in one sentence'),
    c('IMPACT_SNAPSHOT_AT', TS, 'When the impact snapshot was taken (DATA-022)'),
    n('MONEY_LOST_AT_CLOSE', MONEY, 'Money lost, frozen when the incident closed'),
    n('CREDITS_AT_CLOSE', MONEY, 'SLA credits caused, frozen when the incident closed'),
    n('CLOSED_SNAPSHOT_AT', TS, 'When the close snapshot was taken'),
    n('RCA_FEEDBACK', enum('confirmed', 'rejected'), 'Engineer verdict on the leading hypothesis'),
    n('FEEDBACK_BY', USER_ID, 'Who gave the verdict'),
    n('FEEDBACK_AT', TS, 'When'),
], domain=D, site=True, related='INCIDENT_ENRICHMENT ← INCIDENT_IMPACT_ITEM, INCIDENT_RCA_HYPOTHESIS, INCIDENT_ACTION_STEP, INCIDENT_VERIFICATION_CHECK',
    uniques=[('TENANT_ID', 'ITSM_INCIDENT_ID')], indexes=[('TENANT_ID', 'INV_SITE_ID')],
    checks=['REVENUE_AT_RISK >= 0', 'MONEY_LOST_AT_CLOSE IS NULL OR MONEY_LOST_AT_CLOSE >= 0', 'CREDITS_AT_CLOSE IS NULL OR CREDITS_AT_CLOSE >= 0',
            '(MONEY_LOST_AT_CLOSE IS NULL) = (CLOSED_SNAPSHOT_AT IS NULL)'])

table('INCIDENT_IMPACT_ITEM', 'What an incident affects at the last snapshot (device, link, rack, service, customer, facility), by module id.', [
    fk('INCIDENT_ENRICHMENT_ID', 'INCIDENT_ENRICHMENT', 'Incident enrichment', od='CASCADE'),
    c('ITEM_KIND', enum('NE', 'Link', 'Rack', 'Service', 'Customer', 'Facility'), 'Kind of affected record'),
    c('ITEM_REF_ID', EXT_ID, 'Record id in its module (Inventory, BSS)'),
    c('ITEM_LABEL', NAME, 'Display name cached at the snapshot'),
], domain=D, uniques=[('INCIDENT_ENRICHMENT_ID', 'ITEM_KIND', 'ITEM_REF_ID')], indexes=[('TENANT_ID', 'ITEM_KIND', 'ITEM_REF_ID')])

table('INCIDENT_RCA_HYPOTHESIS', 'Root-cause hypothesis proposed for an incident, ranked, with confidence.', [
    fk('INCIDENT_ENRICHMENT_ID', 'INCIDENT_ENRICHMENT', 'Incident enrichment', od='CASCADE'),
    c('RANK_NO', 'TINYINT UNSIGNED', 'Rank, 1 = leading'),
    c('CAUSE', TEXT1K, 'Proposed cause'),
    c('CONFIDENCE_PCT', PCT, 'Confidence, %'),
    c('IS_REJECTED', BOOL, '1 = rejected by the engineer', default='0'),
    n('ITSM_CHANGE_ID', EXT_ID, 'Change the hypothesis blames (counts that change as failed)'),
], domain=D, related='INCIDENT_RCA_HYPOTHESIS ← INCIDENT_RCA_EVIDENCE',
    uniques=[('INCIDENT_ENRICHMENT_ID', 'RANK_NO')], indexes=[('ITSM_CHANGE_ID',)])

table('INCIDENT_RCA_EVIDENCE', 'One piece of evidence behind a hypothesis (alarm, reading, change, log line).', [
    fk('INCIDENT_RCA_HYPOTHESIS_ID', 'INCIDENT_RCA_HYPOTHESIS', 'Hypothesis', od='CASCADE'),
    c('SORT_ORDER', 'TINYINT UNSIGNED', 'Display order', default='0'),
    c('EVIDENCE_TEXT', TEXT1K, 'Evidence, in words'),
    n('REF_ID', EXT_ID, 'Id of the record it points at (alarm, change, device)'),
    n('OBSERVED_AT', TS, 'When the evidence was observed'),
], domain=D, uniques=[('INCIDENT_RCA_HYPOTHESIS_ID', 'SORT_ORDER')])

table('INCIDENT_ACTION_STEP', 'Recommended action step for an incident and its state; disruptive steps need approval.', [
    fk('INCIDENT_ENRICHMENT_ID', 'INCIDENT_ENRICHMENT', 'Incident enrichment', od='CASCADE'),
    c('STEP_NO', 'TINYINT UNSIGNED', 'Order of the step'),
    c('STEP_TEXT', TEXT1K, 'What to do'),
    c('OWNER_ROLE', LABEL, 'Who does it'),
    c('EXPECTED_RESULT', TEXT1K, 'Expected result'),
    c('ROLLBACK_TEXT', TEXT1K, 'How to undo it'),
    c('VERIFY_TEXT', TEXT1K, 'How to verify it worked'),
    c('IS_DISRUPTIVE', BOOL, '1 = service-affecting, needs approval', default='0'),
    c('STATUS', enum('Pending', 'Awaiting approval', 'Approved', 'Running', 'Done', 'Rejected'), 'Step state', default="'Pending'"),
    n('ITSM_CHANGE_ID', EXT_ID, 'Change raised to run the step'),
    n('DONE_AT', TS, 'When it finished'),
    n('DONE_BY', USER_ID, 'Who ran it'),
], domain=D, uniques=[('INCIDENT_ENRICHMENT_ID', 'STEP_NO')], indexes=[('ITSM_CHANGE_ID',)])

table('INCIDENT_VERIFICATION_CHECK', 'Check run after the fix to prove the incident is over.', [
    fk('INCIDENT_ENRICHMENT_ID', 'INCIDENT_ENRICHMENT', 'Incident enrichment', od='CASCADE'),
    c('SORT_ORDER', 'TINYINT UNSIGNED', 'Display order'),
    c('CHECK_TEXT', TEXT1K, 'What is checked'),
    c('VERIFICATION_RESULT', enum('Pending', 'Passed', 'Failed'), 'Result', default="'Pending'"),
    n('CHECKED_AT', TS, 'When it was checked'),
], domain=D, uniques=[('INCIDENT_ENRICHMENT_ID', 'SORT_ORDER')])

table('POWER_FINDING', 'Power contract finding per site (block near limit, demand ratchet, unexplained rise, idle block) and the alarm / incident raised for it; de-duplicates the scheduled evaluation (DEV-08).', [
    fk('POWER_CONTRACT_ID', 'POWER_CONTRACT', 'Contract the finding is against', null=True),
    c('FINDING_KIND', enum('block-near-limit', 'demand-ratchet', 'unexplained-rise', 'idle-block'), 'Kind of finding'),
    c('ALARM_SEVERITY', enum('major', 'minor', 'warning'), 'Severity of the raised alarm'),
    c('TITLE', NAME, 'Title'),
    c('DETAIL', TEXT1K, 'What was found'),
    c('CURRENCY_CODE', CURRENCY, 'Currency of the exposure'),
    c('EXPOSURE_AMOUNT', MONEY, 'Money exposure (per year)'),
    c('EXPOSURE_LABEL', LABEL, 'How the exposure reads on screen'),
    n('EVIDENCE_SNAPSHOT', 'JSON', 'Snapshot of the figures behind the finding: [{label, value}] (DATA-022)'),
    c('FIRST_SEEN_AT', TS, 'First evaluation that found it'),
    c('LAST_SEEN_AT', TS, 'Latest evaluation that still found it'),
    c('STATUS', enum('Open', 'Resolved', 'Dismissed'), 'Open until an evaluation no longer finds it', default="'Open'"),
    n('ALR_ALARM_ID', EXT_ID, 'Alarm raised in System Alerts'),
    n('ITSM_INCIDENT_ID', EXT_ID, 'Incident raised in ITSM (costliest block / ratchet finding)'),
    c('OPEN_FINDING_KEY', f'VARCHAR(80) {ASCII}', 'One open finding per site and kind (generated)',
      extra="GENERATED ALWAYS AS (IF(STATUS = 'Open', CONCAT(INV_SITE_ID, '|', FINDING_KIND), NULL)) STORED"),
], domain=D, site=True, related='POWER_FINDING → POWER_CONTRACT',
    uniques=[('TENANT_ID', 'OPEN_FINDING_KEY')], indexes=[('TENANT_ID', 'INV_SITE_ID', 'STATUS'), ('POWER_CONTRACT_ID',), ('ALR_ALARM_ID',)],
    checks=['EXPOSURE_AMOUNT >= 0', 'FIRST_SEEN_AT <= LAST_SEEN_AT'])
TABLES['POWER_FINDING']['cols'][[x.name for x in TABLES['POWER_FINDING']['cols']].index('OPEN_FINDING_KEY')].null = True

# ================================================================ D. Planner — templates
D = 'D. Planner'
TPL_KIND = enum('profile', 'plan', 'aspect', 'ruleset', 'benchmarkset', 'demand', 'document', 'checklist', 'blueprint')
table('PLAN_TEMPLATE', 'Identity of a planner template (plan type, site type profile, module, rule set, checklist, document). Content lives in PLAN_TEMPLATE_VERSION; published versions never change (DATA-020).', [
    c('TEMPLATE_CODE', CODE, 'Template key (e.g. TPL-NEW-DC, R-SET-POWER)'),
    c('TEMPLATE_KIND', TPL_KIND, 'Kind of template'),
    c('IS_BUILT_IN', BOOL, '1 = shipped with the product, 0 = made by the tenant', default='0'),
    n('RETIRED_AT', TS, 'When it was retired; NULL = in use'),
    n('RETIRED_BY', USER_ID, 'Who retired it'),
    n('RETIRE_REASON', TEXT1K, 'Why it was retired'),
], pk=INT, domain=D, related='PLAN_TEMPLATE ← PLAN_TEMPLATE_VERSION, PLAN',
    uniques=[('TENANT_ID', 'TEMPLATE_CODE')], indexes=[('TENANT_ID', 'TEMPLATE_KIND')],
    checks=['(RETIRED_AT IS NULL) = (RETIRED_BY IS NULL)'])

table('PLAN_TEMPLATE_VERSION', 'One version of a template. Draft → Awaiting approval → Published → Superseded; one draft and one published version per template at a time.', [
    fk('PLAN_TEMPLATE_ID', 'PLAN_TEMPLATE', 'Template'),
    c('VERSION_NO', 'SMALLINT UNSIGNED', 'Version number, 1 upwards'),
    c('VERSION_STATUS', VERSION_STATUS, 'State of this version', default="'Draft'"),
    c('NAME', NAME, 'Template name'),
    n('DESCRIPTION', TEXT2K, 'What it is for'),
    c('OWNER_NAME', NAME, 'Owning team or person'),
    n('PLAN_SCOPE', PLAN_SCOPE, 'Plan family (plan types only)'),
    n('DC_TYPE_KEY', KEY, 'Site type key the template is for (built-in key or custom-…)'),
    fk('INHERITS_FROM_TEMPLATE_ID', 'PLAN_TEMPLATE', 'Parent template it inherits from (variant); NULL = root', null=True),
    c('APPLIES_TO_LEVEL', enum('org', 'region', 'site'), 'Where it may be used', default="'org'"),
    n('APPLIES_TO_REF_ID', EXT_ID, 'Region code or Inventory site id when APPLIES_TO_LEVEL is not org'),
    n('APPLIES_TO_LABEL', NAME, 'Display name of the region / site'),
    n('EXECUTES_AS', enum('change', 'project', 'programme', 'portfolio'), 'Delivery vehicle created when a plan on it starts'),
    n('BLUEPRINT_KEY', KEY, 'Delivery blueprint used for the build'),
    n('ATP_SYSTEM', enum('Power', 'Cooling', 'Network', 'Controls', 'Integrated'), 'Checklists: commissioning system it tests; NULL = gate list'),
    c('IS_PER_SITE', BOOL, 'Checklists: 1 = one test per site (edge acceptance)', default='0'),
    n('DEMAND_GPU_PCT', PCT, 'Demand profile: GPU share of the workload mix'),
    n('DEMAND_COMPUTE_PCT', PCT, 'Demand profile: compute share'),
    n('DEMAND_STORAGE_PCT', PCT, 'Demand profile: storage share'),
    n('CHANGE_NOTE', TEXT1K, 'Note on what changed in this version'),
    n('PUBLISH_REQUESTED_BY', USER_ID, 'Who asked to publish (versions of a template in use need approval)'),
    n('PUBLISH_REQUESTED_AT', TS, 'When publication was requested'),
    n('PUBLISH_REASON', TEXT1K, 'Reason given with the request'),
    n('DECIDED_BY', USER_ID, 'Approver who published or rejected (not the requester)'),
    n('DECIDED_AT', TS, 'When the request was decided'),
    n('DECISION_REASON', TEXT1K, 'Reason given by the approver'),
    n('PUBLISHED_AT', TS, 'When this version became live'),
    n('PUBLISHED_BY', USER_ID, 'Who published it'),
    c('OPEN_DRAFT_KEY', 'INT UNSIGNED', 'One open draft per template (generated)',
      extra="GENERATED ALWAYS AS (IF(VERSION_STATUS IN ('Draft','Awaiting approval'), PLAN_TEMPLATE_ID, NULL)) STORED"),
    c('LIVE_KEY', 'INT UNSIGNED', 'One published version per template (generated)',
      extra="GENERATED ALWAYS AS (IF(VERSION_STATUS = 'Published', PLAN_TEMPLATE_ID, NULL)) STORED"),
], pk=INT, domain=D,
    related='PLAN_TEMPLATE_VERSION → PLAN_TEMPLATE; ← PLAN_TEMPLATE_INPUT, PLAN_TEMPLATE_RULE, PLAN_TEMPLATE_ASPECT, PLAN_TEMPLATE_APPROVAL_STEP, PLAN_TEMPLATE_OUTPUT, PLAN_TEMPLATE_ITEM, PLAN_TEMPLATE_LABEL, PLAN_TEMPLATE_MODULE, PLAN_TEMPLATE_DEMAND_PHASE, PLAN_SITE_TYPE',
    uniques=[('PLAN_TEMPLATE_ID', 'VERSION_NO'), ('OPEN_DRAFT_KEY',), ('LIVE_KEY',)],
    indexes=[('INHERITS_FROM_TEMPLATE_ID',), ('TENANT_ID', 'VERSION_STATUS')],
    checks=['VERSION_NO > 0',
            'DEMAND_GPU_PCT IS NULL OR DEMAND_GPU_PCT + DEMAND_COMPUTE_PCT + DEMAND_STORAGE_PCT = 100',
            "VERSION_STATUS <> 'Published' OR PUBLISHED_AT IS NOT NULL",
            "VERSION_STATUS <> 'Awaiting approval' OR PUBLISH_REQUESTED_BY IS NOT NULL",
            'DECIDED_BY IS NULL OR PUBLISH_REQUESTED_BY IS NULL OR DECIDED_BY <> PUBLISH_REQUESTED_BY'])
for _k in ('OPEN_DRAFT_KEY', 'LIVE_KEY'):
    TABLES['PLAN_TEMPLATE_VERSION']['cols'][[x.name for x in TABLES['PLAN_TEMPLATE_VERSION']['cols']].index(_k)].null = True

VER = lambda: fk('PLAN_TEMPLATE_VERSION_ID', 'PLAN_TEMPLATE_VERSION', 'Template version', od='CASCADE')
table('PLAN_TEMPLATE_LABEL', 'Free labels on a template version (filters in the library).', [
    VER(), c('LABEL', SHORT, 'Label'),
], domain=D, uniques=[('PLAN_TEMPLATE_VERSION_ID', 'LABEL')])

table('PLAN_TEMPLATE_INPUT', 'Input (parameter) a template version defines or overrides: default and allowed range or options.', [
    VER(),
    c('INPUT_KEY', KEY, 'Input key the planner engine reads (from the input catalogue)'),
    c('LABEL', NAME, 'Display name'),
    c('ASPECT', ASPECT, 'Wizard area the input belongs to'),
    c('INPUT_TYPE', VALUE_TYPE, 'Type of value'),
    n('UNIT', f'VARCHAR(16)', 'Unit'),
    n('DEFAULT_NUMBER', NUM, 'Default when INPUT_TYPE = number'),
    n('DEFAULT_TEXT', 'VARCHAR(255)', 'Default when INPUT_TYPE = text or select'),
    n('DEFAULT_BOOL', BOOL, 'Default when INPUT_TYPE = bool'),
    n('MIN_VALUE', NUM, 'Lowest allowed value (numbers)'),
    n('MAX_VALUE', NUM, 'Highest allowed value (numbers)'),
    n('HELP_TEXT', TEXT1K, 'Help shown under the input'),
    c('IS_DERIVED', BOOL, '1 = computed by the planner, not typed by the user', default='0'),
], pk=INT, domain=D, related='PLAN_TEMPLATE_INPUT ← PLAN_TEMPLATE_INPUT_OPTION', uniques=[('PLAN_TEMPLATE_VERSION_ID', 'INPUT_KEY')],
    checks=['MIN_VALUE IS NULL OR MAX_VALUE IS NULL OR MIN_VALUE <= MAX_VALUE',
            "INPUT_TYPE = 'number' OR (DEFAULT_NUMBER IS NULL AND MIN_VALUE IS NULL AND MAX_VALUE IS NULL)",
            "INPUT_TYPE = 'bool' OR DEFAULT_BOOL IS NULL",
            "INPUT_TYPE IN ('text','select') OR DEFAULT_TEXT IS NULL"])

table('PLAN_TEMPLATE_INPUT_OPTION', 'Allowed option of a select input.', [
    fk('PLAN_TEMPLATE_INPUT_ID', 'PLAN_TEMPLATE_INPUT', 'Input', od='CASCADE'),
    c('SORT_ORDER', 'SMALLINT UNSIGNED', 'Display order'),
    c('OPTION_VALUE', 'VARCHAR(255)', 'Option'),
], domain=D, uniques=[('PLAN_TEMPLATE_INPUT_ID', 'OPTION_VALUE')])

table('PLAN_TEMPLATE_RULE', 'Rule a template version checks: an engine check with its own settings; IS_OFF switches an inherited rule off for this template and its variants.', [
    VER(),
    c('RULE_CODE', CODE, 'Rule id (R-PWR-01, R-CUS-01 ...)'),
    c('CHECK_KEY', KEY, 'Engine check it runs; a check runs at most once per template'),
    c('ASPECT', ASPECT, 'Area of the rule'),
    c('RULE_SEVERITY', enum('hard', 'soft'), 'hard = must pass, soft = should pass'),
    c('TITLE', NAME, 'Rule name'),
    n('THRESHOLD', NUM, 'Limit for checks that read one'),
    n('STANDARD_REF', NAME, 'Standard it comes from (TIA-942, ASHRAE ...)'),
    n('SOURCE', NAME, 'Source of the limit'),
    c('IS_OFF', BOOL, '1 = switched off here (an own copy that drops the inherited rule)', default='0'),
], domain=D, uniques=[('PLAN_TEMPLATE_VERSION_ID', 'RULE_CODE'), ('PLAN_TEMPLATE_VERSION_ID', 'CHECK_KEY')],
    indexes=[('TENANT_ID', 'RULE_CODE')])

table('PLAN_TEMPLATE_ASPECT', 'Wizard area a template version asks for and how deep (In full / Brief / Skip).', [
    VER(), c('ASPECT', ASPECT, 'Wizard area'), c('DEPTH', enum('full', 'summary', 'skipped'), 'How the wizard treats it'),
], domain=D, uniques=[('PLAN_TEMPLATE_VERSION_ID', 'ASPECT')])

table('PLAN_TEMPLATE_APPROVAL_STEP', 'Approval path of a plan type version, in order (role names map to Platform Engineering roles).', [
    VER(), c('STEP_ORDER', 'TINYINT UNSIGNED', 'Order of the step'), c('STEP_NAME', LABEL, 'Approving step / role name'),
], domain=D, uniques=[('PLAN_TEMPLATE_VERSION_ID', 'STEP_ORDER')])

table('PLAN_TEMPLATE_OUTPUT', 'Output a plan type produces (plan document, BoM, drawings ...).', [
    VER(), c('SORT_ORDER', 'TINYINT UNSIGNED', 'Display order'), c('OUTPUT_NAME', NAME, 'Output'),
], domain=D, uniques=[('PLAN_TEMPLATE_VERSION_ID', 'SORT_ORDER')])

table('PLAN_TEMPLATE_ITEM', 'Checklist item or document section of a checklist / document template version, in order.', [
    VER(), c('SORT_ORDER', 'SMALLINT UNSIGNED', 'Order of the item'), c('ITEM_TEXT', 'VARCHAR(500)', 'Item or section title'),
], domain=D, uniques=[('PLAN_TEMPLATE_VERSION_ID', 'SORT_ORDER')])

table('PLAN_TEMPLATE_MODULE', 'Module (aspect, rule set, demand profile, checklist, document) a plan type version is built from; the plan type\'s own copies win.', [
    VER(),
    fk('MODULE_TEMPLATE_ID', 'PLAN_TEMPLATE', 'Module template'),
    c('SORT_ORDER', 'TINYINT UNSIGNED', 'Order modules are applied in'),
], domain=D, uniques=[('PLAN_TEMPLATE_VERSION_ID', 'MODULE_TEMPLATE_ID')], indexes=[('MODULE_TEMPLATE_ID',)])

table('PLAN_TEMPLATE_DEMAND_PHASE', 'Build phases of a demand profile: share of demand and months from start.', [
    VER(), c('SORT_ORDER', 'TINYINT UNSIGNED', 'Order'), c('PHASE_NAME', LABEL, 'Phase name'),
    c('SHARE_PCT', PCT, 'Share of the demand in this phase'), c('MONTHS_FROM_START', 'SMALLINT UNSIGNED', 'Months after the plan starts'),
], domain=D, uniques=[('PLAN_TEMPLATE_VERSION_ID', 'SORT_ORDER')])

table('PLAN_SITE_TYPE', 'Site type definition carried by a site-type profile version (custom site types; built-in types live in the application catalogue).', [
    fk('PLAN_TEMPLATE_VERSION_ID', 'PLAN_TEMPLATE_VERSION', 'Profile template version', od='CASCADE'),
    c('SITE_TYPE_KEY', KEY, 'Key, custom-<slug>'),
    c('NAME', NAME, 'Name'),
    c('SHORT_LABEL', SHORT, 'Short label'),
    c('SEGMENT', enum('Enterprise', 'Telco'), 'Segment'),
    n('DESCRIPTION', TEXT2K, 'Description'),
    c('BASED_ON_KEY', KEY, 'Built-in site type it was created from (benchmarks fall back to it)'),
    c('RACKS_MIN', 'INT UNSIGNED', 'Typical racks, low'),
    n('RACKS_MAX', 'INT UNSIGNED', 'Typical racks, high; NULL = no upper bound'),
    c('POWER_KW_MIN', KW, 'Typical IT power, low'),
    n('POWER_KW_MAX', KW, 'Typical IT power, high; NULL = no upper bound'),
    n('KW_PER_RACK_MIN', KW, 'Rack density, low'),
    n('KW_PER_RACK_MAX', KW, 'Rack density, high'),
    c('COOLING_APPROACH', NAME, 'Cooling approach'),
    c('REDUNDANCY', SHORT, 'Power redundancy (N, N+1, 2N)'),
    c('DEFAULT_TIER', TIER, 'Default tier'),
    c('IS_HIGH_DENSITY', BOOL, '1 = high-density site', default='0'),
    c('HAS_DC_POWER_PLANT', BOOL, '1 = -48 V DC plant', default='0'),
    c('IS_MULTI_TENANT', BOOL, '1 = multi-tenant', default='0'),
    c('COVERAGE', enum('Full', 'Strong', 'Partial', 'Gap'), 'How well the planner covers this site type'),
    c('PUE_TARGET', 'DECIMAL(4,2)', 'Design PUE target'),
    c('SEED_RACKS', 'INT UNSIGNED', 'Racks used to seed a new plan'),
    c('CONTAINMENT', SHORT, 'Aisle containment'),
    c('RACK_HEIGHT_U', 'TINYINT UNSIGNED', 'Rack height, U'),
    c('COOLING_ZONES', 'SMALLINT UNSIGNED', 'Cooling zones'),
    c('LIQUID_COOLING', enum('none', 'optional', 'standard'), 'Liquid cooling'),
    c('COOLING_OVERHEAD', 'DECIMAL(5,3)', 'Cooling overhead factor'),
    c('FEED_VOLTAGE', SHORT, 'Feed voltage'),
    c('BACKUP_RUNTIME_MIN_LOW', 'SMALLINT UNSIGNED', 'UPS runtime, low, minutes'),
    c('BACKUP_RUNTIME_MIN_HIGH', 'SMALLINT UNSIGNED', 'UPS runtime, high, minutes'),
    c('BUILDINGS', 'TINYINT UNSIGNED', 'Buildings'),
    c('FLOORS_MIN', 'TINYINT UNSIGNED', 'Floors per building, low'),
    c('FLOORS_MAX', 'TINYINT UNSIGNED', 'Floors per building, high'),
    c('WAN_KIND', enum('edge', 'enterprise', 'colo', 'telco'), 'WAN design'),
    c('IS_DIVERSITY_EXPECTED', BOOL, '1 = diverse routes expected', default='0'),
    c('CIRCUITS', 'TINYINT UNSIGNED', 'Expected WAN circuits'),
    c('BUILD_BLUEPRINT_KEY', KEY, 'Delivery blueprint'),
    c('BUILD_DURATION_FACTOR', 'DECIMAL(5,2)', 'Build duration factor against the blueprint'),
    c('BUILD_DEFAULT_BUDGET_USD', MONEY, 'Default budget, USD'),
    c('RACK_POWER_WARN_PCT', PCT, 'Rack power: warn at'),
    c('RACK_POWER_BLOCK_PCT', PCT, 'Rack power: block at'),
    c('COOLING_HEADROOM_MIN_PCT', PCT, 'Minimum cooling headroom'),
], pk=INT, domain=D, related='PLAN_SITE_TYPE → PLAN_TEMPLATE_VERSION; ← PLAN_SITE_TYPE_COOLING_UNIT, PLAN_SITE_TYPE_GAP',
    uniques=[('PLAN_TEMPLATE_VERSION_ID',)], indexes=[('TENANT_ID', 'SITE_TYPE_KEY')],
    checks=['RACKS_MAX IS NULL OR RACKS_MIN <= RACKS_MAX', 'POWER_KW_MAX IS NULL OR POWER_KW_MIN <= POWER_KW_MAX',
            'KW_PER_RACK_MIN IS NULL OR KW_PER_RACK_MAX IS NULL OR KW_PER_RACK_MIN <= KW_PER_RACK_MAX',
            'RACK_POWER_WARN_PCT < RACK_POWER_BLOCK_PCT', 'BACKUP_RUNTIME_MIN_LOW <= BACKUP_RUNTIME_MIN_HIGH', 'FLOORS_MIN <= FLOORS_MAX',
            'PUE_TARGET >= 1', 'RACK_HEIGHT_U IN (42, 45, 48)', "SITE_TYPE_KEY LIKE 'custom-%'"])

table('PLAN_SITE_TYPE_COOLING_UNIT', 'Cooling unit kinds a site type uses.', [
    fk('PLAN_SITE_TYPE_ID', 'PLAN_SITE_TYPE', 'Site type', od='CASCADE'),
    c('UNIT_KIND', enum('CRAC', 'CRAH', 'InRow', 'RDHx', 'CDU'), 'Cooling unit kind'),
], domain=D, uniques=[('PLAN_SITE_TYPE_ID', 'UNIT_KIND')])

table('PLAN_SITE_TYPE_GAP', 'Planner coverage gaps of a site type.', [
    fk('PLAN_SITE_TYPE_ID', 'PLAN_SITE_TYPE', 'Site type', od='CASCADE'),
    c('GAP', enum('multi-tenancy', 'dc-power-plant', 'optical-transport', 'service-inventory'), 'Gap'),
], domain=D, uniques=[('PLAN_SITE_TYPE_ID', 'GAP')])

# ---------------------------------------------------------------- benchmarks
table('BENCHMARK_MEASURE', 'Measures a benchmark value can be given for; the measure fixes the unit, the tab and which applies-to fields matter.', [
    c('MEASURE_CODE', KEY, 'Measure key the engine reads (capex, pue, leadWeeks:<item> ...)'),
    c('LABEL', NAME, 'Display name'),
    c('CATEGORY', enum('cost', 'performance', 'sizing', 'leadtime', 'staffing', 'sustainability'), 'Benchmarks tab'),
    c('UNIT', f'VARCHAR(24)', 'Unit of every value of this measure'),
    c('USES_SITE_TYPE', BOOL, '1 = values differ by site type', default='0'),
    c('USES_COOLING', BOOL, '1 = values differ by cooling type', default='0'),
    c('USES_CLIMATE', BOOL, '1 = values differ by climate', default='0'),
    c('USES_REGION', BOOL, '1 = values differ by region', default='0'),
    c('USES_TIER', BOOL, '1 = values differ by tier', default='0'),
], pk=SMALL, domain=D, related='BENCHMARK_MEASURE ← BENCHMARK', uniques=[('TENANT_ID', 'MEASURE_CODE')])

table('BENCHMARK', 'Identity of one benchmark case: a measure plus the applies-to fields. Values live in BENCHMARK_VERSION; one active case per measure.', [
    c('BENCHMARK_CODE', CODE, 'Benchmark id (BM-0001)'),
    fk('BENCHMARK_MEASURE_ID', 'BENCHMARK_MEASURE', 'Measure'),
    n('DC_TYPE_KEY', KEY, 'Applies to site type (built-in or custom-…)'),
    n('COOLING_TYPE', COOLING_TYPE, 'Applies to cooling type'),
    n('CLIMATE', CLIMATE, 'Applies to climate'),
    fk('GEOGRAPHY_REGION_ID', 'GEOGRAPHY_REGION', 'Applies to region', null=True),
    n('TIER', TIER, 'Applies to tier'),
    c('CASE_KEY', f'VARCHAR(200) {ASCII}', 'Measure + applies-to fields in one key (generated)',
      extra="GENERATED ALWAYS AS (CONCAT_WS('|', BENCHMARK_MEASURE_ID, IFNULL(DC_TYPE_KEY,'*'), IFNULL(COOLING_TYPE,'*'), IFNULL(CLIMATE,'*'), IFNULL(GEOGRAPHY_REGION_ID,'*'), IFNULL(TIER,'*'))) STORED"),
    n('RETIRED_AT', TS, 'When retired; values are retired, never deleted'),
    n('RETIRED_BY', USER_ID, 'Who retired it'),
    n('RETIRE_REASON', TEXT1K, 'Why'),
    c('ACTIVE_CASE_KEY', f'VARCHAR(200) {ASCII}', 'CASE_KEY while active, NULL when retired (generated; makes active cases unique)',
      extra='GENERATED ALWAYS AS (IF(RETIRED_AT IS NULL, CASE_KEY, NULL)) STORED'),
], pk=INT, domain=D, related='BENCHMARK → BENCHMARK_MEASURE; ← BENCHMARK_VERSION',
    uniques=[('TENANT_ID', 'BENCHMARK_CODE'), ('TENANT_ID', 'ACTIVE_CASE_KEY')], indexes=[('BENCHMARK_MEASURE_ID',), ('GEOGRAPHY_REGION_ID',)],
    checks=['(RETIRED_AT IS NULL) = (RETIRED_BY IS NULL)'])
TABLES['BENCHMARK']['cols'][[x.name for x in TABLES['BENCHMARK']['cols']].index('ACTIVE_CASE_KEY')].null = True

table('BENCHMARK_VERSION', 'One version of a benchmark value. Changing a confirmed value creates an Awaiting approval version; approval publishes it and supersedes the old one (DATA-020).', [
    fk('BENCHMARK_ID', 'BENCHMARK', 'Benchmark case'),
    c('VERSION_NO', 'SMALLINT UNSIGNED', 'Version number'),
    c('VERSION_STATUS', VERSION_STATUS, 'State of this version: Awaiting approval → Published (current) → Superseded'),
    c('LABEL', NAME, 'Display name of the value'),
    n('LOW_VALUE', NUM, 'Low end of the range'),
    n('TYPICAL_VALUE', NUM, 'Typical value'),
    n('HIGH_VALUE', NUM, 'High end of the range'),
    c('SOURCE', NAME, 'Source of the value'),
    c('SOURCE_DATE', DATE, 'As-of date of the source'),
    c('CONFIDENCE', enum('indicative', 'confirmed'), 'indicative saves directly; changing a confirmed value needs approval'),
    n('REQUEST_KIND', enum('new', 'change'), 'For Awaiting approval: a new value or a change'),
    n('REQUESTED_BY', USER_ID, 'Who requested the change'),
    n('REQUESTED_AT', TS, 'When'),
    n('REQUEST_REASON', TEXT1K, 'Why'),
    n('DECIDED_BY', USER_ID, 'Capacity Planner who approved or rejected (not the requester)'),
    n('DECIDED_AT', TS, 'When'),
    n('DECISION_REASON', TEXT1K, 'Reason'),
    c('LIVE_KEY', 'INT UNSIGNED', 'One published version per case (generated)',
      extra="GENERATED ALWAYS AS (IF(VERSION_STATUS = 'Published', BENCHMARK_ID, NULL)) STORED"),
    c('PENDING_KEY', 'INT UNSIGNED', 'One pending version per case (generated)',
      extra="GENERATED ALWAYS AS (IF(VERSION_STATUS = 'Awaiting approval', BENCHMARK_ID, NULL)) STORED"),
], pk=INT, domain=D, related='BENCHMARK_VERSION → BENCHMARK',
    uniques=[('BENCHMARK_ID', 'VERSION_NO'), ('LIVE_KEY',), ('PENDING_KEY',)],
    checks=['LOW_VALUE IS NULL OR TYPICAL_VALUE IS NULL OR LOW_VALUE <= TYPICAL_VALUE',
            'TYPICAL_VALUE IS NULL OR HIGH_VALUE IS NULL OR TYPICAL_VALUE <= HIGH_VALUE',
            'LOW_VALUE IS NULL OR HIGH_VALUE IS NULL OR LOW_VALUE <= HIGH_VALUE',
            'COALESCE(LOW_VALUE, TYPICAL_VALUE, HIGH_VALUE) IS NOT NULL',
            "VERSION_STATUS <> 'Awaiting approval' OR REQUESTED_BY IS NOT NULL", "VERSION_STATUS NOT IN ('Draft','Discarded')",
            'DECIDED_BY IS NULL OR REQUESTED_BY IS NULL OR DECIDED_BY <> REQUESTED_BY'])
for _k in ('LIVE_KEY', 'PENDING_KEY'):
    TABLES['BENCHMARK_VERSION']['cols'][[x.name for x in TABLES['BENCHMARK_VERSION']['cols']].index(_k)].null = True

# ---------------------------------------------------------------- plans
table('APPROVAL_DELEGATION', 'Delegation of an approving role from one user to another for a period.', [
    c('DELEGATION_CODE', CODE, 'Delegation id (DLG-001)'),
    c('ROLE_NAME', LABEL, 'Approving role delegated'),
    c('FROM_USER_ID', USER_ID, 'User who delegates (Platform Engineering)'),
    c('FROM_NAME', NAME, 'Display name cached'),
    c('TO_USER_ID', USER_ID, 'User who receives the role'),
    c('TO_NAME', NAME, 'Display name cached'),
    c('START_DATE', DATE, 'First day'),
    c('END_DATE', DATE, 'Last day'),
    n('REASON', TEXT1K, 'Reason'),
    c('STATUS', enum('Active', 'Revoked'), 'State', default="'Active'"),
    n('REVOKED_AT', TS, 'When revoked'),
    n('REVOKED_BY', USER_ID, 'Who revoked'),
], pk=INT, domain=D, uniques=[('TENANT_ID', 'DELEGATION_CODE')], indexes=[('TENANT_ID', 'TO_USER_ID', 'STATUS'), ('TENANT_ID', 'FROM_USER_ID')],
    checks=['START_DATE <= END_DATE', 'FROM_USER_ID <> TO_USER_ID', "STATUS <> 'Revoked' OR REVOKED_AT IS NOT NULL"])

table('PLAN', 'A capacity / build plan (BRD 7.9). A revision (B, C …) is its own row pointing at the plan it revises; approved figures are frozen in PLAN_BASELINE.', [
    c('PLAN_CODE', CODE, 'Plan id shown to users (PLN-0001)'),
    c('REVISION_LETTER', f'CHAR(1) {ASCII}', 'Revision letter; A = original', default="'A'"),
    fk('REVISION_OF_PLAN_ID', 'PLAN', 'Approved plan this revision changes', null=True),
    fk('PARENT_PLAN_ID', 'PLAN', 'Portfolio / programme plan this plan was split from', null=True),
    c('TITLE', NAME, 'Plan title'),
    c('PLAN_SCOPE', PLAN_SCOPE, 'Plan family'),
    c('STATUS', PLAN_STATUS, 'Plan state', default="'Draft'"),
    fk('PLAN_TEMPLATE_ID', 'PLAN_TEMPLATE', 'Plan type'),
    fk('PLAN_TEMPLATE_VERSION_ID', 'PLAN_TEMPLATE_VERSION', 'Plan type version the plan is pinned to', null=True),
    c('DC_TYPE_KEY', KEY, 'Kind of site (built-in or custom-…)'),
    n('INV_SITE_ID', EXT_ID, 'Datacenter id in Inventory; NULL for a new site, region or portfolio plan'),
    n('INV_CAMPUS_ID', EXT_ID, 'Campus id in Inventory'),
    fk('GEOGRAPHY_REGION_ID', 'GEOGRAPHY_REGION', 'Region for a new-site or portfolio plan', null=True),
    n('NEW_SITE_NAME', NAME, 'Name of a site that does not exist yet'),
    n('PEER_INV_SITE_ID', EXT_ID, 'Second site of a two-site plan (network / migration)'),
    c('CLIMATE', CLIMATE, 'Climate of the site'),
    c('INTENT', TEXT2K, 'Why the plan exists'),
    c('OWNER_USER_ID', USER_ID, 'Plan owner'),
    c('OWNER_NAME', NAME, 'Display name cached'),
    c('REQUESTED_BY_NAME', NAME, 'Requester (team or person)'),
    c('DESIGN_POWER_KW', KW, 'Design IT power, kW'),
    c('TARGET_GO_LIVE', DATE, 'Needed-by date'),
    c('DEMAND_GPU_PCT', PCT, 'Workload mix: GPU share'),
    c('DEMAND_COMPUTE_PCT', PCT, 'Workload mix: compute share'),
    c('DEMAND_STORAGE_PCT', PCT, 'Workload mix: storage share'),
    c('DENSITY_KW_PER_RACK', KW, 'Design rack density, kW'),
    c('TENANCY', enum('single', 'multi'), 'Tenancy'),
    c('GROWTH_PCT_PER_YEAR', PCT, 'Demand growth per year'),
    n('REVENUE_PER_KW_MONTH_USD', MONEY, 'Revenue per kW-month used in the business case'),
    n('TARIFF_USD_PER_KWH', RATE, 'Tariff used in the business case'),
    c('WIZARD_STEP_NO', 'TINYINT UNSIGNED', 'Wizard step the draft was left on', default='0'),
    n('WIZARD_STEP_KEY', KEY, 'Wizard step key'),
    c('IS_AI_ASSISTED', BOOL, '1 = AI filled inputs', default='0'),
    n('SUBMITTED_AT', TS, 'Last submission for approval'),
    n('SUBMITTED_BY', USER_ID, 'Who submitted'),
    n('APPROVAL_AMOUNT_USD', MONEY, 'CapEx the approval band was set from'),
    n('APPROVAL_BAND', SHORT, 'CapEx band that sets the approval path'),
    n('HELD_AT', TS, 'When put on hold'),
    n('HELD_BY', USER_ID, 'Who put it on hold'),
    n('HOLD_REASON', TEXT1K, 'Why'),
    n('STATUS_BEFORE_HOLD', PLAN_STATUS, 'Status to return to when the hold is lifted'),
    n('CANCELLED_AT', TS, 'When cancelled'),
    n('CANCELLED_BY', USER_ID, 'Who cancelled'),
    n('CANCEL_REASON', TEXT1K, 'Why'),
    n('IP_PLAN_AT', TS, 'When the IP plan (PLAN_IP_REQUEST) was last computed'),
    n('PRJ_PROGRAM_ID', EXT_ID, 'Programme in Programs & Projects after hand-over'),
    n('PRJ_PROJECT_ID', EXT_ID, 'Project in Programs & Projects after hand-over'),
    n('PROCESS_INSTANCE_ID', EXT_ID, 'Workflow process instance driving the plan'),
], domain=D,
    related='PLAN → PLAN_TEMPLATE, PLAN_TEMPLATE_VERSION, PLAN (revision / parent); ← every PLAN_* table, PLAN_REVIEW, WRITEBACK_REQUEST',
    uniques=[('TENANT_ID', 'PLAN_CODE', 'REVISION_LETTER')],
    indexes=[('TENANT_ID', 'STATUS'), ('TENANT_ID', 'INV_SITE_ID', 'STATUS'), ('PLAN_TEMPLATE_ID',), ('PLAN_TEMPLATE_VERSION_ID',),
             ('REVISION_OF_PLAN_ID',), ('PARENT_PLAN_ID',), ('GEOGRAPHY_REGION_ID',)],
    checks=['DEMAND_GPU_PCT + DEMAND_COMPUTE_PCT + DEMAND_STORAGE_PCT = 100', 'DESIGN_POWER_KW >= 0', 'DENSITY_KW_PER_RACK >= 0',
            "REVISION_LETTER BETWEEN 'A' AND 'Z'", "(REVISION_LETTER = 'A') = (REVISION_OF_PLAN_ID IS NULL)",
            "STATUS <> 'On hold' OR (HELD_AT IS NOT NULL AND STATUS_BEFORE_HOLD IS NOT NULL)",
            "STATUS <> 'Cancelled' OR CANCELLED_AT IS NOT NULL",
            'INV_SITE_ID IS NOT NULL OR NEW_SITE_NAME IS NOT NULL OR GEOGRAPHY_REGION_ID IS NOT NULL'])

PLAN_FK = lambda od='CASCADE': fk('PLAN_ID', 'PLAN', 'Plan', od=od)
table('PLAN_MODULE_PIN', 'Module versions a plan is pinned to (with its plan type version); a module that moves on is reported as drift.', [
    PLAN_FK(),
    fk('MODULE_TEMPLATE_ID', 'PLAN_TEMPLATE', 'Module template'),
    fk('PLAN_TEMPLATE_VERSION_ID', 'PLAN_TEMPLATE_VERSION', 'Pinned version of the module'),
], domain=D, uniques=[('PLAN_ID', 'MODULE_TEMPLATE_ID')], indexes=[('MODULE_TEMPLATE_ID',), ('PLAN_TEMPLATE_VERSION_ID',)])


def value_cols(prefix=''):
    return [c('INPUT_KEY', KEY, 'Input key (PLAN_TEMPLATE_INPUT.INPUT_KEY)'),
            c('VALUE_TYPE', enum('number', 'text', 'bool'), 'Type of the value'),
            n('VALUE_NUMBER', NUM, 'Value when VALUE_TYPE = number'),
            n('VALUE_TEXT', 'VARCHAR(255)', 'Value when VALUE_TYPE = text'),
            n('VALUE_BOOL', BOOL, 'Value when VALUE_TYPE = bool')]


VALUE_CHECK = ["(VALUE_TYPE = 'number') = (VALUE_NUMBER IS NOT NULL)", "(VALUE_TYPE = 'text') = (VALUE_TEXT IS NOT NULL)",
               "(VALUE_TYPE = 'bool') = (VALUE_BOOL IS NOT NULL)"]
table('PLAN_INPUT', 'Input value of a plan and where it came from (user, requirement, template, benchmark, actual ...). Requirements are inputs with source = requirement.', [
    PLAN_FK(), *value_cols(), c('VALUE_SOURCE', VALUE_SOURCE, 'Where the value came from'),
], domain=D, uniques=[('PLAN_ID', 'INPUT_KEY')], checks=VALUE_CHECK)

table('PLAN_PHASE', 'Build phase of a plan: go-live, IT kW, halls, racks.', [
    PLAN_FK(),
    c('PHASE_CODE', CODE, 'Phase id within the plan (P1, P2 …)'),
    c('SORT_ORDER', 'TINYINT UNSIGNED', 'Order'),
    c('NAME', LABEL, 'Phase name'),
    c('GO_LIVE', DATE, 'Go-live date'),
    c('IT_KW', KW, 'IT capacity delivered, kW'),
    c('HALLS', 'SMALLINT UNSIGNED', 'Halls delivered', default='0'),
    c('RACKS', 'INT UNSIGNED', 'Racks delivered', default='0'),
    c('STATUS', enum('Planned', 'Approved', 'In delivery', 'Live'), 'Phase state', default="'Planned'"),
], domain=D, related='PLAN_PHASE ← PLAN_PHASE_INPUT, PLAN_PERMIT', uniques=[('PLAN_ID', 'PHASE_CODE'), ('PLAN_ID', 'SORT_ORDER')],
    checks=['IT_KW >= 0'])

table('PLAN_PHASE_INPUT', 'Input value that differs for one phase.', [
    fk('PLAN_PHASE_ID', 'PLAN_PHASE', 'Phase', od='CASCADE'), *value_cols(),
], domain=D, uniques=[('PLAN_PHASE_ID', 'INPUT_KEY')], checks=VALUE_CHECK)

table('PLAN_SCENARIO', 'What-if scenario of a plan; at most one preferred per plan.', [
    fk('PLAN_ID', 'PLAN', 'Plan'),
    c('SCENARIO_CODE', CODE, 'Scenario id (SCN-001)'),
    c('NAME', LABEL, 'Scenario name'),
    n('DESCRIPTION', TEXT1K, 'What it changes'),
    c('IS_PREFERRED', BOOL, '1 = preferred scenario', default='0'),
    c('PREFERRED_KEY', 'BIGINT UNSIGNED', 'One preferred scenario per plan (generated)',
      extra='GENERATED ALWAYS AS (IF(IS_PREFERRED = 1, PLAN_ID, NULL)) STORED'),
], domain=D, related='PLAN_SCENARIO ← PLAN_SCENARIO_INPUT, PLAN_SCENARIO_PHASE, PLAN_APPROVAL_ROUND, PLAN_BASELINE',
    uniques=[('PLAN_ID', 'SCENARIO_CODE'), ('PREFERRED_KEY',)])
TABLES['PLAN_SCENARIO']['cols'][[x.name for x in TABLES['PLAN_SCENARIO']['cols']].index('PREFERRED_KEY')].null = True

table('PLAN_SCENARIO_INPUT', 'Input value a scenario overrides.', [
    fk('PLAN_SCENARIO_ID', 'PLAN_SCENARIO', 'Scenario', od='CASCADE'), *value_cols(),
], domain=D, uniques=[('PLAN_SCENARIO_ID', 'INPUT_KEY')], checks=VALUE_CHECK)

table('PLAN_SCENARIO_PHASE', 'Phase figures a scenario overrides.', [
    fk('PLAN_SCENARIO_ID', 'PLAN_SCENARIO', 'Scenario', od='CASCADE'),
    fk('PLAN_PHASE_ID', 'PLAN_PHASE', 'Phase overridden'),
    c('NAME', LABEL, 'Phase name'), c('GO_LIVE', DATE, 'Go-live'), c('IT_KW', KW, 'IT kW'),
    c('HALLS', 'SMALLINT UNSIGNED', 'Halls', default='0'), c('RACKS', 'INT UNSIGNED', 'Racks', default='0'),
], domain=D, uniques=[('PLAN_SCENARIO_ID', 'PLAN_PHASE_ID')], indexes=[('PLAN_PHASE_ID',)], checks=['IT_KW >= 0'])

table('PLAN_RISK', 'Risk register of a plan (living: updates save straight onto an approved plan).', [
    PLAN_FK(),
    c('RISK_CODE', CODE, 'Risk id within the plan'),
    c('TITLE', NAME, 'Risk'),
    c('RISK_DOMAIN', enum('Facility', 'Network', 'Supplier', 'Commissioning', 'Regulatory', 'Finance', 'Security'), 'Domain'),
    c('PROBABILITY', LMH, 'Likelihood'),
    c('IMPACT', LMH, 'Impact'),
    c('OWNER_NAME', NAME, 'Owner'),
    c('MITIGATION', TEXT2K, 'Mitigation'),
    c('VALUE_SOURCE', VALUE_SOURCE, 'Where the risk came from (user, template, benchmark ...)'),
    n('EVIDENCE', TEXT1K, 'Evidence'),
], domain=D, uniques=[('PLAN_ID', 'RISK_CODE')])

table('PLAN_PERMIT', 'Permit a plan needs, with lead time and the phase it gates.', [
    PLAN_FK(),
    c('PERMIT_CODE', CODE, 'Permit id within the plan'),
    c('NAME', NAME, 'Permit'),
    c('AUTHORITY', NAME, 'Issuing authority'),
    c('LEAD_WEEKS', 'SMALLINT UNSIGNED', 'Lead time, weeks'),
    c('NEEDED_BEFORE', DATE, 'Date it is needed by'),
    c('STATUS', enum('Not started', 'Applied', 'In review', 'Approved', 'Expired'), 'Permit state', default="'Not started'"),
    fk('GATES_PLAN_PHASE_ID', 'PLAN_PHASE', 'Phase that cannot start without it', null=True, od='SET NULL'),
    n('GATES_PROJECT_KEY', KEY, 'Delivery project key it gates'),
    n('UPLIFT_KW', KW, 'Grid uplift the permit grants, kW'),
    n('ENERGISED_BY', DATE, 'Energisation date promised'),
    n('APPLIED_AT', DATE, 'Application date'),
    n('INV_SITE_ID', EXT_ID, 'Site in Inventory the permit is for (multi-site plans)'),
], domain=D, uniques=[('PLAN_ID', 'PERMIT_CODE')], indexes=[('GATES_PLAN_PHASE_ID',)])

table('PLAN_APPROVAL_ROUND', 'One submission of a plan for approval and its outcome.', [
    fk('PLAN_ID', 'PLAN', 'Plan'),
    c('ROUND_NO', 'TINYINT UNSIGNED', 'Round number'),
    c('SUBMITTED_AT', TS, 'Submitted'),
    c('SUBMITTED_BY', USER_ID, 'Submitted by'),
    fk('PLAN_SCENARIO_ID', 'PLAN_SCENARIO', 'Scenario under review; NULL = the base plan', null=True),
    n('AMOUNT_USD', MONEY, 'CapEx under review'),
    n('APPROVAL_BAND', SHORT, 'Band that set the path'),
    c('ROUND_OUTCOME', enum('Open', 'Approved', 'Rejected', 'Withdrawn', 'Superseded'), 'Outcome', default="'Open'"),
    n('CLOSED_AT', TS, 'When the round closed'),
    c('OPEN_ROUND_KEY', 'BIGINT UNSIGNED', 'One open round per plan (generated)',
      extra="GENERATED ALWAYS AS (IF(ROUND_OUTCOME = 'Open', PLAN_ID, NULL)) STORED"),
], domain=D, related='PLAN_APPROVAL_ROUND ← PLAN_APPROVAL', uniques=[('PLAN_ID', 'ROUND_NO'), ('OPEN_ROUND_KEY',)],
    indexes=[('PLAN_SCENARIO_ID',)], checks=["(ROUND_OUTCOME = 'Open') = (CLOSED_AT IS NULL)"])
TABLES['PLAN_APPROVAL_ROUND']['cols'][[x.name for x in TABLES['PLAN_APPROVAL_ROUND']['cols']].index('OPEN_ROUND_KEY')].null = True

table('PLAN_APPROVAL', 'Decision of one approval step in a round.', [
    fk('PLAN_APPROVAL_ROUND_ID', 'PLAN_APPROVAL_ROUND', 'Round', od='CASCADE'),
    c('STEP_ORDER', 'TINYINT UNSIGNED', 'Order in the path'),
    c('STEP_NAME', LABEL, 'Step'),
    c('ROLE_NAME', LABEL, 'Approving role'),
    n('APPROVER_USER_ID', USER_ID, 'Who decided'),
    n('APPROVER_NAME', NAME, 'Display name cached'),
    c('APPROVAL_DECISION', enum('Pending', 'Approved', 'Rejected', 'Approved with conditions'), 'Decision', default="'Pending'"),
    n('DECIDED_AT', TS, 'When'),
    n('BASIS', TEXT1K, 'Basis of the decision'),
    n('REASON', TEXT1K, 'Reason (rejections)'),
    n('ON_BEHALF_OF_USER_ID', USER_ID, 'Delegating user when decided under a delegation'),
    fk('APPROVAL_DELEGATION_ID', 'APPROVAL_DELEGATION', 'Delegation used', null=True),
], domain=D, uniques=[('PLAN_APPROVAL_ROUND_ID', 'STEP_ORDER')], indexes=[('APPROVAL_DELEGATION_ID',), ('TENANT_ID', 'APPROVER_USER_ID')],
    checks=["(APPROVAL_DECISION = 'Pending') = (DECIDED_AT IS NULL)", "APPROVAL_DECISION <> 'Rejected' OR REASON IS NOT NULL",
            '(ON_BEHALF_OF_USER_ID IS NULL) = (APPROVAL_DELEGATION_ID IS NULL)'])

table('PLAN_CONDITION', 'Condition attached to an approval; open conditions that block execution stop "Start the build".', [
    PLAN_FK(),
    fk('PLAN_APPROVAL_ID', 'PLAN_APPROVAL', 'Approval that set it', null=True, od='SET NULL'),
    c('CONDITION_CODE', CODE, 'Condition id within the plan'),
    c('CONDITION_TEXT', TEXT2K, 'Condition'),
    c('OWNER_NAME', NAME, 'Owner'),
    n('DUE_DATE', DATE, 'Due'),
    c('RAISED_BY', USER_ID, 'Raised by'),
    c('RAISED_AT', TS, 'Raised'),
    c('STATUS', enum('Open', 'Closed'), 'State', default="'Open'"),
    n('CLOSED_AT', TS, 'Closed'),
    n('CLOSED_BY', USER_ID, 'Closed by'),
    n('EVIDENCE', TEXT1K, 'Evidence given on closing'),
    c('BLOCKS_EXECUTION', BOOL, '1 = the build cannot start while open', default='0'),
], domain=D, uniques=[('PLAN_ID', 'CONDITION_CODE')], indexes=[('PLAN_APPROVAL_ID',)],
    checks=["(STATUS = 'Closed') = (CLOSED_AT IS NOT NULL)"])

table('PLAN_BASELINE', 'Snapshot frozen at approval: pinned versions, headline figures and the full figures (DATA-022). Never updated.', [
    fk('PLAN_ID', 'PLAN', 'Plan'),
    c('TAKEN_AT', TS, 'When frozen'),
    c('TAKEN_BY', USER_ID, 'Who approved last'),
    fk('PLAN_SCENARIO_ID', 'PLAN_SCENARIO', 'Approved scenario; NULL = base plan', null=True),
    fk('PLAN_TEMPLATE_VERSION_ID', 'PLAN_TEMPLATE_VERSION', 'Plan type version at approval'),
    c('DESIGN_POWER_KW', KW, 'Design IT kW'),
    c('TARGET_GO_LIVE', DATE, 'Needed-by'),
    c('CAPEX_TOTAL_USD', MONEY, 'CapEx'),
    c('CONTINGENCY_USD', MONEY, 'Contingency'),
    c('OPEX_MONTHLY_USD', MONEY, 'OpEx per month'),
    c('BOM_TOTAL_USD', MONEY, 'Bill of materials total'),
    n('SOURCED_TOTAL_USD', MONEY, 'Part of the bill from site capacity or stock'),
    n('BUY_TOTAL_USD', MONEY, 'Part of the bill bought'),
    c('HARD_FAILS', 'SMALLINT UNSIGNED', 'Must-pass rules failing'),
    c('SOFT_WARNS', 'SMALLINT UNSIGNED', 'Should-pass rules warning'),
    c('READINESS_PCT', PCT, 'Readiness'),
    c('SNAPSHOT', 'JSON', 'Frozen inputs, phases, module versions, schedule and benchmark figures as approved'),
], domain=D, uniques=[('PLAN_ID',)], indexes=[('PLAN_SCENARIO_ID',), ('PLAN_TEMPLATE_VERSION_ID',)],
    checks=['CAPEX_TOTAL_USD >= 0', 'OPEX_MONTHLY_USD >= 0', 'BOM_TOTAL_USD >= 0'])

table('PLAN_CLOSEOUT', 'Close-out of a delivered plan: delivered kW, actual cost, measured load.', [
    fk('PLAN_ID', 'PLAN', 'Plan'),
    c('COMPLETED_AT', TS, 'Completed'), c('COMPLETED_BY', USER_ID, 'Completed by'),
    c('DELIVERED_KW', KW, 'Delivered IT kW'), c('ACTUAL_CAPEX_USD', MONEY, 'Actual CapEx'),
    n('ACTUAL_OPEX_MONTHLY_USD', MONEY, 'Actual OpEx per month'), n('MEASURED_KW', KW, 'Measured load (meter)'),
    n('MEASURED_AT', TS, 'Meter reading time'), n('NOTES', TEXT2K, 'Notes'),
], domain=D, related='PLAN_CLOSEOUT ← PLAN_CLOSEOUT_CHECK', uniques=[('PLAN_ID',)], checks=['DELIVERED_KW >= 0', 'ACTUAL_CAPEX_USD >= 0'])

table('PLAN_CLOSEOUT_CHECK', 'Close-out checklist line.', [
    fk('PLAN_CLOSEOUT_ID', 'PLAN_CLOSEOUT', 'Close-out', od='CASCADE'),
    c('CHECK_KEY', KEY, 'Check key'), c('LABEL', NAME, 'Check'), c('IS_OK', BOOL, '1 = passed'), n('DETAIL', TEXT1K, 'Detail'),
], domain=D, uniques=[('PLAN_CLOSEOUT_ID', 'CHECK_KEY')])

table('PLAN_MATERIAL_OVERRIDE', 'Edit to the plan\'s bill of materials: quantity, model, vendor, source, removed or added line.', [
    PLAN_FK(),
    c('OVERRIDE_KEY', f'VARCHAR(255) {ASCII}', 'kind|item|phase|site of the bill line, or ADD-n for an added line'),
    c('MATERIAL_KIND', SHORT, 'Kind of material'),
    c('ITEM', NAME, 'Item'),
    fk('PLAN_PHASE_ID', 'PLAN_PHASE', 'Phase of the bill line', null=True),
    n('INV_SITE_ID', EXT_ID, 'Site (multi-site plans)'),
    n('QTY', 'DECIMAL(12,2)', 'New quantity'),
    n('MODEL', NAME, 'New model'),
    n('SUPPLY_SOURCE', enum('auto', 'site', 'stock', 'buy'), 'Where the item comes from'),
    n('VENDOR', NAME, 'Vendor or channel'),
    c('IS_REMOVED', BOOL, '1 = line removed', default='0'),
    c('IS_ADDED', BOOL, '1 = line added from the catalogue', default='0'),
    n('ADDED_CATEGORY', SHORT, 'Category of an added line'),
    n('ADDED_UNIT', f'VARCHAR(16)', 'Unit of an added line'),
    n('ADDED_SPEC', TEXT1K, 'Specification of an added line'),
    n('REASON', TEXT1K, 'Why'),
], domain=D, uniques=[('PLAN_ID', 'OVERRIDE_KEY')], checks=['QTY IS NULL OR QTY >= 0', 'NOT (IS_REMOVED = 1 AND IS_ADDED = 1)',
                                                           'IS_ADDED = 0 OR ADDED_CATEGORY IS NOT NULL'])

table('PLAN_SITE', 'Site row of a multi-site plan (edge rollout, portfolio): existing site, edge location, candidate or campus.', [
    PLAN_FK(),
    c('SITE_ROW_CODE', CODE, 'Row id within the plan'),
    c('NAME', NAME, 'Site name'),
    c('REF_KIND', enum('dataCenter', 'edgeLocation', 'candidate', 'campus'), 'What the row points at'),
    n('REF_ID', EXT_ID, 'Inventory id, or PLAN_CANDIDATE_SITE.CANDIDATE_CODE for a candidate'),
    n('VARIANT', SHORT, 'Site variant'),
    c('IT_KW', KW, 'IT kW'),
    c('GO_LIVE', DATE, 'Go-live'),
    n('WAVE_NO', 'TINYINT UNSIGNED', 'Rollout wave'),
    n('ROUTE', enum('expansion', 'new-dc', 'hall', 'pod', 'edge'), 'How the site is delivered'),
    n('CAPEX_USD', MONEY, 'CapEx'),
    fk('CHILD_PLAN_ID', 'PLAN', 'Plan created for this site', null=True, od='SET NULL'),
    n('STATUS', enum('Proposed', 'Accepted', 'Rejected'), 'Row state'),
    n('SUPPLY_KVA', 'DECIMAL(12,2)', 'Grid supply, kVA'),
    n('LATITUDE', LAT, 'Latitude'), n('LONGITUDE', LNG, 'Longitude'),
    n('CITY', LABEL, 'City'), n('COUNTRY_CODE', f'CHAR(2) {ASCII}', 'ISO country'),
    n('NOTES', TEXT1K, 'Notes'),
], domain=D, uniques=[('PLAN_ID', 'SITE_ROW_CODE')], indexes=[('CHILD_PLAN_ID',)],
    checks=['LATITUDE IS NULL OR LATITUDE BETWEEN -90 AND 90', 'LONGITUDE IS NULL OR LONGITUDE BETWEEN -180 AND 180', 'IT_KW >= 0'])

table('PLAN_CANDIDATE_SITE', 'Candidate plot for a new-site plan, scored on land, grid, water, fibre and hazards.', [
    PLAN_FK(),
    c('CANDIDATE_CODE', CODE, 'Candidate id within the plan'),
    c('NAME', NAME, 'Name'),
    n('LATITUDE', LAT, 'Latitude'), n('LONGITUDE', LNG, 'Longitude'),
    fk('GEOGRAPHY_REGION_ID', 'GEOGRAPHY_REGION', 'Region', null=True), n('CLIMATE', CLIMATE, 'Climate'),
    c('PLOT_HA', 'DECIMAL(10,2)', 'Plot, hectares'), c('BUILDABLE_HA', 'DECIMAL(10,2)', 'Buildable, hectares'),
    c('ZONING', enum('Zoned for data centre', 'Rezoning needed', 'Unknown'), 'Zoning'),
    c('GRID_OFFER_MVA', 'DECIMAL(10,2)', 'Grid offer, MVA'), c('GRID_ENERGISATION', DATE, 'Grid energisation date'),
    c('IS_GRID_FIRM', BOOL, '1 = firm grid offer'), c('WATER_M3_PER_DAY', 'DECIMAL(12,2)', 'Water, m³/day'),
    c('FIBRE_ROUTES', 'TINYINT UNSIGNED', 'Fibre routes'), c('KM_TO_POP', 'DECIMAL(8,2)', 'Distance to POP, km'),
    c('IS_FLOOD_ZONE', BOOL, '1 = flood zone'), c('IS_SEISMIC_ZONE', BOOL, '1 = seismic zone'),
    c('LAND_COST_USD', MONEY, 'Land cost'), n('TARIFF_USD_PER_KWH', RATE, 'Local tariff'),
    n('INCENTIVES', TEXT1K, 'Incentives'), c('IS_CHOSEN', BOOL, '1 = chosen plot', default='0'), n('NOTES', TEXT1K, 'Notes'),
], domain=D, uniques=[('PLAN_ID', 'CANDIDATE_CODE')],
    checks=['BUILDABLE_HA <= PLOT_HA', 'LATITUDE IS NULL OR LATITUDE BETWEEN -90 AND 90', 'LONGITUDE IS NULL OR LONGITUDE BETWEEN -180 AND 180'])

table('PLAN_WAVE', 'Wave of a refresh / migration plan: what moves when, method, rollback and result.', [
    PLAN_FK(),
    c('WAVE_CODE', CODE, 'Wave id within the plan'),
    c('NAME', LABEL, 'Name'), c('SORT_ORDER', 'SMALLINT UNSIGNED', 'Order'),
    c('WAVE_KIND', enum('pilot', 'wave', 'drain', 'works', 'repopulate', 'soak'), 'Kind'),
    n('FEED_SIDE', FEED_SIDE, 'Power side worked on'),
    n('METHOD', NAME, 'Method'),
    c('WINDOW_START', TS, 'Window start'), c('WINDOW_END', TS, 'Window end'),
    n('CREW_HOURS', 'DECIMAL(8,2)', 'Crew hours'),
    c('ROLLBACK_TEXT', TEXT1K, 'Rollback'), n('ACCEPTANCE', TEXT1K, 'Acceptance'),
    n('ITSM_CHANGE_ID', EXT_ID, 'Change request (ITSM)'), n('ITSM_MAINTENANCE_WINDOW_ID', EXT_ID, 'Maintenance window (ITSM)'),
    n('PRJ_ATP_ID', EXT_ID, 'Acceptance test (Programs & Projects commissioning)'),
    c('STATUS', enum('Planned', 'Scheduled', 'In progress', 'Closed', 'Rolled back', 'Cancelled'), 'State', default="'Planned'"),
    n('CLOSED_AT', TS, 'Closed'), n('CLOSED_BY', USER_ID, 'Closed by'),
    n('ACTUAL_DOWNTIME_MIN', 'INT UNSIGNED', 'Actual downtime, minutes'), n('IT_KW', KW, 'IT kW moved'), n('NOTES', TEXT1K, 'Notes'),
], domain=D, related='PLAN_WAVE ← PLAN_WAVE_RECORD, PLAN_DISPOSITION', uniques=[('PLAN_ID', 'WAVE_CODE')], indexes=[('ITSM_CHANGE_ID',)],
    checks=['WINDOW_START < WINDOW_END', "STATUS NOT IN ('Closed','Rolled back') OR CLOSED_AT IS NOT NULL"])

table('PLAN_WAVE_RECORD', 'Inventory / BSS record a wave moves, targets or uses as swing space.', [
    fk('PLAN_WAVE_ID', 'PLAN_WAVE', 'Wave', od='CASCADE'),
    c('RECORD_ROLE', enum('device', 'rack', 'service', 'circuit', 'target-rack', 'swing-rack'), 'Role of the record in the wave'),
    c('MODULE_RECORD_ID', EXT_ID, 'Record id in Inventory (device, rack, circuit) or BSS (service)'),
], domain=D, uniques=[('PLAN_WAVE_ID', 'RECORD_ROLE', 'MODULE_RECORD_ID')], indexes=[('TENANT_ID', 'MODULE_RECORD_ID')])

table('PLAN_PLANT_LINE', 'Plant line-up of a plant plan: unit to add, replace or uprate.', [
    PLAN_FK(),
    c('LINE_CODE', CODE, 'Line id within the plan'),
    c('PLANT_SYSTEM', enum('UPS', 'Generator', 'Transformer', 'Chiller', 'CRAH', 'CDU', 'Switchgear', 'Battery', 'Dry cooler'), 'System'),
    c('ACTION', enum('add', 'replace', 'uprate'), 'Action'),
    n('TARGET_INV_ASSET_ID', EXT_ID, 'Existing unit in Inventory being replaced / uprated'),
    n('TARGET_ASSET_LABEL', NAME, 'Its display name cached'),
    n('MODEL', NAME, 'Model'), n('MANUFACTURER', NAME, 'Maker'),
    c('RATING_KW', KW, 'Rating, kW'), n('RATING_KVA', 'DECIMAL(12,2)', 'Rating, kVA'), n('POWER_FACTOR', 'DECIMAL(4,3)', 'Power factor'),
    n('RATING_BASIS', enum('Standby (ESP)', 'Prime (PRP)', 'Continuous (COP)'), 'Generator rating basis'),
    n('RUNTIME_MIN', 'SMALLINT UNSIGNED', 'Battery runtime, minutes'),
    c('QTY', 'SMALLINT UNSIGNED', 'Quantity'), n('BUILD_STAGE', SHORT, 'Build stage'),
    n('ZONE_REF', EXT_ID, 'Cooling zone (Inventory)'), n('FEED_SIDE', FEED_SIDE, 'Power side'),
    n('UNIT_COST_USD', MONEY, 'Unit cost'), n('NOTES', TEXT1K, 'Notes'),
], domain=D, uniques=[('PLAN_ID', 'LINE_CODE')], checks=['QTY > 0', 'RATING_KW >= 0', 'POWER_FACTOR IS NULL OR POWER_FACTOR BETWEEN 0 AND 1'])

table('PLAN_CUT_IN_STEP', 'Cut-in sequence of a plant plan: what is isolated, how the load is carried, rollback.', [
    PLAN_FK(),
    c('STEP_CODE', CODE, 'Step id within the plan'), c('SORT_ORDER', 'SMALLINT UNSIGNED', 'Order'), c('TITLE', NAME, 'Step'),
    c('ISOLATED_LABEL', NAME, 'What is isolated, in words'),
    c('TRANSFER', enum('Static bypass', 'Maintenance bypass', 'Transfer to B path', 'Temporary generator', 'Rental chiller', 'None'), 'How the load is carried'),
    c('WINDOW_START', TS, 'Window start'), c('WINDOW_END', TS, 'Window end'),
    c('MITIGATION', TEXT1K, 'Mitigation'), c('ROLLBACK_TEXT', TEXT1K, 'Rollback'),
    n('ITSM_CHANGE_ID', EXT_ID, 'Change request'), n('ITSM_MAINTENANCE_WINDOW_ID', EXT_ID, 'Maintenance window'),
    c('STATUS', enum('Planned', 'Scheduled', 'Done', 'Rolled back'), 'State', default="'Planned'"),
    n('BUILD_STAGE', SHORT, 'Build stage'), n('TEMPORARY_PLANT', NAME, 'Temporary plant'), n('TEMPORARY_KW', KW, 'Temporary plant kW'),
    n('MOP_REF', SHORT, 'Method of procedure reference'), n('MOP_APPROVED_BY', USER_ID, 'MOP approver'),
], domain=D, related='PLAN_CUT_IN_STEP ← PLAN_CUT_IN_ASSET, PLAN_CUT_IN_LINE', uniques=[('PLAN_ID', 'STEP_CODE')], indexes=[('ITSM_CHANGE_ID',)],
    checks=['WINDOW_START < WINDOW_END'])

table('PLAN_CUT_IN_ASSET', 'Inventory asset isolated by a cut-in step.', [
    fk('PLAN_CUT_IN_STEP_ID', 'PLAN_CUT_IN_STEP', 'Cut-in step', od='CASCADE'),
    c('INV_ASSET_ID', EXT_ID, 'Asset id in Inventory'),
], domain=D, uniques=[('PLAN_CUT_IN_STEP_ID', 'INV_ASSET_ID')])

table('PLAN_CUT_IN_LINE', 'Plant line a cut-in step connects (junction).', [
    fk('PLAN_CUT_IN_STEP_ID', 'PLAN_CUT_IN_STEP', 'Cut-in step', od='CASCADE'),
    fk('PLAN_PLANT_LINE_ID', 'PLAN_PLANT_LINE', 'Plant line', od='CASCADE'),
], domain=D, uniques=[('PLAN_CUT_IN_STEP_ID', 'PLAN_PLANT_LINE_ID')], indexes=[('PLAN_PLANT_LINE_ID',)])

table('PLAN_NETWORK_PATH', 'Network path of a network / DCI plan: provider, link type, diversity, ends and cost.', [
    PLAN_FK(),
    c('PATH_CODE', CODE, 'Path id within the plan'), c('NAME', NAME, 'Name'),
    n('SCM_PROVIDER_ID', EXT_ID, 'Provider (Supply Chain)'), c('PROVIDER_NAME', NAME, 'Provider name cached'),
    n('ROUTE_REF', SHORT, 'Route id'), n('DIVERSITY_GROUP', SHORT, 'Diversity group'),
    c('LINK_TYPE', enum('Leased wavelength', 'Leased IP transit', 'Dark fibre with owned DWDM', 'ZR optics on dark fibre'), 'Link type'),
    c('CAPACITY_GBPS', 'DECIMAL(10,2)', 'Capacity, Gbps'), n('LATENCY_MS', 'DECIMAL(8,3)', 'Latency, ms'), n('DISTANCE_KM', 'DECIMAL(9,2)', 'Route, km'),
    n('A_INV_DEVICE_ID', EXT_ID, 'A-end device (Inventory)'), n('A_PORT_NAME', SHORT, 'A-end port'),
    n('Z_INV_DEVICE_ID', EXT_ID, 'Z-end device (Inventory)'), n('Z_PORT_NAME', SHORT, 'Z-end port'),
    c('MONTHLY_USD', MONEY, 'Monthly charge'), c('INSTALL_USD', MONEY, 'Install charge'), c('TERM_MONTHS', 'SMALLINT UNSIGNED', 'Term, months'),
    n('REPLACES_INV_CIRCUIT_ID', EXT_ID, 'Circuit it replaces (Inventory)'), n('INV_CIRCUIT_ID', EXT_ID, 'Circuit created (Inventory)'),
    n('ENCRYPTION', enum('MACsec', 'Optical (OTNsec)', 'IPsec', 'None'), 'Encryption'), n('ROUTE_NOTES', TEXT1K, 'Route notes'),
], domain=D, related='PLAN_NETWORK_PATH ← PLAN_NETWORK_PATH_SRLG', uniques=[('PLAN_ID', 'PATH_CODE')],
    checks=['CAPACITY_GBPS > 0', 'MONTHLY_USD >= 0', 'INSTALL_USD >= 0'])

table('PLAN_NETWORK_PATH_SRLG', 'Shared-risk link group a path belongs to.', [
    fk('PLAN_NETWORK_PATH_ID', 'PLAN_NETWORK_PATH', 'Path', od='CASCADE'), c('SRLG', SHORT, 'Shared-risk group'),
], domain=D, uniques=[('PLAN_NETWORK_PATH_ID', 'SRLG')])

table('PLAN_CONSENT', 'Customer notice and consent for a migration plan.', [
    PLAN_FK(),
    c('BSS_CUSTOMER_ID', EXT_ID, 'Customer (BSS)'), c('CUSTOMER_NAME', NAME, 'Name cached'),
    c('NOTICE_DAYS', 'SMALLINT UNSIGNED', 'Notice period, days'), n('NOTIFIED_AT', TS, 'Notified'), n('CONSENT_AT', TS, 'Consent given'),
    c('STATUS', enum('Not sent', 'Notified', 'Consented', 'Refused'), 'State', default="'Not sent'"),
    n('ACCOUNT_MANAGER', NAME, 'Account manager'), n('NOTES', TEXT1K, 'Notes'),
], domain=D, related='PLAN_CONSENT ← PLAN_CONSENT_SERVICE', uniques=[('PLAN_ID', 'BSS_CUSTOMER_ID')],
    checks=["STATUS <> 'Consented' OR CONSENT_AT IS NOT NULL"])

table('PLAN_CONSENT_SERVICE', 'Service covered by a consent.', [
    fk('PLAN_CONSENT_ID', 'PLAN_CONSENT', 'Consent', od='CASCADE'), c('BSS_SERVICE_ID', EXT_ID, 'Service (BSS)'),
], domain=D, uniques=[('PLAN_CONSENT_ID', 'BSS_SERVICE_ID')])

table('PLAN_DISPOSITION', 'What happens to each record of a migration / exit (move, retire, cease, re-terminate …).', [
    PLAN_FK(),
    c('DISPOSED_RECORD_TYPE', enum('device', 'rack', 'service', 'circuit', 'subnet', 'vlan', 'contract', 'plant'), 'Record type'),
    c('MODULE_RECORD_ID', EXT_ID, 'Record id in its module'), c('LABEL', NAME, 'Name cached'),
    c('DISPOSITION', enum('move', 'retire', 'dispose', 'keep', 'hand-back', 'cease', 're-terminate', 'release', 'end', 'renew'), 'Disposition'),
    n('TARGET_REF', EXT_ID, 'Where it goes'), fk('PLAN_WAVE_ID', 'PLAN_WAVE', 'Wave', null=True, od='SET NULL'),
    n('DUE_DATE', DATE, 'Date'), n('COST_USD', MONEY, 'Cost'), n('NOTES', TEXT1K, 'Notes'),
], domain=D, uniques=[('PLAN_ID', 'DISPOSED_RECORD_TYPE', 'MODULE_RECORD_ID')], indexes=[('PLAN_WAVE_ID',)])

table('PLAN_MODEL_MAPPING', 'Old model → new model mapping of a refresh plan.', [
    PLAN_FK(),
    c('MAPPING_CODE', CODE, 'Row id'), c('OLD_MODEL', NAME, 'Old model'), n('ROLE', SHORT, 'Role'), c('OLD_COUNT', 'INT UNSIGNED', 'Old units'),
    c('NEW_MODEL', NAME, 'New model'), c('RATIO', 'DECIMAL(6,3)', 'New per old'),
    c('OLD_UNIT_DISPOSITION', enum('dispose', 'keep', 'resell'), 'What happens to the old units'),
    c('NEW_UNITS', 'INT UNSIGNED', 'New units'), c('NEW_KW', KW, 'New kW'), c('OLD_KW', KW, 'Old kW'),
], domain=D, uniques=[('PLAN_ID', 'MAPPING_CODE')], checks=['RATIO > 0'])

table('PLAN_PLACEMENT', 'Placement of an in-site plan: existing racks, new cabinets or empty positions in a hall.', [
    fk('PLAN_ID', 'PLAN', 'Plan', od='CASCADE'),
    c('MODE', enum('existing-rack', 'new-cabinet', 'empty-positions'), 'Placement mode'),
    n('INV_HALL_ID', EXT_ID, 'Hall (Inventory)'), n('ACCEPTED_AT', TS, 'Accepted'),
], domain=D, related='PLAN_PLACEMENT ← PLAN_PLACEMENT_RACK, PLAN_PLACEMENT_POSITION', uniques=[('PLAN_ID',)])
PENDING_PK['PLAN_PLACEMENT'] = BIG

table('PLAN_PLACEMENT_RACK', 'Rack the plan places equipment in, with U range and kW.', [
    fk('PLAN_PLACEMENT_ID', 'PLAN_PLACEMENT', 'Placement', od='CASCADE'),
    c('INV_RACK_ID', EXT_ID, 'Rack (Inventory)'), n('START_U', 'TINYINT UNSIGNED', 'First U'), n('END_U', 'TINYINT UNSIGNED', 'Last U'),
    c('KW', KW, 'kW placed'),
], domain=D, related='PLAN_PLACEMENT_RACK ← PLAN_PLACEMENT_LINK', uniques=[('PLAN_PLACEMENT_ID', 'INV_RACK_ID')],
    checks=['START_U IS NULL OR END_U IS NULL OR START_U <= END_U', 'KW >= 0'])

table('PLAN_PLACEMENT_LINK', 'Power feed, outlet or switch port the placement uses in a rack.', [
    fk('PLAN_PLACEMENT_RACK_ID', 'PLAN_PLACEMENT_RACK', 'Placed rack', od='CASCADE'),
    c('LINK_KIND', enum('feed', 'outlet', 'port'), 'Kind'), c('INV_RECORD_ID', EXT_ID, 'Feed / outlet / device id (Inventory)'),
    n('INTERFACE_NAME', SHORT, 'Interface (ports)'), n('SPEED_MBPS', 'INT UNSIGNED', 'Port speed'),
], domain=D, uniques=[('PLAN_PLACEMENT_RACK_ID', 'LINK_KIND', 'INV_RECORD_ID', 'INTERFACE_NAME')])

table('PLAN_PLACEMENT_POSITION', 'Floor position a placement uses (new cabinet / empty positions), or a new row it adds.', [
    fk('PLAN_PLACEMENT_ID', 'PLAN_PLACEMENT', 'Placement', od='CASCADE'),
    c('INV_HALL_ID', EXT_ID, 'Hall (Inventory)'), n('INV_ROW_ID', EXT_ID, 'Row (Inventory); NULL for a new row'),
    n('NEW_ROW_NAME', LABEL, 'Name of a new row'), c('GRID_X', 'SMALLINT UNSIGNED', 'Grid column'), c('GRID_Y', 'SMALLINT UNSIGNED', 'Grid row'),
    n('INV_RACK_ID', EXT_ID, 'Rack placed there, once created'),
], domain=D, uniques=[('PLAN_PLACEMENT_ID', 'INV_HALL_ID', 'GRID_X', 'GRID_Y')])

table('PLAN_IP_REQUEST', 'Address block the plan asks IP Management for (purpose, CIDR, VLAN).', [
    PLAN_FK(),
    c('NAME', LABEL, 'Name'), c('PURPOSE', LABEL, 'Purpose'), c('CIDR', f'VARCHAR(43) {ASCII}', 'Prefix (IPv4 or IPv6)'),
    n('IPM_PARENT_PREFIX_ID', EXT_ID, 'Parent prefix (IP Management)'), n('INV_SITE_ID', EXT_ID, 'Site'), n('INV_HALL_ID', EXT_ID, 'Hall'),
    n('VLAN_NUMBER', 'SMALLINT UNSIGNED', 'VLAN'), n('IPM_VLAN_ID', EXT_ID, 'Existing VLAN reused (IP Management)'),
    c('IS_REUSE', BOOL, '1 = reuses an existing block', default='0'),
], domain=D, uniques=[('PLAN_ID', 'CIDR')], checks=['VLAN_NUMBER IS NULL OR VLAN_NUMBER BETWEEN 1 AND 4094'])

table('PLAN_EQUIPMENT_LINE', 'Equipment an in-site plan installs.', [
    PLAN_FK(), c('ASSET_MODEL_KEY', KEY, 'Device type (Inventory catalogue)'), c('QTY', 'INT UNSIGNED', 'Quantity'), n('ROLE', SHORT, 'Role'),
], domain=D, uniques=[('PLAN_ID', 'ASSET_MODEL_KEY', 'ROLE')], checks=['QTY > 0'])

table('PLAN_RACK_CLASS', 'Rack class of an in-site plan (count, kW, air / liquid).', [
    PLAN_FK(), c('NAME', LABEL, 'Class'), c('RACKS', 'INT UNSIGNED', 'Racks'), c('KW', KW, 'kW per rack'), c('COOLING_KIND', enum('air', 'liquid'), 'Cooling'),
], domain=D, uniques=[('PLAN_ID', 'NAME')], checks=['KW >= 0'])

table('PLAN_NEW_HALL', 'New hall an in-site plan builds on an existing floor.', [
    fk('PLAN_ID', 'PLAN', 'Plan', od='CASCADE'), c('INV_FLOOR_ID', EXT_ID, 'Floor (Inventory)'), c('NAME', LABEL, 'Hall name'),
    c('AREA_SQM', 'DECIMAL(10,2)', 'Area, m²'), c('POSITIONS', 'INT UNSIGNED', 'Rack positions'), c('DESIGN_KW', KW, 'Design kW'),
], domain=D, uniques=[('PLAN_ID',)], checks=['AREA_SQM > 0'])

table('PLAN_RETROFIT_RACK', 'Rack a retrofit plan upgrades, or uses as swing space.', [
    PLAN_FK(), c('INV_RACK_ID', EXT_ID, 'Rack (Inventory)'), c('RACK_ROLE', enum('retrofit', 'swing'), 'Role'),
    n('TARGET_KW', KW, 'Target kW (retrofit)'), n('READINESS', enum('ready', 'kit', 'new-cabinet'), 'What the rack needs'),
], domain=D, uniques=[('PLAN_ID', 'INV_RACK_ID')], checks=["RACK_ROLE = 'swing' OR TARGET_KW IS NOT NULL"])

table('PLAN_EXECUTION', 'One run of "Start the build": hands the plan to Delivery and records what it created.', [
    fk('PLAN_ID', 'PLAN', 'Plan'),
    c('EXECUTION_CODE', CODE, 'Run id'), c('VEHICLE', enum('programme', 'project', 'change', 'portfolio'), 'Delivery vehicle'),
    c('STARTED_AT', TS, 'Started'), c('STARTED_BY', USER_ID, 'Started by'), n('COMPLETED_AT', TS, 'Finished'),
    c('RUN_OUTCOME', enum('Running', 'Succeeded', 'Partly failed', 'Failed'), 'Outcome', default="'Running'"),
    n('DELIVERY_PROCESS_KEY', KEY, 'Delivery process'),
], domain=D, related='PLAN_EXECUTION ← PLAN_EXECUTION_STEP, PLAN_CREATED_RECORD', uniques=[('TENANT_ID', 'EXECUTION_CODE')], indexes=[('PLAN_ID',)])

table('PLAN_EXECUTION_STEP', 'Step of a build run and its result.', [
    fk('PLAN_EXECUTION_ID', 'PLAN_EXECUTION', 'Run', od='CASCADE'),
    c('STEP_KEY', KEY, 'Step'), c('STATUS', enum('Done', 'Failed', 'Skipped'), 'Result'), n('ERROR_MESSAGE', TEXT1K, 'Error'), c('FINISHED_AT', TS, 'When'),
], domain=D, uniques=[('PLAN_EXECUTION_ID', 'STEP_KEY')], checks=["STATUS <> 'Failed' OR ERROR_MESSAGE IS NOT NULL"])

table('PLAN_CREATED_RECORD', 'Record a plan created in a platform module (project, change, PO, subnet, VLAN, permit, reservation, planned rack / device …).', [
    fk('PLAN_ID', 'PLAN', 'Plan'),
    fk('PLAN_EXECUTION_ID', 'PLAN_EXECUTION', 'Run that created it', null=True, od='SET NULL'),
    c('TARGET_MODULE', MODULE, 'Module that owns the record'),
    c('RECORD_TYPE', f'VARCHAR(40) {ASCII}', 'Record type (project, change, purchase-order, subnet, vlan, permit, reservation, rack, device, circuit …)'),
    c('MODULE_RECORD_ID', EXT_ID, 'Record id in that module'),
], domain=D, uniques=[('PLAN_ID', 'TARGET_MODULE', 'RECORD_TYPE', 'MODULE_RECORD_ID')],
    indexes=[('PLAN_EXECUTION_ID',), ('TENANT_ID', 'TARGET_MODULE', 'MODULE_RECORD_ID')])

table('PLAN_REVIEW', 'Request sent to reviewers with the plan review pack (PDF, ZIP or link).', [
    fk('PLAN_ID', 'PLAN', 'Plan'),
    c('REVIEW_CODE', CODE, 'Review id (REV-1)'), c('ROUND_NO', 'TINYINT UNSIGNED', 'Approval round'), c('DOC_NUMBER', SHORT, 'Document number'),
    c('REQUESTED_BY', USER_ID, 'Requester'), c('REQUESTED_AT', TS, 'Sent'),
    n('MESSAGE', TEXT2K, 'Message to reviewers'), c('DELIVERY', enum('pdf', 'zip', 'link'), 'What was sent'),
    c('EMAIL_SUBJECT', NAME, 'E-mail subject'), n('EMAIL_BODY', 'TEXT', 'E-mail body'), c('REVIEW_LINK', 'VARCHAR(500)', 'Link to the review page'),
    c('PLAN_STATUS_AT_REQUEST', PLAN_STATUS, 'Plan status when sent'),
], domain=D, related='PLAN_REVIEW ← PLAN_REVIEW_REVIEWER, PLAN_REVIEW_ATTACHMENT, PLAN_REVIEW_COMMENT',
    uniques=[('TENANT_ID', 'REVIEW_CODE')], indexes=[('PLAN_ID',)])

table('PLAN_REVIEW_REVIEWER', 'Reviewer of a review request (junction to Platform Engineering users).', [
    fk('PLAN_REVIEW_ID', 'PLAN_REVIEW', 'Review', od='CASCADE'),
    c('REVIEWER_USER_ID', USER_ID, 'Reviewer'), c('REVIEWER_NAME', NAME, 'Name cached'), c('ROLE_NAME', LABEL, 'Approving role'),
    c('EMAIL', 'VARCHAR(320)', 'Address the pack was sent to (personal data)'),
    n('ANSWERED_AT', TS, 'When the reviewer answered (comment or decision)'),
], domain=D, uniques=[('PLAN_REVIEW_ID', 'REVIEWER_USER_ID')], indexes=[('TENANT_ID', 'REVIEWER_USER_ID')])

table('PLAN_REVIEW_ATTACHMENT', 'File sent with a review request.', [
    fk('PLAN_REVIEW_ID', 'PLAN_REVIEW', 'Review', od='CASCADE'),
    c('FILE_NAME', 'VARCHAR(255)', 'File name'), c('SIZE_BYTES', 'BIGINT UNSIGNED', 'Size'), n('SHA256', f'CHAR(64) {ASCII}', 'Checksum'),
], domain=D, uniques=[('PLAN_REVIEW_ID', 'FILE_NAME')])

table('PLAN_REVIEW_COMMENT', 'Threaded comment on a section of the plan review document.', [
    fk('PLAN_ID', 'PLAN', 'Plan'),
    fk('PLAN_REVIEW_ID', 'PLAN_REVIEW', 'Review request it answers', null=True, od='SET NULL'),
    fk('PARENT_COMMENT_ID', 'PLAN_REVIEW_COMMENT', 'Comment it replies to; NULL = thread start', null=True),
    c('COMMENT_CODE', CODE, 'Comment id (RVC-1)'), c('REVISION_LETTER', f'CHAR(1) {ASCII}', 'Plan revision commented on'),
    c('SECTION_ID', f'VARCHAR(32) {ASCII}', 'Section of the review document (4.1 …)'), c('SECTION_LABEL', NAME, 'Section title cached'),
    c('AUTHOR_USER_ID', USER_ID, 'Author'), c('AUTHOR_NAME', NAME, 'Name cached'), n('AUTHOR_ROLE', LABEL, 'Role'),
    c('POSTED_AT', TS, 'Posted'), c('BODY', TEXT2K, 'Comment'),
    c('STATUS', enum('Open', 'Resolved'), 'State', default="'Open'"), n('RESOLVED_BY', USER_ID, 'Resolved by'), n('RESOLVED_AT', TS, 'Resolved'),
], domain=D, uniques=[('TENANT_ID', 'COMMENT_CODE')], indexes=[('PLAN_ID', 'SECTION_ID'), ('PLAN_REVIEW_ID',), ('PARENT_COMMENT_ID',)],
    checks=["(STATUS = 'Resolved') = (RESOLVED_AT IS NOT NULL)"])

# ================================================================ E. MACD, compliance and imports
D = 'E. MACD, compliance and imports'
MACD_STAGE = enum('Draft', 'Submitted', 'Feasibility', 'Quote', 'Scheduled', 'In progress', 'Verification', 'Completed', 'Rejected', 'Cancelled')
table('MACD_CATALOGUE_ITEM', 'MACD catalogue item: what can be ordered, its SLA, charges and change class (BRD 7.13).', [
    c('ITEM_CODE', CODE, 'Item code (MAC-A01)'),
    c('MACD_KIND', enum('Move', 'Add', 'Change', 'Disconnect'), 'Kind'),
    c('MACD_OBJECT', enum('Equipment', 'Cabinet', 'Power circuit', 'Cross-connect', 'Network port', 'IP addresses', 'GPU nodes', 'Access'), 'What it acts on'),
    c('NAME', NAME, 'Name'), c('DESCRIPTION', TEXT1K, 'Description'),
    c('SLA_STANDARD_H', 'SMALLINT UNSIGNED', 'Standard SLA, hours'), c('SLA_EXPEDITED_H', 'SMALLINT UNSIGNED', 'Expedited SLA, hours'),
    c('SLA_EMERGENCY_H', 'SMALLINT UNSIGNED', 'Emergency SLA, hours', default='4'),
    c('CURRENCY_CODE', CURRENCY, 'Currency of the charges'),
    c('NRC_AMOUNT', MONEY, 'One-off charge per unit', default='0.00'), c('MRC_AMOUNT', MONEY, 'Monthly charge per unit', default='0.00'),
    c('UNIT', f'VARCHAR(16)', 'Unit ordered (U, kW, port, node …)'),
    c('IS_STANDARD_CHANGE', BOOL, '1 = runs as a pre-approved standard change'), c('NEEDS_SITE_ACCESS', BOOL, '1 = someone enters the site'),
    c('U_PER_UNIT', 'DECIMAL(6,2)', 'Rack units per unit', default='0.00'), c('KW_PER_UNIT', KW, 'kW per unit', default='0.000'),
    c('RISK', LMH, 'Change risk'), c('CHANGE_TITLE_TEMPLATE', NAME, 'Title of the change request it raises'),
    c('IS_ACTIVE', BOOL, '1 = orderable', default='1'),
], pk=INT, domain=D, related='MACD_CATALOGUE_ITEM ← MACD_CATALOGUE_ITEM_MODEL, MACD_CATALOGUE_STEP, MACD_REQUEST',
    uniques=[('TENANT_ID', 'ITEM_CODE')],
    checks=['SLA_EXPEDITED_H <= SLA_STANDARD_H', 'SLA_EMERGENCY_H <= SLA_EXPEDITED_H', 'NRC_AMOUNT >= 0', 'MRC_AMOUNT >= 0', 'U_PER_UNIT >= 0', 'KW_PER_UNIT >= 0'])

table('MACD_CATALOGUE_ITEM_MODEL', 'Business models an item is offered in (junction).', [
    fk('MACD_CATALOGUE_ITEM_ID', 'MACD_CATALOGUE_ITEM', 'Item', od='CASCADE'),
    fk('BUSINESS_MODEL_ID', 'BUSINESS_MODEL', 'Business model'),
], domain=D, uniques=[('MACD_CATALOGUE_ITEM_ID', 'BUSINESS_MODEL_ID')], indexes=[('BUSINESS_MODEL_ID',)])

table('MACD_CATALOGUE_STEP', 'Record an item updates or task it creates, in order.', [
    fk('MACD_CATALOGUE_ITEM_ID', 'MACD_CATALOGUE_ITEM', 'Item', od='CASCADE'),
    c('STEP_TYPE', enum('record', 'task'), 'record = a record updated on verification; task = a task created'),
    c('SORT_ORDER', 'TINYINT UNSIGNED', 'Order'), c('STEP_TEXT', NAME, 'Record or task'),
], domain=D, uniques=[('MACD_CATALOGUE_ITEM_ID', 'STEP_TYPE', 'SORT_ORDER')])

table('MACD_REQUEST', 'MACD request from a customer or internal team, through stages Draft → … → Completed, with SLA clock and the change it runs under.', [
    c('REQUEST_CODE', CODE, 'Request id (MACD-…)'),
    fk('MACD_CATALOGUE_ITEM_ID', 'MACD_CATALOGUE_ITEM', 'Catalogue item ordered'),
    c('TITLE', NAME, 'Title'), c('DETAIL', TEXT2K, 'Detail'),
    n('INV_ROOM_ID', EXT_ID, 'Room (Inventory)'), n('INV_RACK_ID', EXT_ID, 'Rack (Inventory)'), n('TO_INV_RACK_ID', EXT_ID, 'Target rack of a move'),
    n('BSS_CUSTOMER_ID', EXT_ID, 'Customer (BSS); NULL = internal'),
    c('REQUESTER_NAME', NAME, 'Requester'),
    c('CHANNEL', enum('Customer portal', 'Account manager', 'Email', 'API', 'Internal'), 'Channel'),
    n('OWNER_USER_ID', USER_ID, 'Owner'),
    c('PRIORITY', enum('Standard', 'Expedited', 'Emergency'), 'Priority', default="'Standard'"),
    c('STAGE', MACD_STAGE, 'Stage', default="'Draft'"),
    n('WANTED_BY', DATE, 'Date the requester wants'),
    n('SUBMITTED_AT', TS, 'Submitted (SLA clock starts); NULL while Draft'),
    n('DUE_AT', TS, 'SLA due'),
    n('WINDOW_START', TS, 'Work window start'), n('WINDOW_END', TS, 'Work window end'),
    n('COMPLETED_AT', TS, 'Completed'),
    c('QTY', 'DECIMAL(10,2)', 'Quantity'), c('U_DELTA', 'SMALLINT', 'Rack units added (+) or freed (−)', default='0'),
    c('KW_DELTA', 'DECIMAL(12,3)', 'kW added (+) or freed (−)', default='0.000'),
    c('CURRENCY_CODE', CURRENCY, 'Currency'), c('NRC_AMOUNT', MONEY, 'One-off charge', default='0.00'),
    c('MRC_DELTA', MONEY, 'Change of monthly charge (+/−)', default='0.00'), c('IS_BILLABLE', BOOL, '1 = billed to the customer', default='0'),
    n('ITSM_CHANGE_ID', EXT_ID, 'Change request (ITSM)'), n('IPL_HOLD_ID', EXT_ID, 'Space hold (Inventory Planning)'),
    n('EXTERNAL_REF', SHORT, 'External reference (cross-connect order id)'), n('WORK_REF', SHORT, 'Work order / field reference'),
    n('SLA_STATE', enum('On track', 'At risk', 'Breached', 'Met', 'Missed'), 'SLA state at the last evaluation; NULL while Draft'),
    n('IS_FIRST_TIME_RIGHT', BOOL, '1 = verified without rework'), n('REASON', TEXT1K, 'Reject / cancel reason'),
], domain=D, site=True, related='MACD_REQUEST → MACD_CATALOGUE_ITEM; ← MACD_REQUEST_DEVICE, MACD_REQUEST_CHECK, MACD_REQUEST_TASK, MACD_REQUEST_EVENT',
    uniques=[('TENANT_ID', 'REQUEST_CODE')],
    indexes=[('MACD_CATALOGUE_ITEM_ID',), ('TENANT_ID', 'INV_SITE_ID', 'STAGE'), ('TENANT_ID', 'BSS_CUSTOMER_ID'), ('ITSM_CHANGE_ID',), ('INV_RACK_ID',)],
    checks=['QTY > 0', 'NRC_AMOUNT >= 0', "STAGE = 'Draft' OR SUBMITTED_AT IS NOT NULL", "STAGE <> 'Completed' OR COMPLETED_AT IS NOT NULL",
            'WINDOW_START IS NULL OR WINDOW_END IS NULL OR WINDOW_START < WINDOW_END', "STAGE NOT IN ('Rejected','Cancelled') OR REASON IS NOT NULL"])

table('MACD_REQUEST_DEVICE', 'Device a request acts on (junction to Inventory devices).', [
    fk('MACD_REQUEST_ID', 'MACD_REQUEST', 'Request', od='CASCADE'), c('INV_DEVICE_ID', EXT_ID, 'Device (Inventory)'),
], domain=D, uniques=[('MACD_REQUEST_ID', 'INV_DEVICE_ID')], indexes=[('TENANT_ID', 'INV_DEVICE_ID')])

table('MACD_REQUEST_CHECK', 'Feasibility check result kept with the request (snapshot at the last check, DATA-022).', [
    fk('MACD_REQUEST_ID', 'MACD_REQUEST', 'Request', od='CASCADE'),
    c('CHECK_KIND', enum('space', 'power', 'contract', 'cooling', 'ports', 'freeze', 'incident', 'gpu', 'records'), 'Check'),
    c('LABEL', NAME, 'Check name'), c('CHECK_RESULT', enum('Pass', 'Warn', 'Fail'), 'Result'), c('DETAIL', TEXT1K, 'Detail'), c('CHECKED_AT', TS, 'When'),
], domain=D, uniques=[('MACD_REQUEST_ID', 'CHECK_KIND')])

table('MACD_REQUEST_TASK', 'Task of a request in the system that does it.', [
    fk('MACD_REQUEST_ID', 'MACD_REQUEST', 'Request', od='CASCADE'),
    c('TASK_KEY', KEY, 'Task key'), c('TITLE', NAME, 'Task'),
    c('TASK_SYSTEM', enum('SynapseDC', 'Customer', 'BSS', 'Change management', 'DCIM', 'Field team', 'Inventory', 'IP Management'), 'System doing it'),
    c('STATUS', enum('Done', 'Open', 'Waiting', 'Skipped'), 'State', default="'Open'"), n('DONE_AT', TS, 'Done'), n('TASK_REF_ID', EXT_ID, 'Record in that system'),
], domain=D, uniques=[('MACD_REQUEST_ID', 'TASK_KEY')], checks=["STATUS <> 'Done' OR DONE_AT IS NOT NULL"])

table('MACD_REQUEST_EVENT', 'History line or note on a request.', [
    fk('MACD_REQUEST_ID', 'MACD_REQUEST', 'Request', od='CASCADE'),
    c('EVENT_TYPE', enum('history', 'note'), 'history = stage move / edit; note = user note'),
    c('EVENT_AT', TS, 'When'), c('EVENT_BY', NAME, 'Who'), c('EVENT_TEXT', TEXT2K, 'Text'),
], domain=D, indexes=[('MACD_REQUEST_ID', 'EVENT_TYPE')])

table('COMPLIANCE_POLICY', 'Identity and run state of a policy as code; content is versioned in COMPLIANCE_POLICY_VERSION (BRD 7.11).', [
    c('POLICY_CODE', CODE, 'Policy id (CP-01)'),
    c('IS_ENABLED', BOOL, '0 = switched off: violations stop counting, controls it alone evidences become Not assessed', default='1'),
    c('IS_CUSTOM', BOOL, '1 = made by the tenant', default='0'),
    n('LAST_RUN_AT', TS, 'Last evaluation'),
], pk=INT, domain=D, related='COMPLIANCE_POLICY ← COMPLIANCE_POLICY_VERSION, COMPLIANCE_CONTROL_POLICY', uniques=[('TENANT_ID', 'POLICY_CODE')])

table('COMPLIANCE_POLICY_VERSION', 'Version of a policy: Rego package and source, area, enforcement, trigger. Published versions never change.', [
    fk('COMPLIANCE_POLICY_ID', 'COMPLIANCE_POLICY', 'Policy'),
    c('VERSION_NO', 'SMALLINT UNSIGNED', 'Version'),
    c('VERSION_STATUS', VERSION_STATUS, 'State', default="'Draft'"),
    c('NAME', NAME, 'Name'), c('RULE_TEXT', TEXT1K, 'Rule in words'),
    c('AREA', enum('Power', 'Cooling', 'Network', 'Lifecycle', 'Change', 'Safety', 'Maintenance'), 'Area'),
    c('ENFORCEMENT', enum('Block', 'Warn'), 'Block stops the change; Warn records it'),
    c('POLICY_TRIGGER', enum('Nightly sweep', 'On change', 'Change gate'), 'When it runs'),
    c('REGO_PACKAGE', f'VARCHAR(128) {ASCII}', 'Rego package'), c('REGO_SOURCE', 'MEDIUMTEXT', 'Rego source'),
    n('PUBLISHED_AT', TS, 'Published'), n('PUBLISHED_BY', USER_ID, 'Published by'),
    c('LIVE_KEY', 'INT UNSIGNED', 'One published version per policy (generated)',
      extra="GENERATED ALWAYS AS (IF(VERSION_STATUS = 'Published', COMPLIANCE_POLICY_ID, NULL)) STORED"),
], pk=INT, domain=D, related='COMPLIANCE_POLICY_VERSION → COMPLIANCE_POLICY; ← COMPLIANCE_DECISION',
    uniques=[('COMPLIANCE_POLICY_ID', 'VERSION_NO'), ('LIVE_KEY',)], checks=["VERSION_STATUS IN ('Draft','Discarded','Rejected','Awaiting approval') OR PUBLISHED_AT IS NOT NULL"])
TABLES['COMPLIANCE_POLICY_VERSION']['cols'][[x.name for x in TABLES['COMPLIANCE_POLICY_VERSION']['cols']].index('LIVE_KEY')].null = True

table('COMPLIANCE_FRAMEWORK', 'Framework assessed (ISO 27001, ISO 22237, TIA-942, SOC 2 or custom).', [
    c('FRAMEWORK_CODE', CODE, 'Framework id'), c('NAME', NAME, 'Name'), n('VERSION_LABEL', SHORT, 'Edition (e.g. 2022)'),
    n('DESCRIPTION', TEXT1K, 'Description'), n('OWNER_NAME', NAME, 'Owner'), c('IS_CUSTOM', BOOL, '1 = made by the tenant', default='0'),
], pk=SMALL, domain=D, related='COMPLIANCE_FRAMEWORK ← COMPLIANCE_CONTROL', uniques=[('TENANT_ID', 'FRAMEWORK_CODE')])

table('COMPLIANCE_CONTROL', 'Control of a framework: automated (evidenced by policies) or manual (attested).', [
    fk('COMPLIANCE_FRAMEWORK_ID', 'COMPLIANCE_FRAMEWORK', 'Framework'),
    c('CONTROL_CODE', CODE, 'Control id (CTL-01)'), c('CLAUSE_REF', SHORT, 'Clause in the framework (A.7.4 …)'),
    c('TITLE', NAME, 'Title'), n('DESCRIPTION', TEXT1K, 'Description'),
    c('CONTROL_TYPE', enum('Automated', 'Manual'), 'Automated = from policies; Manual = attested'),
    c('OWNER_NAME', NAME, 'Owner'), c('IS_CUSTOM', BOOL, '1 = made by the tenant', default='0'),
], pk=INT, domain=D, related='COMPLIANCE_CONTROL ← COMPLIANCE_CONTROL_POLICY, COMPLIANCE_ATTESTATION',
    uniques=[('TENANT_ID', 'CONTROL_CODE')], indexes=[('COMPLIANCE_FRAMEWORK_ID', 'CLAUSE_REF')])

table('COMPLIANCE_CONTROL_POLICY', 'Which policies evidence which control (junction, control_policy_map).', [
    fk('COMPLIANCE_CONTROL_ID', 'COMPLIANCE_CONTROL', 'Control', od='CASCADE'),
    fk('COMPLIANCE_POLICY_ID', 'COMPLIANCE_POLICY', 'Policy', od='CASCADE'),
], domain=D, uniques=[('COMPLIANCE_CONTROL_ID', 'COMPLIANCE_POLICY_ID')], indexes=[('COMPLIANCE_POLICY_ID',)])

table('COMPLIANCE_ATTESTATION', 'Attestation of a manual control: who, when, evidence.', [
    fk('COMPLIANCE_CONTROL_ID', 'COMPLIANCE_CONTROL', 'Control'),
    c('ATTESTED_BY', USER_ID, 'Who attested'), c('ATTESTED_AT', TS, 'When'), n('NOTE', TEXT1K, 'Note'),
    n('EVIDENCE_REF', 'VARCHAR(500)', 'Link or document id of the evidence'),
], domain=D, indexes=[('COMPLIANCE_CONTROL_ID', 'ATTESTED_AT')])

table('COMPLIANCE_DECISION', 'Policy decision per resource (deny / warn / allow) with the input it was made on (snapshot, DATA-022).', [
    fk('COMPLIANCE_POLICY_VERSION_ID', 'COMPLIANCE_POLICY_VERSION', 'Policy version evaluated'),
    c('RESOURCE_TYPE', f'VARCHAR(40) {ASCII}', 'Resource type (rack, device, change, prefix …)'),
    c('RESOURCE_ID', EXT_ID, 'Resource id in its module'), c('RESOURCE_NAME', NAME, 'Name cached'),
    n('INV_SITE_ID', EXT_ID, 'Site of the resource'),
    c('POLICY_RESULT', enum('allow', 'deny', 'warn'), 'Decision'), n('GATE_OUTCOME', enum('Blocked', 'Warned'), 'What it did to a change'),
    n('ITSM_CHANGE_ID', EXT_ID, 'Change it gated'), c('EVALUATED_AT', TS, 'When'),
    c('POLICY_TRIGGER', enum('Nightly sweep', 'On change', 'Change gate'), 'What triggered it'),
    c('INPUT_SNAPSHOT', 'JSON', 'OPA input the decision was made on'), n('RESULT_MESSAGE', TEXT1K, 'Message'),
], domain=D, indexes=[('COMPLIANCE_POLICY_VERSION_ID',), ('TENANT_ID', 'INV_SITE_ID', 'POLICY_RESULT'), ('TENANT_ID', 'RESOURCE_TYPE', 'RESOURCE_ID'), ('ITSM_CHANGE_ID',)],
    checks=["POLICY_RESULT = 'allow' OR RESULT_MESSAGE IS NOT NULL", "GATE_OUTCOME IS NULL OR ITSM_CHANGE_ID IS NOT NULL"])

table('IMPORT_BATCH', 'Onboarding workbook upload: file, template, state and the reconciliation report (DATA-012, -013). Loading writes to Inventory / Inventory Planning through their APIs.', [
    c('BATCH_CODE', CODE, 'Batch id'),
    fk('BUSINESS_MODEL_ID', 'BUSINESS_MODEL', 'Template business model'),
    c('TEMPLATE_VERSION', SHORT, 'Template version'),
    c('FILE_NAME', 'VARCHAR(255)', 'File name'), c('FILE_SHA256', f'CHAR(64) {ASCII}', 'Checksum'), c('FILE_SIZE_BYTES', 'BIGINT UNSIGNED', 'Size'),
    c('STATUS', enum('Uploaded', 'Validated', 'Rejected', 'Loading', 'Loaded', 'Partly loaded', 'Failed'), 'State', default="'Uploaded'"),
    c('UPLOADED_AT', TS, 'Uploaded'), n('LOADED_AT', TS, 'Loaded'),
    n('REPORT_SENT_AT', TS, 'Reconciliation report sent'), n('REPORT_SENT_TO', 'VARCHAR(320)', 'Address it was sent to (personal data)'),
], domain=D, related='IMPORT_BATCH ← IMPORT_BATCH_SITE, IMPORT_BATCH_SHEET, WRITEBACK_REQUEST',
    uniques=[('TENANT_ID', 'BATCH_CODE')], indexes=[('BUSINESS_MODEL_ID',), ('TENANT_ID', 'FILE_SHA256')],
    checks=["STATUS NOT IN ('Loaded','Partly loaded') OR LOADED_AT IS NOT NULL"])

table('IMPORT_BATCH_SITE', 'Site a batch loads (a workbook may carry several sites).', [
    fk('IMPORT_BATCH_ID', 'IMPORT_BATCH', 'Batch', od='CASCADE'),
    c('SITE_REF', f'VARCHAR(64) {ASCII}', 'Site id as written in the workbook'),
    n('INV_SITE_ID', EXT_ID, 'Site id in Inventory once created'),
], domain=D, uniques=[('IMPORT_BATCH_ID', 'SITE_REF')], indexes=[('TENANT_ID', 'INV_SITE_ID')])

table('IMPORT_BATCH_SHEET', 'Result per sheet of a batch.', [
    fk('IMPORT_BATCH_ID', 'IMPORT_BATCH', 'Batch', od='CASCADE'),
    c('SHEET_NAME', SHORT, 'Sheet'), c('ROWS_READ', 'INT UNSIGNED', 'Rows read', default='0'), c('ROWS_LOADED', 'INT UNSIGNED', 'Rows loaded', default='0'),
    c('ROWS_REJECTED', 'INT UNSIGNED', 'Rows rejected', default='0'), c('CHECKS_PASSED', 'SMALLINT UNSIGNED', 'Checks passed', default='0'),
    c('CHECKS_FAILED', 'SMALLINT UNSIGNED', 'Checks failed', default='0'),
], domain=D, related='IMPORT_BATCH_SHEET ← IMPORT_REJECTED_ROW', uniques=[('IMPORT_BATCH_ID', 'SHEET_NAME')],
    checks=['ROWS_LOADED + ROWS_REJECTED <= ROWS_READ'])

table('IMPORT_REJECTED_ROW', 'Row rejected on import, with the reason.', [
    fk('IMPORT_BATCH_SHEET_ID', 'IMPORT_BATCH_SHEET', 'Sheet', od='CASCADE'),
    c('ROW_NO', 'INT UNSIGNED', 'Row number in the sheet'), n('COLUMN_NAME', SHORT, 'Column'), c('REASON', TEXT1K, 'Why'), n('VALUE_TEXT', 'VARCHAR(500)', 'Value found'),
], domain=D, indexes=[('IMPORT_BATCH_SHEET_ID', 'ROW_NO')])

# ================================================================ F. Cross-cutting
D = 'F. Cross-cutting'
table('WRITEBACK_REQUEST', 'Write to a platform module API waiting, done or failed (DEV-07): target API, payload, idempotency key, attempts. Exactly one source column is set.', [
    c('TARGET_MODULE', MODULE, 'Module written to'),
    c('TARGET_API', f'VARCHAR(16) {ASCII}', 'API id from BRD 9.11–9.25 (e.g. API-INV-07)'),
    c('HTTP_METHOD', enum('POST', 'PUT', 'PATCH', 'DELETE'), 'Method'),
    c('TARGET_PATH', 'VARCHAR(500)', 'Path called'),
    n('TARGET_RECORD_ID', EXT_ID, 'Record written (once known)'),
    c('IDEMPOTENCY_KEY', f'VARCHAR(80) {ASCII}', 'Idempotency key sent with every attempt'),
    c('PAYLOAD', 'JSON', 'Request body (no credentials; the service account token is never stored)'),
    fk('DCIM_WORK_ITEM_ID', 'DCIM_WORK_ITEM', 'Source: DCIM work item', null=True),
    fk('MACD_REQUEST_ID', 'MACD_REQUEST', 'Source: MACD request', null=True),
    fk('PLAN_ID', 'PLAN', 'Source: plan', null=True),
    fk('IMPORT_BATCH_ID', 'IMPORT_BATCH', 'Source: import batch', null=True),
    fk('INCIDENT_ENRICHMENT_ID', 'INCIDENT_ENRICHMENT', 'Source: incident enrichment', null=True),
    n('SOURCE_NOTE', NAME, 'Source in words when none of the source columns applies (scheduled evaluation)'),
    c('STATUS', enum('Queued', 'Sending', 'Done', 'Failed', 'Abandoned'), 'State', default="'Queued'"),
    c('ATTEMPTS', 'SMALLINT UNSIGNED', 'Attempts so far', default='0'),
    n('NEXT_ATTEMPT_AT', TS, 'Next retry'), n('RESPONSE_STATUS', 'SMALLINT UNSIGNED', 'Last HTTP status'),
    n('LAST_ERROR', TEXT1K, 'Last error'), n('DONE_AT', TS, 'Succeeded'),
], domain=D, uniques=[('TENANT_ID', 'IDEMPOTENCY_KEY')],
    indexes=[('TENANT_ID', 'STATUS', 'NEXT_ATTEMPT_AT'), ('DCIM_WORK_ITEM_ID',), ('MACD_REQUEST_ID',), ('PLAN_ID',), ('IMPORT_BATCH_ID',), ('INCIDENT_ENRICHMENT_ID',)],
    checks=['(DCIM_WORK_ITEM_ID IS NOT NULL) + (MACD_REQUEST_ID IS NOT NULL) + (PLAN_ID IS NOT NULL) + (IMPORT_BATCH_ID IS NOT NULL) + (INCIDENT_ENRICHMENT_ID IS NOT NULL) + (SOURCE_NOTE IS NOT NULL) = 1',
            "STATUS <> 'Done' OR DONE_AT IS NOT NULL", "STATUS <> 'Failed' OR LAST_ERROR IS NOT NULL"])

table('USER_PREFERENCE', 'Per-viewer convenience (list or tiles, open sections, twin view). Optional: browser storage is enough for P1.', [
    c('PE_USER_ID', USER_ID, 'User (Platform Engineering)'),
    c('PREF_KEY', f'VARCHAR(100) {ASCII}', 'Preference key (e.g. dco.pn.layout.plans)'),
    c('PREF_VALUE', 'VARCHAR(1000)', 'Value'),
], domain=D, uniques=[('TENANT_ID', 'PE_USER_ID', 'PREF_KEY')])

# ---------------------------------------------------------------- emit
def ident_ok(s):
    assert re.fullmatch(r'[A-Z][A-Z0-9_]*', s), s
    assert len(s) <= 64, (s, len(s))


def short(name):
    """keep constraint names under 64 characters"""
    if len(name) <= 64:
        return name
    import hashlib
    return name[:55] + '_' + hashlib.sha1(name.encode()).hexdigest()[:8].upper()


def sql_comment(s):
    return "'" + s.replace("'", "''") + "'"


UNIFORM = {'NAME': NAME, 'LABEL': NAME, 'DESCRIPTION': TEXT2K, 'DETAIL': TEXT2K, 'NOTES': TEXT2K, 'MITIGATION': TEXT2K,
           'STEP_TEXT': TEXT1K, 'UNIT': 'VARCHAR(24)', 'VALUE_TEXT': 'VARCHAR(500)', 'SORT_ORDER': 'SMALLINT UNSIGNED', 'QTY': 'DECIMAL(12,2)',
           'SOURCE': NAME}


def uniform():
    """one type per concept: free-text and count columns of the same name share one type"""
    for t in TABLES.values():
        for col in t['cols']:
            if col.name in UNIFORM:
                col.typ = UNIFORM[col.name]


def emit():
    out = [f'-- SynapseDC DC-STORE schema (MySQL 8.0.16+, InnoDB, utf8mb4)',
           f'-- Generated by scripts/db/build_schema.py on {UPDATED}; edit the generator, not this file.',
           '-- Source: BRD 10.4 (DATA-017…022). Physical / facility records, holds, customers, alarms, incidents, changes,',
           '-- addresses, projects and contracts are NOT here: they are read and written through the platform module APIs.',
           '-- Ids of records owned by a module are stored as that module\'s id (prefix INV_ / IPL_ / IPM_ / ITSM_ / ALR_ / BSS_ /',
           '-- PRJ_ / SCM_ / PE_); they cannot carry FOREIGN KEYs because the records live in other databases (DATA-019).',
           '-- No AUD tables: the platform keeps the audit trail of every insert / update / delete (DATA-021).',
           '-- Times are UTC. Money is DECIMAL with a CURRENCY_CODE column (planner figures are USD, suffix _USD).',
           '', 'SET NAMES utf8mb4;', 'SET FOREIGN_KEY_CHECKS = 0;', '']
    for name in ORDER:
        t = TABLES[name]
        ident_ok(name)
        lines = []
        names = set()
        for col in t['cols']:
            ident_ok(col.name)
            assert col.name not in names, (name, col.name)
            names.add(col.name)
            d = f'  `{col.name}` {col.typ}'
            if 'GENERATED' in col.extra:
                d += f' {col.extra}'
                d += ' NULL' if col.null else ' NOT NULL'
            else:
                d += ' NULL' if col.null else ' NOT NULL'
                if col.default is not None:
                    d += f' DEFAULT {col.default}'
                if col.extra:
                    d += f' {col.extra}'
            assert col.comment, (name, col.name)
            d += f' COMMENT {sql_comment(col.comment)}'
            lines.append(d)
        lines.append(f'  PRIMARY KEY (`{name}_ID`)')
        covered = []
        for u in t['uniques']:
            for x in u:
                assert x in names, (name, x)
            lines.append(f'  UNIQUE KEY `{short("UK_" + name + "_" + "_".join(u))}` (' + ', '.join(f'`{x}`' for x in u) + ')')
            covered.append(u)
        for ix in t['indexes']:
            for x in ix:
                assert x in names, (name, x)
            lines.append(f'  KEY `{short("IDX_" + name + "_" + "_".join(ix))}` (' + ', '.join(f'`{x}`' for x in ix) + ')')
            covered.append(ix)
        # every FK column must lead some index
        for col, ref, od in t['fks']:
            if not any(k[0] == col for k in covered):
                lines.append(f'  KEY `{short("IDX_" + name + "_" + col)}` (`{col}`)')
                covered.append((col,))
        # a plain index made redundant by a wider one is dropped
        for i, ck in enumerate(t['checks']):
            lines.append(f'  CONSTRAINT `{short(f"CK_{name}_{i + 1:02d}")}` CHECK ({ck})')
        for col, ref, od in t['fks']:
            lines.append(f'  CONSTRAINT `{short("FK_" + name + "_" + col)}` FOREIGN KEY (`{col}`) REFERENCES `{ref}` (`{ref}_ID`) ON DELETE {od} ON UPDATE RESTRICT')
        hdr = [f'-- {name}: {t["comment"]}']
        if t['related']:
            hdr.append(f'-- Related tables: {t["related"]}')
        hdr.append(f'-- Domain: {t["domain"]} · Updated: {UPDATED}')
        out += hdr
        out.append(f'CREATE TABLE `{name}` (')
        out.append(',\n'.join(lines))
        out.append(f') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT={sql_comment(t["comment"][:2000])};')
        out.append('')
    out.append('SET FOREIGN_KEY_CHECKS = 1;')
    return '\n'.join(out) + '\n'


def redundant_check():
    for name in ORDER:
        t = TABLES[name]
        keys = [tuple(u) for u in t['uniques']] + [tuple(i) for i in t['indexes']]
        for i, a in enumerate(keys):
            for j, b in enumerate(keys):
                if i != j and len(a) < len(b) and b[:len(a)] == a and a in [tuple(x) for x in t['indexes']]:
                    raise SystemExit(f'redundant index on {name}: {a} is a prefix of {b}')


def emit_md():
    doms = {}
    for name in ORDER:
        doms.setdefault(TABLES[name]['domain'], []).append(name)
    cols = sum(len(TABLES[t]['cols']) for t in ORDER)
    fks = sum(len(TABLES[t]['fks']) for t in ORDER)
    chk = sum(len(TABLES[t]['checks']) for t in ORDER)
    md = [f'# SynapseDC DC-STORE — data dictionary', '',
          f'Generated by `scripts/db/build_schema.py` on {UPDATED} from BRD 10.4. DDL: `synapsedc_dc_store.sql` (MySQL 8.0.16+).', '',
          f'**{len(ORDER)} tables · {cols} columns · {fks} foreign keys · {chk} check constraints.**', '',
          '## Conventions', '',
          '- Names in SNAKE_UPPER_CASE, singular; tables of one domain share a prefix (PLAN_, MACD_, COMPLIANCE_, INCIDENT_ …).',
          '- Primary key `<TABLE>_ID`, UNSIGNED integer AUTO_INCREMENT (SMALLINT for small reference tables, INT for catalogues, BIGINT for transactional tables). Business codes shown to users (PLN-0001, MAC-A01) are separate columns, unique per tenant.',
          '- Every table carries `TENANT_ID`, `CREATED_AT`, `CREATED_BY`, `UPDATED_AT`, `UPDATED_BY` (DATA-018); tables that belong to one site carry `INV_SITE_ID`.',
          '- Ids of records owned by a platform module are `VARCHAR(64)` ASCII columns named after the module: `INV_` Inventory, `IPL_` Inventory Planning, `IPM_` IP Management, `ITSM_`, `ALR_` System Alerts, `BSS_`, `PRJ_` Programs & Projects, `SCM_` Supply Chain, `PE_` Platform Engineering. They carry no FOREIGN KEY because the record lives in the module\'s own database (DATA-019); the module API validates them on write.',
          '- Booleans `TINYINT(1)` named `IS_…` / `HAS_…`; fixed vocabularies are `ENUM`, the same ENUM for the same concept everywhere; configurable word lists are in `LOOKUP_LIST` / `LOOKUP_VALUE`.',
          '- Money `DECIMAL(16,2)` with a `CURRENCY_CODE`; planner figures are USD (`_USD`). Percentages `DECIMAL(5,2)` 0–100. Times `DATETIME(3)` UTC.',
          '- Versioned content (templates, benchmark values, compliance policies) has an identity table and a `…_VERSION` table; a published version is never updated (DATA-020). "One draft / one published / one current / one open" rules are enforced by a generated key column with a UNIQUE index (NULL when the rule does not apply).',
          '- JSON only for snapshots kept as evidence (plan baseline, policy decision input, power finding evidence) and for payloads replayed to a module API (DCIM work item arguments, write-back body).',
          '- No AUD tables and no audit_event table: the platform audits every insert, update and delete (DATA-021).', '']
    for dom, names in doms.items():
        md.append(f'## {dom}')
        md.append('')
        for name in names:
            t = TABLES[name]
            md.append(f'### {name}')
            md.append('')
            md.append(t['comment'])
            md.append('')
            fkmap = {f[0]: f[1] for f in t['fks']}
            md.append('| Column | Type | Null | Default | Description |')
            md.append('| --- | --- | --- | --- | --- |')
            for col in t['cols']:
                typ = col.typ.replace(f' {ASCII}', ' ascii').replace(' AUTO_INCREMENT', ' AI').replace('|', '\\|')
                if len(typ) > 60 and typ.startswith('ENUM('):
                    typ = typ[:57] + '…)'
                desc = col.comment + (f' → `{fkmap[col.name]}`' if col.name in fkmap else '')
                if 'GENERATED' in col.extra:
                    desc += ' (generated)'
                dflt = '' if col.default is None else col.default.replace('CURRENT_TIMESTAMP(3)', 'now')
                md.append(f'| `{col.name}` | {typ} | {"yes" if col.null else ""} | {dflt} | {desc.replace("|", "/")} |')
            keys = [f'UNIQUE ({", ".join(u)})' for u in t['uniques']] + [f'INDEX ({", ".join(i)})' for i in t['indexes']]
            if keys:
                md.append('')
                md.append('Keys: ' + ' · '.join(keys))
            if t['checks']:
                md.append('')
                md.append('Checks: ' + ' · '.join(f'`{x}`' for x in t['checks']))
            md.append('')
    return '\n'.join(md) + '\n'


if __name__ == '__main__':
    uniform()
    redundant_check()
    sql = emit()
    os.makedirs(os.path.dirname(OUT_SQL), exist_ok=True)
    open(OUT_SQL, 'w').write(sql)
    open(OUT_MD, 'w').write(emit_md())
    print(f'{len(ORDER)} tables, {sum(len(TABLES[t]["cols"]) for t in ORDER)} columns, '
          f'{sum(len(TABLES[t]["fks"]) for t in ORDER)} FKs, {sum(len(TABLES[t]["checks"]) for t in ORDER)} checks → {OUT_SQL}')

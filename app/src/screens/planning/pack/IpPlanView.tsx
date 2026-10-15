/* IP and network plan: the site container and its usage, prefixes grouped by scope (Download CSV), BGP ASNs and VLANs. */
import { useMemo } from 'react';
import * as I from 'lucide-react';
import type * as T from '../../../planner/p2b/types';
import { ipCsv, type IpItem, type IpPlan } from '../../../planner/lib/outputs';
import { downloadText } from '../../../planner/lib/packModel';
import { Btn, Chip, Empty, Panel } from '../../../ui/kit';
import { DataTable, type Col } from '../../../ui/DataTable';
import { SoftMeter, StatGrid, StatTile } from '../../../ui/Analytics';
import type { Tone } from '../../../lib/tone';
import { num } from '../common';

const PURPOSE_TONE: Record<IpItem['purpose'], Tone> = { Production: 'info', Storage: 'cyan', Management: 'purple', OOB: 'neutral', Transit: 'orange', Loopback: 'neutral' };
const PURPOSE_LABEL: Record<IpItem['purpose'], string> = { Production: 'Production', Storage: 'Storage', Management: 'Management', OOB: 'Out of band', Transit: 'Transit', Loopback: 'Loopback' };
const dash = <span className="vw-label">—</span>;
type VlanRow = IpPlan['vlans'][number] & { id: string };
type AsnRow = IpPlan['asns'][number] & { id: string };
const Purpose = ({ p }: { p: string }) => <Chip tone={PURPOSE_TONE[p as IpItem['purpose']] ?? 'neutral'} size="xs">{PURPOSE_LABEL[p as IpItem['purpose']] ?? p}</Chip>;

export function IpPlanView({ plan, ip, applies }: { plan: T.PlannerPlan; ip: IpPlan; applies: boolean }) {
  const heads = useMemo(() => { const s = new Set<string>(); ip.items.forEach((it, i) => { if (i === 0 || ip.items[i - 1].scope !== it.scope) s.add(it.id); }); return s; }, [ip.items]);
  const cols: Col<IpItem>[] = useMemo(() => [
    { key: 'scope', header: 'Scope', render: r => (heads.has(r.id) ? <span className="pk-b">{r.scope}</span> : null) },
    { key: 'purpose', header: 'Purpose', render: r => <Purpose p={r.purpose} /> },
    { key: 'name', header: 'Name', render: r => r.name },
    { key: 'cidr', header: 'CIDR', render: r => <span className="mono">{r.cidr}</span> },
    { key: 'hosts', header: 'Usable hosts', render: r => <span className="num">{num(r.hosts)}</span> },
    { key: 'vlan', header: 'VLAN', render: r => (r.vlan === undefined ? dash : <span className="num">{r.vlan}</span>) },
    { key: 'gw', header: 'Gateway', render: r => (r.gateway ? <span className="mono">{r.gateway}</span> : dash) },
    { key: 'notes', header: 'Notes', wrap: true, render: r => <span className="vw-label">{r.notes}</span> },
  ], [heads]);
  const vlanRows = useMemo<VlanRow[]>(() => ip.vlans.map((v, i) => ({ ...v, id: `${v.number}-${v.name}-${i}` })), [ip.vlans]);
  const asnRows = useMemo<AsnRow[]>(() => ip.asns.map((x, i) => ({ ...x, id: `${x.role}-${i}` })), [ip.asns]);

  if (!applies) return <Panel><Empty icon={I.Network} title="Not part of this plan type">This plan type does not change the network, so no address plan is produced. Network work is planned with a network uplift or a site plan.</Empty></Panel>;
  if (!ip.items.length) return <Panel><Empty icon={I.Network} title={ip.aggregate}>This plan does not allocate addresses itself.</Empty></Panel>;
  const usedPct = ip.totalAddresses ? Math.round((ip.usedAddresses / ip.totalAddresses) * 1000) / 10 : 0;
  const isNew = (ip.containers ?? []).some(c => c.isNew);
  const aggregateSub = ip.pending ? 'taken from IP & Network once loaded' : isNew ? 'new site container, written to IP & Network on execution' : ip.containers?.length ? 'the site container; prefixes avoid everything in use' : 'no container in IP & Network';
  return (
    <div className="col" style={{ gap: 14 }}>
      {(ip.warnings ?? []).length > 0 && <p className="note note--warn"><I.TriangleAlert size={15} /><span><b>Allocation notes</b> · {ip.warnings!.join('; ')}</span></p>}
      <StatGrid cols={4}>
        <StatTile label={isNew ? 'New site container' : 'Site container'} value={<span className="mono">{ip.aggregate}</span>} sub={aggregateSub} info="The address block the plan's prefixes are carved from." />
        <StatTile label="Prefixes" value={num(ip.items.length)} sub={`${new Set(ip.items.map(i => i.scope)).size} scope${new Set(ip.items.map(i => i.scope)).size === 1 ? '' : 's'}`} info="Subnets the plan allocates, grouped by the hall, fabric or service they serve." />
        <StatTile label="VLANs" value={num(ip.vlans.length)} sub={ip.asns.length ? `${ip.asns.length} ASN range${ip.asns.length === 1 ? '' : 's'}` : 'no routing domains'} info="Next free VLAN numbers at the site; private ASNs are unique across plans." />
        <StatTile label="Addresses used" value={`${usedPct}%`} sub={`${num(ip.usedAddresses)} of ${num(ip.totalAddresses)}`} subTone={usedPct > 80 ? 'warn' : undefined} info="Share of the container the site already uses plus what this plan takes.">
          <SoftMeter pct={usedPct} tone={usedPct > 80 ? 'warning' : 'info'} />
        </StatTile>
      </StatGrid>
      <Panel flush icon={I.Network} title="Prefixes" count={ip.items.length} actions={<Btn size="sm" icon={I.Download} onClick={() => downloadText(`${plan.plnId}-ip-plan.csv`, ipCsv(ip), 'text/csv')}>Download CSV</Btn>}>
        <DataTable rows={ip.items} cols={cols} pageSize={1000} maxHeight={520} />
      </Panel>
      <div className="pn-two">
        <Panel flush icon={I.Route} title="Routing (BGP autonomous systems)" count={ip.asns.length}>
          {asnRows.length ? <DataTable<AsnRow> rows={asnRows} pageSize={500} cols={[{ key: 'role', header: 'Role', render: r => r.role }, { key: 'asn', header: 'ASN', render: r => <span className="mono">{r.asn}</span> }]} />
            : <Empty icon={I.Route} title="No private ASNs">No switching fabric, so no private ASNs are allocated.</Empty>}
        </Panel>
        <Panel flush icon={I.Tags} title="VLANs" count={ip.vlans.length}>
          {vlanRows.length ? <DataTable<VlanRow> rows={vlanRows} pageSize={500} maxHeight={280} cols={[{ key: 'n', header: 'VLAN', render: r => <span className="mono">{r.number}</span> }, { key: 'name', header: 'Name', render: r => r.name }, { key: 'p', header: 'Purpose', render: r => <Purpose p={r.purpose} /> }]} />
            : <Empty icon={I.Tags} title="No VLANs">No VLANs in this plan.</Empty>}
        </Panel>
      </div>
    </div>
  );
}

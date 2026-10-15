/* Plant baseline per system and the as-is / to-be line-up, drawn from the site's records. */
import { Chip } from '../../../../ui/kit';
import { SYSTEM_LABEL, SYSTEM_ORDER, type PlantAnalysis, type PlantSystem, type PlantUnit } from '../../../../planner/lib/plantModel';
import { kw, num } from '../../common';
import { Tbl } from '../../wizard/panelKit';

/** Installed, usable at redundancy, load, held by other plans, needed with this plan, and usable after the works. */
export function PlantSystemsTable({ an, systems }: { an: PlantAnalysis; systems?: PlantSystem[] }) {
  const b = an.baseline; if (!b) return null;
  const rows = b.systems.filter(s => !systems || systems.includes(s.system));
  return (
    <Tbl head={['System', 'Installed / usable', 'Load today', 'Held by others', 'Needed with this plan', 'Usable after', 'Result']} empty="No plant recorded.">
      {rows.map(s => {
        const a = an.after.find(x => x.system === s.system);
        const short = s.recorded && a && a.usableKw < s.requiredKw;
        return (
          <tr key={s.system}>
            <td title={s.basis}><span className="cell-2"><b className="strong">{s.label}</b><small>{s.recorded ? `${s.redundancy} · ${num(s.units.length)} unit${s.units.length === 1 ? '' : 's'}` : 'not recorded'}</small></span></td>
            <td className="num">{s.recorded ? `${kw(s.installedKw)} / ${kw(s.usableKw)}` : '—'}</td>
            <td className="num" title={s.loadSource}>{kw(s.loadKw)}{s.loadSource !== 'measured' ? ' *' : ''}</td>
            <td className="num">{kw(s.reservedKw + s.pipelineKw)}</td>
            <td className="num" title={`(committed + plan load × ${s.factor}) × ${s.margin}`}>{kw(s.requiredKw)}</td>
            <td className="num">{a && (s.recorded || a.units.length) ? <span className="cell-2"><span>{kw(a.usableKw)}</span>{a.deltaUsableKw ? <small>{a.deltaUsableKw > 0 ? '+' : '−'}{kw(Math.abs(a.deltaUsableKw))}</small> : null}</span> : '—'}</td>
            <td>{!s.recorded ? <Chip tone="neutral" size="xs">Not recorded</Chip> : short ? <Chip tone="error" size="xs" dot>Short {kw(s.requiredKw - (a?.usableKw ?? 0))}</Chip> : <Chip tone="success" size="xs" dot>Meets</Chip>}</td>
          </tr>
        );
      })}
    </Tbl>
  );
}

const STATE_COLOR = { existing: 'var(--primaryColor500)', new: 'var(--vw-color-emerald-500)', removed: 'var(--vw-color-red-500)', uprated: 'var(--vw-color-amber-500)' } as const;
interface Box { u: PlantUnit; state: keyof typeof STATE_COLOR }
/** One lane per system: the units in the records, new units dashed, replaced units struck through, uprated units in amber. */
export function AsIsOneLine({ an, systems = SYSTEM_ORDER }: { an: PlantAnalysis; systems?: PlantSystem[] }) {
  const b = an.baseline; if (!b) return null;
  const lanes = systems.map(sys => {
    const before = b.systems.find(s => s.system === sys)?.units ?? [];
    const after = an.after.find(s => s.system === sys)?.units ?? [];
    const boxes: Box[] = [
      ...before.map(u => { const now = after.find(x => x.id === u.id); return { u, state: !now ? 'removed' as const : now.capacityKw !== u.capacityKw ? 'uprated' as const : 'existing' as const }; }),
      ...after.filter(u => u.isNew).map(u => ({ u, state: 'new' as const })),
    ];
    return { sys, boxes };
  }).filter(l => l.boxes.length);
  if (!lanes.length) return <p className="vw-label">No plant recorded at the site and none added.</p>;
  const MAX = 8, BW = 96, BH = 36, GAP = 8, LX = 176, LH = 50;
  const W = LX + MAX * (BW + GAP) + 64, H = lanes.length * LH + 6;
  return (
    <div className="pn-draw">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }} role="img" aria-label="Plant by system, as-is and to-be">
        {lanes.map((l, i) => {
          const y = 4 + i * LH; const shown = l.boxes.slice(0, MAX);
          return (
            <g key={l.sys}>
              <text x={0} y={y + 15} fontSize={11.5} fontWeight={500} fill="var(--vw-color-slate-900)">{SYSTEM_LABEL[l.sys].split(' (')[0]}</text>
              <text x={0} y={y + 29} fontSize={10.5} fill="var(--vw-color-slate-500)">{b.systems.find(s => s.system === l.sys)?.redundancy}</text>
              <line x1={LX - 10} y1={y + BH / 2} x2={LX + shown.length * (BW + GAP)} y2={y + BH / 2} stroke="var(--vw-color-slate-200)" strokeWidth={2} />
              {shown.map((x, k) => (
                <g key={x.u.id} transform={`translate(${LX + k * (BW + GAP)},${y})`}>
                  <title>{`${x.u.name} · ${kw(x.u.capacityKw)}${x.u.side ? ` · ${x.u.side} side` : ''} · ${x.state === 'existing' ? 'in the records' : x.state === 'new' ? 'added by this plan' : x.state}`}</title>
                  <rect width={BW} height={BH} rx={6} fill="var(--vw-color-white)" stroke={STATE_COLOR[x.state]} strokeWidth={1.5} strokeDasharray={x.state === 'new' ? '4 3' : undefined} />
                  <text x={7} y={15} fontSize={10.5} fontWeight={500} fill="var(--vw-color-slate-900)">{x.u.name.length > 15 ? `${x.u.name.slice(0, 14)}…` : x.u.name}</text>
                  <text x={7} y={28} fontSize={10} fill="var(--vw-color-slate-500)">{kw(x.u.capacityKw)}{x.u.side ? ` · ${x.u.side}` : ''}</text>
                  {x.state === 'removed' && <line x1={4} y1={BH - 4} x2={BW - 4} y2={4} stroke={STATE_COLOR.removed} strokeWidth={1.5} />}
                </g>
              ))}
              {l.boxes.length > MAX && <text x={LX + MAX * (BW + GAP)} y={y + 22} fontSize={10.5} fill="var(--vw-color-slate-500)">+{l.boxes.length - MAX} more</text>}
            </g>
          );
        })}
      </svg>
      <div className="pn-legend2">
        <span><i style={{ borderColor: STATE_COLOR.existing }} />In the records</span>
        <span><i className="is-dash" style={{ borderColor: STATE_COLOR.new }} />Added by this plan</span>
        <span><i style={{ borderColor: STATE_COLOR.removed }} />Replaced</span>
        <span><i style={{ borderColor: STATE_COLOR.uprated }} />Uprated</span>
      </div>
    </div>
  );
}

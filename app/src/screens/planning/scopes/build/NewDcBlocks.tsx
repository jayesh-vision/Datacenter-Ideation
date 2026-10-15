/* New datacenter: the site facts of the chosen plot against the design (feasibility) and the candidate plots compared on a weighted
   scorecard. The plots themselves are edited on Requirements (wizard/Candidates.tsx). */
import { Chip } from '../../../../ui/kit';
import { CRITERIA, CRITERION_LABEL, type CandidateScore, type Feasibility } from '../../../../planner/lib/buildSite';
import { money } from '../../common';
import { Tbl } from '../replace/shared';

const checkTone = (c: Feasibility['checks'][number]) => (c.ok ? (c.warn ? 'warning' : 'success') : c.key === 'zoning' ? 'warning' : 'error') as 'success' | 'warning' | 'error';
const checkWord = (c: Feasibility['checks'][number]) => (c.ok ? (c.warn ? 'Warning' : 'Pass') : c.key === 'zoning' ? 'Warning' : 'Fail');

/** Site facts against the design, line by line. */
export function FeasibilityTable({ f }: { f: Feasibility }) {
  return (
    <Tbl>
      <thead><tr><th>Check</th><th>Result</th><th>Detail</th></tr></thead>
      <tbody>{f.checks.map(c => <tr key={c.key}><td><span className="strong">{c.label}</span></td><td><Chip tone={checkTone(c)} size="xs" dot>{checkWord(c)}</Chip></td><td style={{ whiteSpace: 'normal' }}>{c.detail}</td></tr>)}</tbody>
    </Tbl>
  );
}

/** Weighted scorecard across the candidate plots: each criterion scores the best plot 100 and the worst 0; the per-criterion scores are
    in the score's hover. */
export function CandidateScorecard({ scores, weights }: { scores: CandidateScore[]; weights: Record<string, number> }) {
  if (!scores.length) return null;
  const sorted = [...scores].sort((a, b) => a.rank - b.rank);
  return (
    <Tbl>
      <thead><tr><th>Rank</th><th>Plot</th><th>Time to power</th><th>CapEx and land</th><th>Energy a year</th><th>Score</th><th>Hard limits</th></tr></thead>
      <tbody>{sorted.map(s => {
        const broken = s.feasibility.checks.filter(c => !c.ok && c.key !== 'zoning');
        return (
          <tr key={s.candidate.id} className={s.candidate.chosen ? 'is-on' : undefined}>
            <td className="num">{s.rank}</td>
            <td><span className="cell-2"><span className="row" style={{ gap: 6 }}><span className="strong">{s.candidate.name}</span>{s.candidate.chosen && <Chip tone="info" size="xs">Chosen</Chip>}</span>
              <small title={`${s.metrics.latencyBasis}; risk: ${s.metrics.riskWhy.join(', ') || 'none recorded'}`}>{s.metrics.latencyMs === undefined ? 'latency not known' : `${s.metrics.latencyMs} ms to the estate`} · risk {s.metrics.riskPoints ? `${s.metrics.riskPoints} points` : 'low'}</small></span></td>
            <td className="num">{s.metrics.monthsToPower === 99 ? '—' : `${s.metrics.monthsToPower} months`}</td>
            <td className="num">{money(s.metrics.costUsd)}</td>
            <td className="num" title={`${s.metrics.tariff} USD/kWh (${s.metrics.tariffSource})`}>{money(s.metrics.energyUsdYear)}</td>
            <td className="num" title={CRITERIA.map(c => `${CRITERION_LABEL[c]} ${s.scores[c]} (weight ${weights[c]})`).join(' · ')}><b>{s.total}</b></td>
            <td>{s.feasible ? <Chip tone="success" size="xs" dot>All met</Chip> : <Chip tone="error" size="xs" dot title={broken.map(c => c.detail).join(' · ')}>{broken.length} broken</Chip>}</td>
          </tr>
        );
      })}</tbody>
    </Tbl>
  );
}

/** The weights the scorecard uses, in a line. */
export const weightsText = (weights: Record<string, number>) => CRITERIA.map(c => `${CRITERION_LABEL[c]} ${weights[c]}`).join(' · ');

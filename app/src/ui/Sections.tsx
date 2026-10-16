import { useState, type ReactNode } from 'react';
import * as I from 'lucide-react';
import '../styles/sections.css';

export type SecOpen = { is: (id: string) => boolean; toggle: (id: string) => void; ensure: (id: string) => void };
/* Collapsible sections (16-Oct-2026, user: the Power & backup tab had too many widgets to scroll through). Each section is a
   header row with a one-line status summary; open / closed is remembered per viewer (localStorage `dco.fac.<scope>`), the first
   section starts open, and "Expand all / Collapse all" sits above them. */
export type SecSummary = { l: string; v: string; tone?: 'bad' | 'warn' | 'ok' }[];
export function FacSections({ ids, scope, children }: { ids: string[]; scope: string; children: (open: SecOpen) => ReactNode }) {
  const key = `dco.fac.${scope}`;
  const [state, setState] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? { [ids[0]]: true }; } catch { return { [ids[0]]: true }; } });
  const save = (n: Record<string, boolean>) => { setState(n); try { localStorage.setItem(key, JSON.stringify(n)); } catch { /* storage blocked */ } };
  const allOpen = ids.every(id => state[id]);
  return (
    <div className="fac-secs">
      <div className="fac-secs-bar"><button type="button" className="panel-link" onClick={() => save(Object.fromEntries(ids.map(id => [id, !allOpen])))}>{allOpen ? 'Collapse all' : 'Expand all'}{allOpen ? <I.ChevronsDownUp size={14} /> : <I.ChevronsUpDown size={14} />}</button></div>
      {children({ is: id => !!state[id], toggle: id => save({ ...state, [id]: !state[id] }), ensure: id => { if (!state[id]) save({ ...state, [id]: true }); } })}
    </div>
  );
}
export function FacSection({ id, scope, open, title, desc, icon: Ic, summary, children }: { id: string; scope: string; open: SecOpen; title: string; desc: string; icon: I.LucideIcon; summary: SecSummary; children: ReactNode }) {
  const on = open.is(id);
  const state = summary.some(x => x.tone === 'bad') ? 'bad' : summary.some(x => x.tone === 'warn') ? 'warn' : 'ok';
  const word = state === 'bad' ? 'Needs action' : state === 'warn' ? 'Watch' : 'Normal';
  return (
    <section className={`fac-sec${on ? ' is-open' : ''} is-${state}`} data-sec={`${scope}-${id}`}>
      <button type="button" className="fac-sec-h" aria-expanded={on} onClick={() => open.toggle(id)}>
        <span className="fac-sec-ic"><Ic size={18} /></span>
        <span className="fac-sec-name">
          <span className="fac-sec-t">{title}<span className={`fac-sec-state is-${state}`}><i />{word}</span></span>
          <span className="fac-sec-d">{desc}</span>
        </span>
        <span className="fac-sec-act">{on ? 'Collapse' : 'Expand'}<I.ChevronDown size={16} className="fac-sec-chev" /></span>
        {!on && <span className="fac-sec-facts">{summary.map(x => (
          <span key={x.l} className={`fac-fact${x.tone ? ` is-${x.tone}` : ''}`}><span className="fac-fact-l">{x.l}</span><span className="fac-fact-v">{x.v}</span></span>
        ))}</span>}
      </button>
      {on && <div className="fac-sec-b">{children}</div>}
    </section>
  );
}


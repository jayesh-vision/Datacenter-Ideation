import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as I from 'lucide-react';
import { askSentinel, sentinelSuggestions, type Answer, type Ctx } from '../api';
import { Drawer } from '../ui/kit';

type Turn = { q: string; a?: Answer };

/* Sentinel sits over the operational model: it answers from live records and
   always shows the evidence behind each line (DC-AI-001/002). */
export function Sentinel({ open, onClose, ctx, initial }: { open: boolean; onClose: () => void; ctx: Ctx; initial?: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const body = useRef<HTMLDivElement>(null);
  const ask = (text: string) => {
    if (!text.trim()) return;
    setTurns(t => [...t, { q: text }]); setQ('');
    askSentinel(text, ctx).then(a => setTurns(t => t.map((x, i) => (i === t.length - 1 ? { ...x, a } : x))));
  };
  useEffect(() => { if (open && initial) ask(initial); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, initial]);
  useEffect(() => { body.current?.parentElement?.scrollTo({ top: 1e6, behavior: 'smooth' }); }, [turns]);
  const sugg = sentinelSuggestions(ctx);
  const focus = ctx.incidentId ?? ctx.neId ?? ctx.linkId ?? ctx.serviceId ?? ctx.dcId;

  return (
    <Drawer open={open} onClose={onClose} width={500}
      title={<span className="row" style={{ gap: 8 }}><span className="sentinel-ico"><I.Sparkles size={15} /></span>Sentinel</span>}
      sub={<>Answers from live inventory, telemetry, topology and change records{focus ? <> · focused on <b className="mono">{focus}</b></> : null}</>}
      foot={
        <form className="sentinel-input" onSubmit={e => { e.preventDefault(); ask(q); }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ask about a site, element, link, incident…" />
          <button type="submit" className="nst-btn nst-btn--sm nst-btn--filled" disabled={!q.trim()}><I.ArrowUp size={15} /></button>
        </form>
      }>
      <div ref={body} className="col" style={{ gap: 14 }}>
        {!turns.length && (
          <div className="sentinel-empty">
            <p>Observe → investigate → act. I recommend; disruptive actions still need an approval in the incident workspace.</p>
            <div className="col" style={{ gap: 6 }}>{sugg.map(s => <button key={s} type="button" className="sentinel-sugg" onClick={() => ask(s)}><I.CornerDownRight size={13} />{s}</button>)}</div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className="col" style={{ gap: 8 }}>
            <div className="sentinel-q">{t.q}</div>
            {!t.a ? <div className="sentinel-a is-loading"><span className="spinner" />Correlating inventory, alerts and topology…</div> : (
              <div className="sentinel-a">
                <div className="row between"><b>{t.a.title}</b>{t.a.confidence > 0 && <span className="vw-chip vw-chip--info chip-xs">{t.a.confidence}% confidence</span>}</div>
                <ul>{t.a.lines.map((l, k) => <li key={k} className={l.startsWith('  •') ? 'is-sub' : ''}>{l.replace(/^ {2}• /, '')}</li>)}</ul>
                {t.a.evidence.length > 0 && <div className="sentinel-ev"><span className="faint">Evidence</span>{t.a.evidence.map((e, k) => <Link key={k} to={e.to} onClick={onClose} className="vw-chip vw-chip--neutral chip-xs">{e.label}</Link>)}</div>}
                {(t.a.actions.length > 0 || t.a.followups.length > 0) && (
                  <div className="row wrap" style={{ gap: 6 }}>
                    {t.a.actions.map((x, k) => <Link key={k} to={x.to} onClick={onClose} className="nst-btn nst-btn--xs nst-btn--filled">{x.label}</Link>)}
                    {t.a.followups.map((x, k) => <button key={k} type="button" className="nst-btn nst-btn--xs" onClick={() => ask(x)}>{x}</button>)}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </Drawer>
  );
}

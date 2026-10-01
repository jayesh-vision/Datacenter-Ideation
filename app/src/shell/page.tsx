import { createContext, useContext, useEffect, type ReactNode } from 'react';
import type { Ctx } from '../api';

export interface Crumb { label: string; to?: string }
export interface PageMeta { crumbs: Crumb[]; ctx: Ctx }
export const PageCtx = createContext<{ set: (m: PageMeta) => void; openSentinel: (q?: string) => void }>({ set: () => {}, openSentinel: () => {} });

/* each screen declares its breadcrumb and the entity Sentinel should focus on */
export function usePage(crumbs: Crumb[], ctx: Ctx = {}) {
  const { set } = useContext(PageCtx);
  const key = JSON.stringify([crumbs, ctx]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { set({ crumbs, ctx }); }, [key]);
}
export const useSentinel = () => useContext(PageCtx).openSentinel;

export function PageHead({ title, sub, actions, chips, icon }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; chips?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="row" style={{ gap: 14, alignItems: 'flex-start', minWidth: 0 }}>
        {icon}
        <div style={{ minWidth: 0 }}><div className="row wrap" style={{ gap: 10 }}><h1>{title}</h1>{chips}</div>{sub && <p>{sub}</p>}</div>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return <div className="loading"><span className="spinner" />{label}…</div>;
}

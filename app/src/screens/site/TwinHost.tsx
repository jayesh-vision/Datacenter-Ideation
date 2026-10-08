import { Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as I from 'lucide-react';
import { Loading } from '../../shell/page';
import { Seg } from '../../ui/kit';
import '../../styles/twin2.css';
const Twin = lazy(() => import('./twin/Twin'));
const Twin2 = lazy(() => import('./twin2/Twin2'));

/* Two 3D views of the same datacenter (user, 08-Oct-2026): the signed-off schematic twin
   and the realistic twin. `?twin=` wins, then the viewer's last choice (localStorage). */
export type TwinView = 'schematic' | 'realistic';
const KEY = 'dco.twin.view';
const VIEWS: { id: TwinView; label: string; icon: typeof I.Box; title: string }[] = [
  { id: 'schematic', label: 'Schematic', icon: I.Box, title: 'Schematic 3D view: slate shell, graphite cabinets, overlays' },
  { id: 'realistic', label: 'Realistic', icon: I.Building2, title: 'Realistic 3D view: textured cabinets, perforated doors, trays, plant' }
];
const isView = (v: string | null): v is TwinView => v === 'schematic' || v === 'realistic';
const saved = (): TwinView => { try { const v = localStorage.getItem(KEY); return isView(v) ? v : 'schematic'; } catch { return 'schematic'; } };

export function useTwinView(): [TwinView, (v: TwinView) => void] {
  const [sp, setSp] = useSearchParams();
  const q = sp.get('twin');
  const view: TwinView = isView(q) ? q : saved();
  const set = (v: TwinView) => {
    try { localStorage.setItem(KEY, v); } catch { /* storage blocked */ }
    const n = new URLSearchParams(sp); n.set('twin', v); setSp(n, { replace: true });
  };
  return [view, set];
}

function TwinViewSwitch({ value, onChange }: { value: TwinView; onChange: (v: TwinView) => void }) {
  return (
    <div className="site-view-switch" data-twin-view={value}>
      <span className="vw-label">View</span>
      <Seg size="sm" value={value} onChange={onChange} options={VIEWS.map(v => ({ id: v.id, label: v.label, icon: v.icon, title: v.title }))} />
    </div>
  );
}

export function TwinHost({ dcId, view, onView }: { dcId: string; view: TwinView; onView: (v: TwinView) => void }) {
  return (
    <div className="twin-host">
      <div className="twin-host-bar">
        <span className="vw-card-title-sm">Digital twin</span>
        <span className="vw-label twin-host-path">Building › Floor › Room › Rack › Equipment</span>
        <TwinViewSwitch value={view} onChange={onView} />
      </div>
      <Suspense fallback={<Loading label="Loading Data center view" />}>
        {view === 'realistic' ? <Twin2 key={dcId} dcId={dcId} /> : <Twin key={dcId} dcId={dcId} />}
      </Suspense>
    </div>
  );
}

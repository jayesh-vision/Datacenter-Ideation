/* The calm banner every plan-page editor shows above its form: what saving will do on this plan (policy.note from usePlanEdit), with a
   link to the open revision when the change goes there. Nothing for a draft (the note is empty). */
import { Link } from 'react-router-dom';
import * as I from 'lucide-react';
import type { EditPolicy } from './policy';

export function EditNote({ policy, tab }: { policy: EditPolicy; tab?: string }) {
  if (!policy.note) return null;
  const Icon = policy.mode === 'read-only' ? I.Lock : policy.mode === 'revision' ? I.GitBranch : I.Undo2;
  return (
    <p className="note note--info pn-editnote" data-mode={policy.mode}>
      <Icon size={15} />
      <span>{policy.note}{policy.target?.id && <> <Link className="ent-link mono" to={`/planning/plans/${policy.target.id}${tab ? `?tab=${tab}` : ''}`}>Open {policy.target.plnId}</Link></>}</span>
    </p>
  );
}

/* Light entry points for the plan page and the plan pack: the review page link and the Send for review modal, loaded on demand so the
   document builder and its drawing renderer stay out of the plan page's bundle until someone sends the plan for review. */
import { lazy, Suspense } from 'react';
import type * as T from '../../../../planner/p2b/types';

export const reviewUrl = (planId: string) => `/planning/plans/${planId}/review`;
const Modal = lazy(() => import('./SendForReview').then(m => ({ default: m.SendForReviewModal })));
export function SendForReview({ plan, onClose }: { plan: T.PlannerPlan; onClose: () => void }) {
  return <Suspense fallback={null}><Modal plan={plan} onClose={onClose} /></Suspense>;
}

/* The plan's ReviewDoc for the portal (reviewer page, Send for review): the inputs from useReviewInput (shared with the Plan pack's
   downloads, so both build the same document), built once per change. */
import { useMemo } from 'react';
import type * as T from '../../../../planner/p2b/types';
import { buildReviewDoc } from './build';
import type { ReviewDoc } from './model';
import { useReviewInput } from './reviewInput';

export function useReviewDoc(plan: T.PlannerPlan | undefined) {
  const { input, siteName, template, evaluation, delivery } = useReviewInput(plan);
  const doc = useMemo<ReviewDoc | undefined>(() => (input ? buildReviewDoc(input) : undefined), [input]);
  return { doc, loading: !doc, siteName, template, evaluation, delivery };
}

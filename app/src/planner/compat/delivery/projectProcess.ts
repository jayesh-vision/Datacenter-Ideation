/* P2B delivery work specs: our Delivery module plans the work orders itself, so the planner does not assign material to process steps. */
export const WORK_SPECS: Record<string, Record<string, { label: string; items: { type: string }[] }>> = {};
export const processKeyFor = (_template?: string): string | undefined => { void _template; return undefined; };

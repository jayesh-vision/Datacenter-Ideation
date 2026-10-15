/* The plan's review document: ONE content model that the PDF, the workbook, the ZIP package and the in-portal reviewer page all render,
   so what a reviewer reads by email and in the portal is the same document. Built from the plan, its evaluation, the estate data, the
   template and benchmarks, and (once the plan is in Delivery) the Delivery project. No rendering here. */

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';
export interface Cell { text: string; tone?: Tone; num?: boolean }
export type Block =
  | { kind: 'para'; text: string }
  | { kind: 'kv'; rows: { label: string; value: string; tone?: Tone; source?: string }[]; columns?: 1 | 2 }
  | { kind: 'table'; title?: string; columns: { label: string; num?: boolean; width?: number }[]; rows: Cell[][]; total?: Cell[]; note?: string }
  | { kind: 'list'; items: string[]; ordered?: boolean }
  | { kind: 'callout'; tone: Tone; title: string; text?: string }
  | { kind: 'figures'; items: { label: string; value: string; sub?: string; tone?: Tone }[] }
  /* a drawing or chart embedded in the text (rendered to static SVG of the given size) */
  | { kind: 'figure'; drawingId: string; caption?: string };

export interface ReviewSection { id: string; number: string; title: string; summary?: string; blocks: Block[] }

export interface ReviewDrawing {
  id: string; number: string; title: string; discipline: string; revision: string;
  /* a self-contained SVG (inline styles, no external CSS) at the given size; landscape A3/A4 friendly */
  svg: () => string; width: number; height: number; notes?: string[];
}

/* one sheet of the data workbook (and one CSV in the package) */
export interface ReviewSheet { name: string; columns: { label: string; num?: boolean; money?: boolean; width?: number }[]; rows: (string | number | null)[][] }

export interface ReviewApprovalStep { step: number; role: string; approver?: string; decision: string; at?: string; comment?: string; conditions?: string[] }

export interface ReviewMeta {
  plnId: string; title: string; revision: string; status: string; scopeLabel: string; site: string; owner: string; requestedBy?: string;
  neededBy?: string; generatedAt: string; generatedBy: string; currency: string; geography: string; templateName?: string; templateVersion?: string;
  docNumber: string; /* e.g. PLN-0002-A-RP */
  headline: { label: string; value: string; sub?: string; tone?: Tone }[];
  verdict: { tone: Tone; text: string };
}

export interface ReviewDoc {
  meta: ReviewMeta;
  sections: ReviewSection[];
  drawings: ReviewDrawing[];
  sheets: ReviewSheet[];
  approvals: ReviewApprovalStep[];
  /* what the reviewer is asked to decide, and what changes since the last round (if any) */
  ask: { decision: string; changesSinceLast?: string[] };
}

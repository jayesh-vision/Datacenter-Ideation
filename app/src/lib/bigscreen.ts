/* Big screens / TVs (22-Oct-2026, user): base.css scales the whole UI with `html { zoom }` from 2200 px wide.
   Under CSS zoom the browser reports rects, pointer coordinates and the window size in screen pixels while
   layout (style left/top/width, offsetWidth, ResizeObserver) is in zoomed CSS pixels, so every tooltip, chart
   width or hit test computed from getBoundingClientRect would be off by the zoom factor. This layer makes the
   page see one coordinate space (layout pixels, as if the window were innerWidth / zoom wide) while zoom ≠ 1.
   Nothing changes at zoom 1 (every screen up to 2200 px). */
let z = 1;
const read = () => { z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1; };

export function installBigScreen() {
  if (typeof window === 'undefined' || (window as unknown as { __vz?: boolean }).__vz) return;
  (window as unknown as { __vz?: boolean }).__vz = true;
  read(); requestAnimationFrame(read); window.addEventListener('load', read);
  window.addEventListener('resize', read, true);

  const E = Element.prototype, gbcr = E.getBoundingClientRect, gcr = E.getClientRects;
  const scale = (r: DOMRect) => new DOMRect(r.x / z, r.y / z, r.width / z, r.height / z);
  E.getBoundingClientRect = function (this: Element) { const r = gbcr.call(this); return z === 1 ? r : scale(r); };
  E.getClientRects = function (this: Element) {
    const l = gcr.call(this); if (z === 1) return l;
    const a = [...l].map(scale); return Object.assign(a, { item: (i: number) => a[i] ?? null }) as unknown as DOMRectList;
  };

  for (const k of ['clientX', 'clientY', 'pageX', 'pageY', 'x', 'y'] as const) {
    const d = Object.getOwnPropertyDescriptor(MouseEvent.prototype, k); if (!d?.get) continue;
    const g = d.get;
    Object.defineProperty(MouseEvent.prototype, k, { configurable: true, enumerable: d.enumerable, get(this: MouseEvent) { const v = g.call(this) as number; return z === 1 ? v : v / z; } });
  }

  for (const k of ['innerWidth', 'innerHeight'] as const) {
    const d = Object.getOwnPropertyDescriptor(window, k) ?? Object.getOwnPropertyDescriptor(Window.prototype, k); if (!d?.get) continue;
    const g = d.get;
    Object.defineProperty(window, k, { configurable: true, enumerable: true, get() { const v = g.call(window) as number; return z === 1 ? v : Math.round(v / z); } });
  }

  const efp = Document.prototype.elementFromPoint, efps = Document.prototype.elementsFromPoint;
  Document.prototype.elementFromPoint = function (this: Document, x: number, y: number) { return efp.call(this, x * z, y * z); };
  Document.prototype.elementsFromPoint = function (this: Document, x: number, y: number) { return efps.call(this, x * z, y * z); };
}

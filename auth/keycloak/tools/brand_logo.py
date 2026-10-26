"""Build the login theme's logo files from the design team's master SVG (brand/synapse-logo-source.svg):
lockup in ink / white / currentColor, the mark alone in white / ink, and the favicon (white mark on a brand-blue tile)."""
import re
SRC = 'brand/synapse-logo-source.svg'; OUT = 'themes/synapse/login/resources/img/'
paths = re.findall(r'<path[^>]*/>', open(SRC).read())
def box(p):
    """Bounds of an absolute/relative M L H V C S Q T Z path (control points included, close enough for a crop)."""
    d = re.search(r' d="([^"]+)"', p).group(1); xs, ys = [], []; x = y = 0.0
    for cmd, args in re.findall(r'([MLHVCSQTZmlhvcsqtz])([^MLHVCSQTZmlhvcsqtz]*)', d):
        n = [float(v) for v in re.findall(r'-?\d*\.?\d+(?:e-?\d+)?', args)]; rel = cmd.islower(); c = cmd.upper()
        if c == 'Z': continue
        if c in 'HV':
            for v in n:
                if c == 'H': x = x + v if rel else v
                else: y = y + v if rel else v
                xs.append(x); ys.append(y)
            continue
        step = {'M': 2, 'L': 2, 'T': 2, 'C': 6, 'S': 4, 'Q': 4}[c]
        for i in range(0, len(n), step):
            seg = n[i:i + step]; bx, by = x, y
            for j in range(0, step, 2):
                px, py = (bx + seg[j], by + seg[j + 1]) if rel else (seg[j], seg[j + 1]); xs.append(px); ys.append(py)
            x, y = xs[-1], ys[-1]
    return min(xs), min(ys), max(xs), max(ys)
boxes = [box(p) for p in paths]
# the mark = shapes left of the widest horizontal gap
xs = sorted(boxes, key=lambda b: b[0]); gap_at, best, right = None, 0, xs[0][2]
for b in xs[1:]:
    if b[0] - right > best: best, gap_at = b[0] - right, b[0]
    right = max(right, b[2])
mark = [p for p, b in zip(paths, boxes) if b[0] < gap_at]
def bbox(ps):
    bs = [box(p) for p in ps]; return min(b[0] for b in bs), min(b[1] for b in bs), max(b[2] for b in bs), max(b[3] for b in bs)
def svg(ps, fill, pad=4, bg=None):
    x0, y0, x1, y1 = bbox(ps); x0 -= pad; y0 -= pad; x1 += pad; y1 += pad; w, h = x1 - x0, y1 - y0
    body = ''.join(re.sub(r'fill="#[0-9A-Fa-f]{6}"', f'fill="{fill}"', p) for p in ps)
    if bg:
        s = max(w, h) * 1.4; ox, oy = x0 - (s - w) / 2, y0 - (s - h) / 2
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{ox:.1f} {oy:.1f} {s:.1f} {s:.1f}">'
                f'<rect x="{ox:.1f}" y="{oy:.1f}" width="{s:.1f}" height="{s:.1f}" rx="{s*.22:.1f}" fill="{bg}"/>{body}</svg>\n')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:.1f} {y0:.1f} {w:.1f} {h:.1f}" fill="none">{body}</svg>\n'
files = {'synapse-logo.svg': svg(paths, '#0B1221'), 'synapse-logo-white.svg': svg(paths, '#FFFFFF'),
         'synapse-logo-mono.svg': svg(paths, 'currentColor'), 'synapse-mark-white.svg': svg(mark, '#FFFFFF'),
         'synapse-mark-ink.svg': svg(mark, '#0B1221'), 'synapse-mark.svg': svg(mark, '#FFFFFF', pad=0, bg='#1C81EF')}
for n, s in files.items(): open(OUT + n, 'w').write(s); print(n, len(s))
print('mark shapes', len(mark), 'of', len(paths))

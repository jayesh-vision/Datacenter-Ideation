"""Vectorise the design team's Synapse logo (PNG, dark ink on white) into SVGs for the login theme.
Run with a Python that has pillow + numpy + potracer:  python tools/trace_logo.py <logo.png>"""
import sys, numpy as np, potrace
from PIL import Image
OUT = 'themes/synapse/login/resources/img/'
UP = 4
im = Image.open(sys.argv[1]).convert('L')
im = im.resize((im.width * UP, im.height * UP), Image.LANCZOS)
ink = np.array(im) < 128
cols = np.where(ink.any(0))[0]
# split mark | word at the widest empty column gap
gaps = np.diff(cols); g = int(np.argmax(gaps))
parts = {'mark': (cols[0], cols[g]), 'word': (cols[g + 1], cols[-1])}
rows = np.where(ink.any(1))[0]; y0, y1 = rows[0], rows[-1]

def trace(x0, x1):
    bm = potrace.Bitmap(~ink[y0:y1 + 1, x0:x1 + 1])  # potracer traces False as ink
    d = []
    for c in bm.trace(turdsize=8, alphamax=1.0, opticurve=True, opttolerance=0.2):
        f = lambda p: f'{(p.x + x0) / UP:.2f} {(p.y + y0) / UP:.2f}'
        d.append('M' + f(c.start_point))
        for s in c.segments:
            d.append(('L' + f(s.c) + 'L' + f(s.end_point)) if s.is_corner else ('C' + f(s.c1) + ' ' + f(s.c2) + ' ' + f(s.end_point)))
        d.append('Z')
    return ''.join(d)

paths = {k: trace(*v) for k, v in parts.items()}
Y0, Y1 = y0 / UP, (y1 + 1) / UP
def svg(keys, fill, pad=2, bg=None):
    x0 = parts[keys[0]][0] / UP - pad; x1 = (parts[keys[-1]][1] + 1) / UP + pad
    w, h = x1 - x0, Y1 - Y0 + 2 * pad
    if bg:  # square badge for the favicon
        s = max(w, h) * 1.36
        ox, oy = x0 - (s - w) / 2, Y0 - pad - (s - h) / 2
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{ox:.2f} {oy:.2f} {s:.2f} {s:.2f}">'
                f'<rect x="{ox:.2f}" y="{oy:.2f}" width="{s:.2f}" height="{s:.2f}" rx="{s*.22:.2f}" fill="{bg}"/>'
                + ''.join(f'<path fill="{fill}" fill-rule="evenodd" d="{paths[k]}"/>' for k in keys) + '</svg>\n')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:.2f} {Y0-pad:.2f} {w:.2f} {h:.2f}">'
            + ''.join(f'<path fill="{fill}" fill-rule="evenodd" d="{paths[k]}"/>' for k in keys) + '</svg>\n')

files = {
    'synapse-logo.svg': svg(['mark', 'word'], '#0B1220'),        # light backgrounds
    'synapse-logo-white.svg': svg(['mark', 'word'], '#FFFFFF'),  # the login page (dark)
    'synapse-logo-mono.svg': svg(['mark', 'word'], 'currentColor'),
    'synapse-mark-white.svg': svg(['mark'], '#FFFFFF'),
    'synapse-mark-ink.svg': svg(['mark'], '#0B1220'),
    'synapse-mark.svg': svg(['mark'], '#FFFFFF', pad=0, bg='#1C81EF'),  # favicon
}
for n, s in files.items():
    open(OUT + n, 'w').write(s); print(n, len(s))

"""Generates the Synapse login background: a datacenter cold aisle in one-point perspective.
Two rows of racks face each other, devices with blinking status LEDs, perforated floor tiles lit from below,
overhead cable trays and light strips, a bright far end. Deterministic (seeded). Run: python3 tools/aisle.py"""
import random, math, os
random.seed(7)
W, H = 1600, 1000
VX, VY, F = 0.53 * W, 0.47 * H, 520.0
AW, FLOOR, RTOP, CEIL = 1.55, 1.30, -1.02, -1.95      # aisle half width, floor, rack top, ceiling (Y down)
Z0, DZ, NR = 0.72, 0.62, 26                            # first rack face, rack width along the aisle, racks per row

def P(x, y, z): return (VX + x * F / z, VY + y * F / z)
def poly(pts, **a):
    d = ' '.join(f'{x:.1f},{y:.1f}' for x, y in pts)
    at = ' '.join(f'{k.replace("_", "-")}="{v}"' for k, v in a.items())
    return f'<polygon points="{d}" {at}/>'
def line(p, q, **a):
    at = ' '.join(f'{k.replace("_", "-")}="{v}"' for k, v in a.items())
    return f'<line x1="{p[0]:.1f}" y1="{p[1]:.1f}" x2="{q[0]:.1f}" y2="{q[1]:.1f}" {at}/>'
def fog(z):  # 0 near .. 1 far
    return min(1.0, max(0.0, (z - Z0) / (Z0 + DZ * NR - Z0)))
def mixc(a, b, t): return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
def mix(a, b, t): return '#%02x%02x%02x' % mixc(a, b, t)
NEAR, FAR = (10, 16, 30), (34, 58, 104)

out = []
zfar = Z0 + DZ * NR
# --- floor, ceiling, back wall
out.append(poly([P(-AW, FLOOR, Z0 * .55), P(AW, FLOOR, Z0 * .55), P(AW, FLOOR, zfar), P(-AW, FLOOR, zfar)], fill='url(#floor)'))
out.append(poly([P(-AW - .6, CEIL, Z0 * .55), P(AW + .6, CEIL, Z0 * .55), P(AW + .6, CEIL, zfar), P(-AW - .6, CEIL, zfar)], fill='url(#ceil)'))
out.append(poly([P(-AW, CEIL, zfar), P(AW, CEIL, zfar), P(AW, FLOOR, zfar), P(-AW, FLOOR, zfar)], fill='url(#endglow)'))
# floor tiles: lines along the aisle + across; perforated tiles lit in the centre
xs = [-AW + i * (2 * AW / 5) for i in range(6)]
for x in xs: out.append(line(P(x, FLOOR, Z0 * .55), P(x, FLOOR, zfar), stroke='#5b8fd6', stroke_opacity='.16', stroke_width='1'))
z = Z0 * .55
while z < zfar:
    out.append(line(P(-AW, FLOOR, z), P(AW, FLOOR, z), stroke='#5b8fd6', stroke_opacity=f'{.18 * (1 - fog(z) * .6):.2f}', stroke_width='1'))
    if int(round((z - Z0 * .55) / (2 * AW / 5))) % 2 == 0:
        x0, x1 = xs[2], xs[3]
        out.append(poly([P(x0, FLOOR, z), P(x1, FLOOR, z), P(x1, FLOOR, z + 2 * AW / 5), P(x0, FLOOR, z + 2 * AW / 5)], fill='#3b8ff2', fill_opacity=f'{.07 + .05 * (1 - fog(z)):.2f}', **{'class': 'tile'}))
    z += 2 * AW / 5
# ceiling light strips and cable trays
for x in (-.55, .55):
    out.append(line(P(x, CEIL + .02, Z0 * .55), P(x, CEIL + .02, zfar), stroke='url(#strip)', stroke_width='3', stroke_linecap='round', opacity='.55'))
for side in (-1, 1):
    for y in (RTOP - .28, RTOP - .36):
        out.append(line(P(side * (AW - .25), y, Z0 * .6), P(side * (AW - .25), y, zfar), stroke='#7aa7e6', stroke_opacity='.35', stroke_width='1.4'))
    for k in range(60):
        zz = Z0 * .6 + k * .45
        if zz > zfar: break
        out.append(line(P(side * (AW - .25), RTOP - .28, zz), P(side * (AW - .25), RTOP - .36, zz), stroke='#7aa7e6', stroke_opacity='.22', stroke_width='1'))

# light rays fanning out of the far end (soft, slowly breathing)
for k, (dx0, dx1, y0, y1) in enumerate([(-.5, .5, CEIL, CEIL), (-AW, -AW + .7, CEIL, RTOP), (AW - .7, AW, CEIL, RTOP), (-.6, .6, FLOOR, FLOOR)]):
    a = P(0, (y0 + y1) / 2 * .2, zfar)
    out.append(poly([a, P(dx0, y0, Z0 * .5), P(dx1, y1, Z0 * .5)], fill='url(#ray)', **{'class': f'ray r{k % 2 + 1}'}))
# data pulses running along the light strips and cable trays towards the far end
def pulse(p0, p1, n, w, col, cls):
    for j in range(n):
        out.append(f'<line x1="{p0[0]:.1f}" y1="{p0[1]:.1f}" x2="{p1[0]:.1f}" y2="{p1[1]:.1f}" pathLength="100" stroke="{col}" stroke-width="{w}" stroke-linecap="round" stroke-dasharray="3 97" class="pulse {cls}" style="animation-delay:-{j * 100 / n * .045 + random.random():.2f}s"/>')
for x in (-.55, .55): pulse(P(x, CEIL + .02, Z0 * .55), P(x, CEIL + .02, zfar), 3, 6, '#ffffff', 'pf')
for side in (-1, 1):
    pulse(P(side * (AW - .25), RTOP - .32, Z0 * .6), P(side * (AW - .25), RTOP - .32, zfar), 4, 4, '#bfdbfe', 'ps')
mark = len(out)
refl = []

# --- racks, far to near, both rows
LEDC = ['#60a5fa'] * 9 + ['#7dd3fc'] * 5 + ['#34d399'] * 4 + ['#fbbf24']
racks = []
for side in (-1, 1):
    for i in range(NR):
        racks.append((Z0 + i * DZ, side, i))
racks.sort(key=lambda r: -r[0])
for z0, side, i in racks:
    z1 = z0 + DZ * .96
    x = side * AW
    t = fog(z0)
    body = mix(NEAR, FAR, t * .85)
    # front face (doors)
    out.append(poly([P(x, RTOP, z0), P(x, RTOP, z1), P(x, FLOOR, z1), P(x, FLOOR, z0)], fill=body, stroke='#1e3a66', stroke_width='.8', stroke_opacity='.9'))
    if i < 16: refl.append(poly([P(x, FLOOR, z0), P(x, FLOOR, z1), P(x, 2 * FLOOR - RTOP, z1), P(x, 2 * FLOOR - RTOP, z0)], fill=body, opacity='.55'))
    # rack top cap
    out.append(poly([P(x, RTOP, z0), P(x, RTOP, z1), P(x + side * .7, RTOP, z1), P(x + side * .7, RTOP, z0)], fill=mix((6, 10, 20), FAR, t * .5)))
    # devices: bands of different heights with a bezel line and LEDs
    y = RTOP + .06
    while y < FLOOR - .1:
        h = random.choice([.045, .09, .09, .135, .18, .045])
        if y + h > FLOOR - .08: break
        shade = mix(mixc(NEAR, FAR, t * .85), (40, 70, 120), random.random() * .25 + .05)
        gap = .006
        out.append(poly([P(x, y + gap, z0 + .03), P(x, y + gap, z1 - .03), P(x, y + h - gap, z1 - .03), P(x, y + h - gap, z0 + .03)], fill=shade))
        if random.random() < .9:
            for _ in range(random.choice([2, 3, 3, 4, 5])):
                u = random.uniform(.12, .9)
                zl = z0 + (z1 - z0) * u
                cx, cy = P(x, y + h * .5, zl)
                r = max(.6, 2.4 * F / zl / 420)
                c = random.choice(LEDC)
                cls = f'b{random.randint(1, 6)}' if random.random() < .45 else ''
                out.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.2f}" fill="{c}" class="led {cls}"/>')
                if i < 16 and random.random() < .6:
                    rx, ry = P(x, 2 * FLOOR - (y + h * .5), zl)
                    refl.append(f'<circle cx="{rx:.1f}" cy="{ry:.1f}" r="{r * 1.3:.2f}" fill="{c}" class="{cls}"/>')
        if random.random() < .18:
            zb0 = z0 + (z1 - z0) * .15; zb1 = z0 + (z1 - z0) * random.uniform(.35, .55)
            out.append(line(P(x, y + h * .8, zb0), P(x, y + h * .8, zb1), stroke='#60a5fa', stroke_opacity=f'{.55 * (1 - t * .5):.2f}', stroke_width=f'{max(.6, 1.6 * F / z0 / 520):.2f}', stroke_linecap='round'))
        y += h
    es = f' p{random.randint(1, 3)}' if random.random() < .35 else ''
    out.append(line(P(x, RTOP + .03, z0 + .012), P(x, FLOOR - .03, z0 + .012), stroke='#3d8ff2', stroke_opacity=f'{.7 * (1 - t * .55):.2f}', stroke_width=f'{max(.7, 2.2 * F / z0 / 520):.2f}', stroke_linecap='round', **{'class': 'edge' + es}))
    # vertical door seam / handle
    out.append(line(P(x, RTOP + .02, z1 - .02), P(x, FLOOR - .02, z1 - .02), stroke='#0a1222', stroke_width='1'))

out[mark:mark] = ['<g filter="url(#rblur)" opacity=".5" clip-path="url(#floorclip)">'] + refl + ['</g>']
air = []
for k in range(70):
    z = random.uniform(Z0 + .2, Z0 + 9)
    ax, ay = P(random.uniform(-AW * .55, AW * .55), FLOOR, z)
    rr = max(.6, 2.2 * F / z / 520)
    rise = 0.9 * F / z
    air.append(f'<circle cx="{ax:.1f}" cy="{ay:.1f}" r="{rr:.2f}" class="air" style="--rise:-{rise:.0f}px;animation-duration:{random.uniform(5, 11):.1f}s;animation-delay:-{random.uniform(0, 11):.1f}s"/>')
fl = [P(-AW, FLOOR, Z0 * .55), P(AW, FLOOR, Z0 * .55), P(AW, FLOOR, zfar), P(-AW, FLOOR, zfar)]
floorclip = ' '.join(f'{x:.1f},{y:.1f}' for x, y in fl)

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice">
<defs>
  <linearGradient id="floor" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#03060d"/><stop offset=".55" stop-color="#0a1830"/><stop offset="1" stop-color="#1a3766"/></linearGradient>
  <linearGradient id="ceil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05080f"/><stop offset="1" stop-color="#142a4d"/></linearGradient>
  <radialGradient id="endglow" cx=".5" cy=".55" r=".75"><stop offset="0" stop-color="#e0efff"/><stop offset=".35" stop-color="#7cb6ff"/><stop offset="1" stop-color="#1f4c8f"/></radialGradient>
  <linearGradient id="strip" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="{VX:.0f}" y2="{VY:.0f}"><stop offset="0" stop-color="#bfdbfe" stop-opacity=".9"/><stop offset="1" stop-color="#e0efff"/></linearGradient>
  <radialGradient id="ray" gradientUnits="userSpaceOnUse" cx="{VX:.0f}" cy="{VY:.0f}" r="{W * .75:.0f}"><stop offset="0" stop-color="#cfe4ff" stop-opacity=".22"/><stop offset=".55" stop-color="#7cb6ff" stop-opacity=".05"/><stop offset="1" stop-color="#7cb6ff" stop-opacity="0"/></radialGradient>
  <filter id="rblur" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="2.2"/></filter>
  <clipPath id="floorclip"><polygon points="{floorclip}"/></clipPath>
  <radialGradient id="haze" cx="{VX / W:.3f}" cy="{VY / H:.3f}" r=".55"><stop offset="0" stop-color="#9cc8ff" stop-opacity=".55"/><stop offset=".25" stop-color="#3b8ff2" stop-opacity=".22"/><stop offset="1" stop-color="#3b8ff2" stop-opacity="0"/></radialGradient>
</defs>
<style>
  .led {{ opacity: .95; }}
  .b1 {{ animation: bl 1.3s steps(2, jump-none) infinite; }} .b2 {{ animation: bl 2.1s steps(2, jump-none) infinite .4s; }}
  .b3 {{ animation: bl .9s steps(2, jump-none) infinite .2s; }} .b4 {{ animation: bl 3.2s steps(2, jump-none) infinite 1.1s; }}
  .b5 {{ animation: bl 1.7s steps(2, jump-none) infinite .7s; }} .b6 {{ animation: bl 2.6s steps(2, jump-none) infinite 1.6s; }}
  @keyframes bl {{ 0% {{ opacity: .95; }} 100% {{ opacity: .15; }} }}
  .tile {{ animation: glow 5s ease-in-out infinite; }}
  @keyframes glow {{ 0%, 100% {{ opacity: .85; }} 50% {{ opacity: 1; }} }}
  .pulse {{ animation: run 4.5s linear infinite; }} .pulse.ps {{ animation-duration: 6s; }}
  @keyframes run {{ from {{ stroke-dashoffset: 100; opacity: 0; }} 8% {{ opacity: 1; }} 85% {{ opacity: .9; }} to {{ stroke-dashoffset: 0; opacity: 0; }} }}
  .ray {{ animation: breathe 9s ease-in-out infinite; }} .ray.r2 {{ animation-delay: -4.5s; }}
  @keyframes breathe {{ 0%, 100% {{ opacity: .55; }} 50% {{ opacity: 1; }} }}
  .edge.p1 {{ animation: edge 4s ease-in-out infinite; }} .edge.p2 {{ animation: edge 6s ease-in-out infinite -2s; }} .edge.p3 {{ animation: edge 5s ease-in-out infinite -1s; }}
  @keyframes edge {{ 0%, 100% {{ opacity: .35; }} 50% {{ opacity: 1; }} }}
  .air {{ fill: #bfdbfe; opacity: 0; animation: air 8s ease-out infinite; }}
  @keyframes air {{ 0% {{ transform: translateY(0); opacity: 0; }} 15% {{ opacity: .55; }} 100% {{ transform: translateY(var(--rise)); opacity: 0; }} }}
  @media (prefers-reduced-motion: reduce) {{ .b1, .b2, .b3, .b4, .b5, .b6, .tile, .pulse, .ray, .edge, .air {{ animation: none; }} .pulse, .air {{ display: none; }} }}
</style>
<rect width="{W}" height="{H}" fill="#060b16"/>
{chr(10).join(out)}
{chr(10).join(air)}
<rect width="{W}" height="{H}" fill="url(#haze)"/>
</svg>
'''
dst = os.path.join(os.path.dirname(__file__), '..', 'themes', 'synapse', 'login', 'resources', 'img', 'synapse-aisle.svg')
open(dst, 'w').write(svg)
print(dst, len(svg) // 1024, 'KB')

#!/usr/bin/env python3
"""ER diagram + data dictionary page for review: reads the generated DDL (docs/database/synapsedc_dc_store.sql), so the page
shows exactly what installs, and writes docs/database/synapsedc_dc_store_er.html from er.template.html.
Run after build_schema.py:  python3 scripts/db/build_er.py"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SQL = os.path.join(ROOT, 'docs', 'database', 'synapsedc_dc_store.sql')
MD = os.path.join(ROOT, 'docs', 'database', 'synapsedc_dc_store.md')
OUT = os.path.join(ROOT, 'docs', 'database', 'synapsedc_dc_store_er.html')
TPL = os.path.join(HERE, 'er.template.html')

# Subject areas for the diagrams (≤ ~25 tables each, so one view stays readable). First match wins.
AREAS = [
    ('ref', 'Reference and configuration', 'Business models, geography, lookups, GPU catalogue, power tariffs and contracts, metrics.',
     lambda t, d: d.startswith('A.')),
    ('ops', 'Operations', 'DCIM work waiting for a change request, alarm tags, incident enrichment (impact, RCA, actions), power findings.',
     lambda t, d: d.startswith('B.') or d.startswith('C.')),
    ('tpl', 'Planner templates and benchmarks', 'Template identity and versions with their inputs, rules, modules and approval steps; custom site types; benchmark values.',
     lambda t, d: t.startswith('PLAN_TEMPLATE') or t.startswith('PLAN_SITE_TYPE') or t.startswith('BENCHMARK')),
    ('plan', 'Plan, scenarios and approvals', 'The plan, its inputs, phases, scenarios, risks, permits, materials, approval rounds, conditions and baseline.',
     lambda t, d: t in ('PLAN', 'PLAN_MODULE_PIN', 'PLAN_INPUT', 'APPROVAL_DELEGATION', 'PLAN_RISK', 'PLAN_PERMIT', 'PLAN_BASELINE',
                        'PLAN_MATERIAL_OVERRIDE', 'PLAN_CONDITION') or t.startswith(('PLAN_PHASE', 'PLAN_SCENARIO', 'PLAN_APPROVAL'))),
    ('review', 'Review, execution and closeout', 'Review packs, reviewers and comments; the hand-over to Delivery and the records it created; closeout checks.',
     lambda t, d: t.startswith(('PLAN_REVIEW', 'PLAN_EXECUTION', 'PLAN_CREATED_RECORD', 'PLAN_CLOSEOUT'))),
    ('family', 'Plan design by family', 'What each plan family designs: sites and candidates, waves, plant lines and cut-in, network paths, consents, placement, equipment.',
     lambda t, d: d.startswith('D.')),
    ('macd', 'MACD', 'Catalogue of move / add / change / disconnect items and the requests raised against it.',
     lambda t, d: t.startswith('MACD_')),
    ('comp', 'Compliance', 'Policies as code with versions, frameworks and controls, attestations and decision records.',
     lambda t, d: t.startswith('COMPLIANCE_')),
    ('xc', 'Imports and write-back', 'Inventory import batches and rejected rows, write-back requests to module APIs, user preferences.',
     lambda t, d: True),
]

MODULES = {'INV': 'Plan to Build Inventory', 'IPL': 'Inventory Planning', 'IPM': 'IP Management', 'ITSM': 'ITSM', 'ALR': 'System Alerts',
           'BSS': 'BSS', 'PRJ': 'Programs & Projects', 'SCM': 'Supply Chain', 'PE': 'Platform Engineering'}


def cols_of(s):
    return [x.strip().strip('`') for x in s.split(',')]


def parse():
    sql = open(SQL).read()
    tables = []
    for m in re.finditer(r'((?:^-- [^\n]*\n)*)CREATE TABLE `(\w+)` \((.*?)\n\) ENGINE=[^\n]*?COMMENT=\'((?:[^\']|\'\')*)\';', sql, re.S | re.M):
        head, name, body, comment = m.group(1), m.group(2), m.group(3), m.group(4).replace("''", "'")
        dom = re.search(r'^-- Domain: (.*?) ·', head, re.M)
        t = dict(name=name, comment=comment, domain=dom.group(1) if dom else '', cols=[], pk=[], uniques=[], indexes=[], checks=[], fks=[],
                 ddl=m.group(0)[len(head):])
        for line in body.split('\n'):
            line = line.strip().rstrip(',')
            if line.startswith('`'):
                cm = re.match(r"`(\w+)` (.*?)(?: COMMENT '((?:[^']|'')*)')?$", line)
                cname, rest, ccom = cm.group(1), cm.group(2), (cm.group(3) or '').replace("''", "'")
                gen = ' GENERATED ALWAYS AS ' in rest
                null = not re.search(r'\bNOT NULL\b', rest)
                dm = re.search(r"\bDEFAULT ('(?:[^']|'')*'|\S+)", rest)
                typ = re.split(r' (?:NOT NULL|NULL|DEFAULT|GENERATED|AUTO_INCREMENT)\b', rest)[0]
                typ = typ.replace(' CHARACTER SET ascii COLLATE ascii_bin', ' ascii')
                expr = re.search(r'GENERATED ALWAYS AS \((.*)\) (?:STORED|VIRTUAL)', rest)
                t['cols'].append(dict(n=cname, t=typ, null=null, d=dm.group(1) if dm else None, c=ccom, ai='AUTO_INCREMENT' in rest,
                                      gen=expr.group(1) if expr else None, upd='ON UPDATE' in rest))
            elif line.startswith('PRIMARY KEY'):
                t['pk'] = cols_of(re.search(r'\((.*)\)', line).group(1))
            elif line.startswith('UNIQUE KEY'):
                km = re.match(r'UNIQUE KEY `(\w+)` \((.*)\)', line)
                t['uniques'].append(dict(n=km.group(1), c=cols_of(km.group(2))))
            elif line.startswith('KEY'):
                km = re.match(r'KEY `(\w+)` \((.*)\)', line)
                t['indexes'].append(dict(n=km.group(1), c=cols_of(km.group(2))))
            elif ' CHECK ' in line:
                km = re.match(r'CONSTRAINT `(\w+)` CHECK \((.*)\)$', line)
                t['checks'].append(dict(n=km.group(1), x=km.group(2)))
            elif ' FOREIGN KEY ' in line:
                km = re.match(r'CONSTRAINT `(\w+)` FOREIGN KEY \((.*?)\) REFERENCES `(\w+)` \((.*?)\) ON DELETE (\w+(?: \w+)?) ON UPDATE (\w+)', line)
                fc, rc = cols_of(km.group(2)), cols_of(km.group(4))
                # the referencing column = the one that is not shared with the parent's key by name (TENANT_ID, PLAN_ID ...)
                own = [c for c, r in zip(fc, rc) if c != r] or [fc[-1]]
                t['fks'].append(dict(n=km.group(1), c=fc, ref=km.group(3), rc=rc, col=own[0], od=km.group(5), ou=km.group(6)))
        for a in AREAS:
            if a[3](name, t['domain']):
                t['area'] = a[0]
                break
        tables.append(t)
    return tables


def conventions():
    md = open(MD).read()
    conv = re.search(r'## Conventions\n\n(.*?)\n\n', md, re.S).group(1)
    alias = re.findall(r'^\| `(\w+)` \| `(\w+)` \|$', md, re.M)
    return [re.sub(r'^- ', '', l) for l in conv.split('\n')], alias


REVIEW = os.path.join(ROOT, 'docs', 'database', 'synapsedc_dc_store_review.md')


def inline(x):
    x = x.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    x = re.sub(r'`([^`]+)`', r'<code>\1</code>', x)
    return re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', x)


def md_html(md):
    """The few Markdown shapes the review uses: headings, paragraphs, bullets, tables."""
    out, lines, i = [], md.split('\n'), 0
    while i < len(lines):
        l = lines[i]
        if l.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].startswith('|'):
                if not re.match(r'^\|[-| ]+\|$', lines[i]):
                    rows.append([inline(c.strip()) for c in lines[i].strip('|').split('|')])
                i += 1
            out.append('<div class="tw"><table class="grid"><thead><tr>' + ''.join(f'<th>{c}</th>' for c in rows[0]) + '</tr></thead><tbody>'
                       + ''.join('<tr>' + ''.join(f'<td>{c}</td>' for c in r) + '</tr>' for r in rows[1:]) + '</tbody></table></div>')
            continue
        if l.startswith('- '):
            items = []
            while i < len(lines) and lines[i].startswith('- '):
                items.append(inline(lines[i][2:]))
                i += 1
            out.append('<ul>' + ''.join(f'<li>{x}</li>' for x in items) + '</ul>')
            continue
        h = re.match(r'^(#+) (.*)', l)
        if h:
            out.append(f'<h{len(h.group(1)) + 1}>{inline(h.group(2))}</h{len(h.group(1)) + 1}>')
        elif l.strip() and l.strip() != '---':
            out.append(f'<p>{inline(l)}</p>')
        i += 1
    return '\n'.join(out)


def review():
    md = open(REVIEW).read()
    top = md.split('\n# First review')[0]
    return md_html('\n'.join(top.split('\n')[2:]))


def main():
    tables = parse()
    assert len(tables) == open(SQL).read().count('CREATE TABLE'), 'parser missed a table'
    conv, alias = conventions()
    stats = dict(tables=len(tables), cols=sum(len(t['cols']) for t in tables), fks=sum(len(t['fks']) for t in tables),
                 checks=sum(len(t['checks']) for t in tables), idx=sum(len(t['uniques']) + len(t['indexes']) for t in tables),
                 updated=re.search(r'on (\d{4}-\d{2}-\d{2})', open(SQL).read()).group(1))
    data = dict(stats=stats, areas=[dict(id=a[0], name=a[1], desc=a[2]) for a in AREAS], modules=MODULES, conventions=conv,
                aliases=alias, review=review(), tables=tables)
    js = json.dumps(data, separators=(',', ':'), ensure_ascii=False).replace('</', '<\\/')
    html = open(TPL).read().replace('/*__DATA__*/null', js)
    open(OUT, 'w').write(html)
    print(f"{stats['tables']} tables, {stats['cols']} columns, {stats['fks']} FKs, {stats['checks']} checks, {stats['idx']} keys "
          f"→ {os.path.relpath(OUT, ROOT)} ({len(html) // 1024} KB)")


if __name__ == '__main__':
    main()

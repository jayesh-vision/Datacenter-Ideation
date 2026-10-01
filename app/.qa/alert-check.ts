import * as S from '../src/mock/server';
const a = S.alerts({ state: 'open' });
const by: Record<string, number> = {};
a.forEach(x => { const k = `${x.severity} ${x.title}`; by[k] = (by[k] ?? 0) + 1; });
console.log(a.length, Object.entries(by).sort((x, y) => y[1] - x[1]));
console.log(S.commandCenter().attention.map(x => `${x.n} ${x.label}`));

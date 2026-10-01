import * as S from '../src/mock/server';
const n = S.networkElements({ dcId: 'MH-DC-001' });
console.log(n.filter(x => x.discovery === 'not-discovered').slice(0,3).map(x => x.id + ' ' + x.ndReason), n.filter(x => x.discovery === 'drifted').slice(0,2).map(x => x.id));

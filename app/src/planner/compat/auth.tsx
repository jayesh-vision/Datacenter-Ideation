/* Signed-in user for the planner (P2B AuthContext): the Capacity Planner of the current geography, switchable for approvals. */
import { useSyncExternalStore } from 'react';
import { PEOPLE } from './people';

export interface User { id: string; name: string; email: string; roleId: string; roleName: string; operatorId: string; operatorName: string }
let current = 'U06';
const subs = new Set<() => void>();
const asUser = (id: string): User => { const p = PEOPLE.find(x => x.id === id) ?? PEOPLE[0]; return { id: p.id, name: p.name, email: '', roleId: p.id, roleName: p.role, operatorId: 'OP1', operatorName: '' }; };
export function switchUser(id: string) { current = id; subs.forEach(f => f()); }
export function currentUser(): User { return asUser(current); }
export function useAuth() {
  const id = useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => current);
  return { user: asUser(id), switchUser, users: PEOPLE.map(p => asUser(p.id)) };
}

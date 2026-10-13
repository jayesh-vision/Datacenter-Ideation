/* P2B work-order engine hooks used by plan execution. Our app has no BPMN engine: a started "process" is a record naming the delivery
   vehicle; Delivery shows the executing plan as a project (mock/p2b/bridge.ts). */
import type * as T from '../p2b/types';
import { db } from './db';
export function useEngineActions() {
  return {
    startInstance: async (definitionKey: string, businessKey: string, record: { recordType: string; recordId: string; dataCenterId?: string; title?: string; variables?: Record<string, unknown> }) => {
      const id = `PI-${businessKey}-${definitionKey}`;
      const t = new Date().toISOString();
      return db.create('processInstances', { id, piId: id, definitionKey, businessKey, recordType: record.recordType, recordId: record.recordId, dataCenterId: record.dataCenterId, title: record.title, state: 'active', startedAt: t, variables: record.variables ?? {}, customerId: 'CUST-001', createdAt: t, updatedAt: t, createdBy: 'Planner', createdById: 'planner', isDeleted: false }) as unknown as T.ProcessInstance;
    },
  };
}

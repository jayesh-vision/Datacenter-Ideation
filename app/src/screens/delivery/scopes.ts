/* Delivery's labels for what a project builds (the planner's plan types, grouped as Delivery reads them in mock/p2b/bridge.ts). */
import * as I from 'lucide-react';
import type { PlanScope } from '../../api/types';
export const SCOPE_LABEL: Record<PlanScope, string> = { 'rack-expansion': 'Rack placement', 'ai-pod': 'Pod or retrofit', 'new-hall': 'Hall fit-out', 'new-site': 'New capacity', 'plant-upgrade': 'Plant upgrade', refresh: 'Network, refresh or migration' };
export const SCOPE_ICON: Record<PlanScope, I.LucideIcon> = { 'rack-expansion': I.Server, 'ai-pod': I.Cpu, 'new-hall': I.LayoutGrid, 'new-site': I.Building2, 'plant-upgrade': I.Zap, refresh: I.RefreshCcw };

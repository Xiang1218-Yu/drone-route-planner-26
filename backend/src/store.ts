import { randomUUID } from 'node:crypto';
import { prepareNoFlyZones } from './zones.js';
import type { RoutePlan } from './types.js';

const plans = new Map<string, RoutePlan>();

export function listPlans(): RoutePlan[] {
  return [...plans.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getPlan(id: string): RoutePlan | undefined {
  return plans.get(id);
}

export function savePlan(input: Omit<RoutePlan, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<RoutePlan, 'id' | 'createdAt'>>): RoutePlan {
  const now = new Date().toISOString();
  const id = input.id ?? randomUUID();
  const existing = plans.get(id);
  const plan: RoutePlan = {
    ...input,
    id,
    // 实体标识约束：重复 id 在此抛出 DuplicateZoneIdError，缺失 id 被安全改写，
    // 保证进入存储的方案绝不会携带重复禁飞区标识。
    noFlyZones: prepareNoFlyZones(input.noFlyZones),
    createdAt: input.createdAt ?? existing?.createdAt ?? now,
    updatedAt: now
  };
  plans.set(id, plan);
  return plan;
}

export function deletePlan(id: string): boolean {
  return plans.delete(id);
}

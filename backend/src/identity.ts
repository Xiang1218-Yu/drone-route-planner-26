import { randomUUID } from 'node:crypto';
import type { NoFlyZone, Point } from './types.js';

/**
 * 方案数据不合法（含禁飞区标识冲突）时抛出，
 * 由 HTTP 层转换为 400 响应，错误信息会直接返回给调用方。
 */
export class PlanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanValidationError';
  }
}

function isPoint(value: unknown): value is Point {
  if (!value || typeof value !== 'object') return false;
  const point = value as { x?: unknown; y?: unknown };
  return typeof point.x === 'number' && Number.isFinite(point.x) &&
    typeof point.y === 'number' && Number.isFinite(point.y);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * 规范化一份方案中的禁飞区：
 * - 校验每个区域的形状（kind / 坐标点）；
 * - 缺失或空白的 id 会被安全改写为新的 UUID；
 * - 同一方案内出现重复 id 时明确抛错，拒绝写入，绝不静默合并。
 *
 * 注意：唯一性约束的作用域是「单个方案」。不同方案可以复用同一个
 * 禁飞区 id，二者是互相独立的实体。
 */
export function normalizeZones(rawZones: unknown): NoFlyZone[] {
  if (rawZones === undefined || rawZones === null) return [];
  if (!Array.isArray(rawZones)) {
    throw new PlanValidationError('noFlyZones 必须是数组');
  }

  const zones: NoFlyZone[] = [];
  const idCounts = new Map<string, number>();

  rawZones.forEach((raw, index) => {
    const label = `第 ${index + 1} 个禁飞区`;
    if (!raw || typeof raw !== 'object') {
      throw new PlanValidationError(`${label}的数据格式不合法`);
    }
    const zone = raw as Partial<NoFlyZone>;
    if (zone.kind !== 'rectangle' && zone.kind !== 'polygon') {
      throw new PlanValidationError(`${label}的 kind 必须是 rectangle 或 polygon`);
    }
    if (!Array.isArray(zone.points) || zone.points.length < 3 || !zone.points.every(isPoint)) {
      throw new PlanValidationError(`${label}至少需要 3 个有效坐标点`);
    }

    // 缺失 id 属于可安全补全的情况；重复 id 则必须在下方显式拒绝。
    const id = isNonEmptyString(zone.id) ? (zone.id as string) : randomUUID();
    idCounts.set(id, (idCounts.get(id) ?? 0) + 1);

    zones.push({
      id,
      name: isNonEmptyString(zone.name) ? (zone.name as string) : `禁飞区 ${index + 1}`,
      kind: zone.kind,
      points: zone.points.map((point) => ({ x: point.x, y: point.y })),
      ...(isNonEmptyString(zone.color) ? { color: zone.color as string } : {})
    });
  });

  for (const [id, count] of idCounts) {
    if (count > 1) {
      throw new PlanValidationError(
        `禁飞区 id「${id}」在同一方案中重复出现 ${count} 次，实体标识必须唯一，请修改后重新提交`
      );
    }
  }

  return zones;
}

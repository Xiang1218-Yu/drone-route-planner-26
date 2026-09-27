import { randomUUID } from 'node:crypto';
import type { NoFlyZone, Point } from './types.js';

/** 同一方案内禁飞区 id 重复时抛出，由路由层映射为 409。 */
export class DuplicateZoneIdError extends Error {
  readonly zoneId: string;

  constructor(zoneId: string) {
    super(`禁飞区 id「${zoneId}」在同一方案中重复出现，每个禁飞区必须使用唯一标识`);
    this.name = 'DuplicateZoneIdError';
    this.zoneId = zoneId;
  }
}

/** 禁飞区数据本身不合法时抛出，由路由层映射为 400。 */
export class InvalidZoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidZoneError';
  }
}

export const newZoneId = (): string => `zone-${randomUUID()}`;

const isValidPoint = (point: unknown): point is Point =>
  typeof point === 'object' &&
  point !== null &&
  typeof (point as Point).x === 'number' &&
  Number.isFinite((point as Point).x) &&
  typeof (point as Point).y === 'number' &&
  Number.isFinite((point as Point).y);

/**
 * 校验并规范化一个方案内的禁飞区列表，保证返回的 id 全部非空且互不重复：
 * - 缺失或空白的 id 会被安全改写为新生成的唯一 id（几何与名称保持不变）；
 * - 同一方案内重复的 id 抛出 DuplicateZoneIdError，明确拒绝而不是静默合并。
 *
 * 唯一性约束按方案隔离：不同方案之间允许使用相同的禁飞区 id。
 */
export function prepareNoFlyZones(input: unknown): NoFlyZone[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return input.map((raw, index) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new InvalidZoneError(`第 ${index + 1} 个禁飞区不是合法对象`);
    }
    const zone = raw as Partial<NoFlyZone>;
    if (zone.kind !== 'rectangle' && zone.kind !== 'polygon') {
      throw new InvalidZoneError(`第 ${index + 1} 个禁飞区的 kind 必须是 rectangle 或 polygon`);
    }
    if (!Array.isArray(zone.points) || zone.points.length < 3 || !zone.points.every(isValidPoint)) {
      throw new InvalidZoneError(`第 ${index + 1} 个禁飞区至少需要 3 个合法坐标点`);
    }

    let id = typeof zone.id === 'string' ? zone.id.trim() : '';
    if (!id) id = newZoneId();
    if (seen.has(id)) throw new DuplicateZoneIdError(id);
    seen.add(id);

    const normalized: NoFlyZone = {
      id,
      name: typeof zone.name === 'string' && zone.name.trim() ? zone.name : `禁飞区 ${index + 1}`,
      kind: zone.kind,
      points: zone.points.map((point) => ({ x: point.x, y: point.y }))
    };
    if (typeof zone.color === 'string' && zone.color) normalized.color = zone.color;
    return normalized;
  });
}

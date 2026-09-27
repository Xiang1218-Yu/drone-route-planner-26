import type { NoFlyZone } from './types';

/**
 * 生成新的禁飞区实体标识。
 * 旧实现使用 `zone-${Date.now()}`，在同一毫秒内连续放置两个区域
 * （矩形 + 多边形工具切换极快时）会产生相同 id，进而触发重复的
 * React key 与按 id 批量误删。这里改用随机 UUID，并兜底校验当前
 * 列表中是否已经存在该 id。
 */
export function createZoneId(existing: readonly { id: string }[] = []): string {
  const used = new Set(existing.map((zone) => zone.id));
  const generate = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `zone-${crypto.randomUUID()}`;
    }
    return `zone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  };
  let id = generate();
  while (used.has(id)) id = generate();
  return id;
}

export type DedupeResult = {
  zones: NoFlyZone[];
  /** 被安全改写（补全新 id）的区域数量，供界面提示。 */
  rewrites: number;
};

/**
 * 规范化禁飞区列表中的实体标识：
 * - 缺失/空白 id 的区域补全新 id；
 * - 与前序区域重复的 id 会被改写为新的唯一 id，而不是静默合并；
 * - 其它字段保持原样，区域顺序不变。
 *
 * 该函数用于加载历史数据、切换方案等边界场景；正常保存路径上后端
 * 会再次强制同一方案内 id 唯一，重复提交会收到 400。
 */
export function dedupeZoneIds(zones: readonly NoFlyZone[]): DedupeResult {
  const seen = new Set<string>();
  let rewrites = 0;
  const normalized = zones.map((zone) => {
    if (zone.id && !seen.has(zone.id)) {
      seen.add(zone.id);
      return zone;
    }
    rewrites += 1;
    const nextId = createZoneId([...seen].map((id) => ({ id })));
    seen.add(nextId);
    return { ...zone, id: nextId };
  });
  return { zones: normalized, rewrites };
}

/**
 * 按下标删除单个禁飞区。即使外部数据中仍存在重复 id（例如直接
 * 绕过界面写入的历史数据），也只会移除被点击的那一个对象。
 */
export function removeZoneAt(zones: readonly NoFlyZone[], index: number): NoFlyZone[] {
  return zones.filter((_, zoneIndex) => zoneIndex !== index);
}

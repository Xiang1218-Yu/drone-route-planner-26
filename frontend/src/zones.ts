import type { NoFlyZone } from './types';

let fallbackCounter = 0;

/** 生成前端本地唯一的禁飞区 id；保存时后端仍会做一次最终校验。 */
export function newZoneId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return `zone-${cryptoApi.randomUUID()}`;
  }
  fallbackCounter += 1;
  return `zone-${Date.now()}-${fallbackCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 确保禁飞区 id 在列表内唯一：缺失或重复的 id 会被安全改写为新 id，
 * 几何、名称、颜色保持不变。用于加载外部方案后的兜底，
 * 避免重复 React key、误删多个区域以及风险项无法定位到具体区域。
 */
export function ensureUniqueZoneIds(zones: NoFlyZone[]): NoFlyZone[] {
  const seen = new Set<string>();
  return zones.map((zone) => {
    const id = typeof zone.id === 'string' ? zone.id.trim() : '';
    if (id && !seen.has(id)) {
      seen.add(id);
      return zone;
    }
    let fresh = newZoneId();
    while (seen.has(fresh)) fresh = newZoneId();
    seen.add(fresh);
    return { ...zone, id: fresh };
  });
}

/** 按位置移除禁飞区：即使列表中残留重复 id，也只删除被操作的那一条。 */
export function removeZoneAt(zones: NoFlyZone[], index: number): NoFlyZone[] {
  return zones.filter((_, zoneIndex) => zoneIndex !== index);
}

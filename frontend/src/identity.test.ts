import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createZoneId, dedupeZoneIds, removeZoneAt } from './identity';
import type { NoFlyZone } from './types';

const rectangle: NoFlyZone = {
  id: 'zone-x',
  name: '矩形区',
  kind: 'rectangle',
  points: [{ x: 20, y: 40 }, { x: 40, y: 40 }, { x: 40, y: 60 }, { x: 20, y: 60 }],
  color: '#fb7185'
};

const polygon: NoFlyZone = {
  id: 'zone-x',
  name: '三角多边形',
  kind: 'polygon',
  points: [{ x: 60, y: 10 }, { x: 80, y: 10 }, { x: 70, y: 30 }],
  color: '#38bdf8'
};

describe('dedupeZoneIds', () => {
  it('保留原本唯一的 id，不做改动', () => {
    const { zones, rewrites } = dedupeZoneIds([rectangle, { ...polygon, id: 'zone-y' }]);
    assert.equal(rewrites, 0);
    assert.deepEqual(zones.map((zone) => zone.id), ['zone-x', 'zone-y']);
  });

  it('同一方案内重复 id 时安全改写后者而非静默合并，几何形状完整保留', () => {
    const { zones, rewrites } = dedupeZoneIds([rectangle, polygon]);
    assert.equal(rewrites, 1);
    assert.equal(zones.length, 2);
    assert.notEqual(zones[0].id, zones[1].id);
    // 第一个区域保持原 id，第二个被改写
    assert.equal(zones[0].id, 'zone-x');
    assert.notEqual(zones[1].id, 'zone-x');
    // 形状差异（矩形 4 点 / 三角形 3 点）不被合并丢失
    assert.equal(zones[0].kind, 'rectangle');
    assert.equal(zones[0].points.length, 4);
    assert.equal(zones[1].kind, 'polygon');
    assert.equal(zones[1].points.length, 3);
    assert.equal(zones[1].name, '三角多边形');
  });

  it('缺失或空白 id 会被补全', () => {
    const { zones, rewrites } = dedupeZoneIds([{ ...rectangle, id: '' }, { ...polygon, id: undefined as unknown as string }]);
    assert.equal(rewrites, 2);
    assert.ok(zones[0].id);
    assert.ok(zones[1].id);
    assert.notEqual(zones[0].id, zones[1].id);
  });

  it('改写后的 id 不会与既有 id 碰撞（链式重复）', () => {
    const { zones } = dedupeZoneIds([
      rectangle,
      { ...polygon, id: 'zone-x' },
      { ...rectangle, id: 'zone-x', name: '第三个' }
    ]);
    const ids = new Set(zones.map((zone) => zone.id));
    assert.equal(ids.size, 3);
  });

  it('规范化后作为 React key 的 id 全部唯一', () => {
    const { zones } = dedupeZoneIds([rectangle, polygon]);
    const keys = zones.map((zone) => zone.id);
    assert.equal(new Set(keys).size, keys.length);
  });
});

describe('removeZoneAt', () => {
  it('按下标只删除被点击的那个区域，即使多个区域 id 相同', () => {
    const zones = [rectangle, polygon, { ...rectangle, id: 'zone-z', name: '第三区' }];
    const after = removeZoneAt(zones, 1);
    assert.equal(after.length, 2);
    // 模拟旧的按 id 过滤会把 zone-x 两个一起删掉；这里必须只删掉中间的三角形
    assert.equal(after[0].id, 'zone-x');
    assert.equal(after[0].name, '矩形区');
    assert.equal(after[1].id, 'zone-z');
  });

  it('删除第一个同 id 区域时保留另一个', () => {
    const zones = [rectangle, polygon];
    const after = removeZoneAt(zones, 0);
    assert.equal(after.length, 1);
    assert.equal(after[0].name, '三角多边形');
  });
});

describe('createZoneId', () => {
  it('生成的 id 与现有列表不重复', () => {
    const existing = [{ id: 'a' }, { id: 'b' }];
    const id = createZoneId(existing);
    assert.ok(!existing.some((zone) => zone.id === id));
    assert.match(id, /^zone-/);
  });

  it('连续快速创建多个区域也得到不同 id（不再依赖毫秒时间戳）', () => {
    const ids = new Set<string>();
    let zones: NoFlyZone[] = [];
    for (let i = 0; i < 20; i += 1) {
      const id = createZoneId(zones);
      ids.add(id);
      zones = [...zones, { ...rectangle, id }];
    }
    assert.equal(ids.size, 20);
  });
});

# SkyRoute · 无人机航线规划与禁飞区可视化工具

项目 5：一个使用 **React + Vite + TypeScript** 构建的二维无人机航线规划工作台，配套 **Node.js + Express + TypeScript** 内存 REST API。

## 已实现功能

- 二维坐标画布：100 × 70 km 的坐标网格、主/次网格线、坐标刻度和北向指示。
- 航线节点编辑：设置起点、终点，点击添加航点，侧栏可删除航点。
- 禁飞区绘制：点击放置矩形禁飞区，逐点绘制并完成多边形禁飞区。
- 基础路径生成：按「起点 → 航点列表 → 终点」顺序生成折线路径。
- 路径校验：检查节点是否越界、航段是否与禁飞多边形/矩形区域相交；风险航段使用红色虚线高亮。
- 距离计算：实时计算航线总距离，并展示航段数量。
- 方案管理：通过 REST API 保存、读取和删除方案；当前使用进程内存存储，服务重启后数据清空。
- 纯 TypeScript：前端与后端均没有使用纯 JavaScript 源文件。

## 目录结构

```text
.
├── backend/
│   ├── src/
│   │   ├── geometry.ts
│   │   ├── server.ts
│   │   ├── store.ts
│   │   └── types.ts
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── api.ts
│   │   ├── App.tsx
│   │   ├── geometry.ts
│   │   ├── main.tsx
│   │   ├── styles.css
│   │   └── types.ts
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   └── vite.config.ts
├── .gitignore
└── package.json
```

## 运行方式

当前仅完整落盘，**未安装依赖**。准备运行时，在项目根目录执行：

```bash
npm install
npm run dev
```

- 前端：<http://localhost:5173>
- 后端：<http://localhost:4000>
- 健康检查：<http://localhost:4000/api/health>

生产构建：

```bash
npm run build
npm start
```

测试与类型检查：

```bash
npm test        # Node 内置测试运行器（后端接口 + 前端标识/渲染逻辑）
npm run typecheck
```

## REST API

### `GET /api/plans`

返回当前进程内保存的所有方案。

### `GET /api/plans/:id`

返回指定方案。

### `POST /api/plans`

创建或更新方案。更新时带上 `id`，最小请求结构如下：

```json
{
  "name": "厂区巡检",
  "canvas": { "width": 100, "height": 70 },
  "start": { "x": 10, "y": 55 },
  "end": { "x": 90, "y": 15 },
  "waypoints": [{ "x": 32, "y": 40 }],
  "noFlyZones": [
    {
      "id": "zone-1",
      "name": "施工区",
      "kind": "rectangle",
      "points": [
        { "x": 40, "y": 20 },
        { "x": 60, "y": 20 },
        { "x": 60, "y": 35 },
        { "x": 40, "y": 35 }
      ],
      "color": "#fb7185"
    }
  ]
}
```

响应中会附带 `validation`，包含 `valid`、`distance` 和 `issues`。
风险项 `issues[]` 除了 `zoneId` 外还会返回 `zoneIndex`（禁飞区在方案内的下标），
即使不同区域出现 id 异常也能稳定定位到具体对象。

#### 禁飞区标识约束

- 每个禁飞区必须有唯一的 `id`，**唯一性作用域为单个方案**；不同方案可以复用同一个 id。
- `noFlyZones` 中出现重复 `id` 时返回 `400`，错误信息会指出冲突的 id，不会静默合并或覆盖。
- 缺失或空白的 `id` 会被服务端安全补全为 UUID。
- 前端在保存、加载、切换方案时同样会做一轮规范化（重复 id 改写为新 UUID 并提示），
  画布与侧栏按下标删除区域，避免同 id 区域被连带删除。

### `DELETE /api/plans/:id`

删除指定方案。

## 说明

当前的路径生成器是基础折线规划器，不会自动绕过障碍物；当路径穿越禁飞区时，会在画布和右侧校验卡片中明确标出风险。后续可以在此基础上接入 A*、可见图或 RRT 等避障算法。

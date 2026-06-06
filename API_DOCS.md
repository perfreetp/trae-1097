# 智慧停车后端服务

面向车场系统、车主 App 和物业平台的统一停车能力服务。

## 技术栈

- Node.js + TypeScript
- Express.js 4.x
- SQLite3 数据库
- Moment.js 时间处理
- Joi 参数校验

## 项目结构

```
src/
├── controllers/          # 控制器层
│   ├── parkingLot.controller.ts    # 车场资料管理
│   ├── parkingSpace.controller.ts  # 车位状态管理
│   ├── event.controller.ts         # 入出场事件
│   ├── order.controller.ts         # 订单与计费
│   ├── benefit.controller.ts       # 优惠权益
│   └── notification.controller.ts  # 通知与对账
├── routes/               # 路由配置
│   └── index.ts
├── middleware/           # 中间件
│   └── apiLogger.ts
├── database/             # 数据库模块
│   ├── connection.ts
│   ├── init.ts
│   └── seed.ts
├── utils/                # 工具函数
│   └── helpers.ts
└── server.ts             # 服务入口
```

## 快速开始

### 安装依赖

```bash
npm install
```

### 初始化数据库

```bash
npm run init-db
```

### 导入示例数据

```bash
npm run seed
```

### 开发模式运行

```bash
npm run dev
```

### 生产构建

```bash
npm run build
npm start
```

## 接口分类

服务默认运行在 `http://localhost:3000`，API 前缀为 `/api/v1`

### 1. 车场资料管理

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/parking-lots` | 创建车场 |
| PUT | `/parking-lots/:id` | 更新车场 |
| GET | `/parking-lots/:id` | 获取车场详情 |
| GET | `/parking-lots` | 车场列表（分页） |
| DELETE | `/parking-lots/:id` | 删除车场 |
| POST | `/parking-lots/zones` | 创建分区 |
| PUT | `/parking-lots/zones/:id` | 更新分区 |
| GET | `/parking-lots/zones/list` | 分区列表 |
| DELETE | `/parking-lots/zones/:id` | 删除分区 |

### 2. 车位状态管理

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/parking-spaces` | 创建车位 |
| PUT | `/parking-spaces/:id` | 更新车位状态 |
| GET | `/parking-spaces` | 车位列表（分页） |
| DELETE | `/parking-spaces/:id` | 删除车位 |
| POST | `/parking-spaces/availability/update` | 余位更新 |
| GET | `/parking-spaces/availability/:lot_id` | 车场余位查询 |

### 3. 入出场事件

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/events/entry` | 车牌入场上报 |
| POST | `/events/exit/calculate` | 离场费用试算 |
| POST | `/events/exit` | 确认出场 |
| GET | `/events/entry-exit` | 入出场记录列表 |
| POST | `/events/abnormal` | 异常事件登记 |
| GET | `/events/abnormal` | 异常事件列表 |
| PUT | `/events/abnormal/:id/handle` | 处理异常事件 |
| POST | `/events/device-heartbeat` | 设备心跳接收 |

### 4. 计费规则

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/billing/rules` | 创建计费规则 |
| PUT | `/billing/rules/:id` | 更新计费规则 |
| GET | `/billing/rules` | 计费规则列表 |
| DELETE | `/billing/rules/:id` | 删除计费规则 |

### 5. 订单支付

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/orders` | 创建订单 |
| GET | `/orders/:id` | 获取订单详情 |
| GET | `/orders/no/:order_no` | 按订单号查询 |
| GET | `/orders` | 订单列表（分页） |
| POST | `/orders/payment/confirm` | 支付确认 |
| POST | `/orders/coupon/apply` | 优惠券抵扣 |
| GET | `/orders/unpaid/list` | 欠费查询 |

### 6. 优惠权益

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/benefits/monthly-cards` | 创建月卡 |
| GET | `/benefits/monthly-cards/verify` | 月卡校验 |
| GET | `/benefits/monthly-cards` | 月卡列表 |
| PUT | `/benefits/monthly-cards/:id` | 更新月卡 |
| POST | `/benefits/coupons` | 创建优惠券 |
| GET | `/benefits/coupons/:coupon_no` | 查询优惠券 |
| GET | `/benefits/coupons` | 优惠券列表 |
| POST | `/benefits/visitor-discounts` | 创建访客减免 |
| GET | `/benefits/visitor-discounts` | 访客减免列表 |
| POST | `/benefits/blacklist/add` | 加入黑名单 |
| POST | `/benefits/blacklist/remove` | 移出黑名单 |
| GET | `/benefits/blacklist/check` | 黑名单判断 |
| GET | `/benefits/blacklist` | 黑名单列表 |

### 7. 通知回调

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/notifications/send` | 发送通知（短信/应用） |
| GET | `/notifications` | 通知列表 |
| PUT | `/notifications/:id/read` | 标记已读 |
| POST | `/callbacks/payment` | 支付回调 |

### 8. 对账查询

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/invoices` | 发票申请 |
| GET | `/invoices/:id` | 发票状态查询 |
| PUT | `/invoices/:id/status` | 更新发票状态 |
| GET | `/reconciliation/report` | 流水对账报表 |
| GET | `/reconciliation/daily` | 日统计数据 |
| GET | `/logs/api-calls` | 接口调用记录 |

## 统一响应格式

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

- `code`: 0 表示成功，非 0 表示失败
- `message`: 响应消息
- `data`: 响应数据

## 数据库表说明

1. **parking_lots** - 车场表
2. **parking_zones** - 分区表
3. **parking_spaces** - 车位表
4. **billing_rules** - 计费规则表
5. **vehicles** - 车辆表（含黑名单）
6. **parking_orders** - 停车订单表
7. **entry_exit_events** - 入出场事件表
8. **monthly_cards** - 月卡表
9. **coupons** - 优惠券表
10. **visitor_discounts** - 访客减免表
11. **abnormal_events** - 异常事件表
12. **device_heartbeats** - 设备心跳表
13. **notifications** - 通知表
14. **invoice_requests** - 发票申请表
15. **api_call_logs** - API 调用日志表

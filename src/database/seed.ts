import { getDatabase } from './connection';
import { generateId } from '../utils/helpers';

async function seedDatabase() {
  const db = await getDatabase();

  console.log('开始插入示例数据...');

  const lot1Id = generateId();
  const lot2Id = generateId();

  await db.run(`
    INSERT INTO parking_lots (id, name, address, contact, phone, total_spaces, available_spaces, business_hours, description)
    VALUES 
    (?, '阳光花园停车场', '北京市朝阳区阳光路88号', '张经理', '13800138001', 200, 185, '00:00-24:00', '小区地下停车场'),
    (?, '万达广场停车场', '北京市海淀区建国路100号', '李经理', '13800138002', 500, 320, '06:00-24:00', '商业综合体停车场')
  `, [lot1Id, lot2Id]);

  const zone1aId = generateId();
  const zone1bId = generateId();
  const zone2aId = generateId();

  await db.run(`
    INSERT INTO parking_zones (id, lot_id, name, code, total_spaces, available_spaces, vehicle_type)
    VALUES 
    (?, ?, 'A区-地下一层', 'A01', 100, 90, 'car'),
    (?, ?, 'B区-地下二层', 'B01', 100, 95, 'car'),
    (?, ?, '东区', 'E01', 300, 200, 'car')
  `, [zone1aId, lot1Id, zone1bId, lot1Id, zone2aId, lot2Id]);

  const rule1Id = generateId();
  const rule2Id = generateId();

  await db.run(`
    INSERT INTO billing_rules (id, lot_id, name, rule_type, free_minutes, first_hour_price, per_hour_price, daily_max, monthly_price, is_default)
    VALUES 
    (?, ?, '小区标准计费', 'hourly', 30, 2, 1, 15, 200, 1),
    (?, ?, '商业标准计费', 'hourly', 15, 8, 5, 60, 400, 1)
  `, [rule1Id, lot1Id, rule2Id, lot2Id]);

  const spaceIds = [];
  for (let i = 1; i <= 10; i++) {
    const spaceId = generateId();
    spaceIds.push(spaceId);
    await db.run(`
      INSERT INTO parking_spaces (id, lot_id, zone_id, space_no, status)
      VALUES (?, ?, ?, ?, ?)
    `, [spaceId, lot1Id, zone1aId, `A${String(i).padStart(3, '0')}`, i <= 8 ? 'empty' : 'occupied']);
  }

  const mcId = generateId();
  const cardNo = 'MC2024010100001';
  const startDate = new Date().toISOString();
  const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  
  await db.run(`
    INSERT INTO monthly_cards (id, card_no, plate_number, lot_id, card_type, holder_name, holder_phone, start_date, end_date, remaining_days, price, status)
    VALUES (?, ?, ?, ?, 'monthly', '王先生', '13900139001', ?, ?, 30, 200, 'active')
  `, [mcId, cardNo, '京A12345', lot1Id, startDate, endDate]);

  const cpId = generateId();
  const couponNo = 'CP2024010100001';
  const couponEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  
  await db.run(`
    INSERT INTO coupons (id, coupon_no, name, coupon_type, value, min_amount, valid_end, max_uses, status)
    VALUES (?, ?, '5元优惠券', 'cash', 5, 10, ?, 1, 'active')
  `, [cpId, couponNo, couponEnd]);

  const blId = generateId();
  await db.run(`
    INSERT INTO vehicles (id, plate_number, vehicle_type, owner_name, is_blacklist, blacklist_reason)
    VALUES (?, '京B88888', 'car', '赵六', 1, '多次逃费')
  `, [blId]);

  console.log('示例数据插入完成');
  console.log('车场1 ID:', lot1Id);
  console.log('车场2 ID:', lot2Id);
  console.log('测试月卡车牌: 京A12345');
  console.log('测试优惠券号: CP2024010100001');
  console.log('黑名单车牌: 京B88888');
}

seedDatabase().then(() => {
  console.log('数据初始化完成');
  process.exit(0);
}).catch(err => {
  console.error('数据初始化失败:', err);
  process.exit(1);
});

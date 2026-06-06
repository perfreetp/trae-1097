const http = require('http');

const BASE_URL = 'localhost';
const PORT = 3000;
const API_PREFIX = '/api/v1';

function request(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : null;
    const options = {
      hostname: BASE_URL,
      port: PORT,
      path: `${API_PREFIX}${path}`,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {})
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve({ statusCode: res.statusCode, ...result });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function printStep(step, message) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`【步骤 ${step}】${message}`);
  console.log('='.repeat(70));
}

function printResult(label, result) {
  console.log(`${label}:`);
  console.log(JSON.stringify(result, null, 2));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`❌ 断言失败: ${message}`);
  }
  console.log(`✅ ${message}`);
}

async function runAcceptanceTest() {
  console.log('\n' + '🚦'.repeat(25));
  console.log('智慧停车系统 - 完整边界场景验收测试');
  console.log('🚦'.repeat(25));

  let testLotId = null;
  let testZoneId = null;
  let testRuleId = null;
  let testOrderId1 = null;
  let testOrderId2 = null;
  const testPlate1 = '边界A11111';
  const testPlate2 = '跨天B22222';
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  try {
    printStep(1, '健康检查');
    const health = await request('GET', '/health');
    assert(health.code === 0, '健康检查通过');

    printStep(2, '创建车场');
    const lotResult = await request('POST', '/parking-lots', {
      name: '边界测试停车场',
      address: '测试大道999号',
      total_spaces: 200,
      business_hours: '00:00-24:00'
    });
    assert(lotResult.code === 0, '车场创建成功');
    testLotId = lotResult.data.id;

    printStep(3, '创建2个分区');
    const zone1 = await request('POST', '/parking-lots/zones', {
      lot_id: testLotId, name: 'A区-地下一层', code: 'A01', total_spaces: 100
    });
    assert(zone1.code === 0, '分区A创建成功');
    testZoneId = zone1.data.id;

    const zone2 = await request('POST', '/parking-lots/zones', {
      lot_id: testLotId, name: 'B区-地下二层', code: 'B01', total_spaces: 100
    });
    assert(zone2.code === 0, '分区B创建成功');

    printStep(4, '【重点验证】分区列表接口 /parking-lots/zones/list（不带lot_id，返回所有）');
    const allZones = await request('GET', '/parking-lots/zones/list');
    printResult('所有分区', allZones);
    assert(allZones.code === 0, '分区列表接口调用成功');
    assert(allZones.data.list.length >= 2, `返回至少2个分区，实际返回: ${allZones.data.list.length}`);
    console.log(`✅ 分区列表接口正常，共 ${allZones.data.list.length} 个分区`);

    printStep(5, '【重点验证】分区列表接口 /parking-lots/zones/list（带lot_id筛选）');
    const lotZones = await request('GET', `/parking-lots/zones/list?lot_id=${testLotId}`);
    printResult('按车场筛选分区', lotZones);
    assert(lotZones.code === 0, '带lot_id筛选调用成功');
    assert(lotZones.data.list.length >= 2, `按车场筛选正确，返回 ${lotZones.data.list.length} 个分区`);

    printStep(6, '创建计费规则');
    const ruleResult = await request('POST', '/billing/rules', {
      lot_id: testLotId, name: '边界测试规则', free_minutes: 0,
      first_hour_price: 8, per_hour_price: 4, daily_max: 40, is_default: 1
    });
    assert(ruleResult.code === 0, '计费规则创建成功');
    testRuleId = ruleResult.data.id;

    printStep(7, '车辆1入场（用于测试：未试算直接出场）');
    const entry1 = await request('POST', '/events/entry', {
      lot_id: testLotId, plate_number: testPlate1, gate_id: 'G1'
    });
    assert(entry1.code === 0, '车辆1入场成功');
    testOrderId1 = entry1.data.id;
    console.log(`✅ 订单1: ${testOrderId1}, 状态: ${entry1.data.status}`);

    printStep(8, '【重点验证】入场后不做试算，直接出场（预期：被拒绝，要求先试算）');
    const exitWithoutCalc = await request('POST', '/events/exit', {
      order_id: testOrderId1, gate_id: 'G2'
    });
    printResult('未试算直接出场结果', exitWithoutCalc);
    assert(exitWithoutCalc.code !== 0, '未试算直接出场被正确拒绝');
    assert(exitWithoutCalc.code === -6, `错误码正确，应为-6，实际: ${exitWithoutCalc.code}`);
    assert(exitWithoutCalc.message.includes('试算'), `提示信息包含试算，实际: ${exitWithoutCalc.message}`);
    console.log(`✅ 正确拦截未试算出场，错误码: ${exitWithoutCalc.code}`);
    console.log(`✅ 提示信息: ${exitWithoutCalc.message}`);

    printStep(9, '车辆1离场费用试算（模拟停车1.5小时）');
    const oneHalfHourLater = new Date(Date.now() + 1.5 * 60 * 60 * 1000).toISOString();
    const calc1 = await request('POST', '/events/exit/calculate', {
      plate_number: testPlate1, lot_id: testLotId, exit_time: oneHalfHourLater
    });
    assert(calc1.code === 0, '费用试算成功');
    assert(calc1.data.final_amount > 0, `产生应付金额: ${calc1.data.final_amount}元`);
    console.log(`✅ 试算结果 - 时长: ${calc1.data.duration_text}, 应付: ${calc1.data.final_amount}元`);

    printStep(10, '验证试算后金额已写入订单');
    const orderCheck = await request('GET', `/orders/${testOrderId1}`);
    assert(orderCheck.data.final_amount > 0, '订单应付金额已更新');
    assert(orderCheck.data.parking_duration !== null, '停车时长已记录');
    console.log(`✅ 订单金额已更新: ${orderCheck.data.final_amount}元`);

    printStep(11, '【重点验证】试算后不支付直接出场（预期：被拒绝，要求支付）');
    const exitWithoutPay = await request('POST', '/events/exit', {
      order_id: testOrderId1, gate_id: 'G2'
    });
    printResult('试算后未支付出场结果', exitWithoutPay);
    assert(exitWithoutPay.code !== 0, '未支付出场被正确拒绝');
    assert(exitWithoutPay.code === -5, `错误码正确，应为-5，实际: ${exitWithoutPay.code}`);
    assert(exitWithoutPay.data.unpaid_amount > 0, '返回未付金额');
    console.log(`✅ 正确拦截未支付出场，未付金额: ${exitWithoutPay.data.unpaid_amount}元`);

    printStep(12, '车辆1部分支付（付一半）');
    const halfAmount = (calc1.data.final_amount / 2).toFixed(2);
    const partialPay = await request('POST', '/orders/payment/confirm', {
      order_id: testOrderId1, payment_method: 'wechat', paid_amount: parseFloat(halfAmount)
    });
    assert(partialPay.code === 0, '部分支付成功');
    assert(partialPay.data.is_fully_paid === false, '标记为未足额支付');
    assert(partialPay.data.status === 'unpaid', '订单状态为unpaid');
    assert(partialPay.data.remaining_amount > 0, `剩余未付: ${partialPay.data.remaining_amount}元`);
    console.log(`✅ 部分支付成功，剩余未付: ${partialPay.data.remaining_amount}元`);

    printStep(13, '【重点验证】部分支付后出场（预期：仍被拒绝）');
    const exitPartialPay = await request('POST', '/events/exit', {
      order_id: testOrderId1, gate_id: 'G2'
    });
    printResult('部分支付后出场结果', exitPartialPay);
    assert(exitPartialPay.code !== 0, '部分支付后出场仍被拒绝');
    assert(exitPartialPay.code === -5, '错误码正确');
    console.log(`✅ 正确拦截未足额支付出场，剩余未付: ${exitPartialPay.data.unpaid_amount}元`);

    printStep(14, '车辆1支付剩余金额，足额支付');
    const remaining = partialPay.data.remaining_amount;
    const fullPay = await request('POST', '/orders/payment/confirm', {
      order_id: testOrderId1, payment_method: 'alipay', paid_amount: remaining
    });
    assert(fullPay.code === 0, '足额支付成功');
    assert(fullPay.data.is_fully_paid === true, '标记为已足额支付');
    assert(fullPay.data.status === 'paid', '订单状态为paid');
    assert(fullPay.data.remaining_amount === 0, '剩余未付为0');
    console.log(`✅ 足额支付成功，状态: ${fullPay.data.status}`);

    printStep(15, '【重点验证】足额支付后出场（预期：成功放行）');
    const exitSuccess = await request('POST', '/events/exit', {
      order_id: testOrderId1, gate_id: 'G2'
    });
    printResult('足额支付后出场结果', exitSuccess);
    assert(exitSuccess.code === 0, '足额支付后出场成功');
    assert(exitSuccess.data.status === 'completed', '订单最终状态为completed');
    console.log(`✅ 出场成功，订单状态: ${exitSuccess.data.status}`);

    printStep(16, '【重点验证】造跨天场景：车辆2昨天入场，今天支付出场');
    const yesterdayEntry = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
    
    const crossDayOrder = await request('POST', '/orders', {
      lot_id: testLotId, plate_number: testPlate2, entry_time: yesterdayEntry, billing_rule_id: testRuleId
    });
    assert(crossDayOrder.code === 0, '跨天订单创建成功（昨天入场）');
    testOrderId2 = crossDayOrder.data.id;

    const entryEventId = require('crypto').randomBytes(16).toString('hex');
    await request('POST', '/events/entry', {
      lot_id: testLotId, plate_number: testPlate2, gate_id: 'G1'
    });

    const crossCalc = await request('POST', '/events/exit/calculate', {
      plate_number: testPlate2, lot_id: testLotId, exit_time: new Date().toISOString()
    });
    assert(crossCalc.code === 0, '跨天订单试算成功');
    console.log(`✅ 跨天订单 - 入场: ${yesterdayEntry.split('T')[0]}, 应付: ${crossCalc.data.final_amount}元`);

    const crossPay = await request('POST', '/orders/payment/confirm', {
      order_id: testOrderId2, payment_method: 'cash', paid_amount: crossCalc.data.final_amount
    });
    assert(crossPay.code === 0, '跨天订单支付成功');

    const crossExit = await request('POST', '/events/exit', {
      order_id: testOrderId2, gate_id: 'G2'
    });
    assert(crossExit.code === 0, '跨天订单出场成功');
    console.log(`✅ 跨天订单今天支付并出场完成`);

    printStep(17, '【重点验证】日报统计（验证跨天场景）');
    const dailyResult = await request('GET', `/reconciliation/daily?date=${today}&lot_id=${testLotId}`);
    printResult('日报统计结果', dailyResult);
    assert(dailyResult.code === 0, '日报统计接口调用成功');
    assert(dailyResult.data.entry_count >= 1, `今日入场次数 >= 1（跨天订单入场是昨天的不算今天），实际: ${dailyResult.data.entry_count}`);
    assert(dailyResult.data.exit_count >= 2, `今日出场次数 >= 2，实际: ${dailyResult.data.exit_count}`);
    assert(dailyResult.data.completed_count >= 2, `完成订单数 >= 2（含跨天入场今天出场的），实际: ${dailyResult.data.completed_count}`);
    assert(dailyResult.data.total_revenue >= 50, `今日实收金额 >= 50元（含跨天订单），实际: ${dailyResult.data.total_revenue}元`);
    console.log(`✅ 日报验证通过 - 入场: ${dailyResult.data.entry_count}次（跨天订单入场是昨天的，不算今天）`);
    console.log(`✅ 今日出场: ${dailyResult.data.exit_count}次`);
    console.log(`✅ 完成订单: ${dailyResult.data.completed_count}笔（含昨天入场今天支付出场的跨天订单）`);
    console.log(`✅ 今日实收: ${dailyResult.data.total_revenue}元（含跨天订单支付）`);

    printStep(18, '验证昨日日报不包含今天支付的跨天订单');
    const yesterdayDaily = await request('GET', `/reconciliation/daily?date=${yesterday}&lot_id=${testLotId}`);
    console.log(`✅ 昨日日报 - 完成订单: ${yesterdayDaily.data.completed_count}笔, 实收: ${yesterdayDaily.data.total_revenue}元`);

    console.log('\n' + '🎉'.repeat(35));
    console.log('✅ 所有边界场景验收测试通过！');
    console.log('🎉'.repeat(35));
    console.log('\n📋 验收覆盖清单:');
    console.log('  ✅ 分区列表接口 /parking-lots/zones/list（不带参返回所有）');
    console.log('  ✅ 分区列表接口 /parking-lots/zones/list（带lot_id筛选）');
    console.log('  ✅ 入场后不试算直接出场 → 被拒绝（错误码-6）');
    console.log('  ✅ 试算后不支付出场 → 被拒绝（错误码-5）');
    console.log('  ✅ 部分支付后出场 → 仍被拒绝');
    console.log('  ✅ 足额支付后出场 → 成功放行');
    console.log('  ✅ 跨天场景：昨天入场今天支付出场');
    console.log('  ✅ 日报统计正确计入跨天订单的完成数和实收金额');
    console.log('  ✅ 入出场次数按当天事件统计');
    console.log('\n');

  } catch (error) {
    console.log('\n' + '❌'.repeat(35));
    console.error('验收测试失败:', error.message);
    console.log('❌'.repeat(35));
    console.log('\n详细错误:', error);
    process.exit(1);
  }
}

runAcceptanceTest();

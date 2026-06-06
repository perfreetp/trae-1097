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
  console.log(`\n${'='.repeat(60)}`);
  console.log(`【步骤 ${step}】${message}`);
  console.log('='.repeat(60));
}

function printResult(label, result) {
  console.log(`${label}:`);
  console.log(JSON.stringify(result, null, 2));
}

async function runAcceptanceTest() {
  console.log('\n' + '🚦'.repeat(20));
  console.log('智慧停车系统 - 主流程验收测试');
  console.log('🚦'.repeat(20));

  let testLotId = null;
  let testRuleId = null;
  let testOrderId = null;
  let testOrderNo = null;
  const testPlate = '验收A88888';

  try {
    printStep(1, '健康检查');
    const health = await request('GET', '/health');
    printResult('健康检查结果', health);
    if (health.code !== 0) throw new Error('健康检查失败');

    printStep(2, '创建车场');
    const lotResult = await request('POST', '/parking-lots', {
      name: '验收测试停车场',
      address: '测试地址888号',
      contact: '测试管理员',
      phone: '13800000000',
      total_spaces: 100,
      business_hours: '00:00-24:00',
      description: '用于验收测试的车场'
    });
    printResult('创建车场结果', lotResult);
    if (lotResult.code !== 0) throw new Error('创建车场失败');
    testLotId = lotResult.data.id;
    console.log(`✅ 车场ID: ${testLotId}`);

    printStep(3, '创建计费规则');
    const ruleResult = await request('POST', '/billing/rules', {
      lot_id: testLotId,
      name: '验收测试计费规则',
      rule_type: 'hourly',
      free_minutes: 0,
      first_hour_price: 10,
      per_hour_price: 5,
      daily_max: 50,
      monthly_price: 300,
      is_default: 1
    });
    printResult('创建计费规则结果', ruleResult);
    if (ruleResult.code !== 0) throw new Error('创建计费规则失败');
    testRuleId = ruleResult.data.id;
    console.log(`✅ 规则ID: ${testRuleId}`);

    printStep(4, '车辆入场');
    const entryResult = await request('POST', '/events/entry', {
      lot_id: testLotId,
      plate_number: testPlate,
      vehicle_type: 'car',
      gate_id: 'GATE-001',
      device_id: 'CAM-001',
      operator: 'system'
    });
    printResult('入场结果', entryResult);
    if (entryResult.code !== 0) throw new Error('车辆入场失败');
    testOrderId = entryResult.data.id;
    testOrderNo = entryResult.data.order_no;
    console.log(`✅ 订单ID: ${testOrderId}`);
    console.log(`✅ 订单号: ${testOrderNo}`);
    console.log(`✅ 当前订单状态: ${entryResult.data.status}`);

    printStep(5, '离场费用试算（模拟已停车2小时）');
    const twoHoursLater = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const calcResult = await request('POST', '/events/exit/calculate', {
      plate_number: testPlate,
      lot_id: testLotId,
      exit_time: twoHoursLater
    });
    printResult('费用试算结果', calcResult);
    if (calcResult.code !== 0) throw new Error('费用试算失败');
    console.log(`✅ 停车时长: ${calcResult.data.duration_text}`);
    console.log(`✅ 原始金额: ${calcResult.data.original_amount}元`);
    console.log(`✅ 优惠金额: ${calcResult.data.discount_amount}元`);
    console.log(`✅ 应付金额: ${calcResult.data.final_amount}元`);
    console.log(`✅ 已付金额: ${calcResult.data.paid_amount}元`);
    console.log(`✅ 未付金额: ${calcResult.data.unpaid_amount}元`);
    if (calcResult.data.final_amount <= 0) throw new Error('试算金额应该大于0');

    printStep(6, '验证试算后金额已写入订单');
    const orderCheck1 = await request('GET', `/orders/${testOrderId}`);
    printResult('订单详情（试算后）', orderCheck1);
    if (!orderCheck1.data.final_amount || orderCheck1.data.final_amount <= 0) {
      throw new Error('订单金额未正确写入');
    }
    console.log(`✅ 订单应付金额已更新: ${orderCheck1.data.final_amount}元`);

    printStep(7, '未支付直接出场（预期：被拒绝）');
    const exitFailedResult = await request('POST', '/events/exit', {
      order_id: testOrderId,
      gate_id: 'GATE-002',
      operator: 'system'
    });
    printResult('未支付出场结果', exitFailedResult);
    if (exitFailedResult.code === 0) {
      throw new Error('❌ 未支付应该被禁止出场，但实际出场成功了！');
    }
    console.log(`✅ 正确拦截未支付出场，错误码: ${exitFailedResult.code}`);
    console.log(`✅ 提示信息: ${exitFailedResult.message}`);

    printStep(8, '支付确认（支付部分金额 - 先付5元）');
    const partialPayResult = await request('POST', '/orders/payment/confirm', {
      order_id: testOrderId,
      payment_method: 'wechat',
      paid_amount: 5,
      transaction_id: 'TEST-PARTIAL-' + Date.now()
    });
    printResult('部分支付结果', partialPayResult);
    if (partialPayResult.code !== 0) throw new Error('部分支付失败');
    console.log(`✅ 是否足额支付: ${partialPayResult.data.is_fully_paid}`);
    console.log(`✅ 剩余未付: ${partialPayResult.data.remaining_amount}元`);
    console.log(`✅ 订单状态: ${partialPayResult.data.status}`);
    if (partialPayResult.data.is_fully_paid) {
      throw new Error('❌ 部分支付不应显示已足额支付');
    }
    if (partialPayResult.data.status !== 'unpaid') {
      throw new Error('❌ 部分支付后状态应为 unpaid');
    }

    printStep(9, '部分支付后再次尝试出场（预期：仍被拒绝）');
    const exitFailedAgain = await request('POST', '/events/exit', {
      order_id: testOrderId,
      gate_id: 'GATE-002',
      operator: 'system'
    });
    printResult('部分支付后出场结果', exitFailedAgain);
    if (exitFailedAgain.code === 0) {
      throw new Error('❌ 部分支付后仍应禁止出场');
    }
    const unpaidAmt = exitFailedAgain.data ? exitFailedAgain.data.unpaid_amount : '>0';
    console.log(`✅ 正确拦截未足额支付出场，剩余未付: ${unpaidAmt}元`);

    printStep(10, '支付剩余金额，完成足额支付');
    const remainingPay = partialPayResult.data.remaining_amount;
    const fullPayResult = await request('POST', '/orders/payment/confirm', {
      order_id: testOrderId,
      payment_method: 'alipay',
      paid_amount: remainingPay,
      transaction_id: 'TEST-FULL-' + Date.now()
    });
    printResult('足额支付结果', fullPayResult);
    if (fullPayResult.code !== 0) throw new Error('足额支付失败');
    console.log(`✅ 是否足额支付: ${fullPayResult.data.is_fully_paid}`);
    console.log(`✅ 剩余未付: ${fullPayResult.data.remaining_amount}元`);
    console.log(`✅ 订单状态: ${fullPayResult.data.status}`);
    console.log(`✅ 支付说明: ${fullPayResult.data.payment_note}`);
    if (!fullPayResult.data.is_fully_paid) {
      throw new Error('❌ 足额支付后应显示已足额支付');
    }
    if (fullPayResult.data.status !== 'paid') {
      throw new Error('❌ 足额支付后状态应为 paid');
    }

    printStep(11, '足额支付后出场（预期：成功放行）');
    const exitSuccessResult = await request('POST', '/events/exit', {
      order_id: testOrderId,
      gate_id: 'GATE-002',
      operator: 'system'
    });
    printResult('支付后出场结果', exitSuccessResult);
    if (exitSuccessResult.code !== 0) {
      throw new Error('❌ 足额支付后应该可以出场');
    }
    console.log(`✅ 出场成功！`);
    console.log(`✅ 出场时间: ${exitSuccessResult.data.exit_time}`);
    console.log(`✅ 订单最终状态: ${exitSuccessResult.data.status}`);
    if (exitSuccessResult.data.status !== 'completed') {
      throw new Error('❌ 出场后订单状态应为 completed');
    }

    printStep(12, '查看分区列表接口（验证路由修复）');
    const zonesResult = await request('GET', '/parking-lots/zones?lot_id=' + testLotId);
    printResult('分区列表结果', zonesResult);
    if (zonesResult.code !== 0) throw new Error('分区列表接口调用失败');
    console.log(`✅ 分区列表接口正常，返回 ${zonesResult.data.list.length} 条数据`);

    printStep(13, '每日统计（验证日报接口修复）');
    const today = new Date().toISOString().split('T')[0];
    const dailyResult = await request('GET', `/reconciliation/daily?date=${today}&lot_id=${testLotId}`);
    printResult('每日统计结果', dailyResult);
    if (dailyResult.code !== 0) throw new Error('每日统计接口调用失败');
    console.log(`✅ 日报日期: ${dailyResult.data.date}`);
    console.log(`✅ 今日入场: ${dailyResult.data.entry_count} 次`);
    console.log(`✅ 今日出场: ${dailyResult.data.exit_count} 次`);
    console.log(`✅ 在场车辆: ${dailyResult.data.parking_count} 辆`);
    console.log(`✅ 完成订单: ${dailyResult.data.completed_count} 笔`);
    console.log(`✅ 今日实收: ${dailyResult.data.total_revenue} 元`);
    console.log(`✅ 平均停车时长: ${dailyResult.data.avg_parking_duration} 分钟`);
    if (dailyResult.data.entry_count < 1 || dailyResult.data.exit_count < 1) {
      throw new Error('❌ 日报数据不正确，应该至少有1条入场和1条出场记录');
    }
    if (dailyResult.data.total_revenue <= 0) {
      throw new Error('❌ 日报实收金额应该大于0');
    }

    console.log('\n' + '🎉'.repeat(30));
    console.log('✅ 所有验收测试通过！主流程正常运行');
    console.log('🎉'.repeat(30));
    console.log('\n📋 测试总结:');
    console.log('  1. ✅ 车场创建正常');
    console.log('  2. ✅ 计费规则创建正常');
    console.log('  3. ✅ 车辆入场正常');
    console.log('  4. ✅ 离场试算正常，金额正确回写订单');
    console.log('  5. ✅ 未支付出场被正确拦截');
    console.log('  6. ✅ 部分支付状态正确（unpaid）');
    console.log('  7. ✅ 部分支付后出场仍被拦截');
    console.log('  8. ✅ 足额支付后状态正确（paid）');
    console.log('  9. ✅ 足额支付后出场放行正常');
    console.log('  10. ✅ 分区列表接口路由修复正常');
    console.log('  11. ✅ 每日统计接口修复正常，数据完整');
    console.log('\n');

  } catch (error) {
    console.log('\n' + '❌'.repeat(30));
    console.error('验收测试失败:', error.message);
    console.log('❌'.repeat(30));
    console.log('\n详细错误:', error);
    process.exit(1);
  }
}

runAcceptanceTest();

import { Request, Response } from 'express';
import { getDatabase } from '../database/connection';
import { generateId, generateOrderNo, calculateParkingDuration, calculateParkingFee, successResponse, errorResponse } from '../utils/helpers';
import moment from 'moment';

export async function vehicleEntry(req: Request, res: Response) {
  try {
    const { lot_id, gate_id, plate_number, vehicle_type = 'car', device_id, image_url, confidence, operator } = req.body;
    
    if (!lot_id || !plate_number) {
      return res.json(errorResponse(-1, '车场ID和车牌号不能为空'));
    }

    const db = await getDatabase();
    
    const vehicle = await db.get('SELECT * FROM vehicles WHERE plate_number = ?', [plate_number]);
    if (vehicle && vehicle.is_blacklist) {
      return res.json(errorResponse(-2, '该车辆已加入黑名单，禁止入场', { 
        plate_number, 
        blacklist_reason: vehicle.blacklist_reason 
      }));
    }

    const existingOrder = await db.get(
      'SELECT * FROM parking_orders WHERE plate_number = ? AND status = ?',
      [plate_number, 'parking']
    );
    if (existingOrder) {
      return res.json(errorResponse(-3, '该车辆已在场内', { order_id: existingOrder.id }));
    }

    const lot = await db.get('SELECT * FROM parking_lots WHERE id = ?', [lot_id]);
    if (!lot) {
      return res.json(errorResponse(-1, '车场不存在'));
    }

    if (lot.available_spaces <= 0) {
      return res.json(errorResponse(-4, '车场车位已满'));
    }

    const orderId = generateId();
    const orderNo = generateOrderNo();
    const entryTime = new Date().toISOString();

    let rule = await db.get('SELECT * FROM billing_rules WHERE lot_id = ? AND is_default = 1', [lot_id]);
    if (!rule) {
      const rules = await db.all('SELECT * FROM billing_rules WHERE lot_id = ?', [lot_id]);
      rule = rules[0] || { id: null, free_minutes: 15, first_hour_price: 5, per_hour_price: 3, daily_max: 30 };
    }

    await db.run(`
      INSERT INTO parking_orders 
      (id, order_no, lot_id, plate_number, entry_time, billing_rule_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [orderId, orderNo, lot_id, plate_number, entryTime, rule?.id || null, 'parking']);

    const eventId = generateId();
    await db.run(`
      INSERT INTO entry_exit_events 
      (id, lot_id, gate_id, event_type, plate_number, vehicle_type, event_time, device_id, image_url, confidence, operator, order_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [eventId, lot_id, gate_id || null, 'entry', plate_number, vehicle_type, entryTime, device_id || null, image_url || null, confidence || null, operator || null, orderId]);

    if (lot.available_spaces > 0) {
      await db.run('UPDATE parking_lots SET available_spaces = available_spaces - 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [lot_id]);
    }

    if (!vehicle) {
      await db.run(`
        INSERT INTO vehicles (id, plate_number, vehicle_type)
        VALUES (?, ?, ?)
      `, [generateId(), plate_number, vehicle_type]);
    }

    const order = await db.get('SELECT * FROM parking_orders WHERE id = ?', [orderId]);
    res.json(successResponse(order, '入场成功'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function calculateExitFee(req: Request, res: Response) {
  try {
    const { plate_number, lot_id, exit_time } = req.body;
    
    if (!plate_number || !lot_id) {
      return res.json(errorResponse(-1, '车牌号和车场ID不能为空'));
    }

    const db = await getDatabase();
    const order = await db.get(
      'SELECT * FROM parking_orders WHERE plate_number = ? AND lot_id = ? AND status = ?',
      [plate_number, lot_id, 'parking']
    );

    if (!order) {
      return res.json(errorResponse(-1, '未找到该车辆的在场订单'));
    }

    const exitTime = exit_time ? new Date(exit_time) : new Date();
    const durationMinutes = calculateParkingDuration(order.entry_time, exitTime);

    let rule = await db.get('SELECT * FROM billing_rules WHERE id = ?', [order.billing_rule_id]);
    if (!rule) {
      rule = { free_minutes: 15, first_hour_price: 5, per_hour_price: 3, daily_max: 30 };
    }

    const { originalAmount } = calculateParkingFee(durationMinutes, rule);

    const monthlyCard = await db.get(`
      SELECT * FROM monthly_cards 
      WHERE plate_number = ? AND status = 'active' 
      AND start_date <= ? AND end_date >= ?
    `, [plate_number, new Date().toISOString(), new Date().toISOString()]);

    let discountAmount = 0;
    let discountType = null;
    let monthlyCardInfo = null;

    if (monthlyCard) {
      discountAmount = originalAmount;
      discountType = 'monthly_card';
      monthlyCardInfo = {
        card_no: monthlyCard.card_no,
        card_type: monthlyCard.card_type,
        end_date: monthlyCard.end_date
      };
    }

    const visitorDiscount = await db.get(`
      SELECT * FROM visitor_discounts 
      WHERE plate_number = ? AND lot_id = ? AND status = 'active' AND used = 0
      AND valid_start <= ? AND valid_end >= ?
    `, [plate_number, lot_id, new Date().toISOString(), new Date().toISOString()]);

    let visitorDiscountInfo = null;
    if (visitorDiscount && !monthlyCard) {
      const freeMinutes = visitorDiscount.free_hours * 60;
      const billableMinutes = Math.max(0, durationMinutes - freeMinutes);
      const discountedFee = calculateParkingFee(billableMinutes, rule).originalAmount;
      discountAmount = originalAmount - discountedFee;
      discountType = 'visitor';
      visitorDiscountInfo = {
        id: visitorDiscount.id,
        free_hours: visitorDiscount.free_hours,
        host_name: visitorDiscount.host_name
      };
    }

    const finalAmount = Math.max(0, Number((originalAmount - discountAmount).toFixed(2)));
    const couponAmount = order.coupon_amount || 0;
    const actualFinalAmount = Math.max(0, Number((finalAmount - couponAmount).toFixed(2)));

    await db.run(`
      UPDATE parking_orders 
      SET exit_time = ?, parking_duration = ?, original_amount = ?, 
          discount_amount = ?, final_amount = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [exitTime.toISOString(), durationMinutes, originalAmount, 
        Number(discountAmount.toFixed(2)), actualFinalAmount, order.id]);

    const updatedOrder = await db.get('SELECT * FROM parking_orders WHERE id = ?', [order.id]);

    res.json(successResponse({
      order_id: order.id,
      order_no: order.order_no,
      plate_number,
      entry_time: order.entry_time,
      exit_time: exitTime.toISOString(),
      parking_duration: durationMinutes,
      duration_text: formatDuration(durationMinutes),
      original_amount: originalAmount,
      discount_amount: Number(discountAmount.toFixed(2)),
      coupon_amount: couponAmount,
      final_amount: actualFinalAmount,
      paid_amount: order.paid_amount || 0,
      unpaid_amount: Number(Math.max(0, actualFinalAmount - (order.paid_amount || 0)).toFixed(2)),
      discount_type: discountType,
      monthly_card: monthlyCardInfo,
      visitor_discount: visitorDiscountInfo,
      billing_rule: rule,
      order_status: updatedOrder.status
    }, '费用试算成功'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}分钟`;
  return `${hours}小时${mins}分钟`;
}

export async function vehicleExit(req: Request, res: Response) {
  try {
    const { order_id, gate_id, device_id, image_url, operator } = req.body;
    
    if (!order_id) {
      return res.json(errorResponse(-1, '订单ID不能为空'));
    }

    const db = await getDatabase();
    const order = await db.get('SELECT * FROM parking_orders WHERE id = ?', [order_id]);
    
    if (!order) {
      return res.json(errorResponse(-1, '订单不存在'));
    }

    if (order.status !== 'parking' && order.status !== 'unpaid' && order.status !== 'paid') {
      return res.json(errorResponse(-1, '订单状态不正确', { current_status: order.status }));
    }

    const finalAmount = order.final_amount || 0;
    const paidAmount = order.paid_amount || 0;
    
    if (finalAmount > 0 && paidAmount < finalAmount) {
      return res.json(errorResponse(-5, '请先支付停车费', { 
        order_id: order.id,
        final_amount: finalAmount,
        paid_amount: paidAmount,
        unpaid_amount: Number((finalAmount - paidAmount).toFixed(2))
      }));
    }

    const exitTime = new Date().toISOString();
    const durationMinutes = order.parking_duration || calculateParkingDuration(order.entry_time, exitTime);

    await db.run(`
      UPDATE parking_orders 
      SET exit_time = ?, parking_duration = ?, status = 'completed', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [exitTime, durationMinutes, order_id]);

    const eventId = generateId();
    await db.run(`
      INSERT INTO entry_exit_events 
      (id, lot_id, gate_id, event_type, plate_number, event_time, device_id, image_url, operator, order_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [eventId, order.lot_id, gate_id || null, 'exit', order.plate_number, exitTime, device_id || null, image_url || null, operator || null, order_id]);

    await db.run('UPDATE parking_lots SET available_spaces = available_spaces + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [order.lot_id]);

    const updatedOrder = await db.get('SELECT * FROM parking_orders WHERE id = ?', [order_id]);
    res.json(successResponse(updatedOrder, '出场成功'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function listEntryExitEvents(req: Request, res: Response) {
  try {
    const { lot_id, plate_number, event_type, start_time, end_time, page = 1, page_size = 20 } = req.query as any;
    const db = await getDatabase();
    
    let where = 'WHERE 1=1';
    const params: any[] = [];
    
    if (lot_id) {
      where += ' AND lot_id = ?';
      params.push(lot_id);
    }
    if (plate_number) {
      where += ' AND plate_number LIKE ?';
      params.push(`%${plate_number}%`);
    }
    if (event_type) {
      where += ' AND event_type = ?';
      params.push(event_type);
    }
    if (start_time) {
      where += ' AND event_time >= ?';
      params.push(start_time);
    }
    if (end_time) {
      where += ' AND event_time <= ?';
      params.push(end_time);
    }

    const offset = (page - 1) * page_size;
    const list = await db.all(`SELECT * FROM entry_exit_events ${where} ORDER BY event_time DESC LIMIT ? OFFSET ?`, [...params, page_size, offset]);
    const total = await db.get(`SELECT COUNT(*) as count FROM entry_exit_events ${where}`, params);

    res.json(successResponse({ list, total: total.count, page, page_size }));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function reportAbnormalEvent(req: Request, res: Response) {
  try {
    const { lot_id, event_type, plate_number, description, device_id, image_url } = req.body;
    
    if (!lot_id || !event_type) {
      return res.json(errorResponse(-1, '车场ID和事件类型不能为空'));
    }

    const db = await getDatabase();
    const id = generateId();

    await db.run(`
      INSERT INTO abnormal_events (id, lot_id, event_type, plate_number, description, device_id, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, lot_id, event_type, plate_number || null, description || '', device_id || null, image_url || null]);

    const event = await db.get('SELECT * FROM abnormal_events WHERE id = ?', [id]);
    res.json(successResponse(event, '异常事件登记成功'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function listAbnormalEvents(req: Request, res: Response) {
  try {
    const { lot_id, handled, page = 1, page_size = 20 } = req.query as any;
    const db = await getDatabase();
    
    let where = 'WHERE 1=1';
    const params: any[] = [];
    
    if (lot_id) {
      where += ' AND lot_id = ?';
      params.push(lot_id);
    }
    if (handled !== undefined) {
      where += ' AND handled = ?';
      params.push(handled);
    }

    const offset = (page - 1) * page_size;
    const list = await db.all(`SELECT * FROM abnormal_events ${where} ORDER BY event_time DESC LIMIT ? OFFSET ?`, [...params, page_size, offset]);
    const total = await db.get(`SELECT COUNT(*) as count FROM abnormal_events ${where}`, params);

    res.json(successResponse({ list, total: total.count, page, page_size }));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function handleAbnormalEvent(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { handled_by, handle_remark } = req.body;

    const db = await getDatabase();
    
    await db.run(`
      UPDATE abnormal_events 
      SET handled = 1, handled_by = ?, handled_at = CURRENT_TIMESTAMP, handle_remark = ?
      WHERE id = ?
    `, [handled_by || '', handle_remark || '', id]);

    const event = await db.get('SELECT * FROM abnormal_events WHERE id = ?', [id]);
    res.json(successResponse(event, '处理成功'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function deviceHeartbeat(req: Request, res: Response) {
  try {
    const { device_id, lot_id, device_type, device_name, ip_address, status } = req.body;
    
    if (!device_id) {
      return res.json(errorResponse(-1, '设备ID不能为空'));
    }

    const db = await getDatabase();
    const id = generateId();

    await db.run(`
      INSERT INTO device_heartbeats (id, device_id, lot_id, device_type, device_name, ip_address, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, device_id, lot_id || null, device_type || '', device_name || '', ip_address || '', status || 'online']);

    res.json(successResponse({ received: true, server_time: new Date().toISOString() }, '心跳接收成功'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

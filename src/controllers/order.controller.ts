import { Request, Response } from 'express';
import { getDatabase } from '../database/connection';
import { generateId, successResponse, errorResponse } from '../utils/helpers';

export async function createBillingRule(req: Request, res: Response) {
  try {
    const { 
      lot_id, zone_id, name, rule_type = 'hourly', 
      free_minutes = 15, first_hour_price = 5, per_hour_price = 3, 
      daily_max = 30, monthly_price = 300, vehicle_type = 'car', is_default = 0 
    } = req.body;
    
    if (!name) {
      return res.json(errorResponse(-1, '规则名称不能为空'));
    }

    const db = await getDatabase();
    const id = generateId();

    if (is_default && lot_id) {
      await db.run('UPDATE billing_rules SET is_default = 0 WHERE lot_id = ?', [lot_id]);
    }

    await db.run(`
      INSERT INTO billing_rules 
      (id, lot_id, zone_id, name, rule_type, free_minutes, first_hour_price, per_hour_price, daily_max, monthly_price, vehicle_type, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, lot_id || null, zone_id || null, name, rule_type, free_minutes, first_hour_price, per_hour_price, daily_max, monthly_price, vehicle_type, is_default]);

    const rule = await db.get('SELECT * FROM billing_rules WHERE id = ?', [id]);
    res.json(successResponse(rule, '计费规则创建成功'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function updateBillingRule(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const db = await getDatabase();
    const existing = await db.get('SELECT * FROM billing_rules WHERE id = ?', [id]);
    
    if (!existing) {
      return res.json(errorResponse(-1, '计费规则不存在'));
    }

    const fields = Object.keys(updateData).filter(k => k !== 'id');
    if (fields.length === 0) {
      return res.json(successResponse(existing));
    }

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => updateData[f]);
    values.push(id);

    await db.run(`UPDATE billing_rules SET ${setClause} WHERE id = ?`, values);

    const rule = await db.get('SELECT * FROM billing_rules WHERE id = ?', [id]);
    res.json(successResponse(rule, '计费规则更新成功'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function listBillingRules(req: Request, res: Response) {
  try {
    const { lot_id } = req.query;
    const db = await getDatabase();
    
    let sql = 'SELECT * FROM billing_rules';
    const params: any[] = [];
    
    if (lot_id) {
      sql += ' WHERE lot_id = ?';
      params.push(lot_id);
    }
    sql += ' ORDER BY is_default DESC, created_at DESC';
    
    const list = await db.all(sql, params);
    res.json(successResponse({ list }));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function deleteBillingRule(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    await db.run('DELETE FROM billing_rules WHERE id = ?', [id]);
    res.json(successResponse(null, '删除成功'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function createOrder(req: Request, res: Response) {
  try {
    const { lot_id, plate_number, entry_time, billing_rule_id } = req.body;
    
    if (!lot_id || !plate_number || !entry_time) {
      return res.json(errorResponse(-1, '参数不完整'));
    }

    const db = await getDatabase();
    const { generateOrderNo } = require('../utils/helpers');
    
    const orderId = generateId();
    const orderNo = generateOrderNo();

    await db.run(`
      INSERT INTO parking_orders 
      (id, order_no, lot_id, plate_number, entry_time, billing_rule_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [orderId, orderNo, lot_id, plate_number, entry_time, billing_rule_id || null, 'parking']);

    const order = await db.get('SELECT * FROM parking_orders WHERE id = ?', [orderId]);
    res.json(successResponse(order, '订单创建成功'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function getOrder(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    const order = await db.get('SELECT * FROM parking_orders WHERE id = ?', [id]);
    
    if (!order) {
      return res.json(errorResponse(-1, '订单不存在'));
    }
    
    res.json(successResponse(order));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function getOrderByNo(req: Request, res: Response) {
  try {
    const { order_no } = req.params;
    const db = await getDatabase();
    const order = await db.get('SELECT * FROM parking_orders WHERE order_no = ?', [order_no]);
    
    if (!order) {
      return res.json(errorResponse(-1, '订单不存在'));
    }
    
    res.json(successResponse(order));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function listOrders(req: Request, res: Response) {
  try {
    const { 
      lot_id, plate_number, status, start_time, end_time, 
      page = 1, page_size = 20 
    } = req.query as any;
    
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
    if (status) {
      where += ' AND status = ?';
      params.push(status);
    }
    if (start_time) {
      where += ' AND entry_time >= ?';
      params.push(start_time);
    }
    if (end_time) {
      where += ' AND entry_time <= ?';
      params.push(end_time);
    }

    const offset = (page - 1) * page_size;
    const list = await db.all(`SELECT * FROM parking_orders ${where} ORDER BY entry_time DESC LIMIT ? OFFSET ?`, [...params, page_size, offset]);
    const total = await db.get(`SELECT COUNT(*) as count FROM parking_orders ${where}`, params);

    res.json(successResponse({ list, total: total.count, page, page_size }));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function confirmPayment(req: Request, res: Response) {
  try {
    const { order_id, payment_method, paid_amount, transaction_id, coupon_id, visitor_discount_id } = req.body;
    
    if (!order_id || paid_amount === undefined || paid_amount <= 0) {
      return res.json(errorResponse(-1, '订单ID和有效的支付金额不能为空'));
    }

    const db = await getDatabase();
    const order = await db.get('SELECT * FROM parking_orders WHERE id = ?', [order_id]);
    
    if (!order) {
      return res.json(errorResponse(-1, '订单不存在'));
    }

    const finalAmount = order.final_amount || 0;
    const currentPaid = order.paid_amount || 0;

    if (finalAmount <= 0) {
      return res.json(errorResponse(-2, '订单应付金额为0，无需支付', { 
        order_id,
        final_amount: finalAmount
      }));
    }

    if (currentPaid >= finalAmount) {
      return res.json(errorResponse(-3, '订单已足额支付，无需重复支付', {
        order_id,
        final_amount: finalAmount,
        paid_amount: currentPaid
      }));
    }

    const paymentTime = new Date().toISOString();
    const newPaidAmount = Number((currentPaid + paid_amount).toFixed(2));
    const remainingAmount = Number(Math.max(0, finalAmount - newPaidAmount).toFixed(2));
    
    let status = order.status;
    let isFullyPaid = false;
    
    if (newPaidAmount >= finalAmount) {
      isFullyPaid = true;
      if (order.status === 'parking' || order.status === 'unpaid') {
        status = 'paid';
      }
    } else {
      if (order.status === 'parking') {
        status = 'unpaid';
      }
    }

    await db.run(`
      UPDATE parking_orders 
      SET paid_amount = ?, payment_method = ?, payment_time = ?, transaction_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [newPaidAmount, payment_method || 'online', paymentTime, transaction_id || null, status, order_id]);

    if (coupon_id) {
      await db.run(`
        UPDATE coupons 
        SET used_count = used_count + 1, used_at = ?, used_order_id = ?, status = CASE WHEN used_count + 1 >= max_uses THEN 'used' ELSE status END
        WHERE id = ?
      `, [paymentTime, order_id, coupon_id]);
    }

    if (visitor_discount_id) {
      await db.run(`
        UPDATE visitor_discounts 
        SET used = 1, order_id = ?
        WHERE id = ?
      `, [order_id, visitor_discount_id]);
    }

    const updatedOrder = await db.get('SELECT * FROM parking_orders WHERE id = ?', [order_id]);
    res.json(successResponse({
      ...updatedOrder,
      is_fully_paid: isFullyPaid,
      remaining_amount: remainingAmount,
      payment_note: isFullyPaid ? '已足额支付，可出场' : `部分支付，还需支付${remainingAmount}元`
    }, '支付确认成功'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function queryUnpaidOrders(req: Request, res: Response) {
  try {
    const { plate_number } = req.query;
    
    if (!plate_number) {
      return res.json(errorResponse(-1, '车牌号不能为空'));
    }

    const db = await getDatabase();
    
    const orders = await db.all(`
      SELECT * FROM parking_orders 
      WHERE plate_number = ? AND status IN ('parking', 'unpaid')
      ORDER BY entry_time DESC
    `, [plate_number]);

    const totalUnpaid = orders.reduce((sum, o) => sum + (o.final_amount - o.paid_amount), 0);

    res.json(successResponse({
      plate_number,
      orders,
      total_unpaid: Number(totalUnpaid.toFixed(2)),
      order_count: orders.length
    }));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function applyCouponToOrder(req: Request, res: Response) {
  try {
    const { order_id, coupon_no } = req.body;
    
    if (!order_id || !coupon_no) {
      return res.json(errorResponse(-1, '订单ID和券号不能为空'));
    }

    const db = await getDatabase();
    const order = await db.get('SELECT * FROM parking_orders WHERE id = ?', [order_id]);
    
    if (!order) {
      return res.json(errorResponse(-1, '订单不存在'));
    }

    const coupon = await db.get(`
      SELECT * FROM coupons 
      WHERE coupon_no = ? AND status = 'active'
      AND used_count < max_uses
      AND (valid_start IS NULL OR valid_start <= CURRENT_TIMESTAMP)
      AND (valid_end IS NULL OR valid_end >= CURRENT_TIMESTAMP)
    `, [coupon_no]);

    if (!coupon) {
      return res.json(errorResponse(-1, '优惠券无效或已过期'));
    }

    if (coupon.min_amount > order.original_amount) {
      return res.json(errorResponse(-1, `订单金额不满${coupon.min_amount}元，不可使用此优惠券`));
    }

    let couponAmount = 0;
    if (coupon.coupon_type === 'discount') {
      couponAmount = Number((order.original_amount * (coupon.value / 100)).toFixed(2));
    } else if (coupon.coupon_type === 'cash') {
      couponAmount = Math.min(coupon.value, order.original_amount);
    } else if (coupon.coupon_type === 'free_hours') {
      const freeMinutes = coupon.value * 60;
      const billableMinutes = Math.max(0, (order.parking_duration || 0) - freeMinutes);
      const rule = await db.get('SELECT * FROM billing_rules WHERE id = ?', [order.billing_rule_id]);
      const { calculateParkingFee } = require('../utils/helpers');
      const newAmount = calculateParkingFee(billableMinutes, rule || { free_minutes: 15, first_hour_price: 5, per_hour_price: 3, daily_max: 30 }).originalAmount;
      couponAmount = order.original_amount - newAmount;
    }

    const newCouponAmount = Number(((order.coupon_amount || 0) + couponAmount).toFixed(2));
    const newFinalAmount = Number(Math.max(0, order.original_amount - (order.discount_amount || 0) - newCouponAmount).toFixed(2));

    await db.run(`
      UPDATE parking_orders 
      SET coupon_amount = ?, final_amount = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [newCouponAmount, newFinalAmount, order_id]);

    const updatedOrder = await db.get('SELECT * FROM parking_orders WHERE id = ?', [order_id]);
    res.json(successResponse({
      order: updatedOrder,
      coupon_info: {
        id: coupon.id,
        name: coupon.name,
        coupon_type: coupon.coupon_type,
        value: coupon.value,
        deduction_amount: couponAmount
      }
    }, '优惠券使用成功'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

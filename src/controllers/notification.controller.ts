import { Request, Response } from 'express';
import { getDatabase } from '../database/connection';
import { generateId, generateInvoiceNo, successResponse, errorResponse } from '../utils/helpers';

export async function sendNotification(req: Request, res: Response) {
  try {
    const { 
      user_id, user_phone, notify_type, title, content, 
      channel = 'app', order_id, plate_number 
    } = req.body;
    
    if (!title || !content) {
      return res.json(errorResponse(-1, '标题和内容不能为空'));
    }

    const db = await getDatabase();
    const id = generateId();

    await db.run(`
      INSERT INTO notifications 
      (id, user_id, user_phone, notify_type, title, content, channel, order_id, plate_number, sent, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
    `, [
      id, user_id || null, user_phone || null, notify_type || 'system', 
      title, content, channel, order_id || null, plate_number || null
    ]);

    const notification = await db.get('SELECT * FROM notifications WHERE id = ?', [id]);
    res.json(successResponse(notification, '通知发送成功'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function listNotifications(req: Request, res: Response) {
  try {
    const { user_id, user_phone, plate_number, read, page = 1, page_size = 20 } = req.query as any;
    const db = await getDatabase();
    
    let where = 'WHERE 1=1';
    const params: any[] = [];
    
    if (user_id) {
      where += ' AND user_id = ?';
      params.push(user_id);
    }
    if (user_phone) {
      where += ' AND user_phone = ?';
      params.push(user_phone);
    }
    if (plate_number) {
      where += ' AND plate_number = ?';
      params.push(plate_number);
    }
    if (read !== undefined) {
      where += ' AND read = ?';
      params.push(read);
    }

    const offset = (page - 1) * page_size;
    const list = await db.all(`SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, page_size, offset]);
    const total = await db.get(`SELECT COUNT(*) as count FROM notifications ${where}`, params);

    res.json(successResponse({ list, total: total.count, page, page_size }));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function markNotificationRead(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    
    await db.run('UPDATE notifications SET read = 1 WHERE id = ?', [id]);
    
    res.json(successResponse(null, '已标记为已读'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function createInvoiceRequest(req: Request, res: Response) {
  try {
    const { 
      order_id, order_no, amount, invoice_type = 'personal', 
      title, tax_no, email, phone 
    } = req.body;
    
    if (!order_id || !amount || !title) {
      return res.json(errorResponse(-1, '参数不完整'));
    }

    const db = await getDatabase();
    const id = generateId();
    const invoiceNo = generateInvoiceNo();

    await db.run(`
      INSERT INTO invoice_requests 
      (id, invoice_no, order_id, order_no, amount, invoice_type, title, tax_no, email, phone, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, invoiceNo, order_id, order_no, amount, 
      invoice_type, title, tax_no || '', email || '', phone || '', 'pending'
    ]);

    const invoice = await db.get('SELECT * FROM invoice_requests WHERE id = ?', [id]);
    res.json(successResponse(invoice, '发票申请已提交'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function getInvoiceStatus(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    
    const invoice = await db.get('SELECT * FROM invoice_requests WHERE id = ?', [id]);
    
    if (!invoice) {
      return res.json(errorResponse(-1, '发票申请不存在'));
    }

    res.json(successResponse(invoice));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function updateInvoiceStatus(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { status, pdf_url } = req.body;

    const db = await getDatabase();
    
    await db.run(`
      UPDATE invoice_requests 
      SET status = ?, pdf_url = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status || 'pending', pdf_url || null, id]);

    const invoice = await db.get('SELECT * FROM invoice_requests WHERE id = ?', [id]);
    res.json(successResponse(invoice, '发票状态已更新'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function reconciliationReport(req: Request, res: Response) {
  try {
    const { lot_id, start_date, end_date } = req.query as any;
    
    if (!start_date || !end_date) {
      return res.json(errorResponse(-1, '开始和结束日期不能为空'));
    }

    const db = await getDatabase();
    
    let where = 'WHERE entry_time >= ? AND entry_time <= ?';
    const params: any[] = [start_date, end_date];
    
    if (lot_id) {
      where += ' AND lot_id = ?';
      params.push(lot_id);
    }

    const orders = await db.all(`
      SELECT * FROM parking_orders 
      ${where} AND status IN ('paid', 'completed')
      ORDER BY entry_time ASC
    `, params);

    const totalOrders = orders.length;
    const totalAmount = orders.reduce((sum, o) => sum + (o.original_amount || 0), 0);
    const totalDiscount = orders.reduce((sum, o) => sum + (o.discount_amount || 0), 0);
    const totalCoupon = orders.reduce((sum, o) => sum + (o.coupon_amount || 0), 0);
    const totalPaid = orders.reduce((sum, o) => sum + (o.paid_amount || 0), 0);
    const totalFinal = orders.reduce((sum, o) => sum + (o.final_amount || 0), 0);

    const byPaymentMethod: Record<string, any> = {};
    orders.forEach(o => {
      const method = o.payment_method || 'unknown';
      if (!byPaymentMethod[method]) {
        byPaymentMethod[method] = { count: 0, amount: 0 };
      }
      byPaymentMethod[method].count++;
      byPaymentMethod[method].amount += o.paid_amount || 0;
    });

    res.json(successResponse({
      period: { start_date, end_date },
      summary: {
        total_orders: totalOrders,
        total_original_amount: Number(totalAmount.toFixed(2)),
        total_discount_amount: Number(totalDiscount.toFixed(2)),
        total_coupon_amount: Number(totalCoupon.toFixed(2)),
        total_final_amount: Number(totalFinal.toFixed(2)),
        total_paid_amount: Number(totalPaid.toFixed(2))
      },
      by_payment_method: byPaymentMethod,
      orders
    }));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function dailyStatistics(req: Request, res: Response) {
  try {
    const { lot_id, date } = req.query as any;
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    const db = await getDatabase();
    
    let orderWhere = 'WHERE DATE(entry_time) = ?';
    let eventWhere = 'WHERE DATE(event_time) = ?';
    const orderParams: any[] = [targetDate];
    const eventParams: any[] = [targetDate];
    
    if (lot_id) {
      orderWhere += ' AND lot_id = ?';
      eventWhere += ' AND lot_id = ?';
      orderParams.push(lot_id);
      eventParams.push(lot_id);
    }

    const orders = await db.all(`
      SELECT * FROM parking_orders ${orderWhere}
    `, orderParams);

    const entryEvents = await db.all(`
      SELECT * FROM entry_exit_events ${eventWhere} AND event_type = 'entry'
    `, eventParams);

    const exitEvents = await db.all(`
      SELECT * FROM entry_exit_events ${eventWhere} AND event_type = 'exit'
    `, eventParams);

    const parkingCount = orders.filter(o => o.status === 'parking').length;
    const completedCount = orders.filter(o => o.status === 'completed' || o.status === 'paid').length;
    const totalRevenue = orders.reduce((sum, o) => sum + (o.paid_amount || 0), 0);

    const ordersWithDuration = orders.filter(o => o.parking_duration && (o.status === 'completed' || o.status === 'paid'));
    const totalDuration = ordersWithDuration.reduce((sum, o) => sum + (o.parking_duration || 0), 0);

    res.json(successResponse({
      date: targetDate,
      lot_id: lot_id || null,
      entry_count: entryEvents.length,
      exit_count: exitEvents.length,
      parking_count: parkingCount,
      completed_count: completedCount,
      total_revenue: Number(totalRevenue.toFixed(2)),
      avg_parking_duration: ordersWithDuration.length > 0 
        ? Math.round(totalDuration / ordersWithDuration.length)
        : 0
    }));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function listApiCallLogs(req: Request, res: Response) {
  try {
    const { api_path, method, status_code, start_time, end_time, page = 1, page_size = 20 } = req.query as any;
    const db = await getDatabase();
    
    let where = 'WHERE 1=1';
    const params: any[] = [];
    
    if (api_path) {
      where += ' AND api_path LIKE ?';
      params.push(`%${api_path}%`);
    }
    if (method) {
      where += ' AND method = ?';
      params.push(method);
    }
    if (status_code) {
      where += ' AND status_code = ?';
      params.push(status_code);
    }
    if (start_time) {
      where += ' AND created_at >= ?';
      params.push(start_time);
    }
    if (end_time) {
      where += ' AND created_at <= ?';
      params.push(end_time);
    }

    const offset = (page - 1) * page_size;
    const list = await db.all(`SELECT * FROM api_call_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, page_size, offset]);
    const total = await db.get(`SELECT COUNT(*) as count FROM api_call_logs ${where}`, params);

    res.json(successResponse({ list, total: total.count, page, page_size }));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function paymentCallback(req: Request, res: Response) {
  try {
    const { order_no, transaction_id, amount, status, payment_method } = req.body;
    
    if (!order_no || !transaction_id) {
      return res.json(errorResponse(-1, '参数不完整'));
    }

    const db = await getDatabase();
    const order = await db.get('SELECT * FROM parking_orders WHERE order_no = ?', [order_no]);
    
    if (!order) {
      return res.json(errorResponse(-1, '订单不存在'));
    }

    if (status === 'success') {
      const paymentTime = new Date().toISOString();
      const newPaidAmount = Number((order.paid_amount + amount).toFixed(2));
      const orderStatus = newPaidAmount >= order.final_amount ? 'paid' : order.status;

      await db.run(`
        UPDATE parking_orders 
        SET paid_amount = ?, payment_method = ?, payment_time = ?, transaction_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [newPaidAmount, payment_method || order.payment_method, paymentTime, transaction_id, orderStatus, order.id]);

      await sendNotification({
        body: {
          user_phone: '',
          notify_type: 'payment_success',
          title: '支付成功',
          content: `您的订单${order_no}已支付成功，金额${amount}元`,
          plate_number: order.plate_number,
          order_id: order.id
        }
      } as Request, { json: () => {} } as Response);
    }

    res.json(successResponse({ received: true }, '回调接收成功'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

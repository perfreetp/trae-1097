import { Request, Response } from 'express';
import { getDatabase } from '../database/connection';
import { generateId, generateCardNo, generateCouponNo, successResponse, errorResponse } from '../utils/helpers';
import moment from 'moment';

export async function createMonthlyCard(req: Request, res: Response) {
  try {
    const { 
      plate_number, lot_id, card_type = 'monthly', 
      holder_name, holder_phone, start_date, duration_months = 1, price 
    } = req.body;
    
    if (!plate_number || !start_date) {
      return res.json(errorResponse(-1, '车牌号和开始日期不能为空'));
    }

    const db = await getDatabase();
    const id = generateId();
    const cardNo = generateCardNo();
    
    const startDate = moment(start_date);
    const endDate = startDate.clone().add(duration_months, 'months');
    const remainingDays = endDate.diff(moment(), 'days');

    await db.run(`
      INSERT INTO monthly_cards 
      (id, card_no, plate_number, lot_id, card_type, holder_name, holder_phone, start_date, end_date, remaining_days, price, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, cardNo, plate_number, lot_id || null, card_type, 
      holder_name || '', holder_phone || '', 
      startDate.toISOString(), endDate.toISOString(), 
      Math.max(0, remainingDays), price || 0, 'active'
    ]);

    const card = await db.get('SELECT * FROM monthly_cards WHERE id = ?', [id]);
    res.json(successResponse(card, '月卡创建成功'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function verifyMonthlyCard(req: Request, res: Response) {
  try {
    const { plate_number, lot_id } = req.query;
    
    if (!plate_number) {
      return res.json(errorResponse(-1, '车牌号不能为空'));
    }

    const db = await getDatabase();
    const now = new Date().toISOString();
    
    let sql = `
      SELECT * FROM monthly_cards 
      WHERE plate_number = ? AND status = 'active'
      AND start_date <= ? AND end_date >= ?
    `;
    const params: any[] = [plate_number, now, now];
    
    if (lot_id) {
      sql += ' AND (lot_id = ? OR lot_id IS NULL)';
      params.push(lot_id);
    }

    const cards = await db.all(sql, params);
    const valid = cards.length > 0;
    
    res.json(successResponse({
      valid,
      plate_number,
      cards: valid ? cards : [],
      active_card: valid ? cards[0] : null
    }, valid ? '月卡有效' : '无有效月卡'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function listMonthlyCards(req: Request, res: Response) {
  try {
    const { plate_number, status, page = 1, page_size = 20 } = req.query as any;
    const db = await getDatabase();
    
    let where = 'WHERE 1=1';
    const params: any[] = [];
    
    if (plate_number) {
      where += ' AND plate_number LIKE ?';
      params.push(`%${plate_number}%`);
    }
    if (status) {
      where += ' AND status = ?';
      params.push(status);
    }

    const offset = (page - 1) * page_size;
    const list = await db.all(`SELECT * FROM monthly_cards ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, page_size, offset]);
    const total = await db.get(`SELECT COUNT(*) as count FROM monthly_cards ${where}`, params);

    res.json(successResponse({ list, total: total.count, page, page_size }));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function updateMonthlyCard(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { status, extend_months } = req.body;

    const db = await getDatabase();
    const card = await db.get('SELECT * FROM monthly_cards WHERE id = ?', [id]);
    
    if (!card) {
      return res.json(errorResponse(-1, '月卡不存在'));
    }

    let endDate = card.end_date;
    let remainingDays = card.remaining_days;

    if (extend_months && extend_months > 0) {
      endDate = moment(card.end_date).add(extend_months, 'months').toISOString();
      remainingDays = moment(endDate).diff(moment(), 'days');
    }

    await db.run(`
      UPDATE monthly_cards 
      SET status = ?, end_date = ?, remaining_days = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status || card.status, endDate, Math.max(0, remainingDays), id]);

    const updatedCard = await db.get('SELECT * FROM monthly_cards WHERE id = ?', [id]);
    res.json(successResponse(updatedCard, '月卡更新成功'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function createCoupon(req: Request, res: Response) {
  try {
    const { 
      name, coupon_type, value, min_amount = 0, 
      lot_id, applicable_plate, valid_start, valid_end, max_uses = 1 
    } = req.body;
    
    if (!name || !coupon_type || value === undefined) {
      return res.json(errorResponse(-1, '参数不完整'));
    }

    const db = await getDatabase();
    const id = generateId();
    const couponNo = generateCouponNo();

    await db.run(`
      INSERT INTO coupons 
      (id, coupon_no, name, coupon_type, value, min_amount, lot_id, applicable_plate, valid_start, valid_end, max_uses)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, couponNo, name, coupon_type, value, min_amount, 
      lot_id || null, applicable_plate || null, 
      valid_start || null, valid_end || null, max_uses
    ]);

    const coupon = await db.get('SELECT * FROM coupons WHERE id = ?', [id]);
    res.json(successResponse(coupon, '优惠券创建成功'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function getCoupon(req: Request, res: Response) {
  try {
    const { coupon_no } = req.params;
    const db = await getDatabase();
    
    const coupon = await db.get('SELECT * FROM coupons WHERE coupon_no = ?', [coupon_no]);
    
    if (!coupon) {
      return res.json(errorResponse(-1, '优惠券不存在'));
    }

    const now = new Date();
    let is_valid = coupon.status === 'active' && coupon.used_count < coupon.max_uses;
    if (coupon.valid_start && new Date(coupon.valid_start) > now) is_valid = false;
    if (coupon.valid_end && new Date(coupon.valid_end) < now) is_valid = false;

    res.json(successResponse({ ...coupon, is_valid }));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function listCoupons(req: Request, res: Response) {
  try {
    const { status, plate_number, page = 1, page_size = 20 } = req.query as any;
    const db = await getDatabase();
    
    let where = 'WHERE 1=1';
    const params: any[] = [];
    
    if (status) {
      where += ' AND status = ?';
      params.push(status);
    }
    if (plate_number) {
      where += ' AND (applicable_plate = ? OR applicable_plate IS NULL)';
      params.push(plate_number);
    }

    const offset = (page - 1) * page_size;
    const list = await db.all(`SELECT * FROM coupons ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, page_size, offset]);
    const total = await db.get(`SELECT COUNT(*) as count FROM coupons ${where}`, params);

    res.json(successResponse({ list, total: total.count, page, page_size }));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function createVisitorDiscount(req: Request, res: Response) {
  try {
    const { 
      visitor_name, visitor_phone, plate_number, lot_id, 
      host_name, host_unit, free_hours = 2, valid_duration_hours = 24 
    } = req.body;
    
    if (!plate_number || !lot_id) {
      return res.json(errorResponse(-1, '车牌号和车场ID不能为空'));
    }

    const db = await getDatabase();
    const id = generateId();
    
    const validStart = new Date();
    const validEnd = moment(validStart).add(valid_duration_hours, 'hours').toISOString();

    await db.run(`
      INSERT INTO visitor_discounts 
      (id, visitor_name, visitor_phone, plate_number, lot_id, host_name, host_unit, free_hours, valid_start, valid_end)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, visitor_name || '', visitor_phone || '', plate_number, lot_id, 
      host_name || '', host_unit || '', free_hours, 
      validStart.toISOString(), validEnd
    ]);

    const discount = await db.get('SELECT * FROM visitor_discounts WHERE id = ?', [id]);
    res.json(successResponse(discount, '访客减免创建成功'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function listVisitorDiscounts(req: Request, res: Response) {
  try {
    const { plate_number, lot_id, status, page = 1, page_size = 20 } = req.query as any;
    const db = await getDatabase();
    
    let where = 'WHERE 1=1';
    const params: any[] = [];
    
    if (plate_number) {
      where += ' AND plate_number = ?';
      params.push(plate_number);
    }
    if (lot_id) {
      where += ' AND lot_id = ?';
      params.push(lot_id);
    }
    if (status) {
      where += ' AND status = ?';
      params.push(status);
    }

    const offset = (page - 1) * page_size;
    const list = await db.all(`SELECT * FROM visitor_discounts ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, page_size, offset]);
    const total = await db.get(`SELECT COUNT(*) as count FROM visitor_discounts ${where}`, params);

    res.json(successResponse({ list, total: total.count, page, page_size }));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function addBlacklist(req: Request, res: Response) {
  try {
    const { plate_number, reason, vehicle_info } = req.body;
    
    if (!plate_number) {
      return res.json(errorResponse(-1, '车牌号不能为空'));
    }

    const db = await getDatabase();
    
    let vehicle = await db.get('SELECT * FROM vehicles WHERE plate_number = ?', [plate_number]);
    
    if (vehicle) {
      await db.run(`
        UPDATE vehicles 
        SET is_blacklist = 1, blacklist_reason = ?, updated_at = CURRENT_TIMESTAMP
        WHERE plate_number = ?
      `, [reason || '', plate_number]);
    } else {
      const id = generateId();
      await db.run(`
        INSERT INTO vehicles (id, plate_number, is_blacklist, blacklist_reason, vehicle_type, color, brand)
        VALUES (?, ?, 1, ?, ?, ?, ?)
      `, [id, plate_number, reason || '', vehicle_info?.vehicle_type || 'car', vehicle_info?.color || '', vehicle_info?.brand || '']);
    }

    vehicle = await db.get('SELECT * FROM vehicles WHERE plate_number = ?', [plate_number]);
    res.json(successResponse(vehicle, '已加入黑名单'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function removeBlacklist(req: Request, res: Response) {
  try {
    const { plate_number } = req.body;
    
    if (!plate_number) {
      return res.json(errorResponse(-1, '车牌号不能为空'));
    }

    const db = await getDatabase();
    
    await db.run(`
      UPDATE vehicles 
      SET is_blacklist = 0, blacklist_reason = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE plate_number = ?
    `, [plate_number]);

    const vehicle = await db.get('SELECT * FROM vehicles WHERE plate_number = ?', [plate_number]);
    res.json(successResponse(vehicle, '已移出黑名单'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function checkBlacklist(req: Request, res: Response) {
  try {
    const { plate_number } = req.query;
    
    if (!plate_number) {
      return res.json(errorResponse(-1, '车牌号不能为空'));
    }

    const db = await getDatabase();
    const vehicle = await db.get('SELECT * FROM vehicles WHERE plate_number = ?', [plate_number]);
    
    const isBlacklisted = vehicle?.is_blacklist === 1;
    
    res.json(successResponse({
      plate_number,
      is_blacklist: isBlacklisted,
      blacklist_reason: isBlacklisted ? vehicle?.blacklist_reason : null,
      vehicle_info: vehicle
    }));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function listBlacklist(req: Request, res: Response) {
  try {
    const { keyword, page = 1, page_size = 20 } = req.query as any;
    const db = await getDatabase();
    
    let where = 'WHERE is_blacklist = 1';
    const params: any[] = [];
    
    if (keyword) {
      where += ' AND plate_number LIKE ?';
      params.push(`%${keyword}%`);
    }

    const offset = (page - 1) * page_size;
    const list = await db.all(`SELECT * FROM vehicles ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`, [...params, page_size, offset]);
    const total = await db.get(`SELECT COUNT(*) as count FROM vehicles ${where}`, params);

    res.json(successResponse({ list, total: total.count, page, page_size }));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

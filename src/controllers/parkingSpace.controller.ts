import { Request, Response } from 'express';
import { getDatabase } from '../database/connection';
import { generateId, successResponse, errorResponse } from '../utils/helpers';

export async function createParkingSpace(req: Request, res: Response) {
  try {
    const { lot_id, zone_id, space_no, vehicle_type } = req.body;
    
    if (!lot_id || !space_no) {
      return res.json(errorResponse(-1, '车场ID和车位编号不能为空'));
    }

    const db = await getDatabase();
    const id = generateId();

    await db.run(`
      INSERT INTO parking_spaces (id, lot_id, zone_id, space_no, vehicle_type)
      VALUES (?, ?, ?, ?, ?)
    `, [id, lot_id, zone_id || null, space_no, vehicle_type || 'car']);

    const space = await db.get('SELECT * FROM parking_spaces WHERE id = ?', [id]);
    res.json(successResponse(space, '车位创建成功'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function updateParkingSpace(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { status, vehicle_plate } = req.body;

    const db = await getDatabase();
    const existing = await db.get('SELECT * FROM parking_spaces WHERE id = ?', [id]);
    
    if (!existing) {
      return res.json(errorResponse(-1, '车位不存在'));
    }

    await db.run(`
      UPDATE parking_spaces 
      SET status = ?, vehicle_plate = ?, last_updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status || existing.status, vehicle_plate !== undefined ? vehicle_plate : existing.vehicle_plate, id]);

    const space = await db.get('SELECT * FROM parking_spaces WHERE id = ?', [id]);
    res.json(successResponse(space, '车位状态更新成功'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function updateAvailableSpaces(req: Request, res: Response) {
  try {
    const { lot_id, zone_id, available_spaces } = req.body;
    
    if (!lot_id || available_spaces === undefined) {
      return res.json(errorResponse(-1, '参数不完整'));
    }

    const db = await getDatabase();
    
    if (zone_id) {
      await db.run('UPDATE parking_zones SET available_spaces = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [available_spaces, zone_id]);
    }
    
    await db.run('UPDATE parking_lots SET available_spaces = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [available_spaces, lot_id]);

    res.json(successResponse({ lot_id, zone_id, available_spaces }, '余位更新成功'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function getLotAvailability(req: Request, res: Response) {
  try {
    const { lot_id } = req.params;
    const db = await getDatabase();
    
    const lot = await db.get('SELECT id, name, total_spaces, available_spaces, status FROM parking_lots WHERE id = ?', [lot_id]);
    
    if (!lot) {
      return res.json(errorResponse(-1, '车场不存在'));
    }

    const zones = await db.all('SELECT id, name, code, total_spaces, available_spaces, vehicle_type FROM parking_zones WHERE lot_id = ?', [lot_id]);
    
    res.json(successResponse({
      lot_id: lot.id,
      lot_name: lot.name,
      total_spaces: lot.total_spaces,
      available_spaces: lot.available_spaces,
      occupied_spaces: lot.total_spaces - lot.available_spaces,
      status: lot.status,
      zones
    }));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function listParkingSpaces(req: Request, res: Response) {
  try {
    const { lot_id, zone_id, status, page = 1, page_size = 50 } = req.query as any;
    const db = await getDatabase();
    
    let where = 'WHERE 1=1';
    const params: any[] = [];
    
    if (lot_id) {
      where += ' AND lot_id = ?';
      params.push(lot_id);
    }
    if (zone_id) {
      where += ' AND zone_id = ?';
      params.push(zone_id);
    }
    if (status) {
      where += ' AND status = ?';
      params.push(status);
    }

    const offset = (page - 1) * page_size;
    const list = await db.all(`SELECT * FROM parking_spaces ${where} ORDER BY space_no LIMIT ? OFFSET ?`, [...params, page_size, offset]);
    const total = await db.get(`SELECT COUNT(*) as count FROM parking_spaces ${where}`, params);

    res.json(successResponse({ list, total: total.count, page, page_size }));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function deleteParkingSpace(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    await db.run('DELETE FROM parking_spaces WHERE id = ?', [id]);
    res.json(successResponse(null, '删除成功'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

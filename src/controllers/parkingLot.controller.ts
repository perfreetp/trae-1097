import { Request, Response } from 'express';
import { getDatabase } from '../database/connection';
import { generateId, successResponse, errorResponse } from '../utils/helpers';

export async function createParkingLot(req: Request, res: Response) {
  try {
    const { name, address, contact, phone, total_spaces, business_hours, description } = req.body;
    
    if (!name) {
      return res.json(errorResponse(-1, '车场名称不能为空'));
    }

    const db = await getDatabase();
    const id = generateId();

    await db.run(`
      INSERT INTO parking_lots 
      (id, name, address, contact, phone, total_spaces, available_spaces, business_hours, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, name, address || '', contact || '', phone || '', total_spaces || 0, total_spaces || 0, business_hours || '', description || '']);

    const lot = await db.get('SELECT * FROM parking_lots WHERE id = ?', [id]);
    res.json(successResponse(lot, '车场创建成功'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function updateParkingLot(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { name, address, contact, phone, total_spaces, status, business_hours, description } = req.body;

    const db = await getDatabase();
    const existing = await db.get('SELECT * FROM parking_lots WHERE id = ?', [id]);
    
    if (!existing) {
      return res.json(errorResponse(-1, '车场不存在'));
    }

    await db.run(`
      UPDATE parking_lots 
      SET name = ?, address = ?, contact = ?, phone = ?, total_spaces = ?, status = ?, business_hours = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      name || existing.name,
      address !== undefined ? address : existing.address,
      contact !== undefined ? contact : existing.contact,
      phone !== undefined ? phone : existing.phone,
      total_spaces !== undefined ? total_spaces : existing.total_spaces,
      status || existing.status,
      business_hours !== undefined ? business_hours : existing.business_hours,
      description !== undefined ? description : existing.description,
      id
    ]);

    const lot = await db.get('SELECT * FROM parking_lots WHERE id = ?', [id]);
    res.json(successResponse(lot, '车场更新成功'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function getParkingLot(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    const lot = await db.get('SELECT * FROM parking_lots WHERE id = ?', [id]);
    
    if (!lot) {
      return res.json(errorResponse(-1, '车场不存在'));
    }

    const zones = await db.all('SELECT * FROM parking_zones WHERE lot_id = ?', [id]);
    res.json(successResponse({ ...lot, zones }));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function listParkingLots(req: Request, res: Response) {
  try {
    const { page = 1, page_size = 20, status, keyword } = req.query as any;
    const db = await getDatabase();
    
    let where = 'WHERE 1=1';
    const params: any[] = [];
    
    if (status) {
      where += ' AND status = ?';
      params.push(status);
    }
    if (keyword) {
      where += ' AND (name LIKE ? OR address LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    const offset = (page - 1) * page_size;
    const list = await db.all(`SELECT * FROM parking_lots ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, page_size, offset]);
    const total = await db.get(`SELECT COUNT(*) as count FROM parking_lots ${where}`, params);

    res.json(successResponse({ list, total: total.count, page, page_size }));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function deleteParkingLot(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    await db.run('DELETE FROM parking_lots WHERE id = ?', [id]);
    res.json(successResponse(null, '删除成功'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function createZone(req: Request, res: Response) {
  try {
    const { lot_id, name, code, total_spaces, vehicle_type } = req.body;
    
    if (!lot_id || !name) {
      return res.json(errorResponse(-1, '车场ID和分区名称不能为空'));
    }

    const db = await getDatabase();
    const id = generateId();

    await db.run(`
      INSERT INTO parking_zones (id, lot_id, name, code, total_spaces, available_spaces, vehicle_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, lot_id, name, code || '', total_spaces || 0, total_spaces || 0, vehicle_type || 'car']);

    const zone = await db.get('SELECT * FROM parking_zones WHERE id = ?', [id]);
    res.json(successResponse(zone, '分区创建成功'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function updateZone(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { name, code, total_spaces, vehicle_type, status } = req.body;

    const db = await getDatabase();
    const existing = await db.get('SELECT * FROM parking_zones WHERE id = ?', [id]);
    
    if (!existing) {
      return res.json(errorResponse(-1, '分区不存在'));
    }

    await db.run(`
      UPDATE parking_zones 
      SET name = ?, code = ?, total_spaces = ?, vehicle_type = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      name || existing.name,
      code !== undefined ? code : existing.code,
      total_spaces !== undefined ? total_spaces : existing.total_spaces,
      vehicle_type || existing.vehicle_type,
      status || existing.status,
      id
    ]);

    const zone = await db.get('SELECT * FROM parking_zones WHERE id = ?', [id]);
    res.json(successResponse(zone, '分区更新成功'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function listZones(req: Request, res: Response) {
  try {
    const { lot_id } = req.query;
    const db = await getDatabase();
    
    let sql = 'SELECT * FROM parking_zones';
    const params: any[] = [];
    
    if (lot_id) {
      sql += ' WHERE lot_id = ?';
      params.push(lot_id);
    }
    sql += ' ORDER BY created_at DESC';
    
    const list = await db.all(sql, params);
    res.json(successResponse({ list }));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

export async function deleteZone(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const db = await getDatabase();
    await db.run('DELETE FROM parking_zones WHERE id = ?', [id]);
    res.json(successResponse(null, '删除成功'));
  } catch (err: any) {
    res.json(errorResponse(-1, err.message));
  }
}

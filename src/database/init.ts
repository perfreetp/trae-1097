import { getDatabase } from './connection';
import fs from 'fs';
import path from 'path';

async function initDatabase() {
  const db = await getDatabase();
  
  const dataDir = path.resolve(__dirname, '../../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS parking_lots (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      contact TEXT,
      phone TEXT,
      total_spaces INTEGER DEFAULT 0,
      available_spaces INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      business_hours TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS parking_zones (
      id TEXT PRIMARY KEY,
      lot_id TEXT NOT NULL,
      name TEXT NOT NULL,
      code TEXT,
      total_spaces INTEGER DEFAULT 0,
      available_spaces INTEGER DEFAULT 0,
      vehicle_type TEXT DEFAULT 'car',
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lot_id) REFERENCES parking_lots(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS parking_spaces (
      id TEXT PRIMARY KEY,
      lot_id TEXT NOT NULL,
      zone_id TEXT,
      space_no TEXT NOT NULL,
      status TEXT DEFAULT 'empty',
      vehicle_plate TEXT,
      vehicle_type TEXT DEFAULT 'car',
      last_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lot_id) REFERENCES parking_lots(id) ON DELETE CASCADE,
      FOREIGN KEY (zone_id) REFERENCES parking_zones(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS billing_rules (
      id TEXT PRIMARY KEY,
      lot_id TEXT,
      zone_id TEXT,
      name TEXT NOT NULL,
      rule_type TEXT DEFAULT 'hourly',
      free_minutes INTEGER DEFAULT 15,
      first_hour_price REAL DEFAULT 5,
      per_hour_price REAL DEFAULT 3,
      daily_max REAL DEFAULT 30,
      monthly_price REAL DEFAULT 300,
      vehicle_type TEXT DEFAULT 'car',
      is_default INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lot_id) REFERENCES parking_lots(id) ON DELETE CASCADE,
      FOREIGN KEY (zone_id) REFERENCES parking_zones(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      plate_number TEXT UNIQUE NOT NULL,
      vehicle_type TEXT DEFAULT 'car',
      owner_name TEXT,
      owner_phone TEXT,
      owner_id TEXT,
      color TEXT,
      brand TEXT,
      is_blacklist INTEGER DEFAULT 0,
      blacklist_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS parking_orders (
      id TEXT PRIMARY KEY,
      order_no TEXT UNIQUE NOT NULL,
      lot_id TEXT NOT NULL,
      zone_id TEXT,
      plate_number TEXT NOT NULL,
      space_id TEXT,
      entry_time DATETIME NOT NULL,
      exit_time DATETIME,
      parking_duration INTEGER,
      billing_rule_id TEXT,
      original_amount REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      coupon_amount REAL DEFAULT 0,
      final_amount REAL DEFAULT 0,
      paid_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'parking',
      payment_method TEXT,
      payment_time DATETIME,
      transaction_id TEXT,
      invoice_status TEXT DEFAULT 'none',
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lot_id) REFERENCES parking_lots(id),
      FOREIGN KEY (billing_rule_id) REFERENCES billing_rules(id)
    );

    CREATE TABLE IF NOT EXISTS entry_exit_events (
      id TEXT PRIMARY KEY,
      lot_id TEXT NOT NULL,
      gate_id TEXT,
      event_type TEXT NOT NULL,
      plate_number TEXT NOT NULL,
      vehicle_type TEXT DEFAULT 'car',
      event_time DATETIME NOT NULL,
      device_id TEXT,
      image_url TEXT,
      confidence REAL,
      operator TEXT,
      order_id TEXT,
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lot_id) REFERENCES parking_lots(id)
    );

    CREATE TABLE IF NOT EXISTS monthly_cards (
      id TEXT PRIMARY KEY,
      card_no TEXT UNIQUE NOT NULL,
      plate_number TEXT NOT NULL,
      lot_id TEXT,
      card_type TEXT DEFAULT 'monthly',
      holder_name TEXT,
      holder_phone TEXT,
      start_date DATETIME NOT NULL,
      end_date DATETIME NOT NULL,
      remaining_days INTEGER,
      price REAL DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS coupons (
      id TEXT PRIMARY KEY,
      coupon_no TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      coupon_type TEXT NOT NULL,
      value REAL NOT NULL,
      min_amount REAL DEFAULT 0,
      lot_id TEXT,
      applicable_plate TEXT,
      valid_start DATETIME,
      valid_end DATETIME,
      max_uses INTEGER DEFAULT 1,
      used_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      used_at DATETIME,
      used_order_id TEXT
    );

    CREATE TABLE IF NOT EXISTS visitor_discounts (
      id TEXT PRIMARY KEY,
      visitor_name TEXT,
      visitor_phone TEXT,
      plate_number TEXT NOT NULL,
      lot_id TEXT NOT NULL,
      host_name TEXT,
      host_unit TEXT,
      free_hours INTEGER DEFAULT 2,
      valid_start DATETIME NOT NULL,
      valid_end DATETIME NOT NULL,
      status TEXT DEFAULT 'active',
      used INTEGER DEFAULT 0,
      order_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS abnormal_events (
      id TEXT PRIMARY KEY,
      lot_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      plate_number TEXT,
      event_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      description TEXT,
      device_id TEXT,
      image_url TEXT,
      handled INTEGER DEFAULT 0,
      handled_by TEXT,
      handled_at DATETIME,
      handle_remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS device_heartbeats (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      lot_id TEXT,
      device_type TEXT,
      device_name TEXT,
      ip_address TEXT,
      status TEXT DEFAULT 'online',
      heartbeat_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      user_phone TEXT,
      notify_type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      channel TEXT DEFAULT 'app',
      order_id TEXT,
      plate_number TEXT,
      read INTEGER DEFAULT 0,
      sent INTEGER DEFAULT 0,
      sent_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoice_requests (
      id TEXT PRIMARY KEY,
      invoice_no TEXT UNIQUE NOT NULL,
      order_id TEXT NOT NULL,
      order_no TEXT NOT NULL,
      amount REAL NOT NULL,
      invoice_type TEXT DEFAULT 'personal',
      title TEXT NOT NULL,
      tax_no TEXT,
      email TEXT,
      phone TEXT,
      status TEXT DEFAULT 'pending',
      pdf_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS api_call_logs (
      id TEXT PRIMARY KEY,
      request_id TEXT,
      api_path TEXT NOT NULL,
      method TEXT NOT NULL,
      client_ip TEXT,
      user_agent TEXT,
      request_body TEXT,
      response_body TEXT,
      status_code INTEGER,
      duration INTEGER,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_orders_plate ON parking_orders(plate_number, status);
    CREATE INDEX IF NOT EXISTS idx_orders_lot ON parking_orders(lot_id, entry_time);
    CREATE INDEX IF NOT EXISTS idx_events_lot ON entry_exit_events(lot_id, event_time);
    CREATE INDEX IF NOT EXISTS idx_monthly_plate ON monthly_cards(plate_number, status);
    CREATE INDEX IF NOT EXISTS idx_coupon_no ON coupons(coupon_no, status);
  `);

  console.log('数据库初始化完成');
}

initDatabase().then(() => process.exit(0)).catch(err => {
  console.error('数据库初始化失败:', err);
  process.exit(1);
});

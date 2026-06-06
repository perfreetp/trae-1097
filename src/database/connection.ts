import * as sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.resolve(__dirname, '../../data/parking.db');

let dbInstance: sqlite3.Database | null = null;

function initDatabase() {
  if (!dbInstance) {
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    dbInstance = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('数据库连接失败:', err.message);
      }
    });
    
    dbInstance.run('PRAGMA journal_mode = WAL');
    dbInstance.run('PRAGMA foreign_keys = ON');
  }
  return dbInstance;
}

export function getDatabase() {
  initDatabase();
  return {
    run(sql: string, params: any[] = []): Promise<sqlite3.RunResult> {
      return new Promise((resolve, reject) => {
        dbInstance!.run(sql, params, function(this: sqlite3.RunResult, err: Error | null) {
          if (err) reject(err);
          else resolve(this);
        });
      });
    },
    get(sql: string, params: any[] = []): Promise<any> {
      return new Promise((resolve, reject) => {
        dbInstance!.get(sql, params, (err: Error | null, row: any) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    },
    all(sql: string, params: any[] = []): Promise<any[]> {
      return new Promise((resolve, reject) => {
        dbInstance!.all(sql, params, (err: Error | null, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    },
    exec(sql: string): Promise<void> {
      return new Promise((resolve, reject) => {
        dbInstance!.exec(sql, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  };
}

export function closeDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      dbInstance.close((err) => {
        if (err) reject(err);
        else {
          dbInstance = null;
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
}

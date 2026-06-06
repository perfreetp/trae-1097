import { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../database/connection';
import { generateId } from '../utils/helpers';

export async function apiLogger(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  const requestId = generateId();
  
  (req as any).requestId = requestId;
  
  const originalSend = res.send;
  let responseBody = '';
  
  res.send = function(this: any, body: any) {
    responseBody = typeof body === 'string' ? body : JSON.stringify(body);
    return originalSend.apply(this, arguments);
  };

  res.on('finish', async () => {
    try {
      const duration = Date.now() - startTime;
      const db = await getDatabase();
      
      let requestBody = '';
      if (req.body && Object.keys(req.body).length > 0) {
        requestBody = JSON.stringify(req.body);
      }
      
      await db.run(`
        INSERT INTO api_call_logs 
        (id, request_id, api_path, method, client_ip, user_agent, request_body, response_body, status_code, duration)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        generateId(),
        requestId,
        req.path,
        req.method,
        req.ip || req.socket.remoteAddress,
        req.headers['user-agent'] || '',
        requestBody.substring(0, 2000),
        responseBody.substring(0, 2000),
        res.statusCode,
        duration
      ]);
    } catch (err) {
      console.error('API日志记录失败:', err);
    }
  });

  next();
}

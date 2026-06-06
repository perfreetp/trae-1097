import express from 'express';
import cors from 'cors';
import routes from './routes';
import { apiLogger } from './middleware/apiLogger';
import { getDatabase } from './database/connection';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(apiLogger);

app.use('/api/v1', routes);

app.use((req, res) => {
  res.status(404).json({ code: -1, message: '接口不存在', path: req.path });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('服务器错误:', err);
  res.status(500).json({ code: -1, message: err.message || '服务器内部错误' });
});

async function startServer() {
  try {
    await getDatabase();
    console.log('数据库连接成功');
    
    app.listen(PORT, () => {
      console.log(`智慧停车后端服务已启动`);
      console.log(`服务地址: http://localhost:${PORT}`);
      console.log(`API前缀: http://localhost:${PORT}/api/v1`);
      console.log(`健康检查: http://localhost:${PORT}/api/v1/health`);
    });
  } catch (err) {
    console.error('服务启动失败:', err);
    process.exit(1);
  }
}

startServer();

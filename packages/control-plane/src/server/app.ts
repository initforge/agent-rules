import express from 'express';
import cors from 'cors';
import path from 'path';
import configRouter from '../routes/config';
import mutationRouter from '../routes/mutation';
import healthRouter from '../routes/health';
import runsRouter from '../routes/runs';
import auditRouter from '../routes/audit';
import plansRouter from '../routes/plans';
import { authMiddleware } from '../middleware/auth';

const app = express();

app.set('x-powered-by', false);
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'X-API-Key'],
}));
app.use(express.json({ limit: '10mb' }));

app.use(authMiddleware);

app.use('/api/config', configRouter);
app.use('/api/mutation', mutationRouter);
app.use('/api/health', healthRouter);
app.use('/api/runs', runsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/plans', plansRouter);

app.use(express.static(path.join(__dirname, '..', '..', 'client')));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'client', 'index.html'));
});

export { app };

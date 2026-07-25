import express from 'express';
import cors from 'cors';
import path from 'path';
import configRouter from '../routes/config';
import mutationRouter from '../routes/mutation';
import healthRouter from '../routes/health';
import runsRouter from '../routes/runs';
import auditRouter from '../routes/audit';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/config', configRouter);
app.use('/api/mutation', mutationRouter);
app.use('/api/health', healthRouter);
app.use('/api/runs', runsRouter);
app.use('/api/audit', auditRouter);

app.use(express.static(path.join(__dirname, '..', '..', 'dist', 'client')));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'dist', 'client', 'index.html'));
});

export { app };

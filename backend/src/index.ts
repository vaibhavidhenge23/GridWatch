import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import ingestRouter from './routes/ingest'
import sensorsRouter from './routes/sensors'
import alertsRouter from './routes/alerts'
import { authRouter, suppressionRouter } from './routes/auth'
import { startAnomalyWorker } from './workers/anomaly.worker'
import { startSilenceDetector, startEscalationJob } from './jobs/cron'

const app = express()
app.use(cors())
app.use(express.json({ limit: '5mb' }))  // large batches

app.use('/ingest', ingestRouter)
app.use('/sensors', sensorsRouter)
app.use('/alerts', alertsRouter)
app.use('/auth', authRouter)
app.use('/suppression', suppressionRouter)

app.get('/health', (_, res) => res.json({ ok: true }))

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`[server] running on port ${PORT}`)
  startAnomalyWorker()
  startSilenceDetector()
  startEscalationJob()
})

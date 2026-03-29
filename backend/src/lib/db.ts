import { Pool } from 'pg'

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,               // max 20 connections — enough for high concurrency
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

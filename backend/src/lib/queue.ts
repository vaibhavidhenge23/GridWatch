import Redis from 'ioredis'
import { EventEmitter } from 'events'

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  lazyConnect: true,         // don't connect immediately (avoids the version check crash)
  enableOfflineQueue: false, // fail fast if redis is down instead of queuing forever
})

// Simple in-process queue that replaces BullMQ when Redis < 5
// Same interface as BullMQ Queue: .add(name, data, opts)
class SimpleQueue extends EventEmitter {
  private handlers: Array<(job: { data: any }) => Promise<void>> = []

  add(_name: string, data: any, _opts?: any) {
    // Schedule async processing immediately in background
    setImmediate(async () => {
      for (const handler of this.handlers) {
        try {
          await handler({ data })
        } catch (err: any) {
          this.emit('failed', null, err)
        }
      }
    })
    return Promise.resolve({ id: Date.now().toString() })
  }

  // Called by the worker shim
  _register(handler: (job: { data: any }) => Promise<void>) {
    this.handlers.push(handler)
  }
}

// This queue receives batches from ingest, worker processes them async
export const readingsQueue = new SimpleQueue()

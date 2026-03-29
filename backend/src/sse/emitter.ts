import { Response } from 'express'

// Map: zone_id → list of active SSE connections
const clients = new Map<string, Set<Response>>()

export function addClient(zoneId: string, res: Response) {
  if (!clients.has(zoneId)) clients.set(zoneId, new Set())
  clients.get(zoneId)!.add(res)
}

export function removeClient(zoneId: string, res: Response) {
  clients.get(zoneId)?.delete(res)
}

// Called by workers after state change — only sends to operators in that zone
export function emitToZone(zoneId: string, event: string, data: unknown) {
  const zone = clients.get(zoneId)
  if (!zone) return
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  zone.forEach(res => {
    try { res.write(payload) }
    catch { zone.delete(res) }  // client disconnected
  })
}

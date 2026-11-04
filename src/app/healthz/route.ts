// Health check for Docker and uptime monitors. Deliberately imports nothing: it must answer
// without loading Payload or touching the database.
export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}

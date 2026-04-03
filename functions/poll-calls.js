// Railway Function: poll-calls
// Runs every minute via Railway cron
// Hits the poll-calls API endpoint on the main Gunner app

const POLL_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/api/cron/poll-calls`
  : 'https://gunner-claude-production.up.railway.app/api/cron/poll-calls'
const CRON_SECRET = process.env.CRON_SECRET ?? ''

export default async function() {
  const res = await fetch(POLL_URL, {
    headers: { 'Authorization': `Bearer ${CRON_SECRET}` },
  })
  const data = await res.json()
  console.log('[poll-calls]', JSON.stringify(data))
  return data
}

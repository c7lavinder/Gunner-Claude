// Railway Function: poll-calls
// Runs every minute via Railway cron
// Hits the poll-calls API endpoint on the main Gunner app

const POLL_URL = 'https://gunner-claude-production.up.railway.app/api/cron/poll-calls'
const CRON_SECRET = '350231d15d8fdaabf9a1429480dc1ac2'

export default async function() {
  const res = await fetch(POLL_URL, {
    headers: { 'Authorization': `Bearer ${CRON_SECRET}` },
  })
  const data = await res.json()
  console.log('[poll-calls]', JSON.stringify(data))
  return data
}

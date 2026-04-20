// scripts/visual-audit.ts
// Logs in with VISUAL_AUDIT_EMAIL/PASSWORD, screenshots every tenant page at 1440x900,
// then writes docs/audits/DESIGN_AUDIT.md flagging routes whose computed styles drift from docs/DESIGN.md tokens.
// No-op if VISUAL_AUDIT_EMAIL is unset. Reads creds from .env.local.
//
// Run:   npx tsx scripts/visual-audit.ts

import { promises as fs } from 'fs'
import path from 'path'
import { chromium, type Browser, type Page } from 'playwright'

// ─── env loader (no dotenv dep) ─────────────────────────────────────────────

async function loadEnvLocal(): Promise<void> {
  const envPath = path.join(process.cwd(), '.env.local')
  try {
    const raw = await fs.readFile(envPath, 'utf8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 0) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (process.env[key] === undefined) process.env[key] = value
    }
  } catch {
    // .env.local optional — vars may be set in the parent shell
  }
}

// ─── DESIGN.md tokens (kept in sync manually with docs/DESIGN.md) ──────────

const ALLOWED_BG_COLORS = new Set([
  'rgb(255, 255, 255)',  // --bg-primary
  'rgb(248, 247, 244)',  // --bg-secondary
  'rgb(240, 238, 233)',  // --bg-tertiary
  'rgba(0, 0, 0, 0)',    // transparent
])
const ALLOWED_BORDER_RADII = new Set(['0px', '6px', '10px', '14px', '20px', '9999px'])
// Body font must include the system stack (DESIGN.md "Always" rule)
const REQUIRED_FONT_TOKENS = ['system', 'apple', 'sf pro', 'blinkmacsystemfont']
const PURPLE_HEX = '#534AB7'
const PURPLE_RGB = 'rgb(83, 74, 183)'
const PURPLE_BG_RGB = 'rgb(238, 237, 254)'
const SPARKLE = '\u2726' // ✦

// ─── route discovery ────────────────────────────────────────────────────────

const ROUTES_ROOT = path.join(process.cwd(), 'app', '(tenant)', '[tenant]')
const SCREENSHOTS_DIR = path.join(process.cwd(), 'docs', 'audits', 'screenshots')
const REPORT_PATH = path.join(process.cwd(), 'docs', 'audits', 'DESIGN_AUDIT.md')

interface RouteEntry {
  routePath: string   // path relative to [tenant]/, e.g. "calls" or "inventory/[propertyId]"
  hasDynamic: boolean // true if it contains any [param] segment beyond [tenant]
}

async function findRoutes(): Promise<RouteEntry[]> {
  const out: RouteEntry[] = []
  async function walk(dir: string, rel: string) {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch { return }
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) {
        await walk(path.join(dir, e.name), childRel)
      } else if (e.name === 'page.tsx') {
        out.push({
          routePath: rel,
          hasDynamic: rel.split('/').some(seg => /^\[.+\]$/.test(seg)),
        })
      }
    }
  }
  await walk(ROUTES_ROOT, '')
  // Stable order
  out.sort((a, b) => a.routePath.localeCompare(b.routePath))
  return out
}

function routeUrl(tenant: string, routePath: string): string {
  return routePath ? `/${tenant}/${routePath}` : `/${tenant}`
}

function routeSlug(routePath: string): string {
  return routePath ? routePath.replace(/\//g, '-') : 'root'
}

// ─── auth ────────────────────────────────────────────────────────────────────

async function login(page: Page, baseUrl: string, email: string, password: string): Promise<void> {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await Promise.all([
    page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 30_000 }),
    page.click('button[type="submit"]'),
  ])
}

// ─── per-page audit ──────────────────────────────────────────────────────────

interface AuditFinding {
  routePath: string
  url: string
  status: 'audited' | 'nav_failed' | 'skipped_dynamic'
  issues: string[]
}

async function auditPage(page: Page): Promise<string[]> {
  const issues: string[] = []

  const data = await page.evaluate(({ allowedBgs, allowedRadii, purpleRgb, purpleBgRgb, sparkle }) => {
    const bodyBg = getComputedStyle(document.body).backgroundColor
    const bodyFont = getComputedStyle(document.body).fontFamily

    const badRadii: Array<{ tag: string; cls: string; radius: string }> = []
    const badBgs: Array<{ tag: string; cls: string; bg: string }> = []

    // Inspect anything that LOOKS like a card / panel / surface
    const candidates = document.querySelectorAll(
      '[class*="rounded"], [class*="card"], [class*="panel"], section, article, aside, dialog'
    )
    candidates.forEach((node) => {
      const el = node as HTMLElement
      const cs = getComputedStyle(el)
      const r = (cs.borderTopLeftRadius || cs.borderRadius || '').split(' ')[0]
      if (r && !allowedRadii.includes(r)) {
        if (badRadii.length < 5) {
          badRadii.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className || '').toString().slice(0, 60),
            radius: r,
          })
        }
      }
      const bg = cs.backgroundColor
      if (bg && !allowedBgs.includes(bg)) {
        if (badBgs.length < 5) {
          badBgs.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className || '').toString().slice(0, 60),
            bg,
          })
        }
      }
    })

    // AI-feature detection: look for ✦ marker or AI text labels, then verify purple is present
    const text = (document.body.innerText || '')
    const hasSparkle = text.includes(sparkle)
    const hasAiLabel = /\b(AI|✦)\b/.test(text)
    let hasPurple = false
    if (hasSparkle || hasAiLabel) {
      const all = document.querySelectorAll('button, [class*="badge"], [class*="ai"], [class*="purple"], svg')
      for (const node of Array.from(all)) {
        const cs = getComputedStyle(node as HTMLElement)
        if (cs.color === purpleRgb || cs.backgroundColor === purpleRgb || cs.backgroundColor === purpleBgRgb) {
          hasPurple = true
          break
        }
      }
    }

    return { bodyBg, bodyFont, badRadii, badBgs, hasSparkle, hasAiLabel, hasPurple }
  }, {
    allowedBgs: Array.from(ALLOWED_BG_COLORS),
    allowedRadii: Array.from(ALLOWED_BORDER_RADII),
    purpleRgb: PURPLE_RGB,
    purpleBgRgb: PURPLE_BG_RGB,
    sparkle: SPARKLE,
  })

  if (!ALLOWED_BG_COLORS.has(data.bodyBg)) {
    issues.push(`body background \`${data.bodyBg}\` is not in DESIGN.md surface tokens`)
  }
  const fontLower = data.bodyFont.toLowerCase()
  if (!REQUIRED_FONT_TOKENS.some(t => fontLower.includes(t))) {
    issues.push(`body font-family \`${data.bodyFont}\` is missing the system stack (Inter/Roboto/etc. are forbidden)`)
  }
  if (data.badRadii.length > 0) {
    const examples = data.badRadii.map(c => `${c.tag}.${c.cls.split(' ')[0]}=${c.radius}`).join(', ')
    issues.push(`${data.badRadii.length}+ element(s) with off-token border-radius (allowed: 6/10/14/20/9999px). e.g. ${examples}`)
  }
  if (data.badBgs.length > 0) {
    const examples = data.badBgs.map(c => `${c.tag}.${c.cls.split(' ')[0]}=${c.bg}`).join(', ')
    issues.push(`${data.badBgs.length}+ element(s) with off-token background color. e.g. ${examples}`)
  }
  if (data.hasAiLabel || data.hasSparkle) {
    if (!data.hasSparkle) issues.push(`AI feature(s) referenced but no ✦ marker rendered`)
    if (!data.hasPurple) issues.push(`AI feature(s) referenced but no element uses purple ${PURPLE_HEX}`)
  }

  return issues
}

// ─── report ──────────────────────────────────────────────────────────────────

function buildReport(findings: AuditFinding[], baseUrl: string, tenant: string): string {
  const audited = findings.filter(f => f.status === 'audited')
  const navFailed = findings.filter(f => f.status === 'nav_failed')
  const dynamic = findings.filter(f => f.status === 'skipped_dynamic')
  const drift = audited.filter(f => f.issues.length > 0)
  const clean = audited.filter(f => f.issues.length === 0)

  const lines: string[] = []
  lines.push('# Design Audit')
  lines.push('')
  lines.push(`Generated: ${new Date().toISOString()}`)
  lines.push(`Base URL: ${baseUrl}`)
  lines.push(`Tenant: ${tenant}`)
  lines.push(`Viewport: 1440x900`)
  lines.push(`Tokens source: docs/DESIGN.md`)
  lines.push('')
  lines.push(`Audited ${audited.length} routes \u2014 ${drift.length} drifting, ${clean.length} clean. ` +
             `Skipped ${dynamic.length} dynamic-param routes. ${navFailed.length} navigation failures.`)
  lines.push('')

  lines.push(`## Drift (${drift.length})`)
  lines.push('')
  if (drift.length === 0) {
    lines.push('_None \u2014 every audited route matches DESIGN.md tokens._')
  } else {
    for (const f of drift) {
      lines.push(`### \`${f.routePath || '/'}\``)
      lines.push(`URL: ${f.url}`)
      lines.push(`Screenshot: \`docs/audits/screenshots/${routeSlug(f.routePath)}.png\``)
      for (const issue of f.issues) lines.push(`- ${issue}`)
      lines.push('')
    }
  }

  if (navFailed.length > 0) {
    lines.push('')
    lines.push(`## Navigation failures (${navFailed.length})`)
    lines.push('')
    for (const f of navFailed) {
      lines.push(`- \`${f.routePath || '/'}\` \u2014 ${f.issues[0] ?? 'unknown error'}`)
    }
  }

  lines.push('')
  lines.push(`## Clean (${clean.length})`)
  lines.push('')
  for (const f of clean) lines.push(`- \`${f.routePath || '/'}\``)

  if (dynamic.length > 0) {
    lines.push('')
    lines.push(`## Skipped \u2014 dynamic params (${dynamic.length})`)
    lines.push('')
    lines.push('These routes need real IDs in the URL; supply them via dedicated audits if needed.')
    for (const f of dynamic) lines.push(`- \`${f.routePath}\``)
  }

  return lines.join('\n') + '\n'
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await loadEnvLocal()

  const email = process.env.VISUAL_AUDIT_EMAIL
  const password = process.env.VISUAL_AUDIT_PASSWORD
  const baseUrl = (process.env.VISUAL_AUDIT_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const tenant = process.env.VISUAL_AUDIT_TENANT ?? 'new-again-houses'

  if (!email) {
    console.log('[visual-audit] VISUAL_AUDIT_EMAIL not set \u2014 skipping (no-op).')
    return
  }
  if (!password) {
    console.error('[visual-audit] VISUAL_AUDIT_EMAIL set but VISUAL_AUDIT_PASSWORD missing.')
    process.exit(1)
  }

  const routes = await findRoutes()
  console.log(`[visual-audit] Found ${routes.length} pages under app/(tenant)/[tenant].`)

  await fs.mkdir(SCREENSHOTS_DIR, { recursive: true })
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true })

  let browser: Browser | null = null
  const findings: AuditFinding[] = []

  try {
    browser = await chromium.launch()
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()

    console.log(`[visual-audit] Logging in as ${email} at ${baseUrl}/login...`)
    await login(page, baseUrl, email, password)
    console.log(`[visual-audit] Login complete. Auditing routes...`)

    for (const r of routes) {
      const url = `${baseUrl}${routeUrl(tenant, r.routePath)}`
      if (r.hasDynamic) {
        findings.push({ routePath: r.routePath, url, status: 'skipped_dynamic', issues: [] })
        continue
      }
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
      } catch (err) {
        findings.push({
          routePath: r.routePath,
          url,
          status: 'nav_failed',
          issues: [`navigation failed: ${(err as Error).message}`],
        })
        console.log(`[visual-audit] \u2716 ${url} \u2014 nav failed`)
        continue
      }
      const slug = routeSlug(r.routePath)
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${slug}.png`), fullPage: true })
      const issues = await auditPage(page)
      findings.push({ routePath: r.routePath, url, status: 'audited', issues })
      console.log(`[visual-audit] \u2713 ${url} \u2014 ${issues.length} issue(s)`)
    }
  } finally {
    if (browser) await browser.close()
  }

  const report = buildReport(findings, baseUrl, tenant)
  await fs.writeFile(REPORT_PATH, report, 'utf8')
  console.log(`[visual-audit] Report: ${REPORT_PATH}`)
  console.log(`[visual-audit] Screenshots: ${SCREENSHOTS_DIR}`)
}

main().catch(err => {
  console.error('[visual-audit] Fatal:', err instanceof Error ? err.message : err)
  process.exit(1)
})

#!/usr/bin/env tsx
// scripts/audit.ts
// Gunner AI Self-Audit Agent — powered by Claude
// Schedule: Daily at 2am (configured in Railway cron)
// Run manually: npx tsx scripts/audit.ts

import { execSync } from 'child_process'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { anthropic } from '@/config/anthropic'

const ROOT = process.cwd()

async function runAudit() {
  console.log(`\n🔍 Gunner AI Self-Audit — ${new Date().toISOString()}\n`)

  const results: AuditResult[] = []

  // ── 1. TypeScript check ────────────────────────────────────────────────────
  console.log('Running TypeScript check...')
  try {
    execSync('npx tsc --noEmit', { cwd: ROOT, stdio: 'pipe' })
    results.push({ check: 'TypeScript', status: 'PASS', details: 'No type errors' })
  } catch (err) {
    const output = (err as { stdout?: Buffer }).stdout?.toString() ?? ''
    results.push({ check: 'TypeScript', status: 'FAIL', details: output.substring(0, 2000) })
  }

  // ── 2. Lint check ─────────────────────────────────────────────────────────
  console.log('Running ESLint...')
  try {
    execSync('npx next lint --quiet', { cwd: ROOT, stdio: 'pipe' })
    results.push({ check: 'ESLint', status: 'PASS', details: 'No lint errors' })
  } catch (err) {
    const output = (err as { stdout?: Buffer }).stdout?.toString() ?? ''
    results.push({ check: 'ESLint', status: 'WARN', details: output.substring(0, 2000) })
  }

  // ── 3. Missing env vars check ──────────────────────────────────────────────
  console.log('Checking environment variables...')
  const requiredEnvVars = [
    'NEXTAUTH_SECRET', 'NEXTAUTH_URL', 'DATABASE_URL', 'DIRECT_URL',
    'GHL_CLIENT_ID', 'GHL_CLIENT_SECRET', 'GHL_REDIRECT_URI', 'GHL_WEBHOOK_SECRET',
    'ANTHROPIC_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
  ]
  const missingEnvVars = requiredEnvVars.filter((v) => !process.env[v])
  results.push({
    check: 'Environment variables',
    status: missingEnvVars.length === 0 ? 'PASS' : 'WARN',
    details: missingEnvVars.length === 0
      ? 'All required env vars present'
      : `Missing: ${missingEnvVars.join(', ')}`,
  })

  // ── 4. Collect source files for AI review ─────────────────────────────────
  console.log('Collecting source files for AI review...')
  const sourceFiles = collectSourceFiles(join(ROOT, 'lib'), '.ts')
    .concat(collectSourceFiles(join(ROOT, 'app/api'), '.ts'))
    .slice(0, 15) // limit to avoid token overflow

  const fileContents = sourceFiles.map((f) => {
    const content = readFileSync(f, 'utf-8')
    const relativePath = f.replace(ROOT, '')
    return `\n// FILE: ${relativePath}\n${content.substring(0, 3000)}`
  }).join('\n\n---\n\n')

  // ── 5. AI code review ─────────────────────────────────────────────────────
  console.log('Running Claude AI code review...')
  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 3000,
      system: `You are a senior software engineer auditing the Gunner AI codebase.
This is a multi-tenant SaaS for real estate wholesalers built with Next.js 14, Prisma, Supabase, and the GHL API.

Review the code for:
1. Security issues (missing auth checks, SQL injection risk, exposed secrets)
2. Missing tenant isolation (queries without tenantId filter)
3. Error handling gaps (async functions without try/catch)
4. Performance issues (N+1 queries, missing indexes)
5. Code improvements (refactoring opportunities, DRY violations)

Respond with valid JSON only:
{
  "issues": [
    {
      "severity": "CRITICAL|ERROR|WARNING|INFO",
      "file": "<file path>",
      "issue": "<brief description>",
      "fix": "<specific fix recommendation>",
      "autoFixable": true|false
    }
  ],
  "summary": "<overall code health summary>",
  "score": <0-100>
}`,
      messages: [{
        role: 'user',
        content: `Review these source files:\n\n${fileContents}`,
      }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const clean = text.replace(/```json|```/g, '').trim()
    const aiReview: AIReview = JSON.parse(clean)

    results.push({
      check: 'AI Code Review',
      status: aiReview.score >= 80 ? 'PASS' : aiReview.score >= 60 ? 'WARN' : 'FAIL',
      details: `Score: ${aiReview.score}/100 — ${aiReview.summary}`,
      aiReview,
    })

    // Log critical issues
    const critical = aiReview.issues.filter((i) => i.severity === 'CRITICAL')
    if (critical.length > 0) {
      console.error(`\n⚠️  ${critical.length} CRITICAL issues found:`)
      critical.forEach((i) => console.error(`  - [${i.file}] ${i.issue}`))
    }
  } catch (err) {
    results.push({
      check: 'AI Code Review',
      status: 'WARN',
      details: `AI review failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    })
  }

  // ── 6. Print summary ──────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════')
  console.log('AUDIT RESULTS')
  console.log('═══════════════════════════════════════')
  results.forEach((r) => {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️ ' : '❌'
    console.log(`${icon} ${r.check}: ${r.details.substring(0, 100)}`)
  })

  const failures = results.filter((r) => r.status === 'FAIL').length
  const warnings = results.filter((r) => r.status === 'WARN').length
  console.log(`\nTotal: ${failures} failures, ${warnings} warnings`)

  if (failures > 0) {
    process.exit(1)
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function collectSourceFiles(dir: string, ext: string): string[] {
  try {
    const files: string[] = []
    const entries = readdirSync(dir)
    for (const entry of entries) {
      const full = join(dir, entry)
      const stat = statSync(full)
      if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
        files.push(...collectSourceFiles(full, ext))
      } else if (entry.endsWith(ext)) {
        files.push(full)
      }
    }
    return files
  } catch {
    return []
  }
}

interface AuditResult {
  check: string
  status: 'PASS' | 'WARN' | 'FAIL'
  details: string
  aiReview?: AIReview
}

interface AIReview {
  issues: Array<{
    severity: 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO'
    file: string
    issue: string
    fix: string
    autoFixable: boolean
  }>
  summary: string
  score: number
}

// Run
runAudit().catch((err) => {
  console.error('Audit failed:', err)
  process.exit(1)
})

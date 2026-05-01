// config/anthropic.ts
// Singleton Anthropic SDK client. All callers should import from here
// instead of doing `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })`
// inline. Centralizes env var access (per CLAUDE.md "All env vars go through
// config/env.ts") and prevents 15+ parallel client instances.

import Anthropic from '@anthropic-ai/sdk'
import { env } from './env'

export const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

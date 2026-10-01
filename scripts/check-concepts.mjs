#!/usr/bin/env node
// Verifies the concept ledger (context/Concepts.md) and active context links.
//
// 1. Every ledger code anchor resolves to an existing path.
// 2. Every "Also called" name appears in src/, context/archive/, or context/phases/, so a search
//    on a legacy word still lands somewhere.
// 3. Every relative Markdown link in active context documents resolves, including heading anchors.
//    Archived documents are history and are not checked.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ledgerPath = join(root, 'context/Concepts.md')
const errors = []

const walk = (dir, filter) => {
  const out = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...walk(path, filter))
    else if (filter(path)) out.push(path)
  }
  return out
}

// Split on commas that are outside backticks.
const splitList = (text) => {
  const items = []
  let current = ''
  let inCode = false
  for (const char of text) {
    if (char === '`') inCode = !inCode
    if (char === ',' && !inCode) {
      items.push(current)
      current = ''
    } else current += char
  }
  items.push(current)
  return items.map((item) => item.trim()).filter(Boolean)
}

// Collect each "- **Label:** value" field, joining wrapped continuation lines.
const readFields = (markdown) => {
  const entries = []
  let entry = null
  let field = null
  for (const line of markdown.split('\n')) {
    const heading = /^### (.+)$/.exec(line)
    if (heading) {
      entry = { name: heading[1], fields: {} }
      entries.push(entry)
      field = null
      continue
    }
    if (/^## /.test(line)) {
      entry = null
      continue
    }
    if (!entry) continue
    const match = /^- \*\*([^*]+):\*\* ?(.*)$/.exec(line)
    if (match) {
      field = match[1]
      entry.fields[field] = match[2]
    } else if (field && /^ {2}\S/.test(line)) {
      entry.fields[field] += ` ${line.trim()}`
    } else field = null
  }
  return entries
}

const ledger = readFileSync(ledgerPath, 'utf8')
const entries = readFields(ledger)
const requiredFields = [
  'Name',
  'Also called',
  'Kind',
  'Owner',
  'Definition',
  'Invariants',
  'Relates to',
  'Code anchors',
  'Status',
]
const kinds = new Set(['data', 'presentation', 'runtime', 'policy'])

const corpus = [
  ...walk(join(root, 'src'), () => true),
  ...walk(join(root, 'context/archive'), (path) => /\.(md|html)$/.test(path)),
  ...walk(join(root, 'context/phases'), (path) => path.endsWith('.md')),
]
  .map((path) => readFileSync(path, 'utf8').toLowerCase())
  .join('\n')

const toPattern = (term) =>
  new RegExp(
    term
      .toLowerCase()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/<\w+>/g, '.+?'),
  )

for (const entry of entries) {
  const where = `Concepts.md "${entry.name}"`
  for (const label of requiredFields) {
    if (!(label in entry.fields)) errors.push(`${where}: missing field "${label}"`)
  }
  const kind = entry.fields.Kind?.trim()
  if (kind && !kinds.has(kind)) errors.push(`${where}: unknown Kind "${kind}"`)

  const anchors = entry.fields['Code anchors'] ?? ''
  for (const [, path] of anchors.matchAll(/`([^`]+)`/g)) {
    if (!existsSync(join(root, path))) errors.push(`${where}: code anchor not found: ${path}`)
  }

  const aliases = entry.fields['Also called'] ?? ''
  if (aliases.trim() === 'none') continue
  for (const alias of splitList(aliases)) {
    const term = alias.replace(/`/g, '').trim()
    if (term && !toPattern(term).test(corpus)) {
      errors.push(`${where}: "Also called" name not found in src or history: ${term}`)
    }
  }
}

// Heading slugs follow GitHub's algorithm closely enough for this repository's headings.
const slug = (heading) =>
  heading
    .trim()
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-')

const anchorsFor = (path) => {
  const counts = new Map()
  const anchors = new Set()
  let inFence = false
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (/^```/.test(line)) inFence = !inFence
    const match = !inFence && /^#{1,6} (.+)$/.exec(line)
    if (!match) continue
    const base = slug(match[1])
    const count = counts.get(base) ?? 0
    counts.set(base, count + 1)
    anchors.add(count === 0 ? base : `${base}-${count}`)
  }
  return anchors
}

const activeDocs = walk(join(root, 'context'), (path) => path.endsWith('.md')).filter(
  (path) => !path.includes(`${join('context', 'archive')}`),
)
for (const doc of activeDocs) {
  const text = readFileSync(doc, 'utf8').replace(/```[\s\S]*?```/g, '')
  for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^[a-z]+:/i.test(target)) continue
    const [file, anchor] = target.split('#')
    const path = file ? resolve(dirname(doc), decodeURIComponent(file)) : doc
    const label = `${relative(root, doc)} → ${target}`
    if (!existsSync(path)) {
      errors.push(`broken link: ${label}`)
      continue
    }
    if (anchor && path.endsWith('.md') && !anchorsFor(path).has(anchor)) {
      errors.push(`broken anchor: ${label}`)
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'))
  console.error(`\n${errors.length} problem(s) found.`)
  process.exit(1)
}
console.log(
  `Concept ledger OK: ${entries.length} entries; links OK in ${activeDocs.length} documents.`,
)

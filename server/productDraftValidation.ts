import { randomUUID } from 'node:crypto'
import {
  ASSET_MAX_BYTES,
  COVER_MAX_BYTES,
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from './crowdDropConstants.js'

export type ValidationResult =
  | { ok: true }
  | { ok: false, reason: string }

export function validateTitle(title: unknown): ValidationResult {
  if (typeof title !== 'string')
    return { ok: false, reason: 'Title is required.' }
  const trimmed = title.trim()
  if (!trimmed)
    return { ok: false, reason: 'Title is required.' }
  if (trimmed.length > TITLE_MAX_LENGTH)
    return { ok: false, reason: `Title must be at most ${TITLE_MAX_LENGTH} characters.` }
  return { ok: true }
}

export function validateDescription(description: unknown): ValidationResult {
  if (typeof description !== 'string')
    return { ok: false, reason: 'Description is required.' }
  const trimmed = description.trim()
  if (!trimmed)
    return { ok: false, reason: 'Description is required.' }
  if (trimmed.length > DESCRIPTION_MAX_LENGTH)
    return { ok: false, reason: `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters.` }
  return { ok: true }
}

const BLOCKED_MIME_PREFIXES = [
  'text/html',
  'application/javascript',
  'text/javascript',
  'application/x-msdownload',
  'application/x-sh',
  'application/x-bat',
  'application/vnd.microsoft.portable-executable',
]

const COVER_ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp'])

const ASSET_ALLOWED = new Set([
  'application/pdf',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
  'text/markdown',
  'image/png',
  'image/jpeg',
  'image/webp',
])

function startsWithBytes(buffer: Buffer, bytes: number[]): boolean {
  if (buffer.length < bytes.length)
    return false
  return bytes.every((byte, index) => buffer[index] === byte)
}

export function sniffMime(buffer: Buffer, filename: string): string | null {
  if (startsWithBytes(buffer, [0x25, 0x50, 0x44, 0x46]))
    return 'application/pdf'
  if (startsWithBytes(buffer, [0x89, 0x50, 0x4E, 0x47]))
    return 'image/png'
  if (startsWithBytes(buffer, [0xFF, 0xD8, 0xFF]))
    return 'image/jpeg'
  if (buffer.length >= 12
    && buffer.slice(0, 4).toString('ascii') === 'RIFF'
    && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp'
  }
  if (startsWithBytes(buffer, [0x50, 0x4B, 0x03, 0x04])) {
    const lower = filename.toLowerCase()
    if (lower.endsWith('.docx'))
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    if (lower.endsWith('.xlsx'))
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    return 'application/zip'
  }

  const textSample = buffer.slice(0, 256).toString('utf8')
  if (/^[\t\r\n\x20-\x7E]*$/.test(textSample)) {
    const lower = filename.toLowerCase()
    if (lower.endsWith('.csv'))
      return 'text/csv'
    if (lower.endsWith('.md'))
      return 'text/markdown'
    return 'text/plain'
  }

  return null
}

export function validateCoverFile(buffer: Buffer, filename: string, declaredMime?: string): ValidationResult & { mime?: string } {
  if (buffer.length === 0)
    return { ok: false, reason: 'Cover image is required.' }
  if (buffer.length > COVER_MAX_BYTES)
    return { ok: false, reason: 'Cover image must be at most 2 MB.' }

  const sniffed = sniffMime(buffer, filename)
  if (!sniffed || !COVER_ALLOWED.has(sniffed))
    return { ok: false, reason: 'Cover must be PNG, JPEG, or WebP.' }

  if (declaredMime && !COVER_ALLOWED.has(declaredMime))
    return { ok: false, reason: 'Cover MIME type not allowed.' }

  for (const blocked of BLOCKED_MIME_PREFIXES) {
    if (declaredMime?.startsWith(blocked))
      return { ok: false, reason: 'Cover file type not allowed.' }
  }

  return { ok: true, mime: sniffed }
}

export function validateAssetFile(buffer: Buffer, filename: string, declaredMime?: string): ValidationResult & { mime?: string, label?: string } {
  if (buffer.length === 0)
    return { ok: false, reason: 'Digital file is required.' }
  if (buffer.length > ASSET_MAX_BYTES)
    return { ok: false, reason: 'Digital file must be at most 50 MB.' }

  const lower = filename.toLowerCase()
  for (const ext of ['.exe', '.bat', '.cmd', '.sh', '.msi', '.apk', '.dmg', '.js', '.html', '.htm', '.wasm']) {
    if (lower.endsWith(ext))
      return { ok: false, reason: 'File type not allowed.' }
  }

  const sniffed = sniffMime(buffer, filename)
  if (!sniffed || !ASSET_ALLOWED.has(sniffed))
    return { ok: false, reason: 'Digital file type not allowed for V1.' }

  if (declaredMime) {
    for (const blocked of BLOCKED_MIME_PREFIXES) {
      if (declaredMime.startsWith(blocked))
        return { ok: false, reason: 'Digital file type not allowed.' }
    }
  }

  return { ok: true, mime: sniffed, label: fileTypeLabel(sniffed, filename) }
}

export function fileTypeLabel(mime: string, filename: string): string {
  switch (mime) {
    case 'application/pdf': return 'PDF'
    case 'application/zip': return 'ZIP archive'
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': return 'Word document'
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': return 'Spreadsheet'
    case 'text/csv': return 'CSV'
    case 'text/plain': return 'Text file'
    case 'text/markdown': return 'Markdown'
    case 'image/png': return 'PNG image'
    case 'image/jpeg': return 'JPEG image'
    case 'image/webp': return 'WebP image'
    default: return filename.split('.').pop()?.toUpperCase() ?? 'File'
  }
}

export function storageExtension(mime: string, filename: string): string {
  switch (mime) {
    case 'application/pdf': return 'pdf'
    case 'application/zip': return 'zip'
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': return 'docx'
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': return 'xlsx'
    case 'text/csv': return 'csv'
    case 'text/plain': return 'txt'
    case 'text/markdown': return 'md'
    case 'image/png': return 'png'
    case 'image/jpeg': return 'jpg'
    case 'image/webp': return 'webp'
    default: {
      const ext = filename.split('.').pop()?.toLowerCase()
      return ext && ext.length <= 8 ? ext : 'bin'
    }
  }
}

export function buildStoragePath(kind: 'covers' | 'assets', sellerWallet: string): string {
  return `${kind}/${sellerWallet}/${randomUUID()}`
}

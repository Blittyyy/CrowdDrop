import type { IncomingMessage } from 'node:http'
import Busboy from 'busboy'
import { ASSET_MAX_BYTES } from './crowdDropConstants.ts'

export type ParsedFile = {
  buffer: Buffer
  mimeType: string
  filename: string
}

export type ParsedMultipart = {
  fields: Record<string, string>
  files: Record<string, ParsedFile>
}

export async function readJsonBody(req: IncomingMessage & { body?: unknown }): Promise<unknown> {
  if (req.body !== undefined && req.body !== null)
    return req.body

  const chunks: Buffer[] = []
  await new Promise<void>((resolve, reject) => {
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    })
    req.on('end', () => resolve())
    req.on('error', reject)
  })

  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw)
    return null
  return JSON.parse(raw) as unknown
}

export function parseMultipart(req: IncomingMessage): Promise<ParsedMultipart> {
  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {}
    const files: Record<string, ParsedFile> = {}
    const pending: Promise<void>[] = []

    const busboy = Busboy({
      headers: req.headers as Busboy.BusboyHeaders,
      limits: {
        files: 2,
        fileSize: ASSET_MAX_BYTES,
      },
    })

    busboy.on('field', (name, value) => {
      fields[name] = value
    })

    busboy.on('file', (name, stream, info) => {
      const task = new Promise<void>((fileResolve, fileReject) => {
        const chunks: Buffer[] = []
        stream.on('data', (chunk: Buffer) => chunks.push(chunk))
        stream.on('limit', () => fileReject(new Error(`File too large: ${name}.`)))
        stream.on('end', () => {
          files[name] = {
            buffer: Buffer.concat(chunks),
            mimeType: info.mimeType,
            filename: info.filename,
          }
          fileResolve()
        })
        stream.on('error', fileReject)
      })
      pending.push(task)
    })

    busboy.on('error', reject)
    busboy.on('finish', async () => {
      try {
        await Promise.all(pending)
        resolve({ fields, files })
      }
      catch (error) {
        reject(error)
      }
    })

    req.pipe(busboy)
  })
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header)
    return out
  for (const part of header.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=')
    if (!rawKey)
      continue
    out[rawKey] = decodeURIComponent(rest.join('='))
  }
  return out
}

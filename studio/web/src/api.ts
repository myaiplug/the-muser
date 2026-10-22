import type { Job, Status, Track } from './types'

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      msg = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail ?? body)
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}

const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export const api = {
  status: (refresh = false) => fetch(`/api/status${refresh ? '?refresh=true' : ''}`).then((r) => j<Status>(r)),
  tracks: () => fetch('/api/tracks').then((r) => j<Track[]>(r)),
  deleteTrack: (id: string) => fetch(`/api/tracks/${id}`, { method: 'DELETE' }).then((r) => j(r)),
  generate: (body: { prompt: string; duration_s: number; bpm?: number | null; key?: string; force_demo?: boolean }) =>
    post('/api/generate', body).then((r) => j<{ job_id: string }>(r)),
  split: (id: string, mode: '4stem' | '2stem') =>
    post(`/api/tracks/${id}/split`, { mode }).then((r) => j<{ job_id: string }>(r)),
  mix: (body: unknown) => post('/api/mix', body).then((r) => j<{ job_id: string }>(r)),
  export: (body: unknown) => post('/api/export', body).then((r) => j<{ job_id: string }>(r)),
  job: <T>(id: string) => fetch(`/api/jobs/${id}`).then((r) => j<Job<T>>(r)),
  upload: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return fetch('/api/upload', { method: 'POST', body: fd }).then((r) => j<{ track: Track }>(r))
  },
}

/** Poll a job until it finishes. */
export async function waitJob<T>(id: string, onMsg?: (m: string) => void): Promise<T> {
  for (;;) {
    const job = await api.job<T>(id)
    if (job.message && onMsg) onMsg(job.message)
    if (job.status === 'done') return job.result as T
    if (job.status === 'error') throw new Error(job.error || 'Job failed')
    await new Promise((r) => setTimeout(r, 400))
  }
}

export type ChatEvent = { event: string; data: any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** POST + read a Server-Sent-Events stream. */
export async function streamChat(
  body: { message: string; session_id?: string | null; model?: string | null },
  onEvent: (e: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`Chat failed: ${res.status}`)
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      let event = 'message'
      let data = ''
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7)
        else if (line.startsWith('data: ')) data += line.slice(6)
      }
      if (!data) continue
      try {
        onEvent({ event, data: JSON.parse(data) })
      } catch {
        onEvent({ event, data })
      }
    }
  }
}

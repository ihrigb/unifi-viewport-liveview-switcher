import { request } from 'undici'
import type { Dispatcher } from 'undici'

export type UnifiViewport = {
  id: string
  name: string
  modelKey: string
}

export type UnifiLiveview = {
  id: string
  name: string
  isDefault: boolean
  slots?: unknown[]
}

export type UnifiViewportState = {
  liveviewId: string | null
}

export class UnifiApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number
  ) {
    super(message)
    this.name = 'UnifiApiError'
  }
}

type ClientOptions = {
  nvrHost: string
  apiKey: string
  skipTlsVerify?: boolean
}

async function doRequest<T>(
  opts: ClientOptions,
  method: Dispatcher.HttpMethod,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `https://${opts.nvrHost}/proxy/protect/integration/v1${path}`
  const dispatcher = opts.skipTlsVerify
    ? new (await import('undici').then((m) => m.Agent))({
        connect: { rejectUnauthorized: false }
      })
    : undefined

  const headers: Record<string, string> = {
    'X-API-KEY': opts.apiKey,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }

  const { statusCode, body: responseBody } = await request(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    dispatcher
  })

  if (statusCode < 200 || statusCode >= 300) {
    const responseText = await responseBody.text().catch(() => '(unreadable)')
    throw new UnifiApiError(
      `API request failed: ${method} ${path} → ${statusCode}: ${responseText}`,
      statusCode
    )
  }

  const text = await responseBody.text()
  return JSON.parse(text) as T
}

export async function getViewports(opts: ClientOptions): Promise<UnifiViewport[]> {
  const data = await doRequest<UnifiViewport[]>(opts, 'GET', '/viewers')
  return data
}

export async function getLiveviews(opts: ClientOptions): Promise<UnifiLiveview[]> {
  const data = await doRequest<UnifiLiveview[]>(opts, 'GET', '/liveviews')
  return data
}

export async function getActiveView(
  opts: ClientOptions,
  viewportId: string
): Promise<UnifiViewportState> {
  const data = await doRequest<{ liveview?: { id: string } }>(
    opts,
    'GET',
    `/viewers/${viewportId}`
  )
  return { liveviewId: data.liveview?.id ?? null }
}

export async function setActiveView(
  opts: ClientOptions,
  viewportId: string,
  liveviewId: string
): Promise<void> {
  await doRequest(opts, 'PATCH', `/viewers/${viewportId}`, { liveview: liveviewId })
}

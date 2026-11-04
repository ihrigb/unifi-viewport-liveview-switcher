import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MockInstance } from 'vitest'

// Mock undici before importing the module under test
vi.mock('undici', async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return {
    ...actual,
    request: vi.fn(),
  }
})

import * as undici from 'undici'
import {
  getViewports,
  getLiveviews,
  getActiveView,
  setActiveView,
  UnifiApiError,
} from './unifi-api'

const mockRequest = undici.request as unknown as MockInstance

const baseOpts = {
  nvrHost: 'nvr.local',
  apiKey: 'test-key',
}

function makeResponse(statusCode: number, body: unknown) {
  return {
    statusCode,
    body: {
      text: () => Promise.resolve(JSON.stringify(body)),
    },
  }
}

beforeEach(() => {
  mockRequest.mockReset()
})

// ---------------------------------------------------------------------------
// getViewports
// ---------------------------------------------------------------------------

describe('getViewports', () => {
  it('calls GET /viewers and returns the array', async () => {
    const viewports = [{ id: 'v1', name: 'Screen 1', modelKey: 'viewport' }]
    mockRequest.mockResolvedValue(makeResponse(200, viewports))

    const result = await getViewports(baseOpts)

    expect(result).toEqual(viewports)
    expect(mockRequest).toHaveBeenCalledOnce()
    const [url, init] = mockRequest.mock.calls[0]
    expect(url).toBe('https://nvr.local/proxy/protect/integration/v1/viewers')
    expect(init.method).toBe('GET')
    expect(init.headers['X-API-KEY']).toBe('test-key')
  })

  it('throws UnifiApiError on non-2xx', async () => {
    mockRequest.mockResolvedValue({
      statusCode: 401,
      body: { text: () => Promise.resolve('Unauthorized') },
    })

    await expect(getViewports(baseOpts)).rejects.toThrow(UnifiApiError)
    await expect(getViewports(baseOpts)).rejects.toMatchObject({ statusCode: 401 })
  })
})

// ---------------------------------------------------------------------------
// getLiveviews
// ---------------------------------------------------------------------------

describe('getLiveviews', () => {
  it('calls GET /liveviews and returns the array', async () => {
    const liveviews = [{ id: 'l1', name: 'All cams', isDefault: true }]
    mockRequest.mockResolvedValue(makeResponse(200, liveviews))

    const result = await getLiveviews(baseOpts)

    expect(result).toEqual(liveviews)
    const [url, init] = mockRequest.mock.calls[0]
    expect(url).toBe('https://nvr.local/proxy/protect/integration/v1/liveviews')
    expect(init.method).toBe('GET')
  })
})

// ---------------------------------------------------------------------------
// getActiveView
// ---------------------------------------------------------------------------

describe('getActiveView', () => {
  it('returns liveviewId from the liveview field', async () => {
    mockRequest.mockResolvedValue(makeResponse(200, { liveview: 'l1' }))

    const result = await getActiveView(baseOpts, 'vp1')

    expect(result).toEqual({ liveviewId: 'l1' })
    const [url] = mockRequest.mock.calls[0]
    expect(url).toBe('https://nvr.local/proxy/protect/integration/v1/viewers/vp1')
  })

  it('returns liveviewId: null when liveview is null', async () => {
    mockRequest.mockResolvedValue(makeResponse(200, { liveview: null }))

    const result = await getActiveView(baseOpts, 'vp1')

    expect(result).toEqual({ liveviewId: null })
  })

  it('returns liveviewId: null when liveview field is absent', async () => {
    mockRequest.mockResolvedValue(makeResponse(200, {}))

    const result = await getActiveView(baseOpts, 'vp1')

    expect(result).toEqual({ liveviewId: null })
  })

  it('throws UnifiApiError with correct statusCode on 403', async () => {
    mockRequest.mockResolvedValue({
      statusCode: 403,
      body: { text: () => Promise.resolve('Forbidden') },
    })

    await expect(getActiveView(baseOpts, 'vp1')).rejects.toThrow(UnifiApiError)
    await expect(getActiveView(baseOpts, 'vp1')).rejects.toMatchObject({ statusCode: 403 })
  })
})

// ---------------------------------------------------------------------------
// setActiveView
// ---------------------------------------------------------------------------

describe('setActiveView', () => {
  it('calls PATCH /viewers/:id with the liveview body', async () => {
    mockRequest.mockResolvedValue(makeResponse(200, {}))

    await setActiveView(baseOpts, 'vp1', 'l2')

    const [url, init] = mockRequest.mock.calls[0]
    expect(url).toBe('https://nvr.local/proxy/protect/integration/v1/viewers/vp1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ liveview: 'l2' })
  })

  it('throws UnifiApiError on 500', async () => {
    mockRequest.mockResolvedValue({
      statusCode: 500,
      body: { text: () => Promise.resolve('Server Error') },
    })

    await expect(setActiveView(baseOpts, 'vp1', 'l2')).rejects.toThrow(UnifiApiError)
    await expect(setActiveView(baseOpts, 'vp1', 'l2')).rejects.toMatchObject({ statusCode: 500 })
  })
})

// ---------------------------------------------------------------------------
// skipTlsVerify dispatcher
// ---------------------------------------------------------------------------

describe('skipTlsVerify', () => {
  it('passes no dispatcher when skipTlsVerify is false', async () => {
    mockRequest.mockResolvedValue(makeResponse(200, []))

    await getViewports({ ...baseOpts, skipTlsVerify: false })

    const [, init] = mockRequest.mock.calls[0]
    expect(init.dispatcher).toBeUndefined()
  })

  it('passes a custom dispatcher when skipTlsVerify is true', async () => {
    mockRequest.mockResolvedValue(makeResponse(200, []))

    await getViewports({ ...baseOpts, skipTlsVerify: true })

    const [, init] = mockRequest.mock.calls[0]
    expect(init.dispatcher).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// UnifiApiError shape
// ---------------------------------------------------------------------------

describe('UnifiApiError', () => {
  it('carries name, message, and statusCode', () => {
    const err = new UnifiApiError('bad request', 400)
    expect(err.name).toBe('UnifiApiError')
    expect(err.message).toBe('bad request')
    expect(err.statusCode).toBe(400)
    expect(err).toBeInstanceOf(Error)
  })

  it('works without a statusCode', () => {
    const err = new UnifiApiError('unknown')
    expect(err.statusCode).toBeUndefined()
  })
})

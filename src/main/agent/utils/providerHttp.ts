import { logger } from '../../utils/logger'

/**
 * Shared streaming-fetch retry policy for all providers
 * (1:1 with Claude Code services/api/withRetry.ts, adapted to our sync fetch).
 *
 * - Retries transient failures: HTTP 429 / 5xx and network-level fetch errors.
 * - Never retries aborts (AbortError) or non-transient 4xx.
 * - Default 3 retries (cc-haha defaults to 10; ours stays conservative until
 *   a need for longer storms is proven). Override via
 *   CLAUDE_STREAM_TRANSIENT_RETRY_MAX (env parity with cc-haha).
 * - Delay: fixed 2s by default; NEXUS_PROVIDER_RETRY_DELAY_MS overrides
 *   (used by tests to keep retry storms fast).
 */

export function getProviderMaxRetries(): number {
  const parsed = parseInt(process.env.CLAUDE_STREAM_TRANSIENT_RETRY_MAX || '', 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 3
}

function retryDelayMs(): number {
  const parsed = parseInt(process.env.NEXUS_PROVIDER_RETRY_DELAY_MS || '', 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 2000
}

export interface FetchWithRetryOptions {
  url: string
  init: RequestInit
  /** Provider label for logs / status updates. */
  provider: string
  model?: string
  onStatusUpdate?: (message: string) => void
  signal?: AbortSignal
}

export async function fetchWithStreamingRetry(options: FetchWithRetryOptions): Promise<Response> {
  const maxRetries = getProviderMaxRetries()
  let retries = 0

  while (true) {
    let response: Response
    try {
      response = (await fetch(options.url, {
        ...options.init,
        signal: options.signal,
      })) as Response
    } catch (err: any) {
      if (err?.name === 'AbortError' || options.signal?.aborted) throw err
      if (retries >= maxRetries) {
        throw new Error(
          `Request failed to ${options.url} (model: ${options.model ?? 'n/a'}): ${err?.message}`
        )
      }
      retries++
      logger.warn(
        options.provider,
        `Network error on ${options.url}: ${err?.message} — retrying (attempt ${retries}/${maxRetries})`
      )
      options.onStatusUpdate?.(
        `Network error: ${err?.message}. Retrying in ${retryDelayMs() / 1000}s (attempt ${retries}/${maxRetries})...`
      )
      await new Promise((r) => setTimeout(r, retryDelayMs()))
      continue
    }

    if (response.ok) return response

    const errorText = await response.text().catch(() => '')
    const transient = response.status === 429 || response.status >= 500
    if (!transient || retries >= maxRetries) {
      logger.error(
        options.provider,
        `LLM API Error (${response.status}) on ${options.url}: ${errorText}`,
        { status: response.status, model: options.model, url: options.url }
      )
      throw new Error(`LLM Provider API error (${response.status}): ${errorText}`)
    }

    retries++
    logger.warn(
      options.provider,
      `Transient ${response.status} on ${options.url} — retrying (attempt ${retries}/${maxRetries})`
    )
    options.onStatusUpdate?.(
      `Rate limited or server error (${response.status}). Retrying in ${retryDelayMs() / 1000}s (attempt ${retries}/${maxRetries})...`
    )
    await new Promise((r) => setTimeout(r, retryDelayMs()))
  }
}

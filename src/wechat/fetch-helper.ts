import { logger } from "../logger.js";

interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export async function fetchWithRetry(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const {
    method = "GET",
    headers = {},
    body,
    timeout = 30000,
    retries = 3,
    retryDelay = 2000,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      logger.debug(`Fetch attempt ${attempt}/${retries}`, { url, method });

      const res = await fetch(url, {
        method,
        headers: {
          "User-Agent": "WeChat-OpenCode-Bridge/1.1.0",
          ...headers,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err instanceof Error ? err : new Error(String(err));

      logger.warn(`Fetch attempt ${attempt} failed`, {
        url,
        error: lastError.message,
      });

      if (attempt < retries) {
        logger.debug(`Retrying in ${retryDelay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }

  throw lastError || new Error("Fetch failed after retries");
}

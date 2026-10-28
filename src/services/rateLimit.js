// Egyszerű csúszóablakos limiter: max `limit` hívás / `windowMs`.
const LIMIT = 40;
const WINDOW_MS = 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let calls = [];
let blockedUntil = 0;
let chain = Promise.resolve();

const waitForSlot = async () => {
  for (;;) {
    const now = Date.now();
    calls = calls.filter((t) => now - t < WINDOW_MS);
    if (now < blockedUntil) {
      await sleep(blockedUntil - now);
    } else if (calls.length >= LIMIT) {
      await sleep(WINDOW_MS - (now - calls[0]) + 50);
    } else {
      calls.push(now);
      return;
    }
  }
};

// A hívások sorban futnak; 429-nél a Retry-After (mp) után újrapróbál.
export const rateLimitedFetch = (url, options, retries = 2) => {
  const run = async () => {
    await waitForSlot();
    const response = await fetch(url, options);
    if (response.status === 429 && retries > 0) {
      const retryAfter = Number(response.headers.get('Retry-After')) || 5;
      blockedUntil = Date.now() + retryAfter * 1000;
      return rateLimitedFetch(url, options, retries - 1);
    }
    return response;
  };
  const result = chain.then(run);
  chain = result.catch(() => {});
  return result;
};

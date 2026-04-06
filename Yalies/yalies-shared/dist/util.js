const MAX_RETRIES = 3;
export async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export async function fetchWithRetry(url, options = {}, maxRetries = MAX_RETRIES) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(url, options);
            // Allow 3xx through when redirect: "manual" is set (caller handles redirects)
            if (!response.ok && !(response.status >= 300 && response.status < 400)) {
                const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
                error.status = response.status;
                throw error;
            }
            return response;
        }
        catch (e) {
            const err = e;
            // Don't retry client errors (4xx) except 429
            if (err.status && err.status >= 400 && err.status < 500 && err.status !== 429) {
                throw e;
            }
            if (attempt === maxRetries - 1)
                throw e;
            const wait = Math.pow(2, attempt) * 1000;
            console.log(`  Retry ${attempt + 1}/${maxRetries} after ${wait}ms: ${err.message}`);
            await sleep(wait);
        }
    }
    throw new Error("fetchWithRetry: unreachable");
}
//# sourceMappingURL=util.js.map
const RESULT_ENDPOINT = '/api/fetch_results';
const REQUEST_TIMEOUT = 320000;

function statusMessage(status) {
  if (status === 403) return 'The request expired. Please try again.';
  if (status === 413) return 'The request was too large.';
  if (status === 429) return 'Too many requests. Wait a minute and try again.';
  if (status === 502 || status === 503 || status === 504) {
    return 'The KTU portal is not responding. Please try again.';
  }
  return 'Failed to fetch results.';
}

function parsePayload(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function emitLog(onLog, message) {
  if (!onLog || !message) return;
  try {
    onLog(message);
  } catch {
    return;
  }
}

async function requestJson(url, options, signal) {
  const response = await fetch(url, {
    ...options,
    signal,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...options.headers,
    },
  });

  const payload = parsePayload(await response.text());

  if (!response.ok) {
    throw new Error(payload?.error || statusMessage(response.status));
  }

  if (!payload || payload.success !== true) {
    throw new Error(payload?.error || 'The results service returned an invalid response.');
  }

  return payload;
}

function readEvent(line, onLog) {
  const event = parsePayload(line);
  if (!event || typeof event !== 'object') return null;

  if (event.type === 'log') {
    emitLog(onLog, typeof event.message === 'string' ? event.message : '');
    return null;
  }

  if (event.type === 'error' || event.success === false) {
    return { error: new Error(event.error || 'Failed to fetch results.') };
  }

  if (event.type === 'result' || event.success === true) {
    if (!event.data) {
      return { error: new Error('The results service returned an invalid response.') };
    }
    return { payload: event };
  }

  return null;
}

async function readStream(response, onLog) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    const lines = text.split('\n');
    let outcome = null;
    for (const line of lines) {
      if (!line.trim()) continue;
      outcome = readEvent(line.trim(), onLog);
      if (outcome) break;
    }
    if (outcome?.error) throw outcome.error;
    if (outcome?.payload) return outcome.payload;
    throw new Error('The results service ended unexpectedly. Please try again.');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let outcome = null;

  try {
    while (!outcome) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      let index = buffer.indexOf('\n');

      while (index !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);

        if (line) {
          outcome = readEvent(line, onLog);
          if (outcome) break;
        }

        index = buffer.indexOf('\n');
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  if (!outcome && buffer.trim()) {
    outcome = readEvent(buffer.trim(), onLog);
  }

  if (outcome?.error) throw outcome.error;
  if (outcome?.payload) return outcome.payload;
  throw new Error('The results service ended unexpectedly. Please try again.');
}

async function readResultResponse(response, onLog) {
  const type = (response.headers.get('content-type') || '').toLowerCase();

  if (!response.ok) {
    const payload = parsePayload(await response.text());
    throw new Error(payload?.error || statusMessage(response.status));
  }

  if (type.includes('application/x-ndjson')) {
    return readStream(response, onLog);
  }

  const payload = parsePayload(await response.text());
  if (!payload || payload.success !== true) {
    throw new Error(payload?.error || 'The results service returned an invalid response.');
  }

  return payload;
}

export async function requestResults({ username, password, semesterId, onLog }) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    emitLog(onLog, 'Requesting a secure session token');

    const tokenPayload = await requestJson(
      RESULT_ENDPOINT,
      { method: 'GET' },
      controller.signal,
    );

    if (!tokenPayload.token) {
      throw new Error('The results service did not return a request token.');
    }

    emitLog(onLog, 'Token received. Starting the KTU portal session');

    const response = await fetch(RESULT_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        Accept: 'application/x-ndjson',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username,
        password,
        semesterId,
        token: tokenPayload.token,
      }),
    });

    return await readResultResponse(response, onLog);
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('The request took too long. Please try again.');
    }
    if (error instanceof TypeError) {
      throw new Error('Could not reach the results service. Please try again.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

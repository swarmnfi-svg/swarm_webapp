const ESP_TIMEOUT_MS = 8000;

function espUrl(ip, path) {
  return `http://${ip.trim()}${path}`;
}

async function espFetch(ip, path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ESP_TIMEOUT_MS);
  try {
    const res = await fetch(espUrl(ip, path), {
      ...options,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 401) {
        throw new Error('Wrong device password');
      }
      throw new Error(text || `ESP returned ${res.status}`);
    }
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return res.json();
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(
        `Cannot reach ESP at ${ip}. Open http://${ip}/info in your browser first. `
        + 'If Wi-Fi failed, join SWARM-Setup hotspot and use http://192.168.4.1/setup.',
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Browser calls ESP directly — cloud backend cannot reach LAN IPs. */
export async function fetchEspInfo(ip) {
  return espFetch(ip, '/info');
}

export async function fetchEspStatus(ip, password) {
  return espFetch(ip, '/api/status', {
    headers: { 'X-Device-Password': password.trim() },
  });
}

export async function configureEsp(ip, password, config) {
  return espFetch(ip, '/swarm/configure', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Password': password.trim(),
    },
    body: JSON.stringify(config),
  });
}

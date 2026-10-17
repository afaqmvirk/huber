let configuration;
let queue = Promise.resolve();
let capsule = sessionStorage.getItem('huber-demo-capsule') || '';

async function send(path, method, body, token) {
  configuration ||= fetch('/hosted-config.json').then(response => response.json());
  const { gateway } = await configuration;
  if (!gateway) {
    const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  }
  const response = await fetch('/api/gateway', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(capsule ? { capsule } : {}), requests: [{ path, method, body, token }] }) });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 || response.status === 413) { capsule = ''; sessionStorage.removeItem('huber-demo-capsule'); }
    throw new Error(result.error || 'The stable hit a snag. Try again.');
  }
  capsule = result.capsule;
  sessionStorage.setItem('huber-demo-capsule', capsule);
  return result.results[0];
}

export function apiCall(path, method = 'GET', body, token = '') {
  const result = queue.then(() => send(path, method, body, token)).then(result => {
    if (result.status < 200 || result.status >= 300) throw new Error(result.body.error || 'The stable hit a snag. Try again.');
    return result.body;
  });
  queue = result.catch(() => {});
  return result;
}

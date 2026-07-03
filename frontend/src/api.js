// Thin wrapper around fetch pointed at the deployed backend.
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const TIMEOUT_MS = 10000; // never let a slow/unstable connection hang the UI

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      ...options,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Connection timed out — check your internet');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  baseUrl: BASE,

  login: (role, pin) =>
    request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ role, pin }),
    }),

  getItems: () => request('/api/items'),
  addItem: (item) =>
    request('/api/items', { method: 'POST', body: JSON.stringify(item) }),
  updateItem: (id, item) =>
    request(`/api/items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(item),
    }),
  deleteItem: (id) => request(`/api/items/${id}`, { method: 'DELETE' }),

  createOrder: (order) =>
    request('/api/orders', {
      method: 'POST',
      body: JSON.stringify(order),
    }),
  getOrders: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v)
    ).toString();
    return request(`/api/orders${qs ? `?${qs}` : ''}`);
  },
  getOrder: (id) => request(`/api/orders/${id}`),
  setOrderStatus: (id, order_status) =>
    request(`/api/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ order_status }),
    }),
  setOrderPayment: (id, payment_status, payment_method) =>
    request(`/api/orders/${id}/payment`, {
      method: 'PATCH',
      body: JSON.stringify({ payment_status, payment_method }),
    }),
  deleteOrder: (id) => request(`/api/orders/${id}`, { method: 'DELETE' }),

  getDashboard: () => request('/api/dashboard'),
  syncOrders: (orders) =>
    request('/api/sync', {
      method: 'POST',
      body: JSON.stringify({ orders }),
    }),

  trackOrders: (block, room_no) =>
    request(
      `/api/track?block=${encodeURIComponent(block)}&room_no=${encodeURIComponent(room_no)}`
    ),

  getSettings: () => request('/api/settings'),
  updateSettings: (updates) =>
    request('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  exportCsvUrl: () => `${BASE}/api/export/csv`,
};

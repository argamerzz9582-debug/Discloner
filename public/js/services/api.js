/**
 * REST helper used for bootstrap data (features, queue, resumable jobs) and for
 * the REST job controls. Socket.IO carries the hot path; REST covers reloads
 * and non-socket clients.
 */

/**
 * @param {string} path
 * @param {RequestInit} [options]
 */
async function request(path, options = {}) {
    const response = await fetch(path, {
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', ...(options.headers || {}) },
        ...options
    });

    let payload = null;
    try {
        payload = await response.json();
    } catch {
        payload = null;
    }

    if (!response.ok) {
        const error = new Error(payload?.error || `Request failed (${response.status})`);
        // @ts-ignore - structured fields for callers
        error.code = payload?.code || 'HTTP_ERROR';
        // @ts-ignore
        error.status = response.status;
        throw error;
    }
    return payload;
}

export const api = {
    health: () => request('/api/health'),
    features: () => request('/api/features'),
    jobs: (limit = 25) => request(`/api/jobs?limit=${encodeURIComponent(limit)}`),
    job: (id) => request(`/api/jobs/${encodeURIComponent(id)}`),
    queue: () => request('/api/queue'),
    resumable: () => request('/api/jobs/resumable'),

    /**
     * @param {{ mode?: string, userToken: string, sourceId: string, targetId: string, options?: any, priority?: string }} payload
     */
    startJob: (payload) => request('/api/jobs', { method: 'POST', body: JSON.stringify(payload) }),

    /**
     * @param {string} id
     * @param {string} token
     */
    cancel: (id, token) => request(`/api/jobs/${encodeURIComponent(id)}/cancel?token=${encodeURIComponent(token || '')}`, { method: 'POST' }),

    /**
     * @param {string} id
     * @param {string} token
     */
    pause: (id, token) => request(`/api/jobs/${encodeURIComponent(id)}/pause?token=${encodeURIComponent(token || '')}`, { method: 'POST' }),

    /**
     * @param {string} id
     * @param {{ userToken: string, resumeKey: string, sourceId?: string, targetId?: string }} body
     */
    resume: (id, body) => request(`/api/jobs/${encodeURIComponent(id)}/resume`, { method: 'POST', body: JSON.stringify(body) })
};

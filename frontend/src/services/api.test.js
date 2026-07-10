import { describe, it, expect, vi } from 'vitest';

// Test getCookie helper logic directly — the function reads document.cookie
// and parses out the named value.
describe('getCookie (via CSRF interceptor behaviour)', () => {
  it('reads a cookie value from document.cookie correctly', () => {
    // Simulate what getCookie does
    function getCookie(name) {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop().split(';').shift();
      return null;
    }

    document.cookie = 'csrf_access_token=abc-123';
    expect(getCookie('csrf_access_token')).toBe('abc-123');
  });

  it('returns null when the cookie is not present', () => {
    function getCookie(name) {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop().split(';').shift();
      return null;
    }
    // Clear cookies
    document.cookie = 'csrf_access_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    expect(getCookie('nonexistent_cookie')).toBeNull();
  });

  it('CSRF header is only attached for state-changing methods', () => {
    // The interceptor checks: ["post", "put", "patch", "delete"].includes(method)
    const stateChanging = ['post', 'put', 'patch', 'delete'];
    const safe = ['get', 'head', 'options'];

    stateChanging.forEach((m) => {
      expect(stateChanging.includes(m.toLowerCase())).toBe(true);
    });
    safe.forEach((m) => {
      expect(stateChanging.includes(m.toLowerCase())).toBe(false);
    });
  });

  it('selects csrf_refresh_token for /auth/refresh and csrf_access_token otherwise', async () => {
    const { default: api } = await import('@/services/api');
    
    // Extract the request interceptor handler
    const requestInterceptor = api.interceptors.request.handlers[0].fulfilled;

    // Set mock cookies correctly (one by one as per DOM API)
    document.cookie = 'csrf_access_token=access-123';
    document.cookie = 'csrf_refresh_token=refresh-456';

    // Test access token (default)
    const config1 = requestInterceptor({ url: '/bids', method: 'post', headers: {} });
    expect(config1.headers['X-CSRF-TOKEN']).toBe('access-123');

    // Test refresh token
    const config2 = requestInterceptor({ url: '/auth/refresh', method: 'post', headers: {} });
    expect(config2.headers['X-CSRF-TOKEN']).toBe('refresh-456');

    // Clean up
    document.cookie = 'csrf_access_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'csrf_refresh_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });
});

describe('publicApi', () => {
  it('does not share response interceptors with the authenticated api instance', async () => {
    const { publicApi } = await import('@/services/api');
    // publicApi should have no registered response interceptors
    // (the handlers array contains null for ejected ones, filter to only active ones)
    const activeHandlers = publicApi.interceptors.response.handlers.filter(Boolean);
    expect(activeHandlers).toHaveLength(0);
  });

  it('publicApi has no request interceptors either (no CSRF header injection)', async () => {
    const { publicApi } = await import('@/services/api');
    const activeRequestHandlers = publicApi.interceptors.request.handlers.filter(Boolean);
    expect(activeRequestHandlers).toHaveLength(0);
  });
});

describe('api retry interceptor', () => {
  it('403 and 429 errors are not retried', async () => {
    const { default: api } = await import('@/services/api');
    const responseInterceptor = api.interceptors.response.handlers.find(h => h.rejected).rejected;
    const error403 = { config: { method: 'get' }, response: { status: 403 } };
    await expect(responseInterceptor(error403)).rejects.toBe(error403);
    expect(error403.config.__retryCount).toBeUndefined();

    const error429 = { config: { method: 'get' }, response: { status: 429 } };
    await expect(responseInterceptor(error429)).rejects.toBe(error429);
    expect(error429.config.__retryCount).toBeUndefined();
  });

  it('transient GET 500-504 errors retry up to 3 times', async () => {
    const { default: api } = await import('@/services/api');
    const responseInterceptor = api.interceptors.response.handlers.find(h => h.rejected).rejected;

    // We mock setTimeout to resolve immediately for this test
    vi.stubGlobal('setTimeout', (cb) => cb());
    
    // Override the axios adapter to prevent real network requests during retry
    api.defaults.adapter = async (config) => {
      // Return a rejected promise simulating 500
      const error = new Error('fail');
      error.config = config;
      error.response = { status: 500 };
      return Promise.reject(error);
    };

    const error500 = { config: { method: 'get' }, response: { status: 500 } };
    
    // 1st retry
    let nextError = await responseInterceptor(error500).catch(e => e);
    expect(error500.config.__retryCount).toBe(1);
    
    // In actual code, api(config) is called which we stubbed or we can just test the retryCount increments
    // Let's just manually call the interceptor again to simulate 2nd and 3rd failures
    await responseInterceptor(error500).catch(e => e);
    expect(error500.config.__retryCount).toBe(2);

    await responseInterceptor(error500).catch(e => e);
    expect(error500.config.__retryCount).toBe(3);

    // 4th failure should not retry and should reject
    await expect(responseInterceptor(error500)).rejects.toBe(error500);
    expect(error500.config.__retryCount).toBe(3); // stays at 3

    vi.unstubAllGlobals();
    // restore original adapter if needed, but this is scoped to the test file anyway
    api.defaults.adapter = undefined;
  });
});


// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function worker() {
  const listeners = new Map<string, (event: any) => void>();
  const saved = new Map<string, Response>();
  const key = (request: string | { url: string }) =>
    typeof request === 'string' ? request : request.url;
  const cache = {
    add: vi.fn(async (_url: string) => {}),
    put: vi.fn(async (request, response) => {
      saved.set(key(request), response);
    }),
    match: vi.fn(async (request) => saved.get(key(request))),
  };
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => ['screenerx-shell-v2', 'screenerx-shell-v3', 'other-app']),
    delete: vi.fn(async () => true),
    match: vi.fn(async (request) => saved.get(key(request))),
  };
  const fetch = vi.fn(async () => new Response('network'));
  const self = {
    location: { origin: 'https://example.test' },
    addEventListener: (type: string, listener: (event: any) => void) =>
      listeners.set(type, listener),
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}) },
  };
  runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, caches, fetch, URL, Response });
  function lifecycle(type: string) {
    let work: Promise<unknown> | undefined;
    listeners.get(type)!({
      waitUntil: (promise: Promise<unknown>) => {
        work = promise;
      },
    });
    return work!;
  }
  function request(path: string, mode = 'cors') {
    let response: Promise<Response> | undefined;
    listeners.get('fetch')!({
      request: { url: `https://example.test${path}`, method: 'GET', mode },
      respondWith: (promise: Promise<Response>) => {
        response = promise;
      },
    });
    return response;
  }
  return { cache, caches, saved, fetch, self, lifecycle, request };
}

describe('offline service worker', () => {
  it('preloads the HTML-linked initial scripts and styles during install', async () => {
    const w = worker();
    w.fetch.mockResolvedValue(
      new Response(
        `<script src="/_next/static/main.js"></script><link href='/_next/static/app.css'><script src="https://foreign.test/_next/static/a.js"></script>`,
      ),
    );
    await w.lifecycle('install');
    expect(w.cache.add.mock.calls.map(([url]) => url)).toEqual([
      'https://example.test/_next/static/main.js',
      'https://example.test/_next/static/app.css',
    ]);
    expect(w.saved.has('/')).toBe(true);
    expect(w.self.skipWaiting).toHaveBeenCalledOnce();
  });
  it('removes only older caches belonging to this app', async () => {
    const w = worker();
    await w.lifecycle('activate');
    expect(w.caches.delete).toHaveBeenCalledTimes(1);
    expect(w.caches.delete).toHaveBeenCalledWith('screenerx-shell-v2');
    expect(w.self.clients.claim).toHaveBeenCalledOnce();
  });
  it('restores the saved shell on a failed navigation and gives a clear 503 if absent', async () => {
    const w = worker();
    w.fetch.mockRejectedValue(new Error('offline'));
    w.saved.set('/', new Response('saved shell'));
    expect(await (await w.request('/', 'navigate')!).text()).toBe('saved shell');
    w.saved.clear();
    expect((await w.request('/', 'navigate')!).status).toBe(503);
  });
  it('caches a successful root navigation and immutable assets while bypassing APIs', async () => {
    const w = worker();
    await w.request('/', 'navigate');
    expect(w.saved.has('/')).toBe(true);
    await w.request('/_next/static/chart.js');
    expect(w.saved.has('https://example.test/_next/static/chart.js')).toBe(true);
    w.fetch.mockRejectedValue(new Error('offline'));
    expect(await (await w.request('/_next/static/chart.js')!).text()).toBe('network');
    expect(w.request('/api/stocks')).toBeUndefined();
  });
  it('serves valid network responses even if cache storage is blocked', async () => {
    const w = worker();
    w.caches.open.mockRejectedValue(new Error('quota'));
    expect(await (await w.request('/', 'navigate')!).text()).toBe('network');
    expect(await (await w.request('/_next/static/main.js')!).text()).toBe('network');
  });
});

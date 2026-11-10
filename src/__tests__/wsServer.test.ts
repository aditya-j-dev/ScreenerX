// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { createPriceSimulationServer, readSimulatorConfig } from '../../server/simulator';
import type { PriceUpdate } from '../types/stock';

const servers: ReturnType<typeof createPriceSimulationServer>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  vi.restoreAllMocks();
});
const stock = { symbol: 'TEST', sector: 'IT' as const, lastPrice: 100, previousClose: 95, beta: 1 };
async function start() {
  const server = createPriceSimulationServer({
    port: 0,
    updateIntervalMs: 80,
    stocks: [stock],
    random: () => 0.5,
  });
  servers.push(server);
  await server.ready;
  const address = server.wss.address();
  if (!address || typeof address === 'string') throw new Error('Missing server address');
  return { server, url: `ws://127.0.0.1:${address.port}` };
}
async function connect(url: string) {
  const client = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    client.once('open', resolve);
    client.once('error', reject);
  });
  return client;
}
function nextMessage(client: WebSocket): Promise<PriceUpdate> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.off('message', receive);
      reject(new Error('Timed out waiting for price'));
    }, 3000);
    const receive = (message: Buffer) => {
      clearTimeout(timeout);
      resolve(JSON.parse(message.toString()) as PriceUpdate);
    };
    client.once('message', receive);
  });
}

describe('standalone WebSocket simulator', () => {
  it('validates environment configuration without silently accepting invalid values', () => {
    expect(readSimulatorConfig({})).toEqual({ port: 3001, updateIntervalMs: 2000 });
    expect(readSimulatorConfig({ WS_PORT: '4000', WS_UPDATE_INTERVAL_MS: '500' })).toEqual({
      port: 4000,
      updateIntervalMs: 500,
    });
    for (const value of ['NaN', '0', '65536', '3.5'])
      expect(() => readSimulatorConfig({ WS_PORT: value })).toThrow(RangeError);
    for (const value of ['NaN', '-1', '0', '10'])
      expect(() => readSimulatorConfig({ WS_UPDATE_INTERVAL_MS: value })).toThrow(RangeError);
  });
  it('broadcasts valid ticks to two real clients and expresses daily change against previous close', async () => {
    const { url } = await start();
    const [first, second] = await Promise.all([connect(url), connect(url)]);
    const [a, b] = await Promise.all([nextMessage(first), nextMessage(second)]);
    expect(a).toEqual(b);
    expect(a.symbol).toBe('TEST');
    expect(a.price).toBeGreaterThan(0);
    expect(a.change).toBeCloseTo(a.price - 95);
    expect(a.changePercent).toBeCloseTo(((a.price - 95) / 95) * 100);
    const next = await nextMessage(second);
    expect(next.timestamp).toBeGreaterThan(a.timestamp);
    expect(next.price).not.toBe(a.price);
    first.terminate();
    expect((await nextMessage(second)).symbol).toBe('TEST');
  });
  it('disconnects a slow client while continuing to serve the other client', async () => {
    const { server, url } = await start();
    const first = await connect(url);
    const second = await connect(url);
    const firstPeer = [...server.wss.clients][0];
    Object.defineProperty(firstPeer, 'bufferedAmount', {
      configurable: true,
      value: 2 * 1024 * 1024,
    });
    const closed = new Promise<void>((resolve) => first.once('close', () => resolve()));
    await Promise.all([closed, nextMessage(second)]);
    expect(first.readyState).toBe(WebSocket.CLOSED);
    expect((await nextMessage(second)).price).toBeGreaterThan(0);
  });
  it('isolates socket errors and closes all connections on shutdown', async () => {
    const { server, url } = await start();
    const client = await connect(url);
    const closed = new Promise<void>((resolve) => client.once('close', () => resolve()));
    [...server.wss.clients][0].emit('error', new Error('Simulated disconnect'));
    await closed;
    const replacement = await connect(url);
    expect((await nextMessage(replacement)).symbol).toBe('TEST');
    await server.close();
    await server.close();
    expect(server.wss.clients.size).toBe(0);
  });

  it('contains a send failure without interrupting broadcasts to another client', async () => {
    const { server, url } = await start();
    const first = await connect(url);
    const second = await connect(url);
    vi.spyOn([...server.wss.clients][0], 'send').mockImplementation(() => {
      throw new Error('Socket closed during send');
    });
    const closed = new Promise<void>((resolve) => first.once('close', () => resolve()));
    const [, message] = await Promise.all([closed, nextMessage(second)]);
    expect(message.symbol).toBe('TEST');
    expect((await nextMessage(second)).price).toBeGreaterThan(0);
  });

  it('rejects startup on an occupied port and can still clean up', async () => {
    const { server } = await start();
    const address = server.wss.address();
    if (!address || typeof address === 'string') throw new Error('Missing port');
    const duplicate = createPriceSimulationServer({ port: address.port, stocks: [stock] });
    servers.push(duplicate);
    await expect(duplicate.ready).rejects.toMatchObject({ code: 'EADDRINUSE' });
    await duplicate.close();
  });
});

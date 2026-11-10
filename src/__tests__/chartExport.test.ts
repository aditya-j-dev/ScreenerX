import { afterEach, describe, expect, it, vi } from 'vitest';
import { composeChartPng, type ChartExportOptions } from '../lib/chartExport';

export function canvasContextMock() {
  return Object.fromEntries(
    [
      'fillRect',
      'fillText',
      'drawImage',
      'save',
      'restore',
      'translate',
      'scale',
      'beginPath',
      'rect',
      'clip',
      'lineTo',
      'moveTo',
      'closePath',
      'fill',
      'strokeRect',
      'stroke',
    ].map((method) => [method, vi.fn()]),
  );
}
afterEach(() => vi.restoreAllMocks());

describe('chart PNG composition', () => {
  function fixture(): ChartExportOptions {
    const main = document.createElement('canvas');
    main.width = 600;
    main.height = 320;
    const rsi = document.createElement('canvas');
    rsi.width = 600;
    rsi.height = 120;
    return {
      main,
      rsi,
      cssWidth: 600,
      title: 'TEST - 1Y',
      subtitle: 'SMA 20 | RSI 14',
      band: [
        { x: 10, y: 20 },
        { x: 20, y: 25 },
        { x: 10, y: 30 },
      ],
      profile: [{ y: 50, width: 40 }],
      shapes: [
        { kind: 'line', x1: 1, y1: 2, x2: 3, y2: 4, color: '#fff' },
        { kind: 'rectangle', x1: 30, y1: 40, x2: 10, y2: 20, color: '#aaa' },
      ],
    };
  }
  it('composes the native panes, band, volume and drawings with title/legend', () => {
    const context = canvasContextMock();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    const options = fixture();
    const result = composeChartPng(options);
    expect(result.width).toBe(600);
    expect(result.height).toBe(552);
    expect(context.drawImage).toHaveBeenCalledWith(options.main, 0, 64);
    expect(context.drawImage).toHaveBeenCalledWith(options.rsi, 0, 408, 600, 120);
    expect(context.fillText).toHaveBeenCalledWith('TEST - 1Y', 12, 23, 576);
    expect(context.fillRect).toHaveBeenCalledWith(552, 48, 40, 4);
    expect(context.closePath).toHaveBeenCalled();
    expect(context.strokeRect).toHaveBeenCalledWith(10, 20, 20, 20);
    expect(context.clip).toHaveBeenCalled();
    expect(context.restore).toHaveBeenCalledOnce();
  });
  it('retains native pixel density and omits an absent RSI pane', () => {
    const context = canvasContextMock();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    const options = fixture();
    options.main.width = 1200;
    options.main.height = 640;
    options.rsi = undefined;
    const result = composeChartPng(options);
    expect(result.width).toBe(1200);
    expect(result.height).toBe(816);
    expect(context.scale).toHaveBeenCalledWith(2, 2);
    expect(context.drawImage).toHaveBeenCalledTimes(1);
  });
  it('fails explicitly when a chart or canvas context is unavailable', () => {
    expect(() => composeChartPng({ ...fixture(), cssWidth: 0 })).toThrow('not ready');
    const invalidRsi = fixture();
    invalidRsi.rsi!.width = 0;
    expect(() => composeChartPng(invalidRsi)).toThrow('RSI chart is not ready');
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(() => composeChartPng(fixture())).toThrow('unavailable');
  });
});

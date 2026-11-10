export type ExportShape = {
  kind: 'line' | 'rectangle';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
};
export interface ChartExportOptions {
  main: HTMLCanvasElement;
  rsi?: HTMLCanvasElement;
  cssWidth: number;
  title: string;
  subtitle: string;
  band: Array<{ x: number; y: number }>;
  profile: Array<{ y: number; width: number }>;
  shapes: ExportShape[];
}

/** Compose native chart screenshots and application overlays without an external DOM renderer. */
export function composeChartPng(options: ChartExportOptions): HTMLCanvasElement {
  const { main, rsi, cssWidth, band, profile, shapes } = options;
  if (cssWidth <= 0 || main.width <= 0 || main.height <= 0) throw new Error('Chart is not ready');
  if (rsi && (rsi.width <= 0 || rsi.height <= 0)) throw new Error('RSI chart is not ready');
  const scale = main.width / cssWidth;
  const header = 64 * scale,
    footer = 24 * scale,
    rsiLabel = rsi ? 24 * scale : 0;
  const rsiHeight = rsi && rsi.width > 0 ? (rsi.height * main.width) / rsi.width : 0;
  const output = document.createElement('canvas');
  output.width = main.width;
  output.height = Math.ceil(header + main.height + rsiLabel + rsiHeight + footer);
  const context = output.getContext('2d');
  if (!context) throw new Error('Canvas export is unavailable');
  context.fillStyle = '#000';
  context.fillRect(0, 0, output.width, output.height);
  context.fillStyle = '#f5f5f5';
  context.font = `${16 * scale}px sans-serif`;
  context.fillText(options.title, 12 * scale, 23 * scale, output.width - 24 * scale);
  context.fillStyle = '#a3a3a3';
  context.font = `${10 * scale}px sans-serif`;
  context.fillText(options.subtitle, 12 * scale, 44 * scale, output.width - 24 * scale);
  context.drawImage(main, 0, header);
  context.save();
  context.translate(0, header);
  context.scale(scale, scale);
  context.beginPath();
  context.rect(0, 0, cssWidth, main.height / scale);
  context.clip();
  if (band.length) {
    context.beginPath();
    band.forEach((point, index) =>
      index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y),
    );
    context.closePath();
    context.fillStyle = 'rgba(245,158,11,0.14)';
    context.fill();
  }
  context.fillStyle = 'rgba(52,211,153,0.6)';
  profile.forEach((bar) => context.fillRect(cssWidth - 8 - bar.width, bar.y - 2, bar.width, 4));
  shapes.forEach((shape) => {
    context.strokeStyle = shape.color;
    context.lineWidth = 2;
    if (shape.kind === 'rectangle') {
      const x = Math.min(shape.x1, shape.x2),
        y = Math.min(shape.y1, shape.y2);
      const width = Math.abs(shape.x2 - shape.x1),
        height = Math.abs(shape.y2 - shape.y1);
      context.fillStyle = 'rgba(167,139,250,0.14)';
      context.fillRect(x, y, width, height);
      context.strokeRect(x, y, width, height);
    } else {
      context.beginPath();
      context.moveTo(shape.x1, shape.y1);
      context.lineTo(shape.x2, shape.y2);
      context.stroke();
    }
  });
  context.restore();
  if (rsi && rsiHeight > 0) {
    context.fillStyle = '#fb7185';
    context.font = `${11 * scale}px sans-serif`;
    context.fillText('RSI', 12 * scale, header + main.height + 16 * scale);
    context.drawImage(rsi, 0, header + main.height + rsiLabel, main.width, rsiHeight);
  }
  context.fillStyle = '#a3a3a3';
  context.font = `${10 * scale}px sans-serif`;
  context.fillText('ScreenerX - simulated market data', 12 * scale, output.height - 8 * scale);
  return output;
}

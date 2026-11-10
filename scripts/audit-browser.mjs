// Prerequisites: production app :3100, simulator :3001, isolated Chrome CDP :9333.
// Run: node scripts/audit-browser.mjs
import WebSocket from 'ws';
import { mkdir, writeFile } from 'node:fs/promises';

const pages = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = pages.find((item) => item.type === 'page');
if (!page) throw new Error('No audit browser tab');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.once('open', resolve);
  ws.once('error', reject);
});
let sequence = 0;
const pending = new Map();
ws.on('message', (raw) => {
  const message = JSON.parse(raw.toString());
  if (!message.id) return;
  const task = pending.get(message.id);
  if (!task) return;
  pending.delete(message.id);
  clearTimeout(task.timeout);
  if (message.error) task.reject(new Error(JSON.stringify(message.error)));
  else task.resolve(message.result);
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out`));
    }, 30000);
    pending.set(id, { resolve, reject, timeout });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
const injection = `
window.__audit = { longTasks: [], shifts: [], lcp: [], ticks: new Map(), latency: [], seen: new Map() };
for (const [type, key] of [['longtask','longTasks'],['layout-shift','shifts'],['largest-contentful-paint','lcp']]) {
  try { new PerformanceObserver(list => { for (const item of list.getEntries()) window.__audit[key].push(item.toJSON()); }).observe({ type, buffered: true }); } catch {}
}
window.WebSocket = class extends window.WebSocket {
  constructor(...args) {
    super(...args);
    this.addEventListener('message', event => {
      try { const tick = JSON.parse(event.data); window.__audit.ticks.set(tick.symbol, { ...tick, receivedAt: performance.now() }); } catch {}
    });
  }
};
`;
try {
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Network.setBypassServiceWorker', { bypass: true });
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: injection });
  await send('Page.navigate', { url: 'http://localhost:3100/' });
  await evaluate(`new Promise((resolve, reject) => {
    const start = performance.now();
    const poll = () => {
      if (document.querySelector('#stock-grid [aria-rowindex]:not([aria-rowindex="1"])')) resolve(true);
      else if (performance.now() - start > 20000) reject(new Error('Grid did not load: '+document.body.innerText.slice(0,300)));
      else setTimeout(poll, 50);
    }; poll();
  })`);
  await evaluate(`new Promise(resolve => setTimeout(resolve, 1000))`);
  const initial = await evaluate(`(() => {
    const a = window.__audit;
    return { navigation: performance.getEntriesByType('navigation')[0].toJSON(),
      paint: performance.getEntriesByType('paint').map(x=>x.toJSON()),
      lcp: a.lcp, longTasks: a.longTasks, shifts: a.shifts,
      heap: performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize } : null,
      domNodes: document.getElementsByTagName('*').length,
      mountedRows: document.querySelectorAll('#stock-grid [aria-rowindex]:not([aria-rowindex="1"])').length,
      resources: performance.getEntriesByType('resource').map(x=>({ name:x.name, transferSize:x.transferSize, encodedBodySize:x.encodedBodySize, decodedBodySize:x.decodedBodySize, duration:x.duration })) };
  })()`);
  await evaluate(`(() => {
    const observer = new MutationObserver(() => {
      const a = window.__audit;
      for (const row of document.querySelectorAll('#stock-grid [aria-rowindex]:not([aria-rowindex="1"])')) {
        const cell = row.querySelector('[role="gridcell"][id$="-6"]');
        if (!cell) continue;
        const symbol = cell.id.slice('grid-cell-'.length, -2);
        const tick = a.ticks.get(symbol);
        if (!tick || a.seen.get(symbol) === tick.timestamp) continue;
        const displayed = Number(cell.textContent.replace(/[^0-9.-]/g,''));
        if (Math.abs(displayed - tick.price) < 0.0051) {
          a.latency.push(performance.now() - tick.receivedAt);
          a.seen.set(symbol, tick.timestamp);
        }
      }
    });
    observer.observe(document.querySelector('#stock-grid'), { subtree:true, childList:true, characterData:true });
    window.__audit.observer = observer;
  })()`);
  const scrollExpression = `new Promise(resolve => {
    const grid = document.getElementById('stock-grid');
    const times = []; let start; let previous; let maxRows = 0; let maxCells = 0;
    const beginning = performance.now();
    function frame(time) {
      if (start === undefined) start = time;
      if (previous !== undefined) times.push(time - previous);
      previous = time;
      const progress = (time - start) / 4000;
      grid.scrollTop = (grid.scrollHeight - grid.clientHeight) * (progress < 0.5 ? progress * 2 : Math.max(0, 2 - progress * 2));
      maxRows = Math.max(maxRows, grid.querySelectorAll('[aria-rowindex]:not([aria-rowindex="1"])').length);
      maxCells = Math.max(maxCells, grid.querySelectorAll('[role="gridcell"]').length);
      if (progress < 1) requestAnimationFrame(frame);
      else { grid.scrollTop = 0; resolve({ intervals: times, maxRows, maxCells, longTasks: window.__audit.longTasks.filter(x=>x.startTime>=beginning) }); }
    } requestAnimationFrame(frame);
  })`;
  const gridScroll = await evaluate(scrollExpression);
  await evaluate(`new Promise(resolve => setTimeout(resolve, 100))`);
  await evaluate(`document.querySelector('#stock-grid [aria-rowindex]:not([aria-rowindex="1"]) [role="gridcell"]').click()`);
  await evaluate(`new Promise((resolve,reject)=>{
    const start=performance.now(); function poll(){
      if(document.querySelectorAll('#chart-panel canvas').length) resolve(true);
      else if(performance.now()-start>15000) reject(new Error('Chart did not load'));
      else setTimeout(poll,50);
    } poll();
  })`);
  await evaluate(`new Promise(resolve => setTimeout(resolve, 500))`);
  const chartScroll = await evaluate(scrollExpression);
  await evaluate(`new Promise(resolve => setTimeout(resolve, 1500))`);
  const final = await evaluate(`(() => {
    const a=window.__audit;
    return { latency:a.latency, observedSymbols:a.ticks.size,
      heap:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null,
      domNodes:document.getElementsByTagName('*').length,
      longTasks:a.longTasks, shifts:a.shifts,
      chartCanvases:document.querySelectorAll('#chart-panel canvas').length,
      resources:performance.getEntriesByType('resource').map(x=>({name:x.name,transferSize:x.transferSize,encodedBodySize:x.encodedBodySize,decodedBodySize:x.decodedBodySize,duration:x.duration})) };
  })()`);
  const summarize = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return {
      samples: sorted.length,
      median: sorted[Math.floor(sorted.length * 0.5)] ?? null,
      p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? null,
      max: sorted.at(-1) ?? null,
    };
  };
  const summarizeScroll = ({ intervals, ...rest }) => ({
    ...rest,
    frameIntervalMs: summarize(intervals),
    observedRafFps: (intervals.length * 1000) / intervals.reduce((sum, x) => sum + x, 0),
    framesOver25ms: intervals.filter((x) => x > 25).length,
    note: 'rAF cadence in headless Chrome; not an on-screen presentation/FPS trace',
    intervals,
  });
  const results = {
    recordedAt: new Date().toISOString(),
    browser: await send('Browser.getVersion'),
    conditions:
      'Single run; production localhost; 1440x1000; no CPU/network throttle; HTTP cache and service worker bypassed; live simulator active; injected tick/DOM observers add overhead. Not Lighthouse.',
    initial,
    gridScroll: summarizeScroll(gridScroll),
    chartScroll: summarizeScroll(chartScroll),
    receiveToDomMs: summarize(final.latency),
    final,
    limitations: [
      'DOM mutation is not paint completion',
      'performance.memory is JS heap, not browser process memory',
      'No mobile, throttled or repeated load sample',
      'No React commit profiling in standard production build',
      'No server-to-browser transit latency measured',
    ],
  };
  await mkdir('audit', { recursive: true });
  await writeFile('audit/browser-results.json', JSON.stringify(results, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        initial: {
          lcp: initial.lcp,
          heap: initial.heap,
          domNodes: initial.domNodes,
          mountedRows: initial.mountedRows,
        },
        gridScroll: { ...results.gridScroll, intervals: undefined },
        chartScroll: { ...results.chartScroll, intervals: undefined },
        receiveToDomMs: results.receiveToDomMs,
        final: { heap: final.heap, chartCanvases: final.chartCanvases },
      },
      null,
      2,
    ),
  );
} finally {
  ws.close();
}

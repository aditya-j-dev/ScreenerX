import { createPriceSimulationServer, readSimulatorConfig } from './simulator';

async function main() {
  const config = readSimulatorConfig(process.env);
  const simulator = createPriceSimulationServer(config);
  try {
    await simulator.ready;
  } catch (error) {
    await simulator.close();
    throw error;
  }
  console.log(
    `WebSocket simulator running on ws://localhost:${config.port}; mean update interval ${config.updateIntervalMs}ms per stock`,
  );
  const shutdown = () => {
    void simulator.close();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

import fs from "node:fs";
import path from "node:path";
import express from "express";
import { config, validateConfig } from "./config";
import { MonitorService } from "./monitor";
import { WhatsAppNotifier } from "./notifier";
import { createApp } from "./routes";
import { JsonStore } from "./storage";
import { createChecker } from "./ticketmasterChecker";

async function main() {
  validateConfig(config);

  const store = new JsonStore(config.dataFile);
  await store.init();

  const checker = createChecker(config);
  const notifier = new WhatsAppNotifier(config);
  const monitor = new MonitorService(store, checker, notifier);
  const app = createApp({ store, monitor, notifier, appConfig: config });
  const staticRoot = path.resolve(process.cwd(), "dist", "web");

  if (fs.existsSync(staticRoot)) {
    app.use(express.static(staticRoot));
    app.get("*", (_request, response) => {
      response.sendFile(path.join(staticRoot, "index.html"));
    });
  }

  const server = app.listen(config.port, async () => {
    console.info(`[api] http://127.0.0.1:${config.port}`);
    console.info(`[monitor] engine=${config.monitorEngine} enabled=${config.monitorEnabled}`);

    if (config.monitorEnabled) {
      await monitor.start();
    }
  });

  const shutdown = (signal: NodeJS.Signals) => {
    console.info(`[api] received ${signal}, shutting down`);
    monitor.stop();
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

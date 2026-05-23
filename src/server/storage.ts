import fs from "node:fs/promises";
import path from "node:path";
import type { StoreData } from "../shared/types";

const emptyStore = (): StoreData => ({
  events: [],
  subscriptions: [],
  snapshots: [],
  lastStatuses: {},
  availabilityTokens: {}
});

export class JsonStore {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      await fs.access(this.filePath);
    } catch {
      await fs.writeFile(this.filePath, `${JSON.stringify(emptyStore(), null, 2)}\n`, "utf8");
    }
  }

  async read(): Promise<StoreData> {
    await this.init();
    const raw = await fs.readFile(this.filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoreData>;

    return {
      ...emptyStore(),
      ...parsed,
      events: parsed.events ?? [],
      subscriptions: parsed.subscriptions ?? [],
      snapshots: parsed.snapshots ?? [],
      lastStatuses: parsed.lastStatuses ?? {},
      availabilityTokens: parsed.availabilityTokens ?? {}
    };
  }

  async mutate<T>(mutation: (data: StoreData) => T | Promise<T>): Promise<T> {
    const run = this.queue
      .catch(() => undefined)
      .then(async () => {
        const data = await this.read();
        const result = await mutation(data);
        const tmpPath = `${this.filePath}.tmp`;

        await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
        await fs.rename(tmpPath, this.filePath);

        return result;
      });

    this.queue = run.then(
      () => undefined,
      () => undefined
    );

    return run;
  }
}

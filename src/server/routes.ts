import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import type { AppConfig } from "./config";
import type { MonitorService } from "./monitor";
import type { WhatsAppNotifier } from "./notifier";
import { normalizeBrazilPhone } from "./phone";
import { createRateLimit, requireAdminToken, securityHeaders } from "./security";
import type { JsonStore } from "./storage";
import type {
  EventSnapshot,
  PublicEvent,
  SectorConfig,
  Subscription,
  TicketEvent,
  TicketTypeConfig
} from "../shared/types";

const defaultTicketTypes = [
  "Inteira",
  "Meia-Entrada",
  "Desc. 50% - Estatuto Idoso",
  "Meia-Entrada PCD"
];
const defaultSectors = [
  "PIT A",
  "PIT B",
  "Pista Premium",
  "Pista",
  "Arquibancada Norte",
  "Cadeira Leste",
  "Cadeira Oeste",
  "Cadeira Oeste Coberta"
];

const latestSnapshotFor = (snapshots: EventSnapshot[], eventId: string) =>
  snapshots.find((snapshot) => snapshot.eventId === eventId) ?? null;

const fallbackTicketTypes = (): TicketTypeConfig[] =>
  defaultTicketTypes.map((name) => ({
    id: name.toLowerCase().replace(/\s+/g, "-"),
    name
  }));

const normalizePublicEvent = (event: TicketEvent): TicketEvent => ({
  ...event,
  sectors: event.sectors.map((sector) => ({
    ...sector,
    ticketTypes: sector.ticketTypes?.length ? sector.ticketTypes : fallbackTicketTypes()
  }))
});

const publicEvents = (data: Awaited<ReturnType<JsonStore["read"]>>): PublicEvent[] =>
  data.events.map((event) => ({
    ...normalizePublicEvent(event),
    latestSnapshot: latestSnapshotFor(data.snapshots, event.id),
    subscribersCount: data.subscriptions.filter((subscription) => subscription.eventId === event.id).length
  }));

const isTicketmasterBrazilUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol.startsWith("http") && url.hostname.endsWith("ticketmaster.com.br");
  } catch {
    return false;
  }
};

const readString = (value: unknown, field: string, min = 1, max = 200) => {
  if (typeof value !== "string") {
    throw new Error(`${field} deve ser texto.`);
  }

  const trimmed = value.trim();

  if (trimmed.length < min || trimmed.length > max) {
    throw new Error(`${field} deve ter entre ${min} e ${max} caracteres.`);
  }

  return trimmed;
};

const parseTicketTypes = (value: unknown): TicketTypeConfig[] => {
  if (!Array.isArray(value)) {
    throw new Error("Modalidades devem ser uma lista.");
  }

  const names = value.map((item) => {
    if (typeof item === "string") {
      return item.trim();
    }

    if (item && typeof item === "object" && "name" in item) {
      return String(item.name).trim();
    }

    return "";
  });

  const uniqueNames = [...new Set(names.filter(Boolean))];

  if (uniqueNames.length === 0 || uniqueNames.length > 20) {
    throw new Error("Informe entre 1 e 20 modalidades.");
  }

  return uniqueNames.map((name) => ({
    id: randomUUID(),
    name
  }));
};

const parseSectors = (value: unknown, ticketTypes: TicketTypeConfig[]): SectorConfig[] => {
  if (!Array.isArray(value)) {
    throw new Error("Setores devem ser uma lista.");
  }

  const names = value.map((item) => {
    if (typeof item === "string") {
      return item.trim();
    }

    if (item && typeof item === "object" && "name" in item) {
      return String(item.name).trim();
    }

    return "";
  });

  const uniqueNames = [...new Set(names.filter(Boolean))];

  if (uniqueNames.length === 0 || uniqueNames.length > 30) {
    throw new Error("Informe entre 1 e 30 setores.");
  }

  return uniqueNames.map((name) => ({
    id: randomUUID(),
    name,
    ticketTypes
  }));
};

const parseEventPayload = (body: Record<string, unknown>, appConfig: AppConfig): Omit<TicketEvent, "id" | "createdAt" | "updatedAt"> => {
  const name = readString(body.name, "Nome do evento", 2, 160);
  const url = readString(body.url, "URL", 10, 1200);

  if (!appConfig.allowNonTicketmasterUrls && !isTicketmasterBrazilUrl(url)) {
    throw new Error("Use uma URL da Ticketmaster Brasil.");
  }

  const requestedInterval = Number(body.checkIntervalSeconds ?? appConfig.defaultCheckIntervalSeconds);
  const checkIntervalSeconds = Math.max(
    Number.isFinite(requestedInterval) ? Math.floor(requestedInterval) : appConfig.defaultCheckIntervalSeconds,
    appConfig.minCheckIntervalSeconds
  );

  const ticketTypes = parseTicketTypes(
    Array.isArray(body.ticketTypes) ? body.ticketTypes : defaultTicketTypes
  );

  return {
    name,
    url,
    active: body.active !== false,
    checkIntervalSeconds,
    sectors: parseSectors(Array.isArray(body.sectors) ? body.sectors : defaultSectors, ticketTypes)
  };
};

export const createApp = (options: {
  store: JsonStore;
  monitor: MonitorService;
  notifier: WhatsAppNotifier;
  appConfig: AppConfig;
}) => {
  const app = express();

  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use("/api", createRateLimit({ windowMs: 60_000, maxRequests: 120, keyPrefix: "api" }));
  app.use(
    "/api/subscriptions",
    createRateLimit({ windowMs: 60_000, maxRequests: 10, keyPrefix: "subscriptions" })
  );
  app.use(
    "/api/admin/test-whatsapp",
    createRateLimit({ windowMs: 60_000, maxRequests: 5, keyPrefix: "whatsapp-test" })
  );
  app.use(express.json({ limit: "100kb" }));

  if (options.appConfig.corsOrigin) {
    app.use(cors({ origin: options.appConfig.corsOrigin }));
  }

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/api/status", async (request, response, next) => {
    try {
      requireAdminToken(options.appConfig.adminToken, request);

      const data = await options.store.read();

      response.json({
        ok: true,
        nodeEnv: options.appConfig.nodeEnv,
        monitorEnabled: options.appConfig.monitorEnabled,
        monitorEngine: options.appConfig.monitorEngine,
        whatsappProvider: options.appConfig.whatsappProvider,
        events: data.events.length,
        activeEvents: data.events.filter((event) => event.active).length,
        subscriptions: data.subscriptions.length,
        snapshots: data.snapshots.length,
        monitor: options.monitor.snapshot()
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/events", async (_request, response, next) => {
    try {
      const data = await options.store.read();
      response.json(publicEvents(data));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/events", async (request, response, next) => {
    try {
      requireAdminToken(options.appConfig.adminToken, request);

      const payload = parseEventPayload(request.body, options.appConfig);
      const now = new Date().toISOString();
      const event: TicketEvent = {
        ...payload,
        id: randomUUID(),
        createdAt: now,
        updatedAt: now
      };

      await options.store.mutate((data) => {
        data.events.push(event);
      });
      await options.monitor.syncSchedules(true);

      response.status(201).json(event);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/events/:id", async (request, response, next) => {
    try {
      requireAdminToken(options.appConfig.adminToken, request);

      const id = request.params.id;
      const updated = await options.store.mutate<TicketEvent>((data) => {
        const event = data.events.find((item) => item.id === id);

        if (!event) {
          throw new Error("Evento nao encontrado.");
        }

        if (typeof request.body.name === "string") {
          event.name = readString(request.body.name, "Nome do evento", 2, 160);
        }

        if (typeof request.body.url === "string") {
          const nextUrl = readString(request.body.url, "URL", 10, 1200);

          if (!options.appConfig.allowNonTicketmasterUrls && !isTicketmasterBrazilUrl(nextUrl)) {
            throw new Error("Use uma URL da Ticketmaster Brasil.");
          }

          event.url = nextUrl;
        }

        if (Array.isArray(request.body.sectors)) {
          const previousByName = new Map(event.sectors.map((sector) => [sector.name, sector.id]));
          const previousTicketTypeByName = new Map(
            event.sectors.flatMap((sector) =>
              (sector.ticketTypes ?? []).map((ticketType) => [ticketType.name, ticketType.id] as const)
            )
          );
          const ticketTypes = Array.isArray(request.body.ticketTypes)
            ? parseTicketTypes(request.body.ticketTypes).map((ticketType) => ({
                ...ticketType,
                id: previousTicketTypeByName.get(ticketType.name) ?? ticketType.id
              }))
            : event.sectors[0]?.ticketTypes?.length
              ? event.sectors[0].ticketTypes
              : fallbackTicketTypes();

          event.sectors = parseSectors(request.body.sectors, ticketTypes).map((sector) => ({
            ...sector,
            id: previousByName.get(sector.name) ?? sector.id
          }));
        }

        if (Array.isArray(request.body.ticketTypes) && !Array.isArray(request.body.sectors)) {
          const previousByName = new Map(
            event.sectors.flatMap((sector) =>
              (sector.ticketTypes ?? []).map((ticketType) => [ticketType.name, ticketType.id] as const)
            )
          );
          const ticketTypes = parseTicketTypes(request.body.ticketTypes).map((ticketType) => ({
            ...ticketType,
            id: previousByName.get(ticketType.name) ?? ticketType.id
          }));

          event.sectors = event.sectors.map((sector) => ({
            ...sector,
            ticketTypes
          }));
        }

        if (typeof request.body.active === "boolean") {
          event.active = request.body.active;
        }

        if (request.body.checkIntervalSeconds !== undefined) {
          const requestedInterval = Number(request.body.checkIntervalSeconds);
          event.checkIntervalSeconds = Math.max(
            Number.isFinite(requestedInterval) ? Math.floor(requestedInterval) : event.checkIntervalSeconds,
            options.appConfig.minCheckIntervalSeconds
          );
        }

        event.updatedAt = new Date().toISOString();
        return event;
      });

      await options.monitor.syncSchedules();
      response.json(updated);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/events/:id", async (request, response, next) => {
    try {
      requireAdminToken(options.appConfig.adminToken, request);

      await options.store.mutate((data) => {
        data.events = data.events.filter((event) => event.id !== request.params.id);
        data.subscriptions = data.subscriptions.filter(
          (subscription) => subscription.eventId !== request.params.id
        );
        data.snapshots = data.snapshots.filter((snapshot) => snapshot.eventId !== request.params.id);
      });
      await options.monitor.syncSchedules();

      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/events/:id/check", async (request, response, next) => {
    try {
      requireAdminToken(options.appConfig.adminToken, request);
      const snapshot = await options.monitor.runNow(request.params.id);
      response.json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/test-whatsapp", async (request, response, next) => {
    try {
      requireAdminToken(options.appConfig.adminToken, request);

      const name = readString(request.body.name, "Nome", 2, 80);
      const phone = normalizeBrazilPhone(readString(request.body.phone, "Telefone", 8, 30));

      await options.notifier.sendAvailabilityAlert({
        to: phone,
        name,
        eventName: "Teste local",
        eventUrl: "http://127.0.0.1:4000",
        sectorName: "Pista",
        ticketTypeName: "Inteira"
      });

      response.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/subscriptions", async (request, response, next) => {
    try {
      const name = readString(request.body.name, "Nome", 2, 80);
      const eventId = readString(request.body.eventId, "Evento", 8, 80);
      const sectorId = readString(request.body.sectorId, "Setor", 8, 80);
      const ticketTypeId = readString(request.body.ticketTypeId, "Modalidade", 1, 80);
      const phone = normalizeBrazilPhone(readString(request.body.phone, "Telefone", 8, 30));

      if (request.body.consent !== true) {
        throw new Error("Confirme o consentimento para receber aviso por WhatsApp.");
      }

      const subscription = await options.store.mutate((data) => {
        const event = data.events.find((item) => item.id === eventId);
        const sector = event?.sectors.find((item) => item.id === sectorId);
        const sectorTicketTypes = sector?.ticketTypes?.length ? sector.ticketTypes : fallbackTicketTypes();
        const ticketType = sectorTicketTypes.find((item) => item.id === ticketTypeId);

        if (!event || !sector || !ticketType) {
          throw new Error("Evento, setor ou modalidade invalida.");
        }

        const existing = data.subscriptions.find(
          (item) =>
            item.eventId === eventId &&
            item.sectorId === sectorId &&
            item.ticketTypeId === ticketTypeId &&
            item.phone === phone
        );

        if (existing) {
          existing.name = name;
          existing.consentAcceptedAt = new Date().toISOString();
          return existing;
        }

        const created: Subscription = {
          id: randomUUID(),
          eventId,
          sectorId,
          ticketTypeId,
          name,
          phone,
          createdAt: new Date().toISOString(),
          consentAcceptedAt: new Date().toISOString()
        };

        data.subscriptions.push(created);
        return created;
      });

      await options.monitor.notifySubscriptionIfAlreadyAvailable(subscription.id);

      response.status(201).json({ ok: true, subscriptionId: subscription.id });
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;
    const message = error instanceof Error ? error.message : "Erro inesperado.";

    response.status(Number.isFinite(status) ? status : 400).json({
      error: message
    });
  });

  return app;
};

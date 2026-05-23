import { randomUUID } from "node:crypto";
import type { AppConfig } from "./config";
import type { EventSnapshot, SectorSnapshot, SectorStatus, TicketEvent } from "../shared/types";

export interface AvailabilityChecker {
  check(event: TicketEvent): Promise<EventSnapshot>;
}

const availabilityWords = [
  "disponivel",
  "disponiveis",
  "comprar",
  "selecionar",
  "adicionar",
  "ingresso disponivel",
  "venda aberta"
];

const soldOutWords = [
  "esgotado",
  "indisponivel",
  "sem ingressos",
  "nao disponivel",
  "vendas encerradas",
  "encerrado"
];

const blockerWords = [
  "captcha",
  "access denied",
  "fila virtual",
  "verifique que voce nao e um robo",
  "bloqueado"
];

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const compact = (value: string) => value.replace(/\s+/g, " ").trim();

const countMatches = (text: string, words: string[]) =>
  words.reduce((total, word) => total + (text.includes(word) ? 1 : 0), 0);

const stripHtml = (html: string) =>
  compact(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
  );

const pageTitleFromHtml = (html: string) => {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? compact(match[1]) : undefined;
};

const classifyContext = (context: string): { status: SectorStatus; evidence: string } => {
  const foldedContext = fold(context);
  const evidence = compact(context).slice(0, 220);
  const availableScore = countMatches(foldedContext, availabilityWords);
  const soldOutScore = countMatches(foldedContext, soldOutWords);

  if (availableScore > 0 && soldOutScore === 0) {
    return {
      status: "available",
      evidence: evidence || "Sinais de disponibilidade encontrados perto da modalidade."
    };
  }

  if (availableScore > soldOutScore + 1) {
    return {
      status: "available",
      evidence: evidence || "Sinais de disponibilidade superam sinais de esgotado."
    };
  }

  if (soldOutScore > 0) {
    return {
      status: "sold_out",
      evidence: evidence || "Sinais de esgotado encontrados perto da modalidade."
    };
  }

  return {
    status: "unknown",
    evidence: evidence || "Nao foi possivel confirmar disponibilidade."
  };
};

const classifySectorTicketType = (
  pageText: string,
  sectorName: string,
  ticketTypeName: string
): { status: SectorStatus; evidence: string } => {
  const foldedText = fold(pageText);

  if (blockerWords.some((word) => foldedText.includes(word))) {
    return {
      status: "unknown",
      evidence: "A pagina parece ter fila, captcha ou bloqueio temporario."
    };
  }

  const foldedSector = fold(sectorName);
  const sectorIndex = foldedText.indexOf(foldedSector);

  if (sectorIndex < 0) {
    return {
      status: "unknown",
      evidence: "Setor nao encontrado no texto renderizado da pagina."
    };
  }

  const start = Math.max(0, sectorIndex - 700);
  const end = Math.min(foldedText.length, sectorIndex + foldedSector.length + 1600);
  const sectorContext = pageText.slice(start, end);
  const foldedSectorContext = fold(sectorContext);
  const foldedTicketType = fold(ticketTypeName);

  if (foldedTicketType && foldedTicketType !== "ingresso") {
    const ticketTypeIndex = foldedSectorContext.indexOf(foldedTicketType);

    if (ticketTypeIndex < 0) {
      return {
        status: "unknown",
        evidence: `Modalidade "${ticketTypeName}" nao encontrada perto do setor "${sectorName}".`
      };
    }

    const ticketContext = sectorContext.slice(
      Math.max(0, ticketTypeIndex - 500),
      Math.min(sectorContext.length, ticketTypeIndex + foldedTicketType.length + 800)
    );

    return classifyContext(ticketContext);
  }

  return classifyContext(sectorContext);
};

const ticketTypesFor = (sector: TicketEvent["sectors"][number]) =>
  sector.ticketTypes?.length
    ? sector.ticketTypes
    : ["Inteira", "Meia-Entrada", "Desc. 50% - Estatuto Idoso", "Meia-Entrada PCD"].map((name) => ({
        id: name.toLowerCase().replace(/\s+/g, "-"),
        name
      }));

const buildSnapshotSectors = (event: TicketEvent, pageText: string): SectorSnapshot[] =>
  event.sectors.flatMap((sector) =>
    ticketTypesFor(sector).map<SectorSnapshot>((ticketType) => ({
      sectorId: sector.id,
      sectorName: sector.name,
      ticketTypeId: ticketType.id,
      ticketTypeName: ticketType.name,
      ...classifySectorTicketType(pageText, sector.name, ticketType.name)
    }))
  );

const buildSnapshot = (
  event: TicketEvent,
  engine: EventSnapshot["engine"],
  pageText: string,
  options: { pageTitle?: string; statusCode?: number; error?: string } = {}
): EventSnapshot => ({
  id: randomUUID(),
  eventId: event.id,
  checkedAt: new Date().toISOString(),
  engine,
  pageTitle: options.pageTitle,
  statusCode: options.statusCode,
  error: options.error,
  sectors: buildSnapshotSectors(event, pageText)
});

export class HtmlAvailabilityChecker implements AvailabilityChecker {
  constructor(private readonly appConfig: AppConfig) {}

  async check(event: TicketEvent): Promise<EventSnapshot> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.appConfig.checkTimeoutMs);

    try {
      const response = await fetch(event.url, {
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.7",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
        }
      });
      const html = await response.text();

      return buildSnapshot(event, "html", stripHtml(html), {
        pageTitle: pageTitleFromHtml(html),
        statusCode: response.status,
        error: response.ok ? undefined : `HTTP ${response.status}`
      });
    } catch (error) {
      return buildSnapshot(event, "html", "", {
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class PlaywrightAvailabilityChecker implements AvailabilityChecker {
  constructor(private readonly appConfig: AppConfig) {}

  async check(event: TicketEvent): Promise<EventSnapshot> {
    let browser: import("playwright").Browser | undefined;
    let context: import("playwright").BrowserContext | undefined;

    try {
      const { chromium } = await import("playwright");
      browser = await chromium.launch({ headless: true });
      context = await browser.newContext({
        locale: "pt-BR",
        timezoneId: "America/Sao_Paulo",
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
      });
      const page = await context.newPage();

      await page.route("**/*", (route) => {
        const resourceType = route.request().resourceType();
        if (["image", "media", "font"].includes(resourceType)) {
          void route.abort();
          return;
        }

        void route.continue();
      });

      const response = await page.goto(event.url, {
        waitUntil: "domcontentloaded",
        timeout: this.appConfig.checkTimeoutMs
      });
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => undefined);

      const pageTitle = await page.title().catch(() => undefined);
      const pageText = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");

      return buildSnapshot(event, "playwright", pageText, {
        pageTitle,
        statusCode: response?.status()
      });
    } catch (error) {
      return buildSnapshot(event, "playwright", "", {
        error: error instanceof Error ? error.message : "Erro desconhecido"
      });
    } finally {
      await context?.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);
    }
  }
}

export const createChecker = (appConfig: AppConfig): AvailabilityChecker =>
  appConfig.monitorEngine === "playwright"
    ? new PlaywrightAvailabilityChecker(appConfig)
    : new HtmlAvailabilityChecker(appConfig);

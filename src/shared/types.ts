export type SectorStatus = "available" | "sold_out" | "unknown";

export interface TicketTypeConfig {
  id: string;
  name: string;
}

export interface SectorConfig {
  id: string;
  name: string;
  ticketTypes: TicketTypeConfig[];
}

export interface TicketEvent {
  id: string;
  name: string;
  url: string;
  active: boolean;
  checkIntervalSeconds: number;
  sectors: SectorConfig[];
  createdAt: string;
  updatedAt: string;
}

export interface SectorSnapshot {
  sectorId: string;
  sectorName: string;
  ticketTypeId: string;
  ticketTypeName: string;
  status: SectorStatus;
  evidence: string;
}

export interface EventSnapshot {
  id: string;
  eventId: string;
  checkedAt: string;
  engine: "html" | "playwright";
  pageTitle?: string;
  statusCode?: number;
  error?: string;
  sectors: SectorSnapshot[];
}

export interface Subscription {
  id: string;
  eventId: string;
  sectorId: string;
  ticketTypeId: string;
  name: string;
  phone: string;
  createdAt: string;
  consentAcceptedAt: string;
  lastNotifiedAvailabilityToken?: number;
}

export interface PublicEvent extends TicketEvent {
  latestSnapshot?: EventSnapshot | null;
  subscribersCount: number;
}

export interface StoreData {
  events: TicketEvent[];
  subscriptions: Subscription[];
  snapshots: EventSnapshot[];
  lastStatuses: Record<string, SectorStatus>;
  availabilityTokens: Record<string, number>;
}

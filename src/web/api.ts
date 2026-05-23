import type { EventSnapshot, PublicEvent } from "../shared/types";

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";

const adminToken = () => window.localStorage.getItem("adminToken") ?? "";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const token = adminToken();

  if (token) {
    headers.set("x-admin-token", token);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Erro HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  listEvents: () => request<PublicEvent[]>("/events"),
  createEvent: (payload: {
    name: string;
    url: string;
    sectors: string[];
    ticketTypes: string[];
    checkIntervalSeconds: number;
    active: boolean;
  }) =>
    request<PublicEvent>("/events", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateEvent: (id: string, payload: Partial<PublicEvent>) =>
    request<PublicEvent>(`/events/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteEvent: (id: string) =>
    request<void>(`/events/${id}`, {
      method: "DELETE"
    }),
  checkEvent: (id: string) =>
    request<EventSnapshot>(`/events/${id}/check`, {
      method: "POST"
    }),
  status: () =>
    request<{
      ok: boolean;
      nodeEnv: string;
      monitorEnabled: boolean;
      monitorEngine: string;
      whatsappProvider: string;
      events: number;
      activeEvents: number;
      subscriptions: number;
      snapshots: number;
      monitor: {
        scheduledEvents: number;
        runningChecks: number;
      };
    }>("/status"),
  testWhatsApp: (payload: { name: string; phone: string }) =>
    request<{ ok: boolean }>("/admin/test-whatsapp", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  subscribe: (payload: {
    name: string;
    phone: string;
    eventId: string;
    sectorId: string;
    ticketTypeId: string;
    consent: boolean;
  }) =>
    request<{ ok: boolean; subscriptionId: string }>("/subscriptions", {
      method: "POST",
      body: JSON.stringify(payload)
    })
};

import type { JsonStore } from "./storage";
import type { AvailabilityChecker } from "./ticketmasterChecker";
import type { WhatsAppNotifier } from "./notifier";
import type { EventSnapshot, Subscription, TicketEvent } from "../shared/types";

const statusKey = (eventId: string, sectorId: string, ticketTypeId: string) =>
  `${eventId}:${sectorId}:${ticketTypeId}`;

interface NotificationTarget {
  subscription: Subscription;
  token: number;
  event: TicketEvent;
  sectorName: string;
  ticketTypeName: string;
}

export class MonitorService {
  private timers = new Map<string, NodeJS.Timeout>();
  private running = new Set<string>();

  constructor(
    private readonly store: JsonStore,
    private readonly checker: AvailabilityChecker,
    private readonly notifier: WhatsAppNotifier
  ) {}

  async start() {
    await this.syncSchedules(true);
  }

  stop() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }

    this.timers.clear();
  }

  snapshot() {
    return {
      scheduledEvents: this.timers.size,
      runningChecks: this.running.size
    };
  }

  async syncSchedules(runImmediately = false) {
    const data = await this.store.read();
    const activeIds = new Set(data.events.filter((event) => event.active).map((event) => event.id));

    for (const [eventId, timer] of this.timers) {
      if (!activeIds.has(eventId)) {
        clearTimeout(timer);
        this.timers.delete(eventId);
      }
    }

    for (const event of data.events) {
      if (event.active && !this.timers.has(event.id)) {
        this.schedule(event, runImmediately ? 0 : event.checkIntervalSeconds * 1000);
      }
    }
  }

  async runNow(eventId: string) {
    if (this.running.has(eventId)) {
      throw new Error("Verificacao ja em andamento para este evento.");
    }

    this.running.add(eventId);

    try {
      const data = await this.store.read();
      const event = data.events.find((item) => item.id === eventId);

      if (!event) {
        throw new Error("Evento nao encontrado.");
      }

      const snapshot = await this.checker.check(event);
      const targets = await this.recordSnapshotAndFindTargets(snapshot, event);
      await this.sendTargets(targets);

      return snapshot;
    } finally {
      this.running.delete(eventId);
    }
  }

  async notifySubscriptionIfAlreadyAvailable(subscriptionId: string) {
    const target = await this.store.mutate<NotificationTarget | null>((data) => {
      const subscription = data.subscriptions.find((item) => item.id === subscriptionId);

      if (!subscription) {
        return null;
      }

      const event = data.events.find((item) => item.id === subscription.eventId);
      const sector = event?.sectors.find((item) => item.id === subscription.sectorId);
      const ticketType = sector?.ticketTypes?.find((item) => item.id === subscription.ticketTypeId);
      const key = statusKey(subscription.eventId, subscription.sectorId, subscription.ticketTypeId);
      const token = data.availabilityTokens[key] ?? 0;

      if (!event || !sector || !ticketType || token === 0 || data.lastStatuses[key] !== "available") {
        return null;
      }

      if (subscription.lastNotifiedAvailabilityToken === token) {
        return null;
      }

      return {
        subscription,
        token,
        event,
        sectorName: sector.name,
        ticketTypeName: ticketType.name
      };
    });

    if (target) {
      await this.sendTargets([target]);
    }
  }

  private schedule(event: TicketEvent, delayMs: number) {
    const timer = setTimeout(async () => {
      this.timers.delete(event.id);

      try {
        await this.runNow(event.id);
      } catch (error) {
        console.error("[monitor] falha na verificacao", {
          eventId: event.id,
          error: error instanceof Error ? error.message : error
        });
      } finally {
        const current = await this.store.read();
        const latestEvent = current.events.find((item) => item.id === event.id);

        if (latestEvent?.active) {
          this.schedule(latestEvent, latestEvent.checkIntervalSeconds * 1000);
        }
      }
    }, delayMs);

    this.timers.set(event.id, timer);
  }

  private async recordSnapshotAndFindTargets(snapshot: EventSnapshot, event: TicketEvent) {
    return this.store.mutate<NotificationTarget[]>((data) => {
      data.snapshots = [
        snapshot,
        ...data.snapshots.filter((item) => item.eventId !== snapshot.eventId).slice(0, 49)
      ];

      const targets: NotificationTarget[] = [];

      for (const sectorSnapshot of snapshot.sectors) {
        const key = statusKey(snapshot.eventId, sectorSnapshot.sectorId, sectorSnapshot.ticketTypeId);
        const previousStatus = data.lastStatuses[key];

        if (sectorSnapshot.status === "available" && previousStatus !== "available") {
          data.availabilityTokens[key] = (data.availabilityTokens[key] ?? 0) + 1;
        }

        data.lastStatuses[key] = sectorSnapshot.status;

        const token = data.availabilityTokens[key] ?? 0;

        if (sectorSnapshot.status !== "available" || token === 0) {
          continue;
        }

        for (const subscription of data.subscriptions) {
          if (
            subscription.eventId === snapshot.eventId &&
            subscription.sectorId === sectorSnapshot.sectorId &&
            subscription.ticketTypeId === sectorSnapshot.ticketTypeId &&
            subscription.lastNotifiedAvailabilityToken !== token
          ) {
            targets.push({
              subscription,
              token,
              event,
              sectorName: sectorSnapshot.sectorName,
              ticketTypeName: sectorSnapshot.ticketTypeName
            });
          }
        }
      }

      return targets;
    });
  }

  private async sendTargets(targets: NotificationTarget[]) {
    for (const target of targets) {
      try {
        await this.notifier.sendAvailabilityAlert({
          to: target.subscription.phone,
          name: target.subscription.name,
          eventName: target.event.name,
          eventUrl: target.event.url,
          sectorName: target.sectorName,
          ticketTypeName: target.ticketTypeName
        });

        await this.store.mutate((data) => {
          const subscription = data.subscriptions.find((item) => item.id === target.subscription.id);

          if (subscription) {
            subscription.lastNotifiedAvailabilityToken = target.token;
          }
        });
      } catch (error) {
        console.error("[monitor] falha ao enviar WhatsApp", {
          subscriptionId: target.subscription.id,
          error: error instanceof Error ? error.message : error
        });
      }
    }
  }
}

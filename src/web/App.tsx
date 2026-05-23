import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Bell,
  CheckCircle2,
  Clock3,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Shield,
  TerminalSquare,
  Trash2,
  XCircle
} from "lucide-react";
import { api } from "./api";
import type { PublicEvent, SectorStatus } from "../shared/types";

type View = "subscribe" | "admin";

const statusLabel: Record<SectorStatus, string> = {
  available: "Disponivel",
  sold_out: "Esgotado",
  unknown: "Indefinido"
};

const statusIcon: Record<SectorStatus, ReactNode> = {
  available: <CheckCircle2 size={16} />,
  sold_out: <XCircle size={16} />,
  unknown: <Clock3 size={16} />
};

const defaultTicketTypes = [
  "Inteira",
  "Meia-Entrada",
  "Desc. 50% - Estatuto Idoso",
  "Meia-Entrada PCD"
].join("\n");
const defaultSectors = [
  "PIT A",
  "PIT B",
  "Pista Premium",
  "Pista",
  "Arquibancada Norte",
  "Cadeira Leste",
  "Cadeira Oeste",
  "Cadeira Oeste Coberta"
].join("\n");

const formatDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short"
      }).format(new Date(value))
    : "Sem leitura";

const ticketTypesFor = (sector?: PublicEvent["sectors"][number]) =>
  sector?.ticketTypes?.length
    ? sector.ticketTypes
    : [
        {
          id: "default",
          name: "Ingresso"
        }
      ];

const optionStatus = (event: PublicEvent, sectorId: string, ticketTypeId: string): SectorStatus =>
  event.latestSnapshot?.sectors.find(
    (sector) => sector.sectorId === sectorId && sector.ticketTypeId === ticketTypeId
  )?.status ?? "unknown";

const formatPhoneInput = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  const ddd = digits.slice(0, 2);
  const firstPart = digits.slice(2, 7);
  const secondPart = digits.slice(7, 11);

  if (digits.length <= 2) {
    return ddd ? `(${ddd}` : "";
  }

  if (digits.length <= 7) {
    return `(${ddd})${firstPart}`;
  }

  return `(${ddd})${firstPart}-${secondPart}`;
};

const isPhoneValid = (value: string) => /^[1-9]{2}9\d{8}$/.test(value.replace(/\D/g, ""));

export function App() {
  const [view, setView] = useState<View>("subscribe");
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [selectedSectorId, setSelectedSectorId] = useState("");
  const [selectedTicketTypeId, setSelectedTicketTypeId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adminToken, setAdminToken] = useState(() => window.localStorage.getItem("adminToken") ?? "");
  const [eventName, setEventName] = useState("");
  const [eventUrl, setEventUrl] = useState("");
  const [eventSectors, setEventSectors] = useState(defaultSectors);
  const [eventTicketTypes, setEventTicketTypes] = useState(defaultTicketTypes);
  const [eventInterval, setEventInterval] = useState(60);
  const [consent, setConsent] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [testWhatsAppName, setTestWhatsAppName] = useState("");
  const [testWhatsAppPhone, setTestWhatsAppPhone] = useState("");

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? events[0],
    [events, selectedEventId]
  );
  const selectedSector = useMemo(
    () => selectedEvent?.sectors.find((sector) => sector.id === selectedSectorId) ?? selectedEvent?.sectors[0],
    [selectedEvent, selectedSectorId]
  );
  const selectedTicketTypes = useMemo(() => ticketTypesFor(selectedSector), [selectedSector]);
  const canSubmitSubscription =
    Boolean(selectedEventId && selectedSectorId && selectedTicketTypeId && consent) &&
    name.trim().length >= 2 &&
    isPhoneValid(phone) &&
    !busy;

  useEffect(() => {
    void loadEvents();
  }, []);

  useEffect(() => {
    if (selectedEvent && !selectedEventId) {
      setSelectedEventId(selectedEvent.id);
    }

    if (selectedEvent && !selectedSectorId) {
      setSelectedSectorId(selectedEvent.sectors[0]?.id ?? "");
    }

    if (
      selectedSector &&
      !selectedTicketTypes.some((ticketType) => ticketType.id === selectedTicketTypeId)
    ) {
      setSelectedTicketTypeId(selectedTicketTypes[0]?.id ?? "");
    }
  }, [selectedEvent, selectedEventId, selectedSector, selectedSectorId, selectedTicketTypeId, selectedTicketTypes]);

  const loadEvents = async () => {
    setLoading(true);

    try {
      const nextEvents = await api.listEvents();
      setEvents(nextEvents);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao carregar eventos.");
    } finally {
      setLoading(false);
    }
  };

  const submitSubscription = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedEventId || !selectedSectorId || !selectedTicketTypeId) {
      setMessage("Selecione evento, setor e modalidade.");
      return;
    }

    if (name.trim().length < 2 || !isPhoneValid(phone)) {
      setMessage("Preencha nome e WhatsApp corretamente.");
      return;
    }

    setBusy(true);

    try {
      await api.subscribe({
        name,
        phone,
        eventId: selectedEventId,
        sectorId: selectedSectorId,
        ticketTypeId: selectedTicketTypeId,
        consent
      });
      setName("");
      setPhone("");
      setConsent(false);
      setMessage("Cadastro confirmado. Se o setor aparecer disponivel, o aviso sai na hora.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel cadastrar.");
    } finally {
      setBusy(false);
    }
  };

  const createEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);

    try {
      await api.createEvent({
        name: eventName,
        url: eventUrl,
        sectors: eventSectors
          .split(/\r?\n|,/)
          .map((sector) => sector.trim())
          .filter(Boolean),
        ticketTypes: eventTicketTypes
          .split(/\r?\n|,/)
          .map((ticketType) => ticketType.trim())
          .filter(Boolean),
        checkIntervalSeconds: eventInterval,
        active: true
      });
      setEventName("");
      setEventUrl("");
      setEventSectors(defaultSectors);
      setEventTicketTypes(defaultTicketTypes);
      setEventInterval(60);
      setMessage("Evento salvo.");
      await loadEvents();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel salvar o evento.");
    } finally {
      setBusy(false);
    }
  };

  const saveToken = () => {
    window.localStorage.setItem("adminToken", adminToken);
    setMessage("Token admin salvo neste navegador.");
  };

  const sendTestWhatsApp = async () => {
    if (testWhatsAppName.trim().length < 2 || !isPhoneValid(testWhatsAppPhone)) {
      setMessage("Preencha nome e WhatsApp de teste corretamente.");
      return;
    }

    setBusy(true);

    try {
      await api.testWhatsApp({
        name: testWhatsAppName,
        phone: testWhatsAppPhone
      });
      setMessage("Mensagem de teste enviada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao enviar teste WhatsApp.");
    } finally {
      setBusy(false);
    }
  };

  const loadStatus = async () => {
    setBusy(true);

    try {
      const status = await api.status();
      setStatusText(
        [
          `Ambiente: ${status.nodeEnv}`,
          `Monitor: ${status.monitorEnabled ? "ativo" : "pausado"} (${status.monitorEngine})`,
          `WhatsApp: ${status.whatsappProvider}`,
          `Eventos ativos: ${status.activeEvents}/${status.events}`,
          `Inscricoes: ${status.subscriptions}`,
          `Agendados: ${status.monitor.scheduledEvents}`
        ].join("\n")
      );
      setMessage("Status carregado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao carregar status.");
    } finally {
      setBusy(false);
    }
  };

  const runCheck = async (id: string) => {
    setBusy(true);

    try {
      await api.checkEvent(id);
      setMessage("Verificacao concluida.");
      await loadEvents();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha na verificacao.");
    } finally {
      setBusy(false);
    }
  };

  const toggleEvent = async (event: PublicEvent) => {
    setBusy(true);

    try {
      await api.updateEvent(event.id, { active: !event.active });
      await loadEvents();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao atualizar evento.");
    } finally {
      setBusy(false);
    }
  };

  const removeEvent = async (id: string) => {
    setBusy(true);

    try {
      await api.deleteEvent(id);
      await loadEvents();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao remover evento.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Monitor de ingressos</p>
          <h1>Alertas | Ticketmaster Brasil</h1>
        </div>
        <nav className="tabs" aria-label="Views">
          <button className={view === "subscribe" ? "active" : ""} onClick={() => setView("subscribe")}>
            <Bell size={17} />
            Inscricao
          </button>
          <button className={view === "admin" ? "active" : ""} onClick={() => setView("admin")}>
            <Shield size={17} />
            Admin
          </button>
        </nav>
      </header>

      {message && <div className="toast">{message}</div>}

      {view === "subscribe" ? (
        <section className="workspace subscribe-grid">
          <div className="event-list">
            {loading ? (
              <div className="empty-state">
                <Loader2 className="spin" />
                Carregando eventos
              </div>
            ) : events.length === 0 ? (
              <div className="empty-state">Nenhum evento cadastrado.</div>
            ) : (
              events.map((event) => (
                <button
                  key={event.id}
                  className={`event-card ${selectedEvent?.id === event.id ? "selected" : ""}`}
                  onClick={() => {
                    const firstSector = event.sectors[0];
                    setSelectedEventId(event.id);
                    setSelectedSectorId(firstSector?.id ?? "");
                    setSelectedTicketTypeId(ticketTypesFor(firstSector)[0]?.id ?? "");
                  }}
                >
                  <span>
                    <strong>{event.name}</strong>
                    <small>{formatDate(event.latestSnapshot?.checkedAt)}</small>
                  </span>
                  <span className={event.active ? "pill live" : "pill muted"}>{event.active ? "Ativo" : "Pausado"}</span>
                </button>
              ))
            )}
          </div>

          <form className="panel" onSubmit={submitSubscription}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Aviso por WhatsApp</p>
                <h2>{selectedEvent?.name ?? "Selecione um evento"}</h2>
              </div>
            </div>

            {selectedEvent && (
              <div className="sector-grid">
                {selectedEvent.sectors.map((sector) => {
                  const ticketTypeId = selectedTicketTypeId || ticketTypesFor(sector)[0]?.id || "default";
                  const status = optionStatus(selectedEvent, sector.id, ticketTypeId);

                  return (
                    <button
                      type="button"
                      key={sector.id}
                      className={`sector-option ${selectedSectorId === sector.id ? "selected" : ""}`}
                      onClick={() => {
                        setSelectedSectorId(sector.id);
                        setSelectedTicketTypeId(ticketTypesFor(sector)[0]?.id ?? "");
                      }}
                    >
                      <span>{sector.name}</span>
                      <span className={`status ${status}`}>{statusIcon[status]} {statusLabel[status]}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {selectedSector && (
              <div className="mode-block">
                <p className="eyebrow">Modalidade</p>
                <div className="sector-grid">
                  {selectedTicketTypes.map((ticketType) => {
                    const status = selectedEvent
                      ? optionStatus(selectedEvent, selectedSector.id, ticketType.id)
                      : "unknown";

                    return (
                      <button
                        type="button"
                        key={ticketType.id}
                        className={`sector-option compact-option ${selectedTicketTypeId === ticketType.id ? "selected" : ""}`}
                        onClick={() => setSelectedTicketTypeId(ticketType.id)}
                      >
                        <span>{ticketType.name}</span>
                        <span className={`status ${status}`}>{statusIcon[status]} {statusLabel[status]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <label>
              Nome
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </label>

            <label>
              WhatsApp
              <input
                value={phone}
                onChange={(event) => setPhone(formatPhoneInput(event.target.value))}
                inputMode="tel"
                maxLength={14}
                placeholder="(11)99999-9999"
                required
              />
            </label>

            <label className="checkline">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                required
              />
              <span>Aceito receber aviso deste evento por WhatsApp.</span>
            </label>

            <button className="primary" disabled={!canSubmitSubscription} type="submit">
              {busy ? <Loader2 className="spin" size={18} /> : <Bell size={18} />}
              Receber aviso
            </button>
          </form>
        </section>
      ) : (
        <section className="workspace admin-grid">
          <form className="panel compact" onSubmit={createEvent}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Cadastro</p>
                <h2>Novo evento</h2>
              </div>
            </div>

            <label>
              Token admin
              <div className="inline-action">
                <input value={adminToken} onChange={(event) => setAdminToken(event.target.value)} />
                <button type="button" className="icon-button" onClick={saveToken} title="Salvar token">
                  <Save size={18} />
                </button>
                <button type="button" className="icon-button" onClick={() => void loadStatus()} title="Ver status">
                  <TerminalSquare size={18} />
                </button>
              </div>
            </label>

            {statusText && <pre className="status-box">{statusText}</pre>}

            <div className="test-box">
              <p className="eyebrow">Teste WhatsApp</p>
              <label>
                Nome
                <input
                  value={testWhatsAppName}
                  onChange={(event) => setTestWhatsAppName(event.target.value)}
                />
              </label>
              <label>
                WhatsApp
                <input
                  value={testWhatsAppPhone}
                  onChange={(event) => setTestWhatsAppPhone(formatPhoneInput(event.target.value))}
                  inputMode="tel"
                  maxLength={14}
                  placeholder="(11)99999-9999"
                />
              </label>
              <button
                type="button"
                className="secondary"
                disabled={busy || testWhatsAppName.trim().length < 2 || !isPhoneValid(testWhatsAppPhone)}
                onClick={() => void sendTestWhatsApp()}
              >
                <Bell size={18} />
                Enviar teste
              </button>
            </div>

            <label>
              Nome
              <input value={eventName} onChange={(event) => setEventName(event.target.value)} required />
            </label>

            <label>
              URL Ticketmaster
              <input value={eventUrl} onChange={(event) => setEventUrl(event.target.value)} required />
            </label>

            <label>
              Setores
              <textarea
                value={eventSectors}
                onChange={(event) => setEventSectors(event.target.value)}
                placeholder="PIT A&#10;PIT B&#10;Pista Premium&#10;Pista&#10;Arquibancada Norte&#10;Cadeira Leste&#10;Cadeira Oeste&#10;Cadeira Oeste Coberta"
                required
              />
            </label>

            <label>
              Modalidades
              <textarea
                aria-label="Modalidades"
                value={eventTicketTypes}
                onChange={(event) => setEventTicketTypes(event.target.value)}
                placeholder="Inteira&#10;Meia-Entrada&#10;Desc. 50% - Estatuto Idoso&#10;Meia-Entrada PCD"
                required
              />
            </label>

            <label>
              Intervalo em segundos
              <input
                type="number"
                min={60}
                step={30}
                value={eventInterval}
                onChange={(event) => setEventInterval(Number(event.target.value))}
              />
            </label>

            <button className="primary" disabled={busy} type="submit">
              {busy ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}
              Salvar evento
            </button>
          </form>

          <div className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Monitor</p>
                <h2>Eventos ativos</h2>
              </div>
              <button className="icon-button" onClick={() => void loadEvents()} title="Atualizar lista">
                <RefreshCw size={18} />
              </button>
            </div>

            <div className="admin-list">
              {events.map((event) => (
                <article key={event.id} className="admin-item">
                  <div>
                    <strong>{event.name}</strong>
                    <small>{event.url}</small>
                    <small>Ultima leitura: {formatDate(event.latestSnapshot?.checkedAt)}</small>
                  </div>
                  <div className="admin-actions">
                    <button type="button" className="secondary" onClick={() => void toggleEvent(event)}>
                      {event.active ? "Pausar" : "Ativar"}
                    </button>
                    <button type="button" className="icon-button" onClick={() => void runCheck(event.id)} title="Verificar agora">
                      <RefreshCw size={18} />
                    </button>
                    <button type="button" className="icon-button danger" onClick={() => void removeEvent(event.id)} title="Remover">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </article>
              ))}
              {events.length === 0 && <div className="empty-state">Nenhum evento cadastrado.</div>}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

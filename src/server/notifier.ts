import type { AppConfig } from "./config";

export interface AvailabilityNotification {
  to: string;
  name: string;
  eventName: string;
  eventUrl: string;
  sectorName: string;
  ticketTypeName: string;
}

export class WhatsAppNotifier {
  constructor(private readonly appConfig: AppConfig) {}

  async sendAvailabilityAlert(payload: AvailabilityNotification) {
    const body = [
      `Oi, ${payload.name}!`,
      `O ingresso "${payload.ticketTypeName}" no setor "${payload.sectorName}" voltou a aparecer como disponivel para ${payload.eventName}.`,
      `Confira agora: ${payload.eventUrl}`
    ].join("\n\n");

    if (this.appConfig.whatsappProvider === "console") {
      console.info("[whatsapp:console]", {
        to: payload.to,
        body
      });
      return;
    }

    await this.sendWithTwilio(payload, body);
  }

  private async sendWithTwilio(payload: AvailabilityNotification, body: string) {
    const { twilioAccountSid, twilioAuthToken, twilioWhatsAppFrom } = this.appConfig;

    if (!twilioAccountSid || !twilioAuthToken || !twilioWhatsAppFrom) {
      throw new Error("Credenciais Twilio ausentes.");
    }

    const params = new URLSearchParams({
      From: twilioWhatsAppFrom,
      To: `whatsapp:${payload.to}`
    });

    if (this.appConfig.twilioContentSid) {
      params.set("ContentSid", this.appConfig.twilioContentSid);
      params.set(
        "ContentVariables",
        JSON.stringify({
          "1": payload.name,
          "2": payload.ticketTypeName,
          "3": payload.sectorName,
          "4": payload.eventName,
          "5": payload.eventUrl
        })
      );
    } else {
      params.set("Body", body);
    }

    const auth = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64");
    let response: Response;

    try {
      response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: params
        }
      );
    } catch (error) {
      console.error("[twilio] connection failed", error instanceof Error ? error.message : error);
      const sendError = new Error("Falha de conexao com o WhatsApp. Tente novamente.");
      Object.assign(sendError, { status: 502 });
      throw sendError;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("[twilio] send failed", {
        status: response.status,
        body: text.slice(0, 500)
      });
      const sendError = new Error("Twilio recusou o envio. Verifique sandbox, telefone e credenciais.");
      Object.assign(sendError, { status: 502 });
      throw sendError;
    }
  }
}

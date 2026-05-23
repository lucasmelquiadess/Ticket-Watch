import "dotenv/config";
import path from "node:path";

const toInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const minInterval = Math.max(toInt(process.env.MIN_CHECK_INTERVAL_SECONDS, 60), 30);

export const config = {
  nodeEnv: process.env.NODE_ENV?.trim() || "development",
  port: toInt(process.env.PORT, 4000),
  dataFile: process.env.DATA_FILE ?? path.resolve(process.cwd(), "data", "store.json"),
  monitorEnabled: process.env.MONITOR_ENABLED !== "false",
  monitorEngine: process.env.MONITOR_ENGINE === "playwright" ? "playwright" : "html",
  defaultCheckIntervalSeconds: Math.max(
    toInt(process.env.DEFAULT_CHECK_INTERVAL_SECONDS, 60),
    minInterval
  ),
  minCheckIntervalSeconds: minInterval,
  checkTimeoutMs: toInt(process.env.CHECK_TIMEOUT_MS, 30000),
  allowNonTicketmasterUrls: process.env.ALLOW_NON_TICKETMASTER_URLS === "true",
  adminToken: process.env.ADMIN_TOKEN?.trim() || "",
  corsOrigin: process.env.CORS_ORIGIN?.trim() || "",
  whatsappProvider: process.env.WHATSAPP_PROVIDER === "twilio" ? "twilio" : "console",
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID?.trim() || "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN?.trim() || "",
  twilioWhatsAppFrom: process.env.TWILIO_WHATSAPP_FROM?.trim() || "",
  twilioContentSid: process.env.TWILIO_CONTENT_SID?.trim() || ""
} as const;

export type AppConfig = typeof config;

export const validateConfig = (appConfig: AppConfig) => {
  const errors: string[] = [];

  if (!appConfig.adminToken || appConfig.adminToken.length < 32) {
    errors.push("ADMIN_TOKEN deve ter pelo menos 32 caracteres.");
  }

  if (appConfig.nodeEnv === "production" && appConfig.allowNonTicketmasterUrls) {
    errors.push("ALLOW_NON_TICKETMASTER_URLS deve ficar false em producao.");
  }

  if (appConfig.whatsappProvider === "twilio") {
    if (!appConfig.twilioAccountSid || !appConfig.twilioAuthToken || !appConfig.twilioWhatsAppFrom) {
      errors.push("Credenciais Twilio incompletas.");
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }
};

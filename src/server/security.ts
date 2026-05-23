import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitBucket>();

const clientKey = (request: Request) =>
  request.ip || request.socket.remoteAddress || "unknown";

const sameSecret = (candidate: string, expected: string) => {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);

  if (candidateBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(candidateBuffer, expectedBuffer);
};

const requestError = (message: string, status: number) => {
  const error = new Error(message);
  Object.assign(error, { status });
  return error;
};

export const requireAdminToken = (adminToken: string, request: Request) => {
  if (!adminToken) {
    throw requestError("Token admin nao configurado.", 503);
  }

  const token = request.header("x-admin-token") ?? "";

  if (!sameSecret(token, adminToken)) {
    throw requestError("Token admin invalido.", 401);
  }
};

export const securityHeaders = (_request: Request, response: Response, next: NextFunction) => {
  response.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; base-uri 'self'; frame-ancestors 'none'");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
};

export const createRateLimit = ({ windowMs, maxRequests, keyPrefix }: RateLimitOptions) => {
  return (request: Request, response: Response, next: NextFunction) => {
    const now = Date.now();
    const key = `${keyPrefix}:${clientKey(request)}`;
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + windowMs
      });
      next();
      return;
    }

    current.count += 1;
    const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000);
    response.setHeader("Retry-After", String(retryAfterSeconds));

    if (current.count > maxRequests) {
      response.status(429).json({
        error: "Muitas tentativas. Tente novamente em instantes."
      });
      return;
    }

    next();
  };
};

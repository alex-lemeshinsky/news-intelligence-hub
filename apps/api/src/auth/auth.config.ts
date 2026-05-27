import type { JwtModuleOptions } from '@nestjs/jwt';
import type { CookieOptions } from 'express';

const DEFAULT_COOKIE_NAME = 'nih_access_token';
const DEFAULT_COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;
const DEFAULT_WEB_ORIGIN = 'http://localhost:3000';
type JwtSignOptions = NonNullable<JwtModuleOptions['signOptions']>;

export function getAuthCookieName(): string {
  return process.env.AUTH_COOKIE_NAME?.trim() || DEFAULT_COOKIE_NAME;
}

export function getAuthCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    maxAge: getCookieMaxAgeSeconds() * 1000,
    path: '/',
    sameSite: getCookieSameSite(),
    secure: getCookieSecure(),
  };
}

export function getAuthClearCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    path: '/',
    sameSite: getCookieSameSite(),
    secure: getCookieSecure(),
  };
}

export function getJwtModuleOptions(): JwtModuleOptions {
  return {
    secret: process.env.JWT_SECRET?.trim() || 'dev-secret',
    signOptions: {
      expiresIn: getJwtExpiresIn(),
    },
  };
}

export function getWebOrigin(): string {
  return process.env.WEB_ORIGIN?.trim() || DEFAULT_WEB_ORIGIN;
}

export function getDevConfirmationEnabled(): boolean {
  return parseBoolean(
    process.env.DEV_EMAIL_CONFIRMATION,
    process.env.NODE_ENV !== 'production',
  );
}

export function buildDevConfirmationUrl(token: string): string {
  const url = new URL('/confirm-email', getWebOrigin());
  url.searchParams.set('token', token);
  return url.toString();
}

function getCookieMaxAgeSeconds(): number {
  const rawValue = process.env.AUTH_COOKIE_MAX_AGE_SECONDS;
  if (!rawValue) {
    return DEFAULT_COOKIE_MAX_AGE_SECONDS;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsedValue) && parsedValue > 0
    ? parsedValue
    : DEFAULT_COOKIE_MAX_AGE_SECONDS;
}

function getJwtExpiresIn(): JwtSignOptions['expiresIn'] {
  return (process.env.JWT_EXPIRES_IN?.trim() ||
    '1d') as JwtSignOptions['expiresIn'];
}

function getCookieSecure(): boolean {
  return parseBoolean(
    process.env.AUTH_COOKIE_SECURE,
    process.env.NODE_ENV === 'production',
  );
}

function getCookieSameSite(): CookieOptions['sameSite'] {
  const rawValue = process.env.AUTH_COOKIE_SAME_SITE?.trim().toLowerCase();

  if (rawValue === 'strict' || rawValue === 'none') {
    return rawValue;
  }

  return 'lax';
}

function parseBoolean(
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  return value.trim().toLowerCase() === 'true';
}

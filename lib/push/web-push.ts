import * as webPush from 'web-push';
import type { PushSubscription } from 'web-push';

export type PixelPushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
};

export type PixelPushTarget = {
  id: string;
  subscription: PushSubscription;
};

export type PixelPushProviderError = {
  id: string;
  endpointHost?: string;
  statusCode?: number;
  reason: string;
  message?: string;
  body?: string;
};

export type PixelPushResult = {
  skipped: boolean;
  reason?: string;
  attempted: number;
  sent: number;
  failed: number;
  expiredIds: string[];
  providerErrors?: PixelPushProviderError[];
};

const cleanEnvValue = (value?: string) => {
  const trimmed = (value || '').trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
};

const normalizeWebPushSubject = (value?: string) => {
  const subject = cleanEnvValue(value);
  if (!subject) return '';
  if (/^mailto:/i.test(subject) || /^https:\/\//i.test(subject)) return subject;
  if (/^http:\/\//i.test(subject)) return subject.replace(/^http:/i, 'https:');
  if (subject.includes('@')) return `mailto:${subject}`;
  return `https://${subject.replace(/^\/+/, '')}`;
};

const getWebPushConfig = () => {
  const publicKey = cleanEnvValue(process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY);
  const privateKey = cleanEnvValue(process.env.WEB_PUSH_PRIVATE_KEY);
  const subject = normalizeWebPushSubject(
    process.env.WEB_PUSH_SUBJECT || process.env.NEXT_PUBLIC_SITE_URL || ''
  );

  if (!publicKey || !privateKey || !subject) {
    return null;
  }

  return {
    publicKey,
    privateKey,
    subject,
  };
};

const isExpiredSubscriptionError = (error: unknown) => {
  const statusCode = Number((error as any)?.statusCode || 0);
  return statusCode === 404 || statusCode === 410;
};

const truncateDiagnostic = (value: unknown) => {
  if (!value) return undefined;
  return String(value).replace(/\s+/g, ' ').trim().slice(0, 300);
};

const getEndpointHost = (endpoint?: string) => {
  if (!endpoint) return undefined;
  try {
    return new URL(endpoint).host;
  } catch {
    return undefined;
  }
};

const getProviderErrorReason = (statusCode: number) => {
  if (statusCode === 400) return 'invalid_push_request';
  if (statusCode === 401 || statusCode === 403) return 'vapid_auth_rejected';
  if (statusCode === 413) return 'payload_too_large';
  if (statusCode === 429) return 'provider_rate_limited';
  if (statusCode >= 500) return 'provider_unavailable';
  return 'provider_rejected';
};

const buildProviderError = (target: PixelPushTarget, error: unknown): PixelPushProviderError => {
  const statusCode = Number((error as any)?.statusCode || 0);
  const providerError: PixelPushProviderError = {
    id: target.id,
    endpointHost: getEndpointHost(target.subscription?.endpoint),
    reason: getProviderErrorReason(statusCode),
    message: truncateDiagnostic((error as any)?.message),
    body: truncateDiagnostic((error as any)?.body),
  };

  if (statusCode) {
    providerError.statusCode = statusCode;
  }

  return providerError;
};

export const sendPixelPushBatch = async (
  targets: PixelPushTarget[],
  payload: PixelPushPayload
): Promise<PixelPushResult> => {
  const config = getWebPushConfig();

  if (!config) {
    return {
      skipped: true,
      reason: 'missing_web_push_config',
      attempted: 0,
      sent: 0,
      failed: 0,
      expiredIds: [],
      providerErrors: [],
    };
  }

  if (targets.length === 0) {
    return {
      skipped: true,
      reason: 'no_active_subscriptions',
      attempted: 0,
      sent: 0,
      failed: 0,
      expiredIds: [],
      providerErrors: [],
    };
  }

  const notificationPayload = JSON.stringify({
    icon: '/icons/pixel-project-icon-192.png',
    badge: '/icons/pixel-project-icon-192.png',
    ...payload,
  });

  const results = await Promise.allSettled(
    targets.map((target) =>
      webPush.sendNotification(target.subscription, notificationPayload, {
        vapidDetails: config,
        TTL: 60 * 60 * 24,
        urgency: 'high',
        contentEncoding: 'aes128gcm',
      })
    )
  );

  const expiredIds: string[] = [];
  const providerErrors: PixelPushProviderError[] = [];
  let sent = 0;
  let failed = 0;

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      sent += 1;
      return;
    }

    failed += 1;
    if (isExpiredSubscriptionError(result.reason)) {
      expiredIds.push(targets[index].id);
      return;
    }

    const providerError = buildProviderError(targets[index], result.reason);
    providerErrors.push(providerError);
    console.warn('Pixel push provider rejected notification', providerError);
  });

  return {
    skipped: false,
    reason: failed > 0 ? 'web_push_provider_rejected' : undefined,
    attempted: targets.length,
    sent,
    failed,
    expiredIds,
    providerErrors,
  };
};

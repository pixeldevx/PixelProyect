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

export type PixelPushResult = {
  skipped: boolean;
  reason?: string;
  attempted: number;
  sent: number;
  failed: number;
  expiredIds: string[];
};

const getWebPushConfig = () => {
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY || '';
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY || '';
  const subject = process.env.WEB_PUSH_SUBJECT || process.env.NEXT_PUBLIC_SITE_URL || '';

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
    }
  });

  return {
    skipped: false,
    attempted: targets.length,
    sent,
    failed,
    expiredIds,
  };
};

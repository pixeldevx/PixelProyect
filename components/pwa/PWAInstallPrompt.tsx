"use client";

import { useEffect, useMemo, useState } from 'react';
import { Bell, Download, Share, Smartphone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/backend';
import { doc, serverTimestamp, setDoc } from '@/lib/supabase/document-store';
import { toast } from 'sonner';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const DISMISSED_KEY = 'pixel-project-pwa-dismissed';
const WEB_PUSH_PUBLIC_KEY = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY || '';

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
};

const hashEndpoint = async (endpoint: string) => {
  const data = new TextEncoder().encode(endpoint);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const isIosDevice = () => {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
};

const isStandaloneMode = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((window.navigator as any).standalone);
};

export function PWAInstallPrompt() {
  const { user, userOrganizationIds } = useAuth();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isDismissed, setIsDismissed] = useState(true);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [isSavingSubscription, setIsSavingSubscription] = useState(false);

  const canUseNotifications = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  }, []);

  const hasPushKey = Boolean(WEB_PUSH_PUBLIC_KEY);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsDismissed(window.localStorage.getItem(DISMISSED_KEY) === 'true');
    setIsStandalone(isStandaloneMode());
    setIsIos(isIosDevice());
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setIsDismissed(false);
    };

    const onAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      window.localStorage.removeItem(DISMISSED_KEY);
      toast.success('Pixel Project quedo instalado.');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js')
      .then((serviceWorkerRegistration) => setRegistration(serviceWorkerRegistration))
      .catch((error) => {
        console.warn('No fue posible registrar la PWA:', error);
      });
  }, []);

  const handleDismiss = () => {
    window.localStorage.setItem(DISMISSED_KEY, 'true');
    setIsDismissed(true);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);

    if (choice.outcome === 'accepted') {
      window.localStorage.removeItem(DISMISSED_KEY);
      toast.success('Pixel Project se esta instalando.');
    }
  };

  const handleEnableNotifications = async () => {
    if (!user || !registration || !canUseNotifications || !hasPushKey) return;

    setIsSavingSubscription(true);
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);

      if (permission !== 'granted') {
        toast.error('Las notificaciones quedaron bloqueadas en este dispositivo.');
        return;
      }

      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription =
        existingSubscription ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(WEB_PUSH_PUBLIC_KEY),
        }));

      const subscriptionJson = subscription.toJSON();
      const subscriptionId = await hashEndpoint(subscription.endpoint);

      await setDoc(
        doc(db, 'push_subscriptions', subscriptionId),
        {
          userId: user.uid,
          email: user.email || null,
          organizationIds: userOrganizationIds || [],
          endpoint: subscription.endpoint,
          subscription: subscriptionJson,
          permission,
          isActive: true,
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      toast.success('Notificaciones activadas en este dispositivo.');
    } catch (error) {
      console.error('Error enabling push notifications:', error);
      toast.error('No fue posible activar las notificaciones push.');
    } finally {
      setIsSavingSubscription(false);
    }
  };

  if (!user || isDismissed) return null;

  const shouldShowInstall = !isStandalone && (Boolean(deferredPrompt) || isIos);
  const shouldShowPush = isStandalone && canUseNotifications && notificationPermission !== 'granted' && hasPushKey;

  if (!shouldShowInstall && !shouldShowPush) return null;

  return (
    <div className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md md:bottom-5 md:left-auto md:right-5 md:mx-0">
      <div className="rounded-2xl border border-indigo-100 bg-white/95 p-3 shadow-2xl shadow-indigo-950/15 backdrop-blur">
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="Cerrar"
        >
          <X size={15} />
        </button>

        <div className="flex gap-3 pr-8">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/25">
            {shouldShowPush ? <Bell size={20} /> : <Smartphone size={20} />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-slate-950">
              {shouldShowPush ? 'Activa alertas moviles' : 'Instala Pixel Project'}
            </p>
            <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
              {isIos && shouldShowInstall
                ? 'En iPhone: compartir, luego Agregar a pantalla de inicio.'
                : shouldShowPush
                  ? 'Recibe tareas y workflows directo en este dispositivo.'
                  : 'Accede como app, con pantalla completa y acceso rapido.'}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {deferredPrompt && shouldShowInstall && (
                <Button size="sm" onClick={() => void handleInstall()} className="h-8 bg-indigo-600 text-xs font-black hover:bg-indigo-700">
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Instalar
                </Button>
              )}
              {isIos && shouldShowInstall && (
                <span className="inline-flex h-8 items-center gap-1 rounded-md bg-slate-100 px-2.5 text-xs font-black text-slate-700">
                  <Share className="h-3.5 w-3.5" />
                  Compartir
                </span>
              )}
              {shouldShowPush && (
                <Button
                  size="sm"
                  onClick={() => void handleEnableNotifications()}
                  disabled={isSavingSubscription}
                  className="h-8 bg-emerald-600 text-xs font-black hover:bg-emerald-700"
                >
                  <Bell className="mr-1.5 h-3.5 w-3.5" />
                  {isSavingSubscription ? 'Activando...' : 'Activar'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

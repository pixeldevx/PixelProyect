"use client"

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  Database,
  Loader2,
  Save,
  ShieldCheck,
  TestTube2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { doc, onSnapshot, serverTimestamp, setDoc } from '@/lib/supabase/document-store';
import { db, supabase } from '@/lib/backend';
import { useAuth } from '@/hooks/useAuth';

type StorageProvider = 'supabase' | 's3';

type StorageSettings = {
  provider: StorageProvider;
  s3Bucket: string;
  s3Region: string;
  s3Prefix: string;
  maxFileSizeMb: string;
  allowedContentTypes: string;
};

const CONFIG_DOC_PATH = ['app_config', 'document_storage'] as const;

const DEFAULT_SETTINGS: StorageSettings = {
  provider: 'supabase',
  s3Bucket: '',
  s3Region: '',
  s3Prefix: 'pixel-project',
  maxFileSizeMb: '',
  allowedContentTypes: '',
};

const providerCopy = {
  supabase: {
    title: 'Supabase Storage',
    description: 'Proveedor actual del MVP. Mantiene compatibilidad con documentos históricos.',
    icon: Database,
  },
  s3: {
    title: 'Amazon S3',
    description: 'Almacenamiento externo para escalar archivos pesados con bucket privado.',
    icon: Cloud,
  },
} as const;

const normalizeAllowedTypes = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export function DocumentStorageManagement() {
  const { user, userRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settings, setSettings] = useState<StorageSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<any>(null);

  const canManage = userRole === 'admin';
  const activeProvider = providerCopy[settings.provider];
  const ActiveProviderIcon = activeProvider.icon;

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, ...CONFIG_DOC_PATH),
      (snapshot) => {
        const data = snapshot.exists() ? snapshot.data() : {};
        setSettings({
          provider: data.provider === 's3' ? 's3' : 'supabase',
          s3Bucket: data.s3Bucket || '',
          s3Region: data.s3Region || '',
          s3Prefix: data.s3Prefix || 'pixel-project',
          maxFileSizeMb: data.maxFileSizeMb ? String(data.maxFileSizeMb) : '',
          allowedContentTypes: Array.isArray(data.allowedContentTypes)
            ? data.allowedContentTypes.join(', ')
            : data.allowedContentTypes || '',
        });
        setLoading(false);
      },
      (error) => {
        console.error('Error loading document storage config:', error);
        toast.error('No se pudo cargar la configuración documental.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [canManage]);

  const allowedTypesPreview = useMemo(
    () => normalizeAllowedTypes(settings.allowedContentTypes),
    [settings.allowedContentTypes]
  );

  const authHeaders = async (): Promise<HeadersInit> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchStatus = async () => {
    const headers = await authHeaders();
    const response = await fetch('/api/storage/test', { headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'No se pudo leer el estado.');
    setStatus(payload);
    return payload;
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const headers = await authHeaders();
      const response = await fetch('/api/storage/test', {
        method: 'POST',
        headers,
      });
      const payload = await response.json().catch(() => ({}));
      setStatus(payload);

      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || 'La prueba no fue exitosa.');
      }

      toast.success(payload.message || 'Gestor documental probado correctamente.');
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo probar el gestor documental.');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage || !user) return;

    setSaving(true);
    try {
      const maxFileSizeMb = Number(settings.maxFileSizeMb);
      await setDoc(
        doc(db, ...CONFIG_DOC_PATH),
        {
          provider: settings.provider,
          s3Bucket: settings.s3Bucket.trim() || null,
          s3Region: settings.s3Region.trim() || null,
          s3Prefix: settings.s3Prefix.trim() || null,
          maxFileSizeMb: Number.isFinite(maxFileSizeMb) && maxFileSizeMb > 0 ? maxFileSizeMb : null,
          allowedContentTypes: allowedTypesPreview,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
          updatedByEmail: user.email || null,
        },
        { merge: true }
      );

      toast.success('Gestor documental actualizado.');
      await fetchStatus().catch(() => null);
    } catch (error: any) {
      console.error('Error saving document storage config:', error);
      toast.error(error?.message || 'No se pudo guardar la configuración.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!canManage) return;
    fetchStatus().catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  if (!canManage) return null;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-slate-200">
        <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-cyan-200 ring-1 ring-white/20">
                <ShieldCheck size={24} />
              </div>
              <div>
                <CardTitle className="text-2xl">Gestor documental</CardTitle>
                <CardDescription className="mt-1 max-w-2xl text-slate-300">
                  Reapunta el almacenamiento de archivos sin mover usuarios, permisos ni metadatos.
                  Los secretos viven en Vercel; este panel controla el proveedor y diagnostica la conexión.
                </CardDescription>
              </div>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-200">
                Proveedor activo
              </div>
              <div className="mt-1 flex items-center gap-2 text-lg font-black">
                <ActiveProviderIcon size={18} />
                {activeProvider.title}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm font-semibold text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Cargando configuración...
            </div>
          ) : (
            <form onSubmit={handleSave} className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-6 p-6">
                <div className="grid gap-4 md:grid-cols-2">
                  {(['supabase', 's3'] as StorageProvider[]).map((provider) => {
                    const copy = providerCopy[provider];
                    const Icon = copy.icon;
                    const isActive = settings.provider === provider;
                    return (
                      <button
                        key={provider}
                        type="button"
                        onClick={() => setSettings((current) => ({ ...current, provider }))}
                        className={`rounded-2xl border p-5 text-left transition ${
                          isActive
                            ? 'border-indigo-500 bg-indigo-50 shadow-sm ring-2 ring-indigo-500/15'
                            : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                              isActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                            }`}>
                              <Icon size={21} />
                            </div>
                            <div>
                              <div className="font-black text-slate-950">{copy.title}</div>
                              <div className="mt-1 text-sm text-slate-500">{copy.description}</div>
                            </div>
                          </div>
                          {isActive && <CheckCircle2 className="h-5 w-5 text-indigo-600" />}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="mb-4">
                    <h3 className="text-lg font-black text-slate-950">Configuración de Amazon S3</h3>
                    <p className="text-sm font-medium text-slate-500">
                      Estos datos no son secretos. Las llaves AWS deben estar en variables de entorno de Vercel.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Bucket</span>
                      <input
                        value={settings.s3Bucket}
                        onChange={(event) => setSettings((current) => ({ ...current, s3Bucket: event.target.value }))}
                        placeholder="pixel-project-documents"
                        className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Región</span>
                      <input
                        value={settings.s3Region}
                        onChange={(event) => setSettings((current) => ({ ...current, s3Region: event.target.value }))}
                        placeholder="us-east-1"
                        className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </label>
                    <label className="space-y-1 md:col-span-2">
                      <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Prefijo</span>
                      <input
                        value={settings.s3Prefix}
                        onChange={(event) => setSettings((current) => ({ ...current, s3Prefix: event.target.value }))}
                        placeholder="pixel-project/produccion"
                        className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Peso máximo MB</span>
                      <input
                        value={settings.maxFileSizeMb}
                        onChange={(event) => setSettings((current) => ({ ...current, maxFileSizeMb: event.target.value }))}
                        placeholder="50"
                        inputMode="decimal"
                        className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Tipos MIME permitidos</span>
                      <input
                        value={settings.allowedContentTypes}
                        onChange={(event) => setSettings((current) => ({ ...current, allowedContentTypes: event.target.value }))}
                        placeholder="application/pdf, image/png"
                        className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </label>
                  </div>
                </div>
              </div>

              <aside className="border-t border-slate-200 bg-slate-50 p-6 xl:border-l xl:border-t-0">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex items-center gap-2">
                      {status?.s3Ready || settings.provider === 'supabase' ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-orange-600" />
                      )}
                      <h3 className="font-black text-slate-950">Estado de conexión</h3>
                    </div>
                    <p className="mt-2 text-sm font-medium text-slate-500">
                      {settings.provider === 'supabase'
                        ? 'Supabase Storage está seleccionado. Amazon S3 queda listo como alternativa.'
                        : status?.s3Ready
                          ? 'Las variables mínimas de S3 están presentes.'
                          : 'Faltan variables server-only en Vercel para activar S3.'}
                    </p>

                    {status?.missingS3Variables?.length > 0 && (
                      <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-3">
                        <div className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">
                          Variables faltantes
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {status.missingS3Variables.map((item: string) => (
                            <span key={item} className="rounded-full bg-white px-2 py-1 text-xs font-black text-orange-700">
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                      Variables de Vercel requeridas
                    </div>
                    <ul className="mt-3 space-y-2 text-sm font-semibold text-slate-700">
                      <li>AWS_ACCESS_KEY_ID</li>
                      <li>AWS_SECRET_ACCESS_KEY</li>
                      <li>AWS_REGION</li>
                      <li>AWS_S3_BUCKET</li>
                      <li className="text-slate-400">DOCUMENT_STORAGE_PROVIDER=s3</li>
                    </ul>
                  </div>

                  <div className="flex flex-col gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleTest}
                      disabled={testing}
                      className="h-11 border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                    >
                      {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TestTube2 className="mr-2 h-4 w-4" />}
                      Probar conexión
                    </Button>
                    <Button
                      type="submit"
                      disabled={saving}
                      className="h-11 bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Guardar configuración
                    </Button>
                  </div>
                </div>
              </aside>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

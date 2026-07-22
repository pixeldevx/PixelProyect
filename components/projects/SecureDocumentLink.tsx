"use client";

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { storage } from '@/lib/backend';
import { getAuthorizedDownloadURL, ref } from '@/lib/supabase/storage-shim';

export function SecureDocumentLink({
  storagePath,
  fallbackUrl,
  className,
  children,
  title,
}: {
  storagePath?: string | null;
  fallbackUrl?: string | null;
  className?: string;
  children: React.ReactNode;
  title?: string;
}) {
  const [opening, setOpening] = useState(false);

  const handleOpen = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const url = storagePath
        ? await getAuthorizedDownloadURL(ref(storage, storagePath))
        : String(fallbackUrl || '');
      if (!url) throw new Error('El soporte no tiene una ruta disponible.');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo abrir el soporte.');
    } finally {
      setOpening(false);
    }
  };

  return (
    <button type="button" onClick={handleOpen} disabled={opening} className={className} title={title}>
      {opening && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

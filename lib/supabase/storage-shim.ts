import { supabase, SUPABASE_STORAGE_BUCKET } from './client';
import { formatS3StoragePath, parseS3StoragePath } from '@/lib/storage/paths';

type StorageRoot = { bucket?: string };
type StorageRef = {
  bucket: string;
  fullPath: string;
  provider?: 'supabase' | 's3';
  key?: string;
};

const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const S3_BROWSER_UPLOAD_ERROR =
  'Amazon S3 bloqueó la carga desde el navegador. La conexión servidor-S3 puede estar correcta, pero falta configurar CORS del bucket para permitir PUT desde este dominio.';

const getS3DownloadPath = (storageRef: StorageRef) => {
  if (storageRef.provider === 's3' && storageRef.key) {
    return formatS3StoragePath(storageRef.bucket, storageRef.key);
  }

  return parseS3StoragePath(storageRef.fullPath) ? storageRef.fullPath : null;
};

export const ref = (storage: StorageRoot, path: string): StorageRef => {
  const cleanPath = path.replace(/^\/+/, '');
  const parsedS3Path = parseS3StoragePath(cleanPath);

  if (parsedS3Path) {
    return {
      bucket: parsedS3Path.bucket,
      fullPath: cleanPath,
      provider: 's3',
      key: parsedS3Path.key,
    };
  }

  return {
    bucket: storage.bucket || SUPABASE_STORAGE_BUCKET,
    fullPath: cleanPath,
    provider: 'supabase',
  };
};

export const uploadBytes = async (storageRef: StorageRef, file: File) => {
  const headers = await getAuthHeaders();
  const planResponse = await fetch('/api/storage/upload-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({
      path: storageRef.fullPath,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      size: file.size,
    }),
  });

  if (planResponse.ok) {
    const plan = await planResponse.json();
    if (plan.provider === 's3') {
      let uploadResponse: Response;
      try {
        uploadResponse = await fetch(plan.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: file.type ? { 'Content-Type': file.type } : undefined,
        });
      } catch (error) {
        console.error('Browser upload to S3 failed:', error);
        throw new Error(S3_BROWSER_UPLOAD_ERROR);
      }

      if (!uploadResponse.ok) {
        const message = await uploadResponse.text().catch(() => '');
        throw new Error(`Amazon S3 rechazó la carga (${uploadResponse.status}). ${message}`.trim());
      }

      storageRef.provider = 's3';
      storageRef.bucket = plan.bucket;
      storageRef.key = plan.key;
      storageRef.fullPath = plan.storagePath;
      return { ref: storageRef };
    }
  } else if (planResponse.status >= 400 && planResponse.status !== 404) {
    const errorPayload = await planResponse.json().catch(() => null);
    throw new Error(errorPayload?.error || 'No se pudo preparar la carga del archivo.');
  }

  const { error } = await supabase.storage
    .from(storageRef.bucket)
    .upload(storageRef.fullPath, file, { upsert: true });

  if (error) throw error;
  return { ref: storageRef };
};

export const uploadBytesResumable = uploadBytes;

export const getDownloadURL = async (storageRef: StorageRef) => {
  const s3Path = getS3DownloadPath(storageRef);
  if (s3Path) {
    return `/api/storage/download?path=${encodeURIComponent(s3Path)}`;
  }

  const { data } = supabase.storage.from(storageRef.bucket).getPublicUrl(storageRef.fullPath);
  return data.publicUrl;
};

export const getAuthorizedDownloadURL = async (storageRef: StorageRef) => {
  const s3Path = getS3DownloadPath(storageRef);
  if (s3Path) {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/storage/download', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({ path: s3Path }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.url) {
      throw new Error(payload?.error || 'No se pudo autorizar la apertura del documento.');
    }
    return String(payload.url);
  }

  const { data, error } = await supabase.storage
    .from(storageRef.bucket)
    .createSignedUrl(storageRef.fullPath, 300);
  if (error || !data?.signedUrl) throw error || new Error('No se pudo firmar el documento.');
  return data.signedUrl;
};

export const deleteObject = async (storageRef: StorageRef) => {
  const s3Path = getS3DownloadPath(storageRef);
  if (s3Path) {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/storage/object', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({ path: s3Path }),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null);
      throw new Error(errorPayload?.error || 'No se pudo eliminar el archivo en Amazon S3.');
    }
    return;
  }

  const { error } = await supabase.storage.from(storageRef.bucket).remove([storageRef.fullPath]);
  if (error) throw error;
};

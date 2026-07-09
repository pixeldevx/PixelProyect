import { createClient } from '@supabase/supabase-js';
import { normalizeStorageKey, type DocumentStorageProvider } from './paths';

const DOCUMENTS_TABLE = 'app_documents';
const CONFIG_COLLECTION = 'app_config';
const CONFIG_DOC_ID = 'document_storage';

export type DocumentStorageSettings = {
  provider: DocumentStorageProvider;
  s3Bucket: string;
  s3Region: string;
  s3Prefix: string;
  maxFileSizeMb: number | null;
  allowedContentTypes: string[];
  updatedAt?: string;
  updatedBy?: string;
  updatedByEmail?: string;
};

export type S3RuntimeConfig = {
  bucket: string;
  region: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};

export type StorageConfigStatus = {
  provider: DocumentStorageProvider;
  settings: DocumentStorageSettings;
  s3Ready: boolean;
  missingS3Variables: string[];
  publicBaseUrl: string;
};

const normalizeProvider = (value: unknown): DocumentStorageProvider =>
  String(value || '').toLowerCase() === 's3' ? 's3' : 'supabase';

const numberOrNull = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const splitContentTypes = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }

  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

export const getServerSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

export const getBearerToken = (request: Request) => {
  const header = request.headers.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' ? token : '';
};

export const getAuthenticatedUser = async (request: Request) => {
  const token = getBearerToken(request);
  const supabase = getServerSupabaseClient();

  if (!token || !supabase) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
};

export const getDocumentStorageSettings = async (): Promise<DocumentStorageSettings> => {
  const envProvider = normalizeProvider(process.env.DOCUMENT_STORAGE_PROVIDER);
  const defaults: DocumentStorageSettings = {
    provider: envProvider,
    s3Bucket: process.env.AWS_S3_BUCKET || '',
    s3Region: process.env.AWS_REGION || '',
    s3Prefix: normalizeStorageKey(process.env.AWS_S3_PREFIX || 'pixel-project'),
    maxFileSizeMb: numberOrNull(process.env.DOCUMENT_STORAGE_MAX_FILE_SIZE_MB),
    allowedContentTypes: splitContentTypes(process.env.DOCUMENT_STORAGE_ALLOWED_TYPES),
  };

  const supabase = getServerSupabaseClient();
  if (!supabase) return defaults;

  const { data, error } = await supabase
    .from(DOCUMENTS_TABLE)
    .select('data')
    .eq('collection_path', CONFIG_COLLECTION)
    .eq('doc_id', CONFIG_DOC_ID)
    .maybeSingle();

  if (error || !data?.data) return defaults;

  const saved = data.data as Record<string, any>;
  return {
    provider: normalizeProvider(saved.provider || defaults.provider),
    s3Bucket: String(saved.s3Bucket || defaults.s3Bucket || '').trim(),
    s3Region: String(saved.s3Region || defaults.s3Region || '').trim(),
    s3Prefix: normalizeStorageKey(saved.s3Prefix || defaults.s3Prefix || ''),
    maxFileSizeMb: numberOrNull(saved.maxFileSizeMb) ?? defaults.maxFileSizeMb,
    allowedContentTypes: splitContentTypes(saved.allowedContentTypes).length
      ? splitContentTypes(saved.allowedContentTypes)
      : defaults.allowedContentTypes,
    updatedAt: saved.updatedAt,
    updatedBy: saved.updatedBy,
    updatedByEmail: saved.updatedByEmail,
  };
};

export const getStorageConfigStatus = async (): Promise<StorageConfigStatus> => {
  const settings = await getDocumentStorageSettings();
  const requiredS3Variables: Array<[string, string | undefined]> = [
    ['AWS_ACCESS_KEY_ID', process.env.AWS_ACCESS_KEY_ID],
    ['AWS_SECRET_ACCESS_KEY', process.env.AWS_SECRET_ACCESS_KEY],
    ['AWS_REGION', settings.s3Region || process.env.AWS_REGION],
    ['AWS_S3_BUCKET', settings.s3Bucket || process.env.AWS_S3_BUCKET],
  ];
  const missingS3Variables = requiredS3Variables
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return {
    provider: settings.provider,
    settings,
    s3Ready: missingS3Variables.length === 0,
    missingS3Variables,
    publicBaseUrl: process.env.AWS_S3_PUBLIC_BASE_URL || '',
  };
};

export const getS3RuntimeConfig = async (): Promise<S3RuntimeConfig> => {
  const status = await getStorageConfigStatus();

  if (!status.s3Ready) {
    throw new Error(`Faltan variables para Amazon S3: ${status.missingS3Variables.join(', ')}`);
  }

  return {
    bucket: status.settings.s3Bucket || process.env.AWS_S3_BUCKET || '',
    region: status.settings.s3Region || process.env.AWS_REGION || '',
    prefix: normalizeStorageKey(status.settings.s3Prefix || process.env.AWS_S3_PREFIX || ''),
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    sessionToken: process.env.AWS_SESSION_TOKEN || undefined,
  };
};

export const buildS3ObjectKey = (prefix: string, path: string) => {
  const cleanPath = normalizeStorageKey(path);
  const cleanPrefix = normalizeStorageKey(prefix);
  return cleanPrefix ? `${cleanPrefix}/${cleanPath}` : cleanPath;
};

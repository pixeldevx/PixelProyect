import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const DOCUMENTS_TABLE = 'app_documents';

type AppDocumentRow = {
  collection_path: string;
  doc_id: string;
  data: Record<string, any>;
};

const json = (body: Record<string, any>, status = 200) =>
  NextResponse.json(body, { status });

const getBearerToken = (request: NextRequest) => {
  const header = request.headers.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' ? token : '';
};

const getAdminClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Falta configurar SUPABASE_SERVICE_ROLE_KEY en el entorno de Vercel.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

const normalizeStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    : [];

const hashEndpoint = (endpoint: string) =>
  createHash('sha256').update(endpoint).digest('hex');

const getDocument = async (supabase: any, docId: string) => {
  const { data, error } = await supabase
    .from(DOCUMENTS_TABLE)
    .select('collection_path, doc_id, data')
    .eq('collection_path', 'push_subscriptions')
    .eq('doc_id', docId)
    .maybeSingle();

  if (error) throw error;
  return (data || null) as AppDocumentRow | null;
};

export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient();
    const token = getBearerToken(request);
    const { data: requesterData, error: requesterError } = await supabase.auth.getUser(token);

    if (requesterError || !requesterData.user) {
      return json({ error: 'Sesión inválida.' }, 401);
    }

    const payload = await request.json().catch(() => null);
    const subscription = payload?.subscription || null;
    const endpoint =
      typeof subscription?.endpoint === 'string'
        ? subscription.endpoint
        : typeof payload?.endpoint === 'string'
          ? payload.endpoint
          : '';
    const keys = subscription?.keys || {};

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return json({ error: 'La suscripción push está incompleta.', reason: 'invalid_subscription' }, 400);
    }

    const now = new Date().toISOString();
    const subscriptionId = hashEndpoint(endpoint);
    const existing = await getDocument(supabase, subscriptionId);
    const organizationIds = normalizeStringArray(payload?.organizationIds);

    const { error } = await supabase.from(DOCUMENTS_TABLE).upsert(
      {
        collection_path: 'push_subscriptions',
        doc_id: subscriptionId,
        data: {
          ...(existing?.data || {}),
          userId: requesterData.user.id,
          email: requesterData.user.email || null,
          organizationIds,
          endpoint,
          subscription: {
            ...subscription,
            endpoint,
            keys,
          },
          permission: payload?.permission || 'granted',
          isActive: true,
          userAgent: typeof payload?.userAgent === 'string' ? payload.userAgent : null,
          platform: typeof payload?.platform === 'string' ? payload.platform : null,
          deactivatedAt: null,
          deactivationReason: null,
          createdAt: existing?.data?.createdAt || now,
          updatedAt: now,
        },
        updated_at: now,
      },
      { onConflict: 'collection_path,doc_id' }
    );

    if (error) throw error;

    return json({
      ok: true,
      subscriptionId,
    });
  } catch (error: any) {
    console.error('Error saving push subscription:', error);
    return json({ error: error.message || 'No fue posible guardar la suscripción push.' }, 500);
  }
}

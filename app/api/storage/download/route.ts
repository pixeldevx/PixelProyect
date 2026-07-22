import { NextRequest, NextResponse } from 'next/server';
import { createS3PresignedUrl } from '@/lib/storage/s3-presign';
import { authorizeProjectStorageAction, getS3RuntimeConfig, isDocumentStoragePathRestricted } from '@/lib/storage/server-config';
import { parseS3StoragePath } from '@/lib/storage/paths';

export const runtime = 'nodejs';

const json = (body: Record<string, any>, status = 200) => NextResponse.json(body, { status });

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const path = String(body.path || '');
    const parsed = parseS3StoragePath(path);
    if (!parsed) {
      return json({ error: 'Ruta S3 inválida.' }, 400);
    }

    const s3 = await getS3RuntimeConfig();
    if (parsed.bucket !== s3.bucket) {
      return json({ error: 'El bucket del documento no corresponde al gestor configurado.' }, 403);
    }

    const authorization = await authorizeProjectStorageAction({
      request,
      storagePath: path,
      storageKey: parsed.key,
      permission: 'documentView',
    });
    if (!authorization.ok) return json({ error: authorization.error }, authorization.status);

    const downloadUrl = createS3PresignedUrl({
      method: 'GET',
      bucket: s3.bucket,
      key: parsed.key,
      region: s3.region,
      accessKeyId: s3.accessKeyId,
      secretAccessKey: s3.secretAccessKey,
      sessionToken: s3.sessionToken,
      expiresInSeconds: 300,
    });

    return json({ url: downloadUrl, expiresInSeconds: 300 });
  } catch (error: any) {
    console.error('Error creating storage download URL:', error);
    return json({ error: error?.message || 'No se pudo abrir el documento.' }, 500);
  }
}

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get('path') || '';
  const parsed = parseS3StoragePath(path);
  if (!parsed) return json({ error: 'Ruta S3 inválida.' }, 400);

  try {
    if (await isDocumentStoragePathRestricted(path)) {
      return json({ error: 'Por seguridad, abre este documento desde Pixel Project.' }, 401);
    }
    const s3 = await getS3RuntimeConfig();
    if (parsed.bucket !== s3.bucket) return json({ error: 'Bucket inválido.' }, 403);
    return NextResponse.redirect(createS3PresignedUrl({
      method: 'GET',
      bucket: s3.bucket,
      key: parsed.key,
      region: s3.region,
      accessKeyId: s3.accessKeyId,
      secretAccessKey: s3.secretAccessKey,
      sessionToken: s3.sessionToken,
      expiresInSeconds: 300,
    }));
  } catch (error: any) {
    return json({ error: error?.message || 'No se pudo abrir el archivo.' }, 500);
  }
}

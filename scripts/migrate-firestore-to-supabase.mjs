#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const DOCUMENTS_TABLE = 'app_documents';
const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_AUTH_COLLECTIONS = ['users', 'team_members'];
const DEFAULT_EMAIL_FIELDS = ['email', 'correo', 'user.email', 'profile.email'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const apply = process.env.MIGRATE_APPLY === 'true';
const migrateAuthUsers = process.env.MIGRATE_AUTH_USERS === 'true';
const outputPath = process.env.MIGRATION_OUTPUT || '';
const batchSize = Number(process.env.MIGRATION_BATCH_SIZE || DEFAULT_BATCH_SIZE);
const authCollectionIds = new Set(
  (process.env.MIGRATION_AUTH_COLLECTIONS || DEFAULT_AUTH_COLLECTIONS.join(','))
    .split(',')
    .map((collectionId) => collectionId.trim())
    .filter(Boolean)
);
const emailFields = (process.env.MIGRATION_EMAIL_FIELDS || DEFAULT_EMAIL_FIELDS.join(','))
  .split(',')
  .map((field) => field.trim())
  .filter(Boolean);

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (apply && (!supabaseUrl || !supabaseServiceRoleKey)) {
  throw new Error(
    'Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.'
  );
}

const loadFirebaseAdmin = async () => {
  try {
    const app = await import('firebase-admin/app');
    const firestore = await import('firebase-admin/firestore');
    return { app, firestore };
  } catch {
    throw new Error(
      'Missing firebase-admin. Install it temporarily with: npm install --no-save firebase-admin'
    );
  }
};

const parseServiceAccount = () => {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return undefined;
  return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
};

const normalizeData = (value) => {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(normalizeData);
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return value;

  if (typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }

  if (typeof value.latitude === 'number' && typeof value.longitude === 'number') {
    return {
      latitude: value.latitude,
      longitude: value.longitude,
    };
  }

  if (value.path && value.id && value.parent) {
    return {
      id: value.id,
      path: value.path,
    };
  }

  if (typeof value.toBase64 === 'function') {
    return value.toBase64();
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([entryKey, entryValue]) => [entryKey, normalizeData(entryValue)])
  );
};

const normalizeEmail = (value) => {
  if (typeof value !== 'string') return '';
  const email = value.trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : '';
};

const getByPath = (source, fieldPath) => {
  return fieldPath.split('.').reduce((value, key) => {
    if (!value || typeof value !== 'object') return undefined;
    return value[key];
  }, source);
};

const findEmailInValue = (value) => {
  const directEmail = normalizeEmail(value);
  if (directEmail) return directEmail;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const nestedEmail = findEmailInValue(entry);
      if (nestedEmail) return nestedEmail;
    }
  }

  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) {
      const nestedEmail = findEmailInValue(entry);
      if (nestedEmail) return nestedEmail;
    }
  }

  return '';
};

const firstString = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
};

const compactObject = (value) =>
  Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined));

const collectCollection = async (collectionRef, rows, counts) => {
  const snapshot = await collectionRef.get();
  counts.set(collectionRef.path, (counts.get(collectionRef.path) || 0) + snapshot.size);

  for (const documentSnapshot of snapshot.docs) {
    rows.push({
      collection_path: collectionRef.path,
      doc_id: documentSnapshot.id,
      data: normalizeData(documentSnapshot.data()),
    });

    const subcollections = await documentSnapshot.ref.listCollections();
    for (const subcollection of subcollections) {
      await collectCollection(subcollection, rows, counts);
    }
  }
};

const chunk = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const upsertRows = async (supabase, rows) => {
  let migrated = 0;
  for (const rowsChunk of chunk(rows, batchSize)) {
    const { error } = await supabase
      .from(DOCUMENTS_TABLE)
      .upsert(rowsChunk, { onConflict: 'collection_path,doc_id' });

    if (error) throw error;
    migrated += rowsChunk.length;
    console.log(`Migrated ${migrated}/${rows.length} documents...`);
  }
};

const collectionIdFromPath = (collectionPath) => collectionPath.split('/').filter(Boolean).at(-1) || '';

const collectAuthUserCandidates = (rows) => {
  const candidates = new Map();

  for (const row of rows) {
    if (!authCollectionIds.has(collectionIdFromPath(row.collection_path))) continue;

    const email =
      emailFields.map((field) => normalizeEmail(getByPath(row.data, field))).find(Boolean) ||
      findEmailInValue(row.data);

    if (!email) continue;

    const existing = candidates.get(email);
    const sourcePath = `${row.collection_path}/${row.doc_id}`;
    const metadata = compactObject({
      migrated_from_firestore: true,
      display_name: firstString(
        row.data.displayName,
        row.data.display_name,
        row.data.name,
        row.data.nombre,
        row.data.fullName,
        row.data.full_name
      ),
      role: firstString(row.data.role, row.data.roleName, row.data.systemRole, row.data.rol),
      firestore_primary_source: existing?.metadata.firestore_primary_source || sourcePath,
      firestore_sources: [...(existing?.metadata.firestore_sources || []), sourcePath].slice(0, 20),
    });

    candidates.set(email, { email, metadata });
  }

  return [...candidates.values()].sort((left, right) => left.email.localeCompare(right.email));
};

const fetchExistingAuthUsers = async (supabase) => {
  const existingUsers = new Map();
  const perPage = 1000;
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users || [];
    for (const user of users) {
      const email = normalizeEmail(user.email);
      if (email) existingUsers.set(email, user);
    }

    if (users.length < perPage) break;
    page += 1;
  }

  return existingUsers;
};

const createAuthUsers = async (supabase, candidates) => {
  const existingUsers = await fetchExistingAuthUsers(supabase);
  let created = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    if (existingUsers.has(candidate.email)) {
      skipped += 1;
      console.log(`Auth user already exists: ${candidate.email}`);
      continue;
    }

    const password = randomBytes(32).toString('base64url');
    const { error } = await supabase.auth.admin.createUser({
      email: candidate.email,
      password,
      email_confirm: true,
      user_metadata: candidate.metadata,
    });

    if (error) {
      if (/already|registered|exists/i.test(error.message)) {
        skipped += 1;
        console.log(`Auth user already exists: ${candidate.email}`);
        continue;
      }
      throw error;
    }

    created += 1;
    console.log(`Created Supabase Auth user: ${candidate.email}`);
  }

  console.log(`Supabase Auth users created: ${created}. Skipped: ${skipped}.`);
};

const main = async () => {
  const { app, firestore } = await loadFirebaseAdmin();
  const existingApps = app.getApps();

  if (existingApps.length === 0) {
    const serviceAccount = parseServiceAccount();
    app.initializeApp(
      serviceAccount
        ? { credential: app.cert(serviceAccount) }
        : { credential: app.applicationDefault() }
    );
  }

  const db = firestore.getFirestore();
  const topLevelCollections = await db.listCollections();
  const rows = [];
  const counts = new Map();

  for (const collectionRef of topLevelCollections) {
    await collectCollection(collectionRef, rows, counts);
  }

  rows.sort((left, right) =>
    `${left.collection_path}/${left.doc_id}`.localeCompare(`${right.collection_path}/${right.doc_id}`)
  );

  console.log('Firestore collections found:');
  for (const [collectionPath, count] of [...counts.entries()].sort()) {
    console.log(`- ${collectionPath}: ${count}`);
  }
  console.log(`Total documents prepared: ${rows.length}`);

  const authUserCandidates = collectAuthUserCandidates(rows);
  console.log(`Auth user candidates found in Firestore data: ${authUserCandidates.length}`);

  if (outputPath) {
    await writeFile(
      outputPath,
      JSON.stringify(
        {
          documents: rows,
          auth_user_candidates: authUserCandidates,
        },
        null,
        2
      )
    );
    console.log(`Wrote backup payload to ${outputPath}`);
  }

  if (!apply) {
    console.log('Dry run only. Set MIGRATE_APPLY=true to write to Supabase.');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  await upsertRows(supabase, rows);

  if (migrateAuthUsers) {
    await createAuthUsers(supabase, authUserCandidates);
    console.log('Created users use random passwords. Ask users to reset password from the app.');
  } else {
    console.log('Skipped Supabase Auth user creation. Set MIGRATE_AUTH_USERS=true to enable it.');
  }

  console.log('Firestore to Supabase migration completed.');
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

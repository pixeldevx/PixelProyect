import { supabase, SUPABASE_DOCUMENTS_TABLE } from './client';

type Primitive = string | number | boolean | null;
type DataValue = Primitive | DataValue[] | { [key: string]: DataValue };

type Row = {
  id: string;
  collection_path: string;
  doc_id: string;
  data: Record<string, any>;
  created_at?: string;
  updated_at?: string;
};

type WhereOperator = '==' | '!=' | 'array-contains' | 'in';

type WhereConstraint = {
  type: 'where';
  field: string;
  op: WhereOperator;
  value: any;
};

type OrderConstraint = {
  type: 'orderBy';
  field: string;
  direction: 'asc' | 'desc';
};

type OrConstraint = {
  type: 'or';
  constraints: WhereConstraint[];
};

type QueryConstraint = WhereConstraint | OrderConstraint | OrConstraint;

const SERVER_TIMESTAMP = Symbol('serverTimestamp');

class IncrementTransform {
  constructor(public by: number) {}
}

class ArrayUnionTransform {
  constructor(public values: any[]) {}
}

class ArrayRemoveTransform {
  constructor(public values: any[]) {}
}

export class Timestamp {
  private date: Date;

  constructor(date: Date | string | number) {
    this.date = date instanceof Date ? date : new Date(date);
  }

  static now() {
    return new Timestamp(new Date());
  }

  static fromDate(date: Date) {
    return new Timestamp(date);
  }

  toDate() {
    return this.date;
  }

  toMillis() {
    return this.date.getTime();
  }

  toJSON() {
    return this.date.toISOString();
  }
}

export type CollectionReference = {
  kind: 'collection';
  collectionPath: string;
  id: string;
  path: string;
  parent: DocumentReference | null;
  isCollectionGroup?: boolean;
};

export type DocumentReference = {
  kind: 'doc';
  collectionPath: string;
  id: string;
  path: string;
  parent: CollectionReference;
};

export type SupabaseQuery = {
  kind: 'query';
  source: CollectionReference;
  constraints: QueryConstraint[];
};

const flattenSegments = (segments: unknown[]) =>
  segments
    .flatMap((segment) =>
      String(segment)
        .split('/')
        .map((part) => part.trim())
        .filter(Boolean)
    );

const randomId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
};

const parentDocForCollectionPath = (collectionPath: string): DocumentReference | null => {
  const segments = flattenSegments([collectionPath]);
  if (segments.length < 3) return null;

  const parentDocSegments = segments.slice(0, -1);
  return createDocRef(parentDocSegments);
};

const createCollectionRef = (segments: string[], isCollectionGroup = false): CollectionReference => {
  const path = segments.join('/');
  return {
    kind: 'collection',
    collectionPath: path,
    id: segments[segments.length - 1] || path,
    path,
    parent: isCollectionGroup ? null : parentDocForCollectionPath(path),
    isCollectionGroup,
  };
};

const createDocRef = (segments: string[]): DocumentReference => {
  const id = segments[segments.length - 1] || randomId();
  const collectionSegments = segments.slice(0, -1);
  const parent = createCollectionRef(collectionSegments);
  return {
    kind: 'doc',
    collectionPath: parent.collectionPath,
    id,
    path: segments.join('/'),
    parent,
  };
};

export const collection = (_db: unknown, ...pathSegments: unknown[]) => {
  return createCollectionRef(flattenSegments(pathSegments));
};

export const collectionGroup = (_db: unknown, collectionId: string) => {
  return createCollectionRef([collectionId], true);
};

export const doc = (base: unknown, ...pathSegments: unknown[]) => {
  if ((base as CollectionReference)?.kind === 'collection') {
    const collectionRef = base as CollectionReference;
    const id = pathSegments.length ? flattenSegments(pathSegments)[0] : randomId();
    return createDocRef([...flattenSegments([collectionRef.collectionPath]), id]);
  }

  const segments = flattenSegments(pathSegments);
  if (segments.length === 0) {
    throw new Error('doc() requires a document path or a collection reference.');
  }
  return createDocRef(segments);
};

export const where = (field: string, op: WhereOperator, value: any): WhereConstraint => ({
  type: 'where',
  field,
  op,
  value,
});

export const orderBy = (field: string, direction: 'asc' | 'desc' = 'asc'): OrderConstraint => ({
  type: 'orderBy',
  field,
  direction,
});

export const or = (...constraints: WhereConstraint[]): OrConstraint => ({
  type: 'or',
  constraints,
});

export const query = (source: CollectionReference, ...constraints: QueryConstraint[]): SupabaseQuery => ({
  kind: 'query',
  source,
  constraints,
});

export const serverTimestamp = () => SERVER_TIMESTAMP;
export const increment = (by: number) => new IncrementTransform(by);
export const arrayUnion = (...values: any[]) => new ArrayUnionTransform(values);
export const arrayRemove = (...values: any[]) => new ArrayRemoveTransform(values);

const isIsoDateString = (value: string) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) && !Number.isNaN(Date.parse(value));

const shouldHydrateTimestamp = (key: string, value: string) => {
  if (!isIsoDateString(value)) return false;
  const normalized = key.toLowerCase();
  return (
    normalized === 'date' ||
    normalized.includes('date') ||
    normalized.endsWith('at') ||
    normalized.includes('timestamp')
  );
};

const hydrateValue = (value: any, key = ''): any => {
  if (Array.isArray(value)) return value.map((item) => hydrateValue(item, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, hydrateValue(entryValue, entryKey)]));
  }
  if (typeof value === 'string' && shouldHydrateTimestamp(key, value)) {
    return new Timestamp(value);
  }
  return value;
};

const normalizeValue = (value: any): DataValue | undefined => {
  if (value === undefined) return undefined;
  if (value === SERVER_TIMESTAMP) return new Date().toISOString();
  if (value instanceof Timestamp) return value.toJSON();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item)).filter((item) => item !== undefined) as DataValue[];
  }
  if (value && typeof value === 'object') {
    if (value instanceof IncrementTransform || value instanceof ArrayUnionTransform || value instanceof ArrayRemoveTransform) {
      return value as any;
    }
    return Object.fromEntries(
      Object.entries(value)
        .map(([entryKey, entryValue]) => [entryKey, normalizeValue(entryValue)])
        .filter(([, entryValue]) => entryValue !== undefined)
    ) as { [key: string]: DataValue };
  }
  return value as DataValue;
};

const normalizeData = (data: Record<string, any>) =>
  Object.fromEntries(
    Object.entries(data)
      .map(([key, value]) => [key, normalizeValue(value)])
      .filter(([, value]) => value !== undefined)
  );

const getByPath = (data: Record<string, any>, path: string) => {
  return path.split('.').reduce((current: any, part) => (current == null ? undefined : current[part]), data);
};

const setByPath = (data: Record<string, any>, path: string, value: any) => {
  const parts = path.split('.');
  let current = data;
  parts.slice(0, -1).forEach((part) => {
    if (!current[part] || typeof current[part] !== 'object' || Array.isArray(current[part])) {
      current[part] = {};
    }
    current = current[part];
  });
  current[parts[parts.length - 1]] = value;
};

const stableStringify = (value: any) => JSON.stringify(normalizeValue(value));

const applyUpdate = (base: Record<string, any>, update: Record<string, any>) => {
  const next = { ...base };

  Object.entries(update).forEach(([key, rawValue]) => {
    const current = getByPath(next, key);

    if (rawValue instanceof IncrementTransform) {
      setByPath(next, key, (Number(current) || 0) + rawValue.by);
      return;
    }

    if (rawValue instanceof ArrayUnionTransform) {
      const currentArray = Array.isArray(current) ? current : [];
      const known = new Set(currentArray.map((item) => stableStringify(item)));
      const valuesToAdd = rawValue.values.filter((item) => !known.has(stableStringify(item)));
      setByPath(next, key, [...currentArray, ...valuesToAdd]);
      return;
    }

    if (rawValue instanceof ArrayRemoveTransform) {
      const removeSet = new Set(rawValue.values.map((item) => stableStringify(item)));
      const currentArray = Array.isArray(current) ? current : [];
      setByPath(
        next,
        key,
        currentArray.filter((item) => !removeSet.has(stableStringify(item)))
      );
      return;
    }

    const value = normalizeValue(rawValue);
    if (value !== undefined) {
      setByPath(next, key, value);
    }
  });

  return next;
};

export class QueryDocumentSnapshot {
  id: string;
  ref: DocumentReference;
  private row: Row;

  constructor(row: Row) {
    this.id = row.doc_id;
    this.ref = createDocRef([...flattenSegments([row.collection_path]), row.doc_id]);
    this.row = row;
  }

  data() {
    return hydrateValue(this.row.data);
  }
}

export class DocumentSnapshot {
  id: string;
  ref: DocumentReference;
  private row: Row | null;

  constructor(ref: DocumentReference, row: Row | null) {
    this.id = ref.id;
    this.ref = ref;
    this.row = row;
  }

  exists() {
    return Boolean(this.row);
  }

  data() {
    return this.row ? hydrateValue(this.row.data) : undefined;
  }
}

export class QuerySnapshot {
  docs: QueryDocumentSnapshot[];
  empty: boolean;

  constructor(rows: Row[]) {
    this.docs = rows.map((row) => new QueryDocumentSnapshot(row));
    this.empty = this.docs.length === 0;
  }

  forEach(callback: (doc: QueryDocumentSnapshot) => void) {
    this.docs.forEach(callback);
  }
}

const matchesWhere = (row: Row, data: Record<string, any>, constraint: WhereConstraint) => {
  const actual = constraint.field === '__name__' ? row.doc_id : getByPath(data, constraint.field);
  switch (constraint.op) {
    case '==':
      return actual === constraint.value;
    case '!=':
      return actual !== constraint.value;
    case 'array-contains':
      return Array.isArray(actual) && actual.includes(constraint.value);
    case 'in':
      return Array.isArray(constraint.value) && constraint.value.includes(actual);
    default:
      return false;
  }
};

const compareValues = (left: any, right: any) => {
  const l = left instanceof Timestamp ? left.toMillis() : left;
  const r = right instanceof Timestamp ? right.toMillis() : right;
  if (l === r) return 0;
  if (l == null) return -1;
  if (r == null) return 1;
  return l > r ? 1 : -1;
};

const applyConstraints = (rows: Row[], constraints: QueryConstraint[]) => {
  let next = rows.filter((row) => {
    const data = hydrateValue(row.data);
    return constraints.every((constraint) => {
      if (constraint.type === 'where') return matchesWhere(row, data, constraint);
      if (constraint.type === 'or') {
        return constraint.constraints.some((innerConstraint) => matchesWhere(row, data, innerConstraint));
      }
      return true;
    });
  });

  constraints
    .filter((constraint): constraint is OrderConstraint => constraint.type === 'orderBy')
    .reverse()
    .forEach((constraint) => {
      next = [...next].sort((a, b) => {
        const left = getByPath(hydrateValue(a.data), constraint.field);
        const right = getByPath(hydrateValue(b.data), constraint.field);
        const result = compareValues(left, right);
        return constraint.direction === 'desc' ? -result : result;
      });
    });

  return next;
};

const fetchRowsForCollection = async (source: CollectionReference) => {
  let request = supabase.from(SUPABASE_DOCUMENTS_TABLE).select('*');

  if (source.isCollectionGroup) {
    request = request.like('collection_path', `%/${source.id}`);
  } else {
    request = request.eq('collection_path', source.collectionPath);
  }

  const { data, error } = await request;
  if (error) throw error;
  return (data || []) as Row[];
};

const fetchDocRow = async (ref: DocumentReference) => {
  const { data, error } = await supabase
    .from(SUPABASE_DOCUMENTS_TABLE)
    .select('*')
    .eq('collection_path', ref.collectionPath)
    .eq('doc_id', ref.id)
    .maybeSingle();

  if (error) throw error;
  return (data || null) as Row | null;
};

export const getDoc = async (ref: DocumentReference) => {
  return new DocumentSnapshot(ref, await fetchDocRow(ref));
};

export const getDocs = async (source: CollectionReference | SupabaseQuery) => {
  const querySource = (source as SupabaseQuery).kind === 'query' ? (source as SupabaseQuery).source : (source as CollectionReference);
  const constraints = (source as SupabaseQuery).kind === 'query' ? (source as SupabaseQuery).constraints : [];
  const rows = await fetchRowsForCollection(querySource);
  return new QuerySnapshot(applyConstraints(rows, constraints));
};

const saveDocData = async (ref: DocumentReference, data: Record<string, any>) => {
  const { error } = await supabase.from(SUPABASE_DOCUMENTS_TABLE).upsert(
    {
      collection_path: ref.collectionPath,
      doc_id: ref.id,
      data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'collection_path,doc_id' }
  );

  if (error) throw error;
};

export const setDoc = async (
  ref: DocumentReference,
  data: Record<string, any>,
  options?: { merge?: boolean }
) => {
  const existing = options?.merge ? (await fetchDocRow(ref))?.data || {} : {};
  const next = options?.merge ? applyUpdate(existing, data) : normalizeData(data);
  await saveDocData(ref, next);
};

export const updateDoc = async (ref: DocumentReference, data: Record<string, any>) => {
  const existing = await fetchDocRow(ref);
  if (!existing) {
    throw new Error(`Document does not exist: ${ref.path}`);
  }
  await saveDocData(ref, applyUpdate(existing.data, data));
};

export const addDoc = async (collectionRef: CollectionReference, data: Record<string, any>) => {
  const ref = doc(collectionRef);
  await setDoc(ref, data);
  return ref;
};

export const deleteDoc = async (ref: DocumentReference) => {
  const { error } = await supabase
    .from(SUPABASE_DOCUMENTS_TABLE)
    .delete()
    .eq('collection_path', ref.collectionPath)
    .eq('doc_id', ref.id);
  if (error) throw error;
};

class WriteBatch {
  private operations: (() => Promise<void>)[] = [];

  set(ref: DocumentReference, data: Record<string, any>, options?: { merge?: boolean }) {
    this.operations.push(() => setDoc(ref, data, options));
  }

  update(ref: DocumentReference, data: Record<string, any>) {
    this.operations.push(() => updateDoc(ref, data));
  }

  delete(ref: DocumentReference) {
    this.operations.push(() => deleteDoc(ref));
  }

  async commit() {
    for (const operation of this.operations) {
      await operation();
    }
  }
}

export const writeBatch = (_db?: unknown) => new WriteBatch();

export function onSnapshot(
  source: DocumentReference,
  onNext: (snapshot: DocumentSnapshot) => void,
  onError?: (error: any) => void
): () => void;
export function onSnapshot(
  source: CollectionReference | SupabaseQuery,
  onNext: (snapshot: QuerySnapshot) => void,
  onError?: (error: any) => void
): () => void;
export function onSnapshot(
  source: DocumentReference | CollectionReference | SupabaseQuery,
  onNext: (snapshot: any) => void,
  onError?: (error: any) => void
) {
  let active = true;

  const emit = async () => {
    try {
      if (!active) return;
      if ((source as DocumentReference).kind === 'doc') {
        onNext(await getDoc(source as DocumentReference));
      } else {
        onNext(await getDocs(source as CollectionReference | SupabaseQuery));
      }
    } catch (error) {
      onError?.(error);
    }
  };

  void emit();

  const channel = supabase
    .channel(`app_documents_${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: SUPABASE_DOCUMENTS_TABLE },
      () => void emit()
    )
    .subscribe();

  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}

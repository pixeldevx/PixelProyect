import { addDoc, collection, serverTimestamp } from '@/lib/supabase/document-store';
import { getDownloadURL, ref, uploadBytes } from '@/lib/supabase/storage-shim';
import { db, storage } from '@/lib/backend';
import { buildDocumentStoragePath, getTaskStorageFolderSegments } from '@/lib/document-storage';
import { getTaskDisplayTitle } from '@/lib/task-title';

export const WORKFLOW_DOCUMENT_VALUE_KIND = 'workflow-document';

export type WorkflowDocumentValue = {
  kind: typeof WORKFLOW_DOCUMENT_VALUE_KIND;
  documentId: string;
  name: string;
  fileName: string;
  url: string;
  storagePath: string;
  storageFolder?: string;
  fileSize?: number;
  contentType?: string | null;
  uploadedAt?: string;
  uploadedBy?: string | null;
  stepIndex?: number | null;
  stepLabel?: string | null;
  fieldId?: string | null;
  fieldLabel?: string | null;
  taskId?: string | null;
  taskTitle?: string | null;
};

const getUserId = (user: any) => user?.uid || user?.id || user?.memberId || null;

const getTimeValue = (value: any) => {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const isWorkflowDocumentValue = (value: any): value is WorkflowDocumentValue =>
  Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      (value.kind === WORKFLOW_DOCUMENT_VALUE_KIND || value.type === 'workflow_form_document') &&
      (value.url || value.documentId || value.storagePath),
  );

export const getWorkflowDocumentDisplayName = (value: any) =>
  value?.name || value?.fileName || 'Documento adjunto';

export async function uploadWorkflowFormDocument({
  file,
  projectId,
  projectName,
  task,
  tasks = [],
  user,
  field,
  stepIndex,
  stepLabel,
}: {
  file: File;
  projectId: string;
  projectName?: string;
  task: any;
  tasks?: any[];
  user?: any;
  field?: any;
  stepIndex?: number | null;
  stepLabel?: string | null;
}): Promise<WorkflowDocumentValue> {
  if (!file) throw new Error('Selecciona un archivo para adjuntar.');
  if (!projectId) throw new Error('No se encontró el proyecto para guardar el documento.');

  const fieldLabel = field?.label || 'Documento';
  const documentName = `${fieldLabel} - ${file.name}`;
  const storagePath = buildDocumentStoragePath({
    projectId,
    projectName: projectName || task?.projectName || 'Proyecto',
    task,
    tasks,
    fileName: file.name,
    documentName,
  });
  const storageFolder = storagePath.split('/').slice(0, -1).join('/');
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  const userId = getUserId(user);
  const documentRef = await addDoc(collection(db, 'projects', projectId, 'documents'), {
    projectId,
    taskId: task?.id || null,
    taskTitle: getTaskDisplayTitle(task),
    taskFolderSegments: getTaskStorageFolderSegments(task, tasks),
    scope: 'task',
    name: documentName,
    type: 'workflow_form_document',
    documentSource: 'workflow_form',
    workflowStepIndex: stepIndex ?? null,
    workflowStepLabel: stepLabel ?? null,
    formFieldId: field?.id ?? null,
    formFieldLabel: fieldLabel,
    url,
    storagePath: storageRef.fullPath,
    storageFolder,
    uploadedBy: userId,
    uploadedAt: serverTimestamp(),
    fileName: file.name,
    fileSize: file.size,
    contentType: file.type || null,
    accessMode: 'all',
    allowedMemberIds: [],
    providerPathVersion: 'structured-v1',
  });

  return {
    kind: WORKFLOW_DOCUMENT_VALUE_KIND,
    documentId: documentRef.id,
    name: documentName,
    fileName: file.name,
    url,
    storagePath: storageRef.fullPath,
    storageFolder,
    fileSize: file.size,
    contentType: file.type || null,
    uploadedAt: new Date().toISOString(),
    uploadedBy: userId,
    stepIndex: stepIndex ?? null,
    stepLabel: stepLabel ?? null,
    fieldId: field?.id ?? null,
    fieldLabel,
    taskId: task?.id || null,
    taskTitle: getTaskDisplayTitle(task),
  };
}

export const collectWorkflowDocumentsFromHistory = (task: any) => {
  const docs: Array<WorkflowDocumentValue & Record<string, any>> = [];
  const steps = Array.isArray(task?.workflowSteps) ? task.workflowSteps : [];

  (task?.workflowHistory || []).forEach((entry: any) => {
    Object.entries(entry?.formData || {}).forEach(([fieldId, value]) => {
      if (!isWorkflowDocumentValue(value)) return;
      const rawStepIndex = Number(entry?.stepIndex ?? value.stepIndex);
      const stepIndex = Number.isFinite(rawStepIndex) ? rawStepIndex : null;
      const step = stepIndex !== null ? steps[stepIndex] : null;
      const field = step?.form?.fields?.find((item: any) => item.id === fieldId);

      docs.push({
        ...value,
        fieldId,
        fieldLabel: field?.label || value.fieldLabel || fieldId,
        stepIndex,
        stepLabel:
          entry.stepLabel ||
          value.stepLabel ||
          step?.label ||
          (stepIndex !== null ? `Paso ${stepIndex + 1}` : 'Paso'),
        comment: entry.comment || null,
        action: entry.action || null,
        timestamp: entry.timestamp || value.uploadedAt || null,
        userName: entry.userName || null,
        userEmail: entry.userEmail || null,
      });
    });
  });

  return docs.sort((a, b) => getTimeValue(b.timestamp) - getTimeValue(a.timestamp));
};

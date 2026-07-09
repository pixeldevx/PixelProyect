import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, ExternalLink, Eye, File, FileText, Folder, Lock, Trash2 } from 'lucide-react';
import { canUserAccessDocument, getDocumentAccessMode } from '@/lib/document-storage';

interface ProjectDocumentsTreeProps {
  documents: any[];
  tasks: any[];
  onDeleteDocument: (docId: string, storagePath: string, name: string) => void;
  onViewDocument?: (doc: any) => void;
  searchQuery?: string;
  currentUser?: any;
  teamMembers?: any[];
  canManageAccess?: boolean;
  canDeleteDocuments?: boolean;
}

const formatFileSize = (bytes?: number) => {
  if (!Number(bytes)) return '';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(Number(bytes)) / Math.log(k));
  return parseFloat((Number(bytes) / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatUploadedAt = (value: any) => {
  if (!value) return '';
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
};

const getDocTypeBadge = (type: string) => {
  switch (type) {
    case 'contract':
      return <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-700">Contrato</span>;
    case 'proposal':
      return <span className="rounded-full bg-purple-100 px-2 py-1 text-xs font-bold text-purple-700">Propuesta</span>;
    case 'task_completion':
      return <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">Evidencia tarea</span>;
    case 'workflow_start':
      return <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">Inicio workflow</span>;
    default:
      return <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">Otro</span>;
  }
};

const getTaskTitle = (task: any) => task?.title || task?.name || task?.externalWorkflowId || 'Sin título';

const DocumentItem = ({
  doc,
  onDeleteDocument,
  onViewDocument,
  canDeleteDocuments,
}: {
  doc: any;
  onDeleteDocument: ProjectDocumentsTreeProps['onDeleteDocument'];
  onViewDocument?: (doc: any) => void;
  canDeleteDocuments: boolean;
}) => {
  const uploadedAt = formatUploadedAt(doc.uploadedAt);
  const restricted = getDocumentAccessMode(doc) === 'restricted';

  return (
    <div className="group flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5 last:border-0 hover:bg-slate-50">
      <button
        type="button"
        onClick={() => onViewDocument?.(doc)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none transition focus-visible:ring-2 focus-visible:ring-indigo-500/30"
      >
        <FileText size={16} className="shrink-0 text-slate-400" />
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate text-sm font-bold text-slate-700">{doc.name}</span>
            {getDocTypeBadge(doc.type)}
            {restricted && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">
                <Lock size={12} />
                Restringido
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs font-medium text-slate-400">
            {doc.fileName ? `${doc.fileName}${formatFileSize(doc.fileSize) ? ` (${formatFileSize(doc.fileSize)})` : ''}` : 'Archivo del proyecto'}
            {uploadedAt ? ` · Subido el ${uploadedAt}` : ''}
          </div>
          {doc.storageFolder && (
            <div className="mt-0.5 truncate text-[11px] font-semibold text-slate-400">
              {String(doc.storageFolder).replaceAll('/', ' / ')}
            </div>
          )}
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
        <button
          type="button"
          onClick={() => onViewDocument?.(doc)}
          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
          title="Ver en Pixel"
        >
          <Eye size={16} />
        </button>
        <a
          href={doc.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
          title="Abrir"
        >
          <ExternalLink size={16} />
        </a>
        <a
          href={doc.url}
          download
          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
          title="Descargar"
        >
          <Download size={16} />
        </a>
        {canDeleteDocuments && (
          <button
            type="button"
            onClick={() => onDeleteDocument(doc.id, doc.storagePath, doc.name)}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
            title="Eliminar"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
};

const FolderNode = ({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 bg-slate-50/80 p-3 text-left transition-colors hover:bg-slate-100"
      >
        {isOpen ? <ChevronDown size={18} className="text-slate-500" /> : <ChevronRight size={18} className="text-slate-500" />}
        <Folder size={18} className="text-indigo-500" />
        <span className="text-sm font-black text-slate-800">{title}</span>
      </button>
      {isOpen && <div className="border-t border-slate-100 bg-white pl-4 md:pl-6">{children}</div>}
    </div>
  );
};

export const ProjectDocumentsTree: React.FC<ProjectDocumentsTreeProps> = ({
  documents,
  tasks,
  onDeleteDocument,
  onViewDocument,
  searchQuery = '',
  currentUser,
  teamMembers = [],
  canManageAccess = false,
  canDeleteDocuments = false,
}) => {
  const accessibleDocuments = useMemo(
    () =>
      documents.filter((document) =>
        canUserAccessDocument({
          document,
          currentUser,
          teamMembers,
          canManageAccess,
        })
      ),
    [documents, currentUser, teamMembers, canManageAccess]
  );

  const filteredDocuments = useMemo(() => {
    if (!searchQuery.trim()) return accessibleDocuments;
    const lowerQuery = searchQuery.toLowerCase();
    return accessibleDocuments.filter((document) =>
      document.name?.toLowerCase().includes(lowerQuery) ||
      document.fileName?.toLowerCase().includes(lowerQuery) ||
      document.taskTitle?.toLowerCase().includes(lowerQuery) ||
      document.taskId?.toLowerCase().includes(lowerQuery)
    );
  }, [accessibleDocuments, searchQuery]);

  const generalDocs = useMemo(() => filteredDocuments.filter((document) => !document.taskId), [filteredDocuments]);
  const taskDocs = useMemo(() => filteredDocuments.filter((document) => document.taskId), [filteredDocuments]);
  const parentTasks = useMemo(
    () => tasks.filter((task) => !task.parentTaskId).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)),
    [tasks]
  );

  const getSubtasks = (parentId: string) =>
    tasks.filter((task) => task.parentTaskId === parentId).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  const getTaskDocuments = (taskId: string) => taskDocs.filter((document) => document.taskId === taskId);

  if (accessibleDocuments.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center">
        <File className="mx-auto mb-3 h-12 w-12 text-slate-200" />
        <h3 className="text-base font-bold text-slate-900">No hay documentos visibles</h3>
        <p className="mt-1 text-sm font-medium text-slate-500">Sube archivos o solicita acceso a la documentación restringida.</p>
      </div>
    );
  }

  if (filteredDocuments.length === 0 && searchQuery) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center">
        <File className="mx-auto mb-3 h-12 w-12 text-slate-200" />
        <h3 className="text-base font-bold text-slate-900">No se encontraron documentos</h3>
        <p className="mt-1 text-sm font-medium text-slate-500">No hay documentos visibles que coincidan con &quot;{searchQuery}&quot;.</p>
      </div>
    );
  }

  const hasDocumentsInSubtree = (taskId: string): boolean => {
    if (getTaskDocuments(taskId).length > 0) return true;
    return getSubtasks(taskId).some((subtask) => hasDocumentsInSubtree(subtask.id));
  };

  const renderTaskNode = (task: any) => {
    const taskTitle = getTaskTitle(task);
    const matchesSearch = searchQuery.trim() && (
      taskTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.id?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (!hasDocumentsInSubtree(task.id) && !matchesSearch) return null;

    const subtasks = getSubtasks(task.id);
    const docs = getTaskDocuments(task.id);

    return (
      <FolderNode key={task.id} title={taskTitle} defaultOpen={!!searchQuery}>
        {docs.length > 0 && (
          <div className="py-1">
            {docs.map((document) => (
              <DocumentItem
                key={document.id}
                doc={document}
                onDeleteDocument={onDeleteDocument}
                onViewDocument={onViewDocument}
                canDeleteDocuments={canDeleteDocuments}
              />
            ))}
          </div>
        )}
        {subtasks.length > 0 && (
          <div className="my-2 ml-3 border-l border-slate-100 py-2 pl-3 md:ml-4 md:pl-4">
            {subtasks.map((subtask) => renderTaskNode(subtask))}
          </div>
        )}
      </FolderNode>
    );
  };

  const renderedTasks = parentTasks.map((task) => renderTaskNode(task)).filter(Boolean);
  const allTaskIds = new Set(tasks.map((task) => task.id));
  const orphanedDocs = taskDocs.filter((document) => !allTaskIds.has(document.taskId));

  return (
    <div className="space-y-4">
      {generalDocs.length > 0 && (
        <FolderNode title="Documentación del proyecto" defaultOpen>
          <div className="py-1">
            {generalDocs.map((document) => (
              <DocumentItem
                key={document.id}
                doc={document}
                onDeleteDocument={onDeleteDocument}
                onViewDocument={onViewDocument}
                canDeleteDocuments={canDeleteDocuments}
              />
            ))}
          </div>
        </FolderNode>
      )}

      {(renderedTasks.length > 0 || orphanedDocs.length > 0) && (
        <FolderNode title="Documentos de tareas y subtareas" defaultOpen>
          <div className="p-3">
            {renderedTasks}

            {orphanedDocs.length > 0 && (
              <FolderNode title="Tareas eliminadas o sin vínculo" defaultOpen={false}>
                <div className="py-1">
                  {orphanedDocs.map((document) => (
                    <DocumentItem
                      key={document.id}
                      doc={document}
                      onDeleteDocument={onDeleteDocument}
                      onViewDocument={onViewDocument}
                      canDeleteDocuments={canDeleteDocuments}
                    />
                  ))}
                </div>
              </FolderNode>
            )}
          </div>
        </FolderNode>
      )}
    </div>
  );
};

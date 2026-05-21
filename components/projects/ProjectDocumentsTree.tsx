import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, Folder, FileText, Download, Trash2, File } from 'lucide-react';

interface ProjectDocumentsTreeProps {
  documents: any[];
  tasks: any[];
  onDeleteDocument: (docId: string, storagePath: string, name: string) => void;
  searchQuery?: string;
}

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getDocTypeBadge = (type: string) => {
  switch (type) {
    case 'contract':
      return <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">Contrato</span>;
    case 'proposal':
      return <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">Propuesta</span>;
    case 'task_completion':
      return <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">Evidencia Tarea</span>;
    default:
      return <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">Otro</span>;
  }
};

const getTaskTitle = (task: any) => task?.title || task?.name || 'Sin título';

const DocumentItem = ({ doc, onDeleteDocument }: { doc: any, onDeleteDocument: any }) => (
  <div className="flex items-center justify-between py-2 px-4 hover:bg-slate-50 border-b border-slate-100 last:border-0 group">
    <div className="flex items-center gap-3">
      <FileText size={16} className="text-slate-400" />
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700">{doc.name}</span>
          {getDocTypeBadge(doc.type)}
        </div>
        <div className="text-xs text-slate-400 mt-0.5">
          {doc.fileName ? `${doc.fileName} (${formatFileSize(doc.fileSize)})` : ''}
          {doc.uploadedAt ? ` • Subido el ${doc.uploadedAt.toDate().toLocaleDateString()}` : ''}
        </div>
      </div>
    </div>
    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
      <a 
        href={doc.url} 
        target="_blank" 
        rel="noopener noreferrer"
        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
        title="Descargar"
      >
        <Download size={16} />
      </a>
      <button 
        onClick={() => onDeleteDocument(doc.id, doc.storagePath, doc.name)}
        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
        title="Eliminar"
      >
        <Trash2 size={16} />
      </button>
    </div>
  </div>
);

const FolderNode = ({ title, children, defaultOpen = false }: { title: string, children: React.ReactNode, defaultOpen?: boolean }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-slate-200 rounded-lg mb-3 overflow-hidden bg-white">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 p-3 bg-slate-50/80 hover:bg-slate-100 transition-colors text-left"
      >
        {isOpen ? <ChevronDown size={18} className="text-slate-500" /> : <ChevronRight size={18} className="text-slate-500" />}
        <Folder size={18} className="text-indigo-500" />
        <span className="font-semibold text-slate-800 text-sm">{title}</span>
      </button>
      {isOpen && (
        <div className="pl-6 border-t border-slate-100 bg-white">
          {children}
        </div>
      )}
    </div>
  );
};

export const ProjectDocumentsTree: React.FC<ProjectDocumentsTreeProps> = ({
  documents,
  tasks,
  onDeleteDocument,
  searchQuery = ''
}) => {
  // Filter documents based on search query
  const filteredDocuments = useMemo(() => {
    if (!searchQuery.trim()) return documents;
    const lowerQuery = searchQuery.toLowerCase();
    return documents.filter(doc => 
      doc.name?.toLowerCase().includes(lowerQuery) || 
      doc.taskId?.toLowerCase().includes(lowerQuery)
    );
  }, [documents, searchQuery]);

  // Group documents
  const generalDocs = useMemo(() => filteredDocuments.filter(d => !d.taskId), [filteredDocuments]);
  const taskDocs = useMemo(() => filteredDocuments.filter(d => d.taskId), [filteredDocuments]);

  // Build task tree
  const parentTasks = useMemo(() => tasks.filter(t => !t.parentTaskId).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)), [tasks]);
  
  const getSubtasks = (parentId: string) => {
    return tasks.filter(t => t.parentTaskId === parentId).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  };

  const getTaskDocuments = (taskId: string) => {
    return taskDocs.filter(d => d.taskId === taskId);
  };

  if (documents.length === 0) {
    return (
      <div className="text-center py-12 px-4 border border-slate-200 rounded-lg bg-white">
        <File className="w-12 h-12 text-slate-200 mx-auto mb-3" />
        <h3 className="text-base font-medium text-slate-900">No hay documentos</h3>
        <p className="text-sm text-slate-500 mt-1">Sube el contrato y la propuesta para empezar.</p>
      </div>
    );
  }

  if (filteredDocuments.length === 0 && searchQuery) {
    return (
      <div className="text-center py-12 px-4 border border-slate-200 rounded-lg bg-white">
        <File className="w-12 h-12 text-slate-200 mx-auto mb-3" />
        <h3 className="text-base font-medium text-slate-900">No se encontraron documentos</h3>
        <p className="text-sm text-slate-500 mt-1">No hay documentos que coincidan con &quot;{searchQuery}&quot;.</p>
      </div>
    );
  }

  const hasDocumentsInSubtree = (taskId: string): boolean => {
    const docs = getTaskDocuments(taskId);
    if (docs.length > 0) return true;
    const subtasks = getSubtasks(taskId);
    return subtasks.some(st => hasDocumentsInSubtree(st.id));
  };

  const renderTaskNode = (task: any) => {
    if (!hasDocumentsInSubtree(task.id) && !searchQuery.trim()) return null;
    const taskTitle = getTaskTitle(task);
    
    // If there's a search query, we want to show tasks that match the query OR have matching documents
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
            {docs.map(doc => (
              <DocumentItem key={doc.id} doc={doc} onDeleteDocument={onDeleteDocument} />
            ))}
          </div>
        )}
        {subtasks.length > 0 && (
          <div className="pl-4 py-2 border-l border-slate-100 ml-4 my-2">
            {subtasks.map(subtask => renderTaskNode(subtask))}
          </div>
        )}
      </FolderNode>
    );
  };

  const renderedTasks = parentTasks.map(task => renderTaskNode(task)).filter(Boolean);
  
  // Find orphaned documents (documents linked to tasks that no longer exist)
  const allTaskIds = new Set(tasks.map(t => t.id));
  const orphanedDocs = taskDocs.filter(d => !allTaskIds.has(d.taskId));

  return (
    <div className="space-y-4">
      {generalDocs.length > 0 && (
        <FolderNode title="Documentos Generales" defaultOpen={true}>
          <div className="py-1">
            {generalDocs.map(doc => (
              <DocumentItem key={doc.id} doc={doc} onDeleteDocument={onDeleteDocument} />
            ))}
          </div>
        </FolderNode>
      )}

      {(renderedTasks.length > 0 || orphanedDocs.length > 0) && (
        <FolderNode title="Documentos de Tareas" defaultOpen={true}>
          <div className="p-3">
            {renderedTasks}
            
            {orphanedDocs.length > 0 && (
              <FolderNode title="Tareas Eliminadas (Huérfanos)" defaultOpen={false}>
                <div className="py-1">
                  {orphanedDocs.map(doc => (
                    <DocumentItem key={doc.id} doc={doc} onDeleteDocument={onDeleteDocument} />
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

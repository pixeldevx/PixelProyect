import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Folder, Lock, Upload, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { db, storage } from '@/lib/backend';
import { ref, uploadBytes, getDownloadURL } from '@/lib/supabase/storage-shim';
import { collection, addDoc, serverTimestamp } from '@/lib/supabase/document-store';
import {
  buildDocumentStoragePath,
  getDocumentFolderStorageSegments,
  getProjectTeamMembers,
  getTaskStorageFolderSegments,
  isDocumentFolder,
} from '@/lib/document-storage';
import { toast } from 'sonner';

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  user: any;
  project?: any;
  tasks?: any[];
  documents?: any[];
  initialFolderId?: string | null;
  teamMembers?: any[];
  canManageAccess?: boolean;
}

type UploadScope = 'project' | 'task';
type AccessMode = 'all' | 'restricted';

const getTaskTitle = (task: any) =>
  task?.externalWorkflowId || task?.title || task?.name || 'Tarea sin nombre';

const buildTaskOptions = (tasks: any[] = []) => {
  const childrenByParent = new Map<string, any[]>();
  const roots: any[] = [];

  tasks.forEach((task) => {
    if (task?.parentTaskId) {
      const children = childrenByParent.get(task.parentTaskId) || [];
      children.push(task);
      childrenByParent.set(task.parentTaskId, children);
    } else {
      roots.push(task);
    }
  });

  const sortTasks = (items: any[]) =>
    [...items].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0) || getTaskTitle(a).localeCompare(getTaskTitle(b)));

  const output: Array<{ task: any; label: string }> = [];
  const walk = (task: any, depth = 0) => {
    output.push({ task, label: `${depth > 0 ? `${'  '.repeat(depth)}↳ ` : ''}${getTaskTitle(task)}` });
    sortTasks(childrenByParent.get(task.id) || []).forEach((child) => walk(child, depth + 1));
  };

  sortTasks(roots).forEach((task) => walk(task));
  return output;
};

const buildFolderOptions = (documents: any[] = []) => {
  const folders = documents.filter((document) => isDocumentFolder(document));
  const childrenByParent = new Map<string, any[]>();
  const roots: any[] = [];

  folders.forEach((folder) => {
    if (folder?.parentFolderId) {
      const children = childrenByParent.get(folder.parentFolderId) || [];
      children.push(folder);
      childrenByParent.set(folder.parentFolderId, children);
    } else {
      roots.push(folder);
    }
  });

  const sortFolders = (items: any[]) =>
    [...items].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  const output: Array<{ folder: any; label: string }> = [];
  const walk = (folder: any, depth = 0) => {
    output.push({ folder, label: `${depth > 0 ? `${'  '.repeat(depth)}↳ ` : ''}${folder.name || 'Carpeta sin nombre'}` });
    sortFolders(childrenByParent.get(folder.id) || []).forEach((child) => walk(child, depth + 1));
  };

  sortFolders(roots).forEach((folder) => walk(folder));
  return output;
};

export function UploadDocumentModal({
  isOpen,
  onClose,
  projectId,
  user,
  project,
  tasks = [],
  documents = [],
  initialFolderId = null,
  teamMembers = [],
  canManageAccess = false,
}: UploadDocumentModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState('contract');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [scope, setScope] = useState<UploadScope>('project');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [accessMode, setAccessMode] = useState<AccessMode>('all');
  const [allowedMemberIds, setAllowedMemberIds] = useState<string[]>([]);

  const projectMembers = useMemo(
    () => getProjectTeamMembers(project, teamMembers),
    [project, teamMembers]
  );
  const taskOptions = useMemo(() => buildTaskOptions(tasks), [tasks]);
  const folderOptions = useMemo(() => buildFolderOptions(documents), [documents]);
  const selectedTask = useMemo(
    () => taskOptions.find((option) => option.task.id === selectedTaskId)?.task || null,
    [selectedTaskId, taskOptions]
  );
  const selectedFolder = useMemo(
    () => folderOptions.find((option) => option.folder.id === selectedFolderId)?.folder || null,
    [selectedFolderId, folderOptions]
  );
  const selectedFolderSegments = useMemo(
    () => getDocumentFolderStorageSegments(selectedFolderId, folderOptions.map((option) => option.folder)),
    [selectedFolderId, folderOptions]
  );

  useEffect(() => {
    if (!isOpen) return;
    setFile(null);
    setDocName('');
    setDocType('contract');
    setUploading(false);
    setUploadProgress(0);
    setScope('project');
    setSelectedTaskId('');
    setSelectedFolderId(initialFolderId || '');
    setAccessMode('all');
    setAllowedMemberIds([]);
  }, [initialFolderId, isOpen]);

  if (!isOpen) return null;

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      if (!docName) {
        setDocName(selectedFile.name.split('.').slice(0, -1).join('.') || selectedFile.name);
      }
    }
  };

  const toggleMember = (memberId: string) => {
    setAllowedMemberIds((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId]
    );
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !user || !docName.trim()) return;

    if (scope === 'task' && !selectedTask) {
      toast.warning('Selecciona la tarea o subtarea donde quedara este documento.');
      return;
    }

    if (accessMode === 'restricted' && allowedMemberIds.length === 0) {
      toast.warning('Selecciona al menos una persona autorizada para ver el documento.');
      return;
    }

    setUploading(true);
    setUploadProgress(10);

    const storagePath = buildDocumentStoragePath({
      projectId,
      projectName: project?.name,
      task: scope === 'task' ? selectedTask : null,
      tasks,
      fileName: file.name,
      documentName: docName,
      folderSegments: scope === 'project' ? selectedFolderSegments : [],
    });
    const storageFolder = storagePath.split('/').slice(0, -1).join('/');
    const storageRef = ref(storage, storagePath);

    try {
      const snapshot = await uploadBytes(storageRef, file);
      setUploadProgress(50);

      const downloadURL = await getDownloadURL(snapshot.ref);
      setUploadProgress(75);

      await addDoc(collection(db, 'projects', projectId, 'documents'), {
        projectId,
        name: docName.trim(),
        type: docType,
        scope,
        parentFolderId: scope === 'project' ? selectedFolderId || null : null,
        taskId: scope === 'task' ? selectedTask?.id || null : null,
        taskTitle: scope === 'task' ? getTaskTitle(selectedTask) : null,
        taskFolderSegments: scope === 'task' ? getTaskStorageFolderSegments(selectedTask, tasks) : [],
        projectFolderSegments: scope === 'project' ? selectedFolderSegments : [],
        url: downloadURL,
        storagePath: storageRef.fullPath,
        storageFolder,
        uploadedAt: serverTimestamp(),
        uploadedBy: user.uid,
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type || null,
        accessMode,
        allowedMemberIds: accessMode === 'restricted' ? allowedMemberIds : [],
        providerPathVersion: 'structured-v1',
      });

      setUploadProgress(100);
      onClose();
      toast.success('Documento subido correctamente');
    } catch (error: any) {
      console.error('Error uploading file:', error);
      toast.error('Error al subir el archivo: ' + (error?.message || 'Error desconocido'));
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const previewPath = file
    ? buildDocumentStoragePath({
        projectId,
        projectName: project?.name,
        task: scope === 'task' ? selectedTask : null,
        tasks,
        fileName: file.name,
        documentName: docName || file.name,
        folderSegments: scope === 'project' ? selectedFolderSegments : [],
      }).split('/').slice(0, -1).join(' / ')
    : scope === 'task'
      ? 'projects / proyecto / tareas / tarea seleccionada'
      : 'projects / proyecto / documentacion-del-proyecto';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-100 p-2.5">
              <Upload className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900">Subir documento</h3>
              <p className="text-sm font-medium text-slate-500">Guarda el archivo en una ruta documental organizada.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleUpload} className="max-h-[calc(92vh-86px)] overflow-y-auto p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Tipo de documento</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="contract">Contrato</option>
                <option value="proposal">Propuesta</option>
                <option value="technical">Tecnico</option>
                <option value="evidence">Evidencia</option>
                <option value="other">Otro documento</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Nombre del documento</label>
              <input
                type="text"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                placeholder="Ej. Anexo tecnico"
                required
              />
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setScope('project')}
              className={`rounded-2xl border p-4 text-left transition ${
                scope === 'project'
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-200'
              }`}
            >
              <Folder className="mb-3 h-5 w-5 text-indigo-600" />
              <p className="text-sm font-black">Documentación del proyecto</p>
              <p className="mt-1 text-xs font-medium text-slate-500">Contrato, anexos, propuestas y documentos generales.</p>
            </button>
            <button
              type="button"
              onClick={() => setScope('task')}
              className={`rounded-2xl border p-4 text-left transition ${
                scope === 'task'
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-200'
              }`}
            >
              <FileText className="mb-3 h-5 w-5 text-indigo-600" />
              <p className="text-sm font-black">Documento de tarea</p>
              <p className="mt-1 text-xs font-medium text-slate-500">Queda dentro de la carpeta de la tarea o subtarea.</p>
            </button>
          </div>

          {scope === 'task' && (
            <div className="mt-4 space-y-2">
              <label className="text-sm font-bold text-slate-700">Tarea o subtarea</label>
              <select
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="">Selecciona donde guardar...</option>
                {taskOptions.map(({ task, label }) => (
                  <option key={task.id} value={task.id}>{label}</option>
                ))}
              </select>
            </div>
          )}

          {scope === 'project' && (
            <div className="mt-4 space-y-2">
              <label className="text-sm font-bold text-slate-700">Carpeta destino</label>
              <select
                value={selectedFolderId}
                onChange={(e) => setSelectedFolderId(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="">Documentación del proyecto / raíz</option>
                {folderOptions.map(({ folder, label }) => (
                  <option key={folder.id} value={folder.id}>{label}</option>
                ))}
              </select>
              <p className="text-xs font-semibold text-slate-400">
                {selectedFolder ? `El archivo quedará dentro de "${selectedFolder.name}".` : 'Usa la raíz o una carpeta creada en el gestor documental.'}
              </p>
            </div>
          )}

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Ruta S3 / Storage</p>
            <p className="mt-2 break-all text-sm font-bold text-slate-700">{previewPath}</p>
          </div>

          {canManageAccess && (
            <div className="mt-5 rounded-2xl border border-slate-200 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Lock className="h-4 w-4 text-indigo-600" />
                <p className="text-sm font-black text-slate-900">Visibilidad del documento</p>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-bold">
                  <input
                    type="radio"
                    checked={accessMode === 'all'}
                    onChange={() => {
                      setAccessMode('all');
                      setAllowedMemberIds([]);
                    }}
                  />
                  Todo el equipo del proyecto
                </label>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-bold">
                  <input
                    type="radio"
                    checked={accessMode === 'restricted'}
                    onChange={() => setAccessMode('restricted')}
                  />
                  Solo personas seleccionadas
                </label>
              </div>

              {accessMode === 'restricted' && (
                <div className="mt-3 max-h-44 overflow-y-auto rounded-xl bg-slate-50 p-2">
                  {projectMembers.length === 0 ? (
                    <p className="px-2 py-3 text-sm font-medium text-slate-500">No hay miembros asignados al proyecto.</p>
                  ) : (
                    projectMembers.map((member) => (
                      <label key={member.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white">
                        <input
                          type="checkbox"
                          checked={allowedMemberIds.includes(member.id)}
                          onChange={() => toggleMember(member.id)}
                        />
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-black text-indigo-700">
                          {(member.name || member.email || '?').charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0 truncate">{member.name || member.email || 'Miembro'}</span>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-5 space-y-2">
            <label className="text-sm font-bold text-slate-700">Archivo</label>
            <div className="relative cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center transition-colors hover:bg-slate-50">
              <input
                type="file"
                id="file-upload"
                onChange={handleFileChange}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                required
              />
              <div className="flex flex-col items-center justify-center gap-2">
                <FileText className="h-9 w-9 text-slate-400" />
                <div className="text-sm text-slate-600">
                  {file ? (
                    <span className="font-bold text-indigo-600">{file.name}</span>
                  ) : (
                    <span>Haz clic o arrastra un archivo aquí</span>
                  )}
                </div>
                {file && <div className="text-xs font-semibold text-slate-400">{formatFileSize(file.size)}</div>}
              </div>
            </div>
          </div>

          {uploading && (
            <div className="mt-4 space-y-1">
              <div className="flex justify-between text-xs font-bold text-slate-500">
                <span>Subiendo a gestor documental...</span>
                <span>{Math.round(uploadProgress)}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-100">
                <div className="h-1.5 rounded-full bg-indigo-600 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-col-reverse justify-end gap-3 border-t border-slate-100 pt-4 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={uploading}
              className="border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!file || uploading || !docName.trim()}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {uploading ? (
                'Subiendo...'
              ) : (
                <>
                  <Users size={16} className="mr-2" />
                  Guardar documento
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

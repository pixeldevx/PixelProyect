import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from '@/lib/supabase/document-store';
import { ref, uploadBytes, getDownloadURL, deleteObject } from '@/lib/supabase/storage-shim';
import { db, storage } from '@/lib/backend';
import { X, Upload, FileText, Trash2, Loader2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface TaskDocumentsViewerProps {
  isOpen: boolean;
  onClose: () => void;
  task: any;
  userId: string;
}

const getTaskTitle = (task: any) => task?.title || task?.name || 'Sin título';

export const TaskDocumentsViewer: React.FC<TaskDocumentsViewerProps> = ({ isOpen, onClose, task, userId }) => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!isOpen || !task) return;

    const q = query(
      collection(db, 'projects', task.projectId, 'documents'),
      where('taskId', '==', task.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDocuments(docsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isOpen, task]);

  const handleUpload = async () => {
    if (!file || !task) return;
    setUploading(true);
    try {
      const storageRef = ref(storage, `projects/${task.projectId}/tasks/${task.id}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      await addDoc(collection(db, 'projects', task.projectId, 'documents'), {
        projectId: task.projectId,
        taskId: task.id,
        name: file.name,
        type: 'workflow_document',
        url: downloadURL,
        storagePath: storageRef.fullPath,
        uploadedBy: userId,
        uploadedAt: serverTimestamp()
      });

      setFile(null);
    } catch (error) {
      console.error("Error uploading document:", error);
      toast.error("Error al subir el documento");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId: string, storagePath: string) => {
    if (!confirm('¿Está seguro de eliminar este documento?')) return;
    try {
      if (storagePath) {
        const storageRef = ref(storage, storagePath);
        await deleteObject(storageRef);
      }
      await deleteDoc(doc(db, 'projects', task.projectId, 'documents', docId));
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Error al eliminar el documento");
    }
  };

  if (!isOpen || !task) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Documentos de la Tarea</h2>
            <p className="text-sm text-slate-500 mt-1">
              {task.externalWorkflowId ? `[${task.externalWorkflowId}] ` : ''}{getTaskTitle(task)}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 border-b border-slate-100 bg-slate-50">
          <h3 className="text-sm font-medium text-slate-700 mb-3">Agregar Nuevo Documento</h3>
          <div className="flex items-center gap-3">
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="flex-1 text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
            <Button 
              onClick={handleUpload} 
              disabled={!file || uploading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
              Subir
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <FileText className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p>No hay documentos adjuntos a esta tarea.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                      <FileText size={20} />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 text-sm">{doc.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {doc.uploadedAt?.toDate ? format(doc.uploadedAt.toDate(), 'dd/MM/yyyy HH:mm') : 'Reciente'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a 
                      href={doc.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Descargar"
                    >
                      <Download size={18} />
                    </a>
                    <button 
                      onClick={() => handleDelete(doc.id, doc.storagePath)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

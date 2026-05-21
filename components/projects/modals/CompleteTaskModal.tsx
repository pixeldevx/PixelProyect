import React, { useState } from 'react';
import { FileText, X, File, Upload, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { db, storage } from '@/lib/backend';
import { doc, collection, addDoc, writeBatch, serverTimestamp, increment } from '@/lib/supabase/document-store';
import { ref, uploadBytes, getDownloadURL } from '@/lib/supabase/storage-shim';
import { toast } from 'sonner';

interface CompleteTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  taskId: string | null;
  task: any | null;
  user: any;
}

export function CompleteTaskModal({ isOpen, onClose, projectId, taskId, task, user }: CompleteTaskModalProps) {
  const [taskDocFile, setTaskDocFile] = useState<File | null>(null);
  const [isCompletingTask, setIsCompletingTask] = useState(false);

  if (!isOpen || !taskId) return null;

  const handleCompleteTaskWithDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskId || !taskDocFile || !user) return;

    setIsCompletingTask(true);
    try {
      // 1. Upload document
      const storageRef = ref(storage, `projects/${projectId}/tasks/${taskId}/${taskDocFile.name}`);
      await uploadBytes(storageRef, taskDocFile);
      const downloadURL = await getDownloadURL(storageRef);

      // 2. Create document record in Supabase
      const docData = {
        projectId: projectId,
        taskId: taskId,
        name: taskDocFile.name,
        type: 'task_completion',
        url: downloadURL,
        storagePath: storageRef.fullPath,
        uploadedBy: user.uid,
        uploadedAt: serverTimestamp()
      };
      
      const docRef = await addDoc(collection(db, 'projects', projectId, 'documents'), docData);

      // 3. Update task status and link document with Rate Card update
      const batch = writeBatch(db);
      const taskRef = doc(db, 'projects', projectId, 'tasks', taskId);

      if (task && task.isRateCardTask && task.rateCardId && task.unitsToAdd) {
        if (task.type !== 'workflow') {
          const oldProgress = task.progress || 0;
          const deltaProgress = 100 - oldProgress;
          const unitsDelta = (deltaProgress / 100) * task.unitsToAdd;
          
          if (unitsDelta !== 0) {
            const rcRef = doc(db, 'projects', projectId, 'rateCards', task.rateCardId);
            const updateData: any = {
              currentValue: increment(unitsDelta)
            };
            if (task.assignedTo) {
              updateData[`userStats.${task.assignedTo}`] = increment(unitsDelta);
            }
            batch.update(rcRef, updateData);
          }
        } else {
          // Workflow: only if completing the whole task
          if (task.status !== 'completed') {
            const rcRef = doc(db, 'projects', projectId, 'rateCards', task.rateCardId);
            const units = task.unitsToAdd || 1;
            const updateData: any = {
              currentValue: increment(units)
            };
            if (task.assignedTo) {
              updateData[`userStats.${task.assignedTo}`] = increment(units);
            }
            batch.update(rcRef, updateData);
          }
        }
      }

      batch.update(taskRef, {
        status: 'completed',
        progress: 100,
        linkedDocumentId: docRef.id,
        updatedAt: serverTimestamp()
      });

      await batch.commit();

      setTaskDocFile(null);
      onClose();
    } catch (error: any) {
      console.error("Error completing task with document:", error);
      toast.error(`Error al completar la tarea: ${error.message}`);
    } finally {
      setIsCompletingTask(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 m-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-full text-indigo-600">
              <FileText size={20} />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">Finalizar Tarea</h3>
          </div>
          <button 
            onClick={() => {
              setTaskDocFile(null);
              onClose();
            }}
            className="text-slate-400 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleCompleteTaskWithDoc} className="space-y-4">
          <p className="text-sm text-slate-600">
            Esta tarea requiere que cargues un documento de soporte (ej. Acta de Inicio, Informe, etc.) para poder marcarla como finalizada.
          </p>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Documento de Soporte</label>
            <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center hover:border-indigo-400 transition-colors cursor-pointer relative">
              <input 
                type="file" 
                onChange={(e) => setTaskDocFile(e.target.files?.[0] || null)}
                className="absolute inset-0 opacity-0 cursor-pointer"
                required
              />
              {taskDocFile ? (
                <div className="flex items-center justify-center gap-2 text-indigo-600">
                  <File size={20} />
                  <span className="text-sm font-medium truncate max-w-[200px]">{taskDocFile.name}</span>
                </div>
              ) : (
                <div className="space-y-1">
                  <Upload className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-xs text-slate-500">Haz clic o arrastra un archivo para cargar</p>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex justify-end gap-3 pt-4">
            <Button 
              type="button"
              variant="outline" 
              onClick={() => {
                setTaskDocFile(null);
                onClose();
              }}
              disabled={isCompletingTask}
              className="border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </Button>
            <Button 
              type="submit"
              disabled={!taskDocFile || isCompletingTask}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isCompletingTask ? (
                <>
                  <Clock className="w-4 h-4 mr-2 animate-spin" />
                  Cargando...
                </>
              ) : 'Finalizar Tarea'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

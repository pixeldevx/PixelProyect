import React, { useEffect, useState } from 'react';
import { X, Upload, Save, FileText, MessageSquare, Hash } from 'lucide-react';
import { doc, updateDoc, serverTimestamp, addDoc, collection } from '@/lib/supabase/document-store';
import { ref, uploadBytes, getDownloadURL } from '@/lib/supabase/storage-shim';
import { db, storage } from '@/lib/backend';
import { toast } from 'sonner';

interface StartWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: any;
  projectId: string;
  userId: string;
  teamMembers: any[];
}

const getTaskTitle = (task: any) => task?.title || task?.name || 'Sin título';
const getTaskDisplayTitle = (task: any) => {
  const title = getTaskTitle(task);
  if (!task?.externalWorkflowId || title === task.externalWorkflowId) {
    return title;
  }
  return `[${task.externalWorkflowId}] ${title}`;
};

export const StartWorkflowModal: React.FC<StartWorkflowModalProps> = ({
  isOpen,
  onClose,
  task,
  projectId,
  userId,
  teamMembers
}) => {
  const [workflowId, setWorkflowId] = useState('');
  const [observation, setObservation] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [firstStepAssignee, setFirstStepAssignee] = useState<string>('');

  useEffect(() => {
    if (!isOpen || !task) return;
    setWorkflowId(task.externalWorkflowId || '');
    setObservation('');
    setFile(null);
    setFirstStepAssignee('');
  }, [isOpen, task]);

  if (!isOpen || !task) return null;

  const handleStart = async () => {
    const cleanWorkflowId = workflowId.trim();

    if (!cleanWorkflowId) {
      toast.warning("Por favor ingrese un ID de Workflow.");
      return;
    }

    if (task.workflowSteps?.[0]?.assignedTo === 'DYNAMIC' && !firstStepAssignee) {
      toast.warning("Por favor asigne el primer paso a un miembro del equipo.");
      return;
    }

    setIsStarting(true);
    try {
      let documentId = null;

      // 1. Upload file if exists
      if (file) {
        const storageRef = ref(storage, `projects/${projectId}/tasks/${task.id}/start_${file.name}`);
        await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);

        const docData = {
          projectId: projectId,
          taskId: task.id,
          name: file.name,
          type: 'workflow_start',
          url: downloadURL,
          storagePath: storageRef.fullPath,
          uploadedBy: userId,
          uploadedAt: serverTimestamp()
        };
        
        const docRef = await addDoc(collection(db, 'projects', projectId, 'documents'), docData);
        documentId = docRef.id;
      }

      // 2. Prepare history entry
      const historyEntry = {
        stepIndex: 0,
        userId: userId,
        action: 'start',
        comment: observation || 'Workflow iniciado',
        timestamp: new Date(),
        workflowId: cleanWorkflowId
      };

      // 3. Update task
      const updatedSteps = [...(task.workflowSteps || [])];
      if (updatedSteps.length > 0) {
        updatedSteps[0] = {
          ...updatedSteps[0],
          status: 'en_curso',
          startedAt: new Date()
        };
        if (updatedSteps[0].assignedTo === 'DYNAMIC' && firstStepAssignee) {
          updatedSteps[0].assignedTo = firstStepAssignee;
        }
      }

      await updateDoc(doc(db, 'projects', projectId, 'tasks', task.id), {
        title: cleanWorkflowId,
        name: cleanWorkflowId,
        originalTitle: task.originalTitle || getTaskTitle(task),
        status: 'in_progress',
        progress: 10,
        externalWorkflowId: cleanWorkflowId,
        initialObservation: observation,
        startDocumentId: documentId,
        currentStepIndex: 0,
        workflowSteps: updatedSteps,
        workflowHistory: [historyEntry, ...(task.workflowHistory || [])],
        updatedAt: serverTimestamp()
      });

      if (task.parentTaskId) {
        const { updateParentTaskStatus } = await import('@/lib/taskUtils');
        await updateParentTaskStatus(projectId, task.parentTaskId);
      }

      toast.success("Workflow iniciado correctamente.");
      onClose();
    } catch (error: any) {
      console.error("Error starting workflow:", error);
      toast.error(`Error al iniciar el workflow: ${error.message}`);
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Iniciar Workflow</h2>
            <p className="text-sm text-slate-500 mt-1">
              {getTaskDisplayTitle(task)}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Workflow ID */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
              <Hash size={16} className="text-slate-400" />
              ID del Workflow / Radicado
            </label>
            <input
              type="text"
              value={workflowId}
              onChange={(e) => setWorkflowId(e.target.value)}
              placeholder="Ej: WKF-2024-001"
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Initial Observation */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
              <MessageSquare size={16} className="text-slate-400" />
              Observación Inicial
            </label>
            <textarea
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              placeholder="Notas sobre el inicio de este proceso..."
              className="w-full h-24 px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
            />
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
              <Upload size={16} className="text-slate-400" />
              Documento de Inicio (Opcional)
            </label>
            <div className="relative group">
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className={`w-full p-4 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 transition-colors ${
                file ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 group-hover:border-indigo-300 group-hover:bg-slate-50'
              }`}>
                {file ? (
                  <>
                    <FileText className="text-emerald-500" size={24} />
                    <span className="text-sm font-medium text-emerald-700">{file.name}</span>
                    <span className="text-xs text-emerald-600">Haga clic para cambiar el archivo</span>
                  </>
                ) : (
                  <>
                    <Upload className="text-slate-400" size={24} />
                    <span className="text-sm font-medium text-slate-600">Seleccionar archivo</span>
                    <span className="text-xs text-slate-400">Arrastre o haga clic para subir</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Status Bar */}
          <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
            <p className="text-sm font-medium text-indigo-900">
              El workflow será enviado a:
            </p>
            {task.workflowSteps && task.workflowSteps.length > 0 && task.workflowSteps[0].assignedTo === 'DYNAMIC' ? (
              <div className="mt-2">
                <select
                  value={firstStepAssignee}
                  onChange={(e) => setFirstStepAssignee(e.target.value)}
                  className="w-full bg-white border border-indigo-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  required
                >
                  <option value="">Seleccione un responsable...</option>
                  {teamMembers.map(member => (
                    <option key={member.id} value={member.id}>{member.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="text-sm text-indigo-700 font-bold mt-1">
                {task.workflowSteps && task.workflowSteps.length > 0 
                  ? teamMembers.find(m => m.id === task.workflowSteps[0].assignedTo)?.name || 'Usuario no encontrado'
                  : 'No hay pasos definidos'}
              </p>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleStart}
            disabled={isStarting}
            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            <Save size={16} />
            {isStarting ? 'Iniciando...' : 'Iniciar Proceso'}
          </button>
        </div>
      </div>
    </div>
  );
};

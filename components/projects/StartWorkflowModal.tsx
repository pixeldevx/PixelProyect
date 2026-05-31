import React, { useEffect, useState } from 'react';
import { X, Upload, Save, FileText, MessageSquare, Hash, Calendar, MapPin } from 'lucide-react';
import { doc, updateDoc, serverTimestamp, addDoc, collection } from '@/lib/supabase/document-store';
import { ref, uploadBytes, getDownloadURL } from '@/lib/supabase/storage-shim';
import { db, storage } from '@/lib/backend';
import { toast } from 'sonner';
import { notifyTaskAssignment } from '@/lib/notifications';
import { getTaskDisplayTitle, getTaskTitle } from '@/lib/task-title';

interface StartWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: any;
  parentTask?: any | null;
  projectId: string;
  userId: string;
  teamMembers: any[];
}

const getTaskDate = (value: any) => {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const toDateInputValue = (value: any) => {
  const date = getTaskDate(value);
  return date ? date.toISOString().slice(0, 10) : '';
};
const parseDateInput = (value: string) => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const endOfDate = (date: Date) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};
export const StartWorkflowModal: React.FC<StartWorkflowModalProps> = ({
  isOpen,
  onClose,
  task,
  parentTask,
  projectId,
  userId,
  teamMembers
}) => {
  const [workflowId, setWorkflowId] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [observation, setObservation] = useState('');
  const [workflowStartDate, setWorkflowStartDate] = useState('');
  const [workflowEndDate, setWorkflowEndDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [firstStepAssignee, setFirstStepAssignee] = useState<string>('');

  useEffect(() => {
    if (!isOpen || !task) return;
    setWorkflowId(task.externalWorkflowId || '');
    setMunicipality(task.municipality || task.workflowMunicipality || parentTask?.municipality || parentTask?.workflowMunicipality || '');
    setObservation('');
    setWorkflowStartDate(toDateInputValue(task.startDate || task.start));
    setWorkflowEndDate(toDateInputValue(task.endDate || task.end));
    setFile(null);
    setFirstStepAssignee('');
  }, [isOpen, task, parentTask]);

  if (!isOpen || !task) return null;

  const parentStartValue = parentTask ? toDateInputValue(parentTask.startDate || parentTask.start) : '';
  const parentEndValue = parentTask ? toDateInputValue(parentTask.endDate || parentTask.end) : '';

  const handleStart = async () => {
    const cleanWorkflowId = workflowId.trim();
    const cleanMunicipality = municipality.trim();

    if (!cleanWorkflowId) {
      toast.warning("Por favor ingrese un ID de Workflow.");
      return;
    }

    if (!cleanMunicipality) {
      toast.warning("Por favor ingrese el municipio del workflow.");
      return;
    }

    if (task.workflowSteps?.[0]?.assignedTo === 'DYNAMIC' && !firstStepAssignee) {
      toast.warning("Por favor asigne el primer paso a un miembro del equipo.");
      return;
    }

    const parsedWorkflowStart = parseDateInput(workflowStartDate);
    const parsedWorkflowEnd = parseDateInput(workflowEndDate);
    if (!parsedWorkflowStart || !parsedWorkflowEnd) {
      toast.warning("Define fecha de inicio y fecha fin para este workflow.");
      return;
    }

    if (parsedWorkflowStart.getTime() > parsedWorkflowEnd.getTime()) {
      toast.warning("La fecha de inicio no puede ser posterior a la fecha fin.");
      return;
    }

    const parentStartDate = getTaskDate(parentTask?.startDate || parentTask?.start);
    const parentEndDate = getTaskDate(parentTask?.endDate || parentTask?.end);
    if (parentTask && parentStartDate && parsedWorkflowStart.getTime() < parentStartDate.getTime()) {
      toast.warning("El workflow no puede iniciar antes que la tarea principal.");
      return;
    }

    if (parentTask && parentEndDate && endOfDate(parsedWorkflowEnd).getTime() > endOfDate(parentEndDate).getTime()) {
      toast.warning("El workflow no puede terminar después que la tarea principal.");
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
        workflowId: cleanWorkflowId,
        municipality: cleanMunicipality,
        plannedStartDate: parsedWorkflowStart.toISOString(),
        plannedEndDate: parsedWorkflowEnd.toISOString()
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

      const resolvedFirstStepAssignee = updatedSteps[0]?.assignedTo;
      const shouldAssignTaskToFirstStep =
        task.workflowSteps?.[0]?.assignedTo === 'DYNAMIC' &&
        resolvedFirstStepAssignee &&
        resolvedFirstStepAssignee !== 'DYNAMIC';

      await updateDoc(doc(db, 'projects', projectId, 'tasks', task.id), {
        title: cleanWorkflowId,
        name: cleanWorkflowId,
        originalTitle: task.originalTitle || getTaskTitle(task),
        status: 'in_progress',
        progress: 10,
        startDate: parsedWorkflowStart,
        endDate: parsedWorkflowEnd,
        start: parsedWorkflowStart,
        end: parsedWorkflowEnd,
        assignedTo: shouldAssignTaskToFirstStep ? resolvedFirstStepAssignee : task.assignedTo || '',
        externalWorkflowId: cleanWorkflowId,
        municipality: cleanMunicipality,
        workflowMunicipality: cleanMunicipality,
        initialObservation: observation,
        startDocumentId: documentId,
        currentStepIndex: 0,
        workflowSteps: updatedSteps,
        workflowHistory: [historyEntry, ...(task.workflowHistory || [])],
        updatedAt: serverTimestamp()
      });

      void notifyTaskAssignment({
        projectId,
        taskId: task.id,
        assigneeId: updatedSteps[0]?.assignedTo,
        stepIndex: 0,
        eventType: 'workflow_step_assigned',
        source: 'workflow_start',
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden">
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

        <div className="p-6 space-y-6 overflow-y-auto">
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

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
              <MapPin size={16} className="text-slate-400" />
              Municipio
            </label>
            <input
              type="text"
              value={municipality}
              onChange={(e) => setMunicipality(e.target.value)}
              placeholder="Ej: Medellín"
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <p className="mt-1 text-xs text-slate-500">
              Se usará para segmentar reportes por ciudad o municipio.
            </p>
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
            <label className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Calendar size={16} className="text-indigo-500" />
              Cronograma del workflow
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <span className="mb-1 block text-xs font-medium text-slate-600">Fecha inicio</span>
                <input
                  type="date"
                  value={workflowStartDate}
                  min={parentStartValue || undefined}
                  max={parentEndValue || undefined}
                  onChange={(e) => setWorkflowStartDate(e.target.value)}
                  className="w-full rounded-lg border border-indigo-100 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium text-slate-600">Fecha fin</span>
                <input
                  type="date"
                  value={workflowEndDate}
                  min={workflowStartDate || parentStartValue || undefined}
                  max={parentEndValue || undefined}
                  onChange={(e) => setWorkflowEndDate(e.target.value)}
                  className="w-full rounded-lg border border-indigo-100 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>
            {parentTask && parentStartValue && parentEndValue && (
              <p className="mt-2 text-xs text-indigo-700">
                Debe quedar dentro de la tarea principal: {parentStartValue} a {parentEndValue}.
              </p>
            )}
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
            disabled={isStarting || !workflowId.trim() || !municipality.trim()}
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

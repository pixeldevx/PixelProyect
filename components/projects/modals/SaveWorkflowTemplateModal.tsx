import React, { useState } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';

interface SaveWorkflowTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  workflowSteps: any[];
  user: any;
}

export function SaveWorkflowTemplateModal({
  isOpen,
  onClose,
  workflowSteps,
  user
}: SaveWorkflowTemplateModalProps) {
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateName.trim()) {
      toast.warning('Por favor ingrese un nombre para la plantilla.');
      return;
    }
    
    if (workflowSteps.length === 0) {
      toast.warning('No hay pasos en el workflow para guardar.');
      return;
    }

    setIsSaving(true);
    try {
      // Limpiamos la asignación específica de usuarios ya que la plantilla será global
      const stepsToSave = workflowSteps.map(step => ({
        ...step,
        assignedTo: '' // Lo limpiamos para que el usuario asigne a alguien del nuevo proyecto
      }));

      await addDoc(collection(db, 'workflow_templates'), {
        name: templateName,
        description: templateDesc,
        steps: stepsToSave,
        createdAt: serverTimestamp(),
        createdBy: user?.uid || ''
      });

      toast.success('Plantilla guardada correctamente');
      onClose();
      setTemplateName('');
      setTemplateDesc('');
    } catch (error: any) {
      console.error('Error saving template:', error);
      toast.error(`Error al guardar: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
              <Save size={20} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Guardar Plantilla</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Nombre de la Plantilla</label>
            <input 
              type="text" 
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
              placeholder="Ej. Diseño y Creación estándar"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Descripción (Opcional)</label>
            <textarea 
              value={templateDesc}
              onChange={(e) => setTemplateDesc(e.target.value)}
              className="w-full min-h-[80px] p-4 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm resize-none"
              placeholder="Detalles sobre qué contiene este flujo..."
            />
          </div>

          <div className="pt-4 flex gap-3">
            <Button 
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 h-11 rounded-xl text-slate-600"
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={isSaving}
              className="flex-1 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isSaving ? <Loader2 className="animate-spin" size={20} /> : 'Guardar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

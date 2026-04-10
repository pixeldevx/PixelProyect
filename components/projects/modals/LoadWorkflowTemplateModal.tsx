import React, { useState, useEffect } from 'react';
import { X, Copy, Download, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface LoadWorkflowTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (steps: any[]) => void;
}

export function LoadWorkflowTemplateModal({
  isOpen,
  onClose,
  onSelectTemplate
}: LoadWorkflowTemplateModalProps) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
    }
  }, [isOpen]);

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const q = query(collection(db, 'workflow_templates'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTemplates(data);
    } catch (error) {
      console.error('Error loading templates:', error);
      toast.error('No se pudieron cargar las plantillas');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
              <Download size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Cargar Plantilla</h3>
              <p className="text-xs text-slate-500">Selecciona un workflow pre-guardado</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="flex flex-col flex-1 items-center justify-center py-12 text-slate-400">
              <Loader2 className="animate-spin mb-4" size={32} />
              <p>Cargando plantillas...</p>
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mb-4">
                <Copy size={32} />
              </div>
              <h4 className="text-lg font-bold text-slate-700">No hay plantillas guardadas</h4>
              <p className="text-sm text-slate-500 max-w-sm mt-2">
                Puedes guardar cualquier workflow desde la ventana anterior para re-utilizarlo después.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {templates.map(template => (
                <div key={template.id} className="border border-slate-200 rounded-xl p-4 hover:border-emerald-300 transition-colors bg-white hover:bg-slate-50 flex flex-col group">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-bold text-slate-800">{template.name}</h4>
                      {template.description && (
                        <p className="text-sm text-slate-500 mt-1">{template.description}</p>
                      )}
                    </div>
                    <Button
                      onClick={() => {
                        onSelectTemplate(template.steps || []);
                        toast.success('Plantilla cargada correctamente');
                        onClose();
                      }}
                      className="shrink-0 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white"
                      size="sm"
                    >
                      Usar Plantilla <ArrowRight size={14} className="ml-1" />
                    </Button>
                  </div>
                  
                  <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
                    <span className="bg-slate-100 px-2 py-1 rounded-md font-medium text-slate-600">
                      {template.steps?.length || 0} pasos
                    </span>
                    {template.createdAt && (
                      <span>
                        Guardada el {format(template.createdAt.toDate(), "d 'de' MMMM, yyyy", { locale: es })}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

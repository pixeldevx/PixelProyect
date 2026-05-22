import React, { useState } from 'react';
import { X, Plus, Trash2, GripVertical, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export interface FormField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'checkbox';
  required: boolean;
  options?: string[];
  selectionMode?: 'single' | 'multiple';
}

export interface CustomForm {
  title: string;
  fields: FormField[];
}

interface WorkflowStepFormBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  stepName: string;
  initialForm?: CustomForm;
  onSave: (form: CustomForm | undefined) => void;
}

export const WorkflowStepFormBuilderModal: React.FC<WorkflowStepFormBuilderModalProps> = ({
  isOpen,
  onClose,
  stepName,
  initialForm,
  onSave
}) => {
  const [title, setTitle] = useState(initialForm?.title || `Formulario para ${stepName}`);
  const [fields, setFields] = useState<FormField[]>(initialForm?.fields || []);

  if (!isOpen) return null;

  const addField = () => {
    setFields([
      ...fields,
      {
        id: `field_${Date.now()}`,
        label: 'Nuevo Campo',
        type: 'text',
        required: false
      }
    ]);
  };

  const updateField = (index: number, updates: Partial<FormField>) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], ...updates };
    setFields(newFields);
  };

  const removeField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const addOption = (fieldIndex: number) => {
    const field = fields[fieldIndex];
    updateField(fieldIndex, {
      options: [...(field.options || []), `Opción ${(field.options?.length || 0) + 1}`],
    });
  };

  const updateOption = (fieldIndex: number, optionIndex: number, value: string) => {
    const field = fields[fieldIndex];
    const options = [...(field.options || [])];
    options[optionIndex] = value;
    updateField(fieldIndex, { options });
  };

  const removeOption = (fieldIndex: number, optionIndex: number) => {
    const field = fields[fieldIndex];
    updateField(fieldIndex, {
      options: (field.options || []).filter((_, index) => index !== optionIndex),
    });
  };

  const handleSave = () => {
    if (fields.length === 0) {
      onSave(undefined);
      onClose();
      return;
    }

    const cleanedFields: FormField[] = fields.map((field) => {
      const cleanLabel = field.label.trim();
      if (field.type !== 'select') {
        return {
          ...field,
          label: cleanLabel,
          options: undefined,
          selectionMode: undefined,
        };
      }

      return {
        ...field,
        label: cleanLabel,
        selectionMode: field.selectionMode || 'multiple',
        options: (field.options || []).map((option) => option.trim()).filter(Boolean),
      };
    });

    const hasEmptyLabels = cleanedFields.some(f => !f.label.trim());
    if (hasEmptyLabels) {
      toast.warning('Todos los campos deben tener un nombre (label).');
      return;
    }

    const hasSelectWithoutOptions = cleanedFields.some(f => f.type === 'select' && (!f.options || f.options.length === 0));
    if (hasSelectWithoutOptions) {
      toast.warning('Los campos de selección deben tener al menos una opción.');
      return;
    }

    const hasDuplicateOptions = cleanedFields.some((field) => {
      if (field.type !== 'select') return false;
      const normalizedOptions = (field.options || []).map((option) => option.toLowerCase());
      return new Set(normalizedOptions).size !== normalizedOptions.length;
    });
    if (hasDuplicateOptions) {
      toast.warning('Las opciones de selección no pueden estar repetidas.');
      return;
    }

    onSave({ title, fields: cleanedFields });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Formulario Personalizado</h2>
            <p className="text-sm text-slate-500 mt-1">
              Paso: {stepName || 'Sin nombre'}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Nombre del Formulario
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Ej: Formulario de Aprobación"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <label className="block text-sm font-medium text-slate-700">
                Campos del Formulario
              </label>
              <Button onClick={addField} size="sm" variant="outline" className="h-8 text-xs">
                <Plus size={14} className="mr-1" /> Agregar Campo
              </Button>
            </div>

            {fields.length === 0 ? (
              <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <p className="text-sm text-slate-500">No hay campos definidos.</p>
                <p className="text-xs text-slate-400 mt-1">Agrega campos para solicitar información en este paso.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex items-start gap-3 p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                    <div className="mt-2 text-slate-300 cursor-move">
                      <GripVertical size={16} />
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <input
                            type="text"
                            value={field.label}
                            onChange={(e) => updateField(index, { label: e.target.value })}
                            placeholder="Nombre del campo"
                            className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div className="w-40">
                          <select
                            value={field.type}
                            onChange={(e) => {
                              const type = e.target.value as FormField['type'];
                              updateField(index, {
                                type,
                                ...(type === 'select'
                                  ? {
                                      selectionMode: field.selectionMode || 'multiple',
                                      options: field.options?.length ? field.options : ['Opción 1'],
                                    }
                                  : {}),
                              });
                            }}
                            className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="text">Texto corto</option>
                            <option value="number">Número</option>
                            <option value="date">Fecha</option>
                            <option value="select">Selección</option>
                            <option value="checkbox">Casilla de verificación</option>
                          </select>
                        </div>
                      </div>

                      {field.type === 'select' && (
                        <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <span className="text-xs font-medium text-slate-600">
                              Opciones de respuesta
                            </span>
                            <select
                              value={field.selectionMode || 'multiple'}
                              onChange={(e) =>
                                updateField(index, {
                                  selectionMode: e.target.value as FormField['selectionMode'],
                                })
                              }
                              className="h-8 px-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
                            >
                              <option value="single">Selección única</option>
                              <option value="multiple">Selección múltiple</option>
                            </select>
                          </div>

                          <div className="space-y-2">
                            {(field.options || []).map((option, optionIndex) => (
                              <div key={`${field.id}-option-${optionIndex}`} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={option}
                                  onChange={(e) => updateOption(index, optionIndex, e.target.value)}
                                  placeholder={`Opción ${optionIndex + 1}`}
                                  className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeOption(index, optionIndex)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Eliminar opción"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}
                          </div>

                          <Button
                            type="button"
                            onClick={() => addOption(index)}
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                          >
                            <Plus size={14} className="mr-1" />
                            Agregar opción
                          </Button>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`required-${field.id}`}
                          checked={field.required}
                          onChange={(e) => updateField(index, { required: e.target.checked })}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <label htmlFor={`required-${field.id}`} className="text-xs text-slate-600">
                          Campo obligatorio
                        </label>
                      </div>
                    </div>
                    <button
                      onClick={() => removeField(index)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            Guardar Formulario
          </Button>
        </div>
      </div>
    </div>
  );
};

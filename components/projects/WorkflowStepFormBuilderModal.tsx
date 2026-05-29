import React, { useState } from 'react';
import { X, Plus, Trash2, GripVertical, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export interface FormField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'datetime' | 'select' | 'checkbox';
  required: boolean;
  options?: string[];
  selectionMode?: 'single' | 'multiple';
}

export interface CustomForm {
  title: string;
  fields: FormField[];
  rateCardMode?: 'static' | 'dynamic' | null;
  dynamicRateCard?: boolean;
  dynamicRateCardConfig?: {
    defaultUnits: number;
    requirePerson: boolean;
    requireRateCard: boolean;
    promptForUnits?: boolean;
  } | null;
  rateCardId?: string | null;
  unitsToAdd?: number | null;
  autoAddUnits?: boolean | null;
}

interface WorkflowStepFormBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  stepName: string;
  initialForm?: CustomForm;
  rateCards?: any[];
  allowDynamicRateCard?: boolean;
  onSave: (form: CustomForm | undefined) => void;
}

export const WorkflowStepFormBuilderModal: React.FC<WorkflowStepFormBuilderModalProps> = ({
  isOpen,
  onClose,
  stepName,
  initialForm,
  rateCards = [],
  allowDynamicRateCard = true,
  onSave
}) => {
  const [title, setTitle] = useState(initialForm?.title || `Formulario para ${stepName}`);
  const [fields, setFields] = useState<FormField[]>(initialForm?.fields || []);
  const [formRateCardMode, setFormRateCardMode] = useState<'none' | 'static' | 'dynamic'>(
    allowDynamicRateCard && (initialForm?.dynamicRateCard || initialForm?.rateCardMode === 'dynamic')
      ? 'dynamic'
      : initialForm?.rateCardId
        ? 'static'
        : 'none'
  );
  const [formRateCardId, setFormRateCardId] = useState(initialForm?.rateCardId || '');
  const [formUnitsToAdd, setFormUnitsToAdd] = useState<number>(Number(initialForm?.unitsToAdd || initialForm?.dynamicRateCardConfig?.defaultUnits || 1));
  const [formAutoAddUnits, setFormAutoAddUnits] = useState(initialForm?.autoAddUnits !== false);

  React.useEffect(() => {
    if (!isOpen) return;

    setTitle(initialForm?.title || `Formulario para ${stepName}`);
    setFields(initialForm?.fields || []);
    setFormRateCardMode(
      allowDynamicRateCard && (initialForm?.dynamicRateCard || initialForm?.rateCardMode === 'dynamic')
        ? 'dynamic'
        : initialForm?.rateCardId
          ? 'static'
          : 'none'
    );
    setFormRateCardId(initialForm?.rateCardId || '');
    setFormUnitsToAdd(Number(initialForm?.unitsToAdd || initialForm?.dynamicRateCardConfig?.defaultUnits || 1));
    setFormAutoAddUnits(initialForm?.autoAddUnits !== false);
  }, [allowDynamicRateCard, initialForm, isOpen, stepName]);

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

    if (formRateCardMode === 'static' && !formRateCardId) {
      toast.warning('Selecciona el Rate Card fijo que se vinculará al formulario.');
      return;
    }

    if (formRateCardMode !== 'none' && Number(formUnitsToAdd) <= 0) {
      toast.warning('Define unidades de Rate Card mayores a cero.');
      return;
    }

    const rateCardConfig =
      formRateCardMode === 'none'
        ? {
            rateCardMode: null,
            dynamicRateCard: false,
            dynamicRateCardConfig: null,
            rateCardId: null,
            unitsToAdd: null,
            autoAddUnits: true,
          }
        : formRateCardMode === 'dynamic'
          ? {
              rateCardMode: 'dynamic' as const,
              dynamicRateCard: true,
              dynamicRateCardConfig: {
                defaultUnits: Number(formUnitsToAdd) || 1,
                requirePerson: true,
                requireRateCard: true,
                promptForUnits: !formAutoAddUnits,
              },
              rateCardId: null,
              unitsToAdd: Number(formUnitsToAdd) || 1,
              autoAddUnits: formAutoAddUnits,
            }
          : {
              rateCardMode: 'static' as const,
              dynamicRateCard: false,
              dynamicRateCardConfig: null,
              rateCardId: formRateCardId,
              unitsToAdd: Number(formUnitsToAdd) || 1,
              autoAddUnits: true,
            };

    onSave({ title, fields: cleanedFields, ...rateCardConfig });
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

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Rate Card del formulario
                </label>
                <select
                  value={formRateCardMode === 'dynamic' ? '__dynamic__' : formRateCardMode === 'static' ? formRateCardId : ''}
                  onChange={(event) => {
                    if (event.target.value === '__dynamic__') {
                      setFormRateCardMode('dynamic');
                      setFormRateCardId('');
                      return;
                    }

                    if (event.target.value) {
                      setFormRateCardMode('static');
                      setFormRateCardId(event.target.value);
                      return;
                    }

                    setFormRateCardMode('none');
                    setFormRateCardId('');
                  }}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="">Sin Rate Card</option>
                  {allowDynamicRateCard && <option value="__dynamic__">Rate Card dinámico</option>}
                  {rateCards.map((rateCard) => (
                    <option key={rateCard.id} value={rateCard.id}>
                      {rateCard.name}
                    </option>
                  ))}
                </select>
              </div>

              {formRateCardMode !== 'none' && (
                <div className="flex flex-wrap items-center gap-2">
                  {formRateCardMode === 'dynamic' && (
                    <label className="flex h-10 items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 text-xs font-medium text-emerald-700">
                      <input
                        type="checkbox"
                        checked={formAutoAddUnits}
                        onChange={(event) => setFormAutoAddUnits(event.target.checked)}
                        className="rounded border-emerald-200 text-emerald-600 focus:ring-emerald-500"
                      />
                      Sumar auto.
                    </label>
                  )}
                  {(formRateCardMode === 'static' || formAutoAddUnits) && (
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={formUnitsToAdd}
                      onChange={(event) => setFormUnitsToAdd(Number(event.target.value))}
                      className="h-10 w-24 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="Unid."
                    />
                  )}
                </div>
              )}
            </div>
            {formRateCardMode === 'dynamic' && (
              <p className="mt-2 text-[10px] text-emerald-700">
                Al aprobar el formulario se pedirá persona y perfil; {formAutoAddUnits ? 'usará las unidades configuradas.' : 'también pedirá unidades.'}
              </p>
            )}
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
                            <option value="datetime">Fecha y hora</option>
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

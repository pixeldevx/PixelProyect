"use client"

import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, History, MessageSquare, Pause, Play, Send, X } from 'lucide-react';
import { addDoc, collection, doc, increment, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from '@/lib/supabase/document-store';
import { db } from '@/lib/backend';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface TaskCommentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  task: any | null;
  currentUser: any;
  teamMembers: any[];
}

const getTaskTitle = (task: any) => task?.title || task?.name || 'Tarea';

const getTaskDate = (value: any) => {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getHistoryTime = (entry: any) => getTaskDate(entry?.timestamp)?.getTime() || 0;

const formatCommentDate = (value: any) => {
  const date = getTaskDate(value);
  if (!date) return '';
  return date.toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getHistoryActionLabel = (action: string) => {
  switch (action) {
    case 'start':
      return 'Iniciado';
    case 'approve':
      return 'Aprobado';
    case 'return':
      return 'Devuelto';
    case 'stop':
      return 'Detenido';
    case 'resume':
      return 'Reanudado';
    case 'reset':
      return 'Reiniciado';
    default:
      return 'Interacción';
  }
};

const getHistoryActionClass = (action: string) => {
  switch (action) {
    case 'start':
      return 'bg-indigo-50 text-indigo-700';
    case 'approve':
      return 'bg-emerald-50 text-emerald-700';
    case 'return':
      return 'bg-red-50 text-red-700';
    case 'stop':
      return 'bg-orange-50 text-orange-700';
    case 'resume':
      return 'bg-blue-50 text-blue-700';
    case 'reset':
      return 'bg-amber-50 text-amber-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
};

const renderHistoryIcon = (action: string) => {
  if (action === 'approve') {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
        <CheckCircle2 size={16} />
      </div>
    );
  }

  if (action === 'return') {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-600">
        <ArrowLeft size={16} />
      </div>
    );
  }

  if (action === 'stop') {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-orange-600">
        <Pause size={16} />
      </div>
    );
  }

  if (action === 'resume') {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600">
        <Play size={16} />
      </div>
    );
  }

  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
      <MessageSquare size={16} />
    </div>
  );
};

const formatHistoryFormValue = (value: any) => {
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'Sin selección';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (value === null || value === undefined || value === '') return 'Sin respuesta';
  return String(value);
};

const renderHistoryFormValue = (value: any) => {
  const formattedValue = formatHistoryFormValue(value);
  const isUrl = /^https?:\/\//i.test(formattedValue.trim());

  if (isUrl) {
    return (
      <a
        href={formattedValue}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 break-all text-xs font-bold text-indigo-700 underline decoration-indigo-300 underline-offset-2 [overflow-wrap:anywhere] hover:text-indigo-900"
      >
        {formattedValue}
      </a>
    );
  }

  return (
    <span className="min-w-0 whitespace-pre-wrap break-words text-xs font-bold text-slate-800 [overflow-wrap:anywhere]">
      {formattedValue}
    </span>
  );
};

export function TaskCommentsModal({
  isOpen,
  onClose,
  projectId,
  task,
  currentUser,
  teamMembers,
}: TaskCommentsModalProps) {
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'comments' | 'interactions'>('comments');

  useEffect(() => {
    if (!isOpen || !task?.id) {
      setComments([]);
      return;
    }

    const commentsQuery = query(
      collection(db, 'projects', projectId, 'tasks', task.id, 'comments'),
      orderBy('createdAt', 'asc'),
    );

    const unsubscribe = onSnapshot(
      commentsQuery,
      (snapshot) => {
        setComments(snapshot.docs.map((commentDoc) => ({ id: commentDoc.id, ...commentDoc.data() })));
      },
      (error) => {
        console.error('Error loading task comments:', error);
        toast.error('No se pudieron cargar los comentarios.');
      },
    );

    return () => unsubscribe();
  }, [isOpen, projectId, task?.id]);

  useEffect(() => {
    if (isOpen) {
      setCommentText('');
      setActiveTab('comments');
    }
  }, [isOpen, task?.id]);

  if (!isOpen || !task) return null;

  const getAuthorName = (comment: any) => {
    const author = teamMembers.find((member) =>
      member.id === comment.createdBy ||
      member.authUserId === comment.createdBy ||
      (comment.createdByEmail && member.email?.toLowerCase() === comment.createdByEmail.toLowerCase())
    );
    return author?.name || comment.createdByEmail || 'Usuario';
  };

  const getHistoryAuthorName = (history: any) => {
    const author = teamMembers.find((member) =>
      member.id === history.userId ||
      member.authUserId === history.userId ||
      member.uid === history.userId ||
      (history.userEmail && member.email?.toLowerCase() === String(history.userEmail).toLowerCase())
    );

    if (author?.name) return author.name;
    if (history.userName) return history.userName;
    if (history.userId === currentUser?.uid) return currentUser?.displayName || currentUser?.email || 'Usuario';
    return history.userEmail || 'Usuario';
  };

  const workflowHistory = [...(task.workflowHistory || [])].sort((left: any, right: any) => getHistoryTime(right) - getHistoryTime(left));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const cleanText = commentText.trim();
    if (!cleanText) return;

    setIsSaving(true);
    try {
      await addDoc(collection(db, 'projects', projectId, 'tasks', task.id, 'comments'), {
        projectId,
        taskId: task.id,
        text: cleanText,
        createdAt: serverTimestamp(),
        createdBy: currentUser?.uid || null,
        createdByEmail: currentUser?.email || null,
      });

      await updateDoc(doc(db, 'projects', projectId, 'tasks', task.id), {
        commentCount: increment(1),
        updatedAt: serverTimestamp(),
      });

      setCommentText('');
    } catch (error: any) {
      console.error('Error saving task comment:', error);
      toast.error(error?.message || 'No se pudo guardar el comentario.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-100 p-5">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
              <MessageSquare size={20} className="text-indigo-600" />
              Comentarios
            </h2>
            <p className="mt-1 truncate text-sm text-slate-500">{getTaskTitle(task)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="Cerrar comentarios"
          >
            <X size={20} />
          </button>
        </div>

        <div className="border-b border-slate-100 bg-white px-5 py-3">
          <div className="inline-flex rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('comments')}
              className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-bold transition-colors ${
                activeTab === 'comments' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <MessageSquare size={15} />
              Comentarios
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-600">
                {comments.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('interactions')}
              className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-bold transition-colors ${
                activeTab === 'interactions' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <History size={15} />
              Interacciones
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-600">
                {workflowHistory.length}
              </span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50/60 p-5">
          {activeTab === 'comments' ? (
            <div className="space-y-3">
              {comments.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                  No hay comentarios en esta tarea.
                </div>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-slate-800">
                        {getAuthorName(comment)}
                      </span>
                      <span className="shrink-0 text-[11px] text-slate-400">
                        {formatCommentDate(comment.createdAt)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-5 text-slate-600 [overflow-wrap:anywhere]">{comment.text}</p>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {workflowHistory.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                  No hay interacciones registradas en esta tarea.
                </div>
              ) : (
                workflowHistory.map((history: any, index: number) => {
                  const stepIndex = Number(history.stepIndex || 0);
                  const step = task.workflowSteps?.[stepIndex];
                  return (
                    <div key={`${history.action}-${index}-${getHistoryTime(history)}`} className="flex min-w-0 gap-3">
                      <div className="mt-1 shrink-0">
                        {renderHistoryIcon(history.action)}
                      </div>
                      <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-900">
                              {getHistoryAuthorName(history)}
                            </p>
                            <p className="break-words text-xs text-slate-500 [overflow-wrap:anywhere]">
                              Paso {stepIndex + 1}: {step?.label || history.stepLabel || 'Desconocido'}
                            </p>
                          </div>
                          <div className="shrink-0 text-left sm:text-right">
                            <span className={`rounded-full px-2 py-1 text-xs font-bold ${getHistoryActionClass(history.action)}`}>
                              {getHistoryActionLabel(history.action)}
                            </span>
                            <p className="mt-1 text-[10px] text-slate-400">
                              {formatCommentDate(history.timestamp) || 'Fecha desconocida'}
                            </p>
                          </div>
                        </div>

                        {history.comment && (
                          <div className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700 [overflow-wrap:anywhere]">
                            {history.comment}
                          </div>
                        )}

                        {history.formData && Object.keys(history.formData).length > 0 && (
                          <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 p-3">
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-indigo-600">Datos del formulario</p>
                            <div className="space-y-2">
                              {Object.entries(history.formData).map(([fieldId, value]: [string, any]) => {
                                const field = step?.form?.fields?.find((fieldItem: any) => fieldItem.id === fieldId);
                                return (
                                  <div
                                    key={fieldId}
                                    className="grid min-w-0 gap-1 rounded-md border border-indigo-100/60 bg-white/60 p-2 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-3"
                                  >
                                    <span className="min-w-0 break-words text-[11px] font-bold uppercase tracking-wide text-slate-600 [overflow-wrap:anywhere]">
                                      {field?.label || fieldId}
                                    </span>
                                    {renderHistoryFormValue(value)}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {activeTab === 'comments' && (
          <form onSubmit={handleSubmit} className="border-t border-slate-100 bg-white p-4">
            <div className="flex items-end gap-3">
              <textarea
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                placeholder="Escribe un comentario..."
                className="min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                rows={2}
              />
              <Button
                type="submit"
                disabled={isSaving || !commentText.trim()}
                className="h-11 bg-indigo-600 text-white hover:bg-indigo-700"
              >
                <Send size={16} className="mr-2" />
                Enviar
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

"use client"

import React, { useEffect, useState } from 'react';
import { MessageSquare, Send, X } from 'lucide-react';
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

const formatCommentDate = (value: any) => {
  if (!value) return '';
  const date = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
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
    if (isOpen) setCommentText('');
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
      <div className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
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

        <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-5">
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
                <p className="whitespace-pre-wrap text-sm leading-5 text-slate-600">{comment.text}</p>
              </div>
            ))
          )}
        </div>

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
      </div>
    </div>
  );
}

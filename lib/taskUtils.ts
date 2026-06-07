import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from '@/lib/supabase/document-store';
import { db } from './backend';

const COMPLETED_STATUSES = new Set(['completed', 'completed_late', 'listo']);
const ACTIVE_STATUSES = new Set(['in_progress', 'en_curso', 'trabajando', 'reproceso']);
const PENDING_STATUSES = new Set(['todo', 'pending', 'not_started']);

export const updateParentTaskStatus = async (projectId: string, parentTaskId: string) => {
  try {
    // Get all subtasks for this parent
    const subtasksQuery = query(
      collection(db, 'projects', projectId, 'tasks'),
      where('parentTaskId', '==', parentTaskId)
    );
    const snapshot = await getDocs(subtasksQuery);
    
    if (snapshot.empty) return;

    const subtasks = snapshot.docs.map(doc => doc.data());
    
    // Determine parent status
    let allDone = true;
    let anyStarted = false;
    let anyPending = false;
    
    let totalProgress = 0;

    subtasks.forEach(task => {
      const status = task.status || 'todo';
      if (!COMPLETED_STATUSES.has(status)) allDone = false;
      if (ACTIVE_STATUSES.has(status) || COMPLETED_STATUSES.has(status)) anyStarted = true;
      if (PENDING_STATUSES.has(status)) anyPending = true;
      
      totalProgress += (task.progress || 0);
    });

    let newStatus = 'todo';
    if (allDone) {
      newStatus = subtasks.some((task) => task.status === 'completed_late') ? 'completed_late' : 'completed';
    } else if (anyStarted) {
      newStatus = 'in_progress';
    }

    const avgProgress = Math.round(totalProgress / subtasks.length);

    // Update parent task
    await updateDoc(doc(db, 'projects', projectId, 'tasks', parentTaskId), {
      status: newStatus,
      progress: avgProgress,
      updatedAt: serverTimestamp()
    });

  } catch (error) {
    console.error("Error updating parent task status:", error);
  }
};

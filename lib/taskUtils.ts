import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from '@/lib/supabase/document-store';
import { db } from './backend';

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
      if (status !== 'completed' && status !== 'completed_late') allDone = false;
      if (status === 'in_progress' || status === 'completed' || status === 'completed_late') anyStarted = true;
      if (status === 'todo' || status === 'pending') anyPending = true;
      
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

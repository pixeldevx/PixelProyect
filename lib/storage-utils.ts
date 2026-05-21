import { ref, uploadBytesResumable, getDownloadURL } from '@/lib/supabase/storage-shim';
import { storage } from './backend';

export const uploadProfilePicture = async (userId: string, file: File): Promise<string> => {
  const fileExtension = file.name.split('.').pop();
  const storageRef = ref(storage, `profile_pictures/${userId}_${Date.now()}.${fileExtension}`);
  
  const uploadTask = await uploadBytesResumable(storageRef, file);
  const downloadURL = await getDownloadURL(uploadTask.ref);
  
  return downloadURL;
};

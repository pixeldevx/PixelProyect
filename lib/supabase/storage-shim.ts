import { supabase, SUPABASE_STORAGE_BUCKET } from './client';

type StorageRoot = { bucket?: string };
type StorageRef = {
  bucket: string;
  fullPath: string;
};

export const ref = (storage: StorageRoot, path: string): StorageRef => ({
  bucket: storage.bucket || SUPABASE_STORAGE_BUCKET,
  fullPath: path.replace(/^\/+/, ''),
});

export const uploadBytes = async (storageRef: StorageRef, file: File) => {
  const { error } = await supabase.storage
    .from(storageRef.bucket)
    .upload(storageRef.fullPath, file, { upsert: true });

  if (error) throw error;
  return { ref: storageRef };
};

export const uploadBytesResumable = uploadBytes;

export const getDownloadURL = async (storageRef: StorageRef) => {
  const { data } = supabase.storage.from(storageRef.bucket).getPublicUrl(storageRef.fullPath);
  return data.publicUrl;
};

export const deleteObject = async (storageRef: StorageRef) => {
  const { error } = await supabase.storage.from(storageRef.bucket).remove([storageRef.fullPath]);
  if (error) throw error;
};

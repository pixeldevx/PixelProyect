import React, { useState, useRef } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { User as UserIcon, X, Camera } from 'lucide-react';
import { doc, updateDoc } from '@/lib/supabase/document-store';
import { updateProfile } from '@/lib/supabase/auth-shim';
import { db, auth } from '@/lib/backend';
import { toast } from 'sonner';
import { uploadProfilePicture } from '@/lib/storage-utils';

interface ProfileModalProps {
  user: any;
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileModal({ user, isOpen, onClose }: ProfileModalProps) {
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(user?.photoURL || null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsUploading(true);
    try {
      let uploadedPhotoURL = user.photoURL;

      if (photoFile) {
        uploadedPhotoURL = await uploadProfilePicture(user.uid, photoFile);
      }

      // Update Supabase Auth Profile
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: displayName,
          photoURL: uploadedPhotoURL
        });
      }

      // Update Supabase User Document
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        displayName: displayName,
        ...(uploadedPhotoURL && { photoURL: uploadedPhotoURL })
      });

      toast.success("Perfil actualizado exitosamente");
      onClose();
    } catch (error: any) {
      console.error("Error updating profile:", error);
      toast.error(`Error al actualizar el perfil: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 m-4 animate-in fade-in zoom-in-95 duration-200 relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X size={20} />
        </button>
        
        <h3 className="text-lg font-semibold text-slate-900 mb-6 text-center">
          Mi Perfil
        </h3>
        
        <form onSubmit={handleSave}>
          <div className="flex flex-col items-center mb-6">
            <div className="relative group mb-2">
              <div className="w-24 h-24 rounded-full bg-slate-100 border-2 border-slate-200 flex items-center justify-center overflow-hidden relative">
                {photoPreview ? (
                  <Image src={photoPreview} alt="Profile" fill className="object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <UserIcon size={40} className="text-slate-400" />
                )}
                <div 
                  className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera size={24} className="text-white mb-1" />
                  <span className="text-white text-xs font-medium">Cambiar</span>
                </div>
              </div>
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                ref={fileInputRef}
                onChange={handlePhotoChange} 
              />
            </div>
            <p className="text-sm text-slate-500">{user?.email}</p>
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Nombre
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Tu nombre"
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
          </div>
          
          <div className="flex justify-end gap-3">
            <Button 
              type="button"
              variant="outline" 
              onClick={onClose}
              className="border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </Button>
            <Button 
              type="submit"
              disabled={isUploading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isUploading ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

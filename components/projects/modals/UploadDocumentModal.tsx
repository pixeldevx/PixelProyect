import React, { useState } from 'react';
import { Upload, X, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { db, storage } from '@/lib/backend';
import { ref, uploadBytes, getDownloadURL } from '@/lib/supabase/storage-shim';
import { collection, addDoc, serverTimestamp } from '@/lib/supabase/document-store';
import { toast } from 'sonner';

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  user: any;
}

export function UploadDocumentModal({ isOpen, onClose, projectId, user }: UploadDocumentModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState('contract');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  if (!isOpen) return null;

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      if (!docName) {
        setDocName(selectedFile.name.split('.')[0]);
      }
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !user || !docName.trim()) return;

    setUploading(true);
    setUploadProgress(10); // Show some initial progress
    
    // Create a unique filename
    const fileExtension = file.name.split('.').pop();
    const uniqueFilename = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExtension}`;
    const storageRef = ref(storage, `projects/${projectId}/${uniqueFilename}`);
    
    try {
      // Use uploadBytes instead of uploadBytesResumable for simpler error handling
      const snapshot = await uploadBytes(storageRef, file);
      setUploadProgress(50);
      
      const downloadURL = await getDownloadURL(snapshot.ref);
      setUploadProgress(75);
      
      // Save document metadata to Supabase
      await addDoc(collection(db, 'projects', projectId, 'documents'), {
        projectId: projectId,
        name: docName,
        type: docType,
        url: downloadURL,
        storagePath: storageRef.fullPath,
        uploadedAt: serverTimestamp(),
        uploadedBy: user.uid,
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type || null
      });
      
      setUploadProgress(100);
      
      // Reset form
      setFile(null);
      setDocName('');
      setDocType('contract');
      setUploading(false);
      setUploadProgress(0);
      onClose();
      toast.success('Documento subido correctamente');
      
    } catch (error: any) {
      console.error('Error uploading file:', error);
      toast.error('Error al subir el archivo: ' + error.message);
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 m-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Upload className="w-5 h-5 text-indigo-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">Subir Documento</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleUpload} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Tipo de Documento</label>
            <select 
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
            >
              <option value="contract">Contrato</option>
              <option value="proposal">Propuesta</option>
              <option value="other">Otro Documento</option>
            </select>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Nombre del Documento</label>
            <input 
              type="text" 
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
              placeholder="Ej. Contrato Principal v1"
              required
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Archivo</label>
            <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center hover:bg-slate-50 transition-colors cursor-pointer relative">
              <input 
                type="file" 
                id="file-upload"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                required
              />
              <div className="flex flex-col items-center justify-center gap-2">
                <FileText className="w-8 h-8 text-slate-400" />
                <div className="text-sm text-slate-600">
                  {file ? (
                    <span className="font-medium text-indigo-600">{file.name}</span>
                  ) : (
                    <span>Haz clic o arrastra un archivo aquí</span>
                  )}
                </div>
                {file && <div className="text-xs text-slate-400">{formatFileSize(file.size)}</div>}
              </div>
            </div>
          </div>

          {uploading && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Subiendo...</span>
                <span>{Math.round(uploadProgress)}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5">
                <div className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button 
              type="button"
              variant="outline" 
              onClick={onClose}
              disabled={uploading}
              className="border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={!file || uploading || !docName.trim()} 
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {uploading ? 'Subiendo...' : 'Guardar Documento'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

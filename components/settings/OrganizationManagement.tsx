"use client"

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Plus, Edit2 } from 'lucide-react';
import { collection, query, onSnapshot, doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

import { handleFirestoreError, OperationType } from '@/lib/firebase-utils';

export function OrganizationManagement() {
  const { user, userRole } = useAuth();
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<any>(null);
  
  const [orgName, setOrgName] = useState('');

  useEffect(() => {
    let active = true;
    if (userRole !== 'admin') {
      if (active) setTimeout(() => setLoading(false), 0);
      return;
    }

    const q = query(collection(db, 'organizations'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const orgs: any[] = [];
      querySnapshot.forEach((doc) => {
        orgs.push({ id: doc.id, ...doc.data() });
      });
      if (active) {
        setOrganizations(orgs);
        setLoading(false);
      }
    }, (error) => {
      if (active) {
        handleFirestoreError(error, OperationType.LIST, 'organizations');
        setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [userRole]);

  const handleOpenModal = (org?: any) => {
    if (org) {
      setEditingOrg(org);
      setOrgName(org.name || '');
    } else {
      setEditingOrg(null);
      setOrgName('');
    }
    setIsModalOpen(true);
  };

  const handleSaveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim() || !user) return;

    try {
      if (editingOrg) {
        await updateDoc(doc(db, 'organizations', editingOrg.id), {
          name: orgName,
          updatedAt: serverTimestamp()
        });
        toast.success("Organización actualizada");
      } else {
        const newOrgRef = doc(collection(db, 'organizations'));
        await setDoc(newOrgRef, {
          name: orgName,
          ownerId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        toast.success("Organización creada");
      }
      setIsModalOpen(false);
    } catch (error) {
      toast.error("Error al guardar la organización");
      handleFirestoreError(error, OperationType.WRITE, 'organizations');
    }
  };

  if (userRole !== 'admin') {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Organizaciones / Espacios de Trabajo</CardTitle>
          <CardDescription>
            Crea y gestiona diferentes organizaciones.
          </CardDescription>
        </div>
        <Button onClick={() => handleOpenModal()} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          <Plus className="w-4 h-4 mr-2" />
          Nueva Organización
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : organizations.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            No hay organizaciones creadas.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Fecha de Creación</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium text-slate-900">{o.name}</TableCell>
                  <TableCell className="text-slate-500 text-sm">
                    {o.createdAt ? new Date(o.createdAt.toDate()).toLocaleDateString() : 'N/A'}
                  </TableCell>
                  <TableCell className="text-right">
                    <button 
                      onClick={() => handleOpenModal(o)}
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 m-4">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              {editingOrg ? 'Editar Organización' : 'Nueva Organización'}
            </h3>
            
            <form onSubmit={handleSaveOrg}>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Nombre de la Organización *
                  </label>
                  <input
                    type="text"
                    required
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Ej: Acirón S.A."
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-3">
                <Button 
                  type="button"
                  variant="outline" 
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  Guardar
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Card>
  );
}

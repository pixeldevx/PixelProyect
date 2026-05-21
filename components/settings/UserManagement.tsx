"use client"

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Plus, Edit2, Shield, User as UserIcon, AlertCircle } from 'lucide-react';
import { collection, query, onSnapshot, doc, updateDoc, setDoc, serverTimestamp, getDocs, where } from '@/lib/supabase/document-store';
import { db } from '@/lib/backend';
import { toast } from 'sonner';
import { uploadProfilePicture } from '@/lib/storage-utils';
import { useAuth } from '@/hooks/useAuth';

export function UserManagement() {
  const { user, userRole: currentUserRole, userOrganizationId } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [projectRoles, setProjectRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [orgs, setOrgs] = useState<any[]>([]);

  useEffect(() => {
    if (currentUserRole === 'admin') {
      const q = query(collection(db, 'organizations'));
      onSnapshot(q, (snapshot) => {
        const o: any[] = [];
        snapshot.forEach(doc => o.push({ id: doc.id, ...doc.data()}));
        setOrgs(o);
      });
    }
  }, [currentUserRole]);
  const [editingUser, setEditingUser] = useState<any>(null);
  
  const [userEmail, setUserEmail] = useState('');
  const [formSystemRole, setFormSystemRole] = useState('user');
  const [userName, setUserName] = useState('');
  const [projectRoleId, setProjectRoleId] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');

  const systemRoles = [
    { id: 'admin', name: 'Administrador Global' },
    { id: 'org_admin', name: 'Administrador de Organización' },
    { id: 'manager', name: 'Gerente' },
    { id: 'coordinador', name: 'Coordinador' },
    { id: 'administrativo', name: 'Administrativo' },
    { id: 'user', name: 'Usuario' }
  ];

  useEffect(() => {
    if (!currentUserRole) return;
    
    let qUsers = query(collection(db, 'users'));
    if (currentUserRole !== 'admin' && userOrganizationId) {
       qUsers = query(collection(db, 'users'), where('organizationId', '==', userOrganizationId));
    }
    const unsubscribeUsers = onSnapshot(qUsers, (querySnapshot) => {
      const usersData: any[] = [];
      querySnapshot.forEach((doc) => {
        usersData.push({ id: doc.id, ...doc.data() });
      });
      setUsers(usersData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching users:", error);
      setLoading(false);
    });

    let qRoles = query(collection(db, 'roles'));
    if (currentUserRole !== 'admin' && userOrganizationId) {
      qRoles = query(collection(db, 'roles'), where('organizationId', '==', userOrganizationId));
    }
    const unsubscribeRoles = onSnapshot(qRoles, (querySnapshot) => {
      const rolesData: any[] = [];
      querySnapshot.forEach((doc) => {
        rolesData.push({ id: doc.id, ...doc.data() });
      });
      setProjectRoles(rolesData);
      if (rolesData.length > 0) {
        setProjectRoleId(rolesData[0].id);
      }
    });

    return () => {
      unsubscribeUsers();
      unsubscribeRoles();
    };
  }, [currentUserRole, userOrganizationId]);

  const handleOpenModal = (u?: any) => {
    if (u) {
      setEditingUser(u);
      setUserEmail(u.email || '');
      setFormSystemRole(u.role || 'user');
      setUserName(u.displayName || '');
      setPhotoPreview(u.photoURL || null);
      setSelectedOrganizationId(u.organizationId || '');
      setPhotoFile(null);
    } else {
      setEditingUser(null);
      setUserEmail('');
      setFormSystemRole('user');
      setUserName('');
      setSelectedOrganizationId('');
      setPhotoPreview(null);
      setPhotoFile(null);
      if (projectRoles.length > 0) {
        setProjectRoleId(projectRoles[0].id);
      }
    }
    setIsModalOpen(true);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userEmail.trim()) return;

    setIsUploading(true);
    try {
      const normalizedEmail = userEmail.toLowerCase();
      
      let uploadedPhotoURL = editingUser?.photoURL || null;

      if (editingUser) {
        if (photoFile) {
          uploadedPhotoURL = await uploadProfilePicture(editingUser.id, photoFile);
        }

        await updateDoc(doc(db, 'users', editingUser.id), {
          role: formSystemRole,
          email: normalizedEmail,
          displayName: userName || normalizedEmail.split('@')[0],
          ...(uploadedPhotoURL && { photoURL: uploadedPhotoURL }),
          ...((currentUserRole === 'admin' && formSystemRole !== 'admin') ? { organizationId: selectedOrganizationId } : {})
        });

        // Also update team_members collection if the user exists there
        if (editingUser.email) {
          const tmQuery = query(collection(db, 'team_members'), where('email', '==', editingUser.email));
          const tmSnapshot = await getDocs(tmQuery);
          for (const tmDoc of tmSnapshot.docs) {
            await updateDoc(doc(db, 'team_members', tmDoc.id), {
              email: normalizedEmail,
              name: userName || normalizedEmail.split('@')[0],
              ...(uploadedPhotoURL && { photoURL: uploadedPhotoURL }),
              ...((currentUserRole === 'admin' && formSystemRole !== 'admin') ? { organizationId: selectedOrganizationId } : {})
            });
          }
        }

        toast.success("Usuario actualizado exitosamente.");
      } else {
        const selectedProjectRole = projectRoles.find(r => r.id === projectRoleId);
        
        const newUserRef = doc(collection(db, 'users'));

        if (photoFile) {
          uploadedPhotoURL = await uploadProfilePicture(newUserRef.id, photoFile);
        }

        await setDoc(newUserRef, {
          email: normalizedEmail,
          displayName: userName || normalizedEmail.split('@')[0],
          role: formSystemRole,
          createdAt: serverTimestamp(),
          isPreRegistered: true,
          ...(uploadedPhotoURL && { photoURL: uploadedPhotoURL }),
          ...(currentUserRole === 'admin' ? { organizationId: selectedOrganizationId } : userOrganizationId ? { organizationId: userOrganizationId } : {})
        });
        
        const newTeamMemberRef = doc(collection(db, 'team_members'));
        await setDoc(newTeamMemberRef, {
          email: normalizedEmail,
          name: userName || normalizedEmail.split('@')[0],
          roleId: projectRoleId || 'system_created',
          roleName: selectedProjectRole?.name || 'Usuario del Sistema',
          createdAt: serverTimestamp(),
          ...(uploadedPhotoURL && { photoURL: uploadedPhotoURL }),
          ...(currentUserRole === 'admin' ? { organizationId: selectedOrganizationId } : userOrganizationId ? { organizationId: userOrganizationId } : {})
        });
        
        toast.success("Usuario creado exitosamente.");
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error saving user:", error);
      toast.error("Error al guardar el usuario");
    } finally {
      setIsUploading(false);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800 border-red-200';
      case 'manager': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'administrativo': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const getRoleName = (roleId: string) => {
    return systemRoles.find(r => r.id === roleId)?.name || 'Usuario';
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Usuarios del Sistema</CardTitle>
          <CardDescription>
            Gestiona los niveles de acceso y roles del sistema para los usuarios.
          </CardDescription>
        </div>
        <Button onClick={() => handleOpenModal()} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          <Plus className="w-4 h-4 mr-2" />
          Crear Usuario
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            No hay usuarios registrados.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rol del Sistema</TableHead>
                <TableHead>Último Acceso</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold overflow-hidden">
                        {u.photoURL ? (
                          <Image src={u.photoURL} alt={u.displayName || 'User'} width={32} height={32} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          u.displayName?.charAt(0).toUpperCase() || u.email?.charAt(0).toUpperCase() || <UserIcon size={16} />
                        )}
                      </div>
                      {u.displayName || 'Usuario'}
                      {u.isPreRegistered && <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full ml-2">Pendiente</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-500">{u.email}</TableCell>
                  <TableCell>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getRoleBadgeColor(u.role || 'user')}`}>
                      {getRoleName(u.role || 'user')}
                    </span>
                  </TableCell>
                  <TableCell className="text-slate-500 text-sm">
                    {u.lastLoginAt ? new Date(u.lastLoginAt.toDate()).toLocaleDateString() : 'Nunca'}
                  </TableCell>
                  <TableCell className="text-right">
                    <button 
                      onClick={() => handleOpenModal(u)}
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                      title="Editar Rol"
                    >
                      <Shield size={16} />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 m-4 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              {editingUser ? 'Editar Rol de Usuario' : 'Crear Nuevo Usuario'}
            </h3>
            
            <form onSubmit={handleSaveUser}>
              <div className="space-y-4 mb-6">
                <div className="flex flex-col items-center mb-4">
                  <div className="w-20 h-20 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden mb-2 relative group">
                    {photoPreview ? (
                      <Image src={photoPreview} alt="Preview" fill className="object-cover" />
                    ) : (
                      <UserIcon size={32} className="text-slate-400" />
                    )}
                    <label className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                      <span className="text-white text-xs font-medium">Cambiar</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                    </label>
                  </div>
                  <p className="text-xs text-slate-500">Foto de perfil (opcional)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Nombre (Opcional)
                  </label>
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="Ej: Juan Pérez"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Correo Electrónico *
                  </label>
                  <input
                    type="email"
                    required
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Rol del Sistema *
                  </label>
                  <select
                    value={formSystemRole}
                    onChange={(e) => setFormSystemRole(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    {systemRoles.filter(role => currentUserRole === 'admin' ? true : role.id !== 'admin').map(role => (
                      <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-1">
                    El rol del sistema determina los permisos globales (ej. facturación, configuración).
                  </p>
                </div>

                {currentUserRole === 'admin' && formSystemRole !== 'admin' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Organización *
                    </label>
                    <select
                      required
                      value={selectedOrganizationId}
                      onChange={(e) => setSelectedOrganizationId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    >
                      <option value="">Selecciona una organización</option>
                      {orgs.map(org => (
                        <option key={org.id} value={org.id}>{org.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {!editingUser && projectRoles.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Rol de Proyecto (Cargo) *
                    </label>
                    <select
                      value={projectRoleId}
                      onChange={(e) => setProjectRoleId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      required
                    >
                      {projectRoles.map(role => (
                        <option key={role.id} value={role.id}>{role.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-500 mt-1">
                      Este rol define la función del usuario dentro de los proyectos.
                    </p>
                  </div>
                )}
              </div>
              
              <div className="flex justify-end gap-3">
                <Button 
                  type="button"
                  variant="outline" 
                  onClick={() => setIsModalOpen(false)}
                  className="border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit"
                  disabled={isUploading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {isUploading ? 'Guardando...' : 'Guardar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Card>
  );
}

"use client"

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Edit2, Mail, UserPlus } from 'lucide-react';
import { collection, query, onSnapshot, doc, updateDoc, where, or } from '@/lib/supabase/document-store';
import { db } from '@/lib/backend';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import Image from 'next/image';

export default function TeamPage() {
  const { user, userRole, userOrganizationId } = useAuth();
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<any>(null);
  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRoleId, setMemberRoleId] = useState('');

  useEffect(() => {
    if (!user) return;

    // Fetch roles
    let qRoles = query(collection(db, 'roles'));
    if (userRole !== 'admin' && userOrganizationId) {
      qRoles = query(
        collection(db, 'roles'),
        or(
          where('organizationId', '==', userOrganizationId),
          where('isDefault', '==', true)
        )
      );
    }
    const unsubscribeRoles = onSnapshot(qRoles, (querySnapshot) => {
      const rolesData: any[] = [];
      querySnapshot.forEach((doc) => {
        rolesData.push({ id: doc.id, ...doc.data() });
      });
      setRoles(rolesData);
    }, (error) => {
      console.error("Error fetching roles:", error);
    });

    // Fetch team members
    let qTeam = query(collection(db, 'team_members'));
    if (userRole !== 'admin' && userOrganizationId) {
      qTeam = query(collection(db, 'team_members'), where('organizationId', '==', userOrganizationId));
    }
    const unsubscribeTeam = onSnapshot(qTeam, (querySnapshot) => {
      const teamData: any[] = [];
      querySnapshot.forEach((doc) => {
        teamData.push({ id: doc.id, ...doc.data() });
      });
      setTeamMembers(teamData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching team members:", error);
      setLoading(false);
    });

    return () => {
      unsubscribeRoles();
      unsubscribeTeam();
    };
  }, [user, userRole, userOrganizationId]);

  const handleOpenModal = (member?: any) => {
    if (member) {
      setEditingMember(member);
      setMemberName(member.name);
      setMemberEmail(member.email);
      setMemberRoleId(member.roleId);
    } else {
      return;
    }
    setIsModalOpen(true);
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberName.trim() || !memberEmail.trim() || !memberRoleId) return;

    const selectedRole = roles.find(r => r.id === memberRoleId);
    if (!selectedRole) return;

    try {
      const normalizedEmail = memberEmail.toLowerCase();
      if (!editingMember) return;

      await updateDoc(doc(db, 'team_members', editingMember.id), {
        name: memberName,
        email: normalizedEmail,
        roleId: memberRoleId,
        roleName: selectedRole.name,
      });
      toast.success("Miembro del equipo actualizado exitosamente.");
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error saving team member:", error);
      toast.error("Error al guardar el miembro del equipo");
    }
  };

  return (
    <DashboardLayout>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Equipo de Trabajo</h1>
          <p className="text-slate-500">Gestiona los miembros de tu equipo y sus cargos</p>
        </div>
        {userRole === 'admin' && (
          <Link href="/settings">
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <UserPlus className="w-4 h-4 mr-2" />
              Invitar Usuario
            </Button>
          </Link>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Directorio del Equipo</CardTitle>
          <CardDescription>
            Lista de todos los usuarios registrados en el sistema y sus roles asignados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : teamMembers.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              No hay miembros en el equipo. Invita usuarios desde Configuración.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Correo Electrónico</TableHead>
                  <TableHead>Cargo / Rol</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamMembers.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs overflow-hidden relative">
                          {member.photoURL ? (
                            <Image src={member.photoURL} alt={member.name} fill className="object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            (member.name || member.email || 'U').charAt(0).toUpperCase()
                          )}
                        </div>
                        {member.name || member.email || 'Usuario'}
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-500">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-slate-400" />
                        {member.email}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-md text-xs font-medium">
                        {member.roleName || 'Sin cargo'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => handleOpenModal(member)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                          title="Editar"
                        >
                          <Edit2 size={16} />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Team Member Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 m-4 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              Editar Miembro
            </h3>
            
            <form onSubmit={handleSaveMember}>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Nombre Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
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
                    value={memberEmail}
                    onChange={(e) => setMemberEmail(e.target.value)}
                    placeholder="juan@empresa.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Cargo / Rol *
                  </label>
                  <select
                    required
                    value={memberRoleId}
                    onChange={(e) => setMemberRoleId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="" disabled>Selecciona un cargo</option>
                    {roles.map(role => (
                      <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                  </select>
                  {roles.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      No hay cargos configurados. Ve a Configuración para crear roles primero.
                    </p>
                  )}
                </div>
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
                  disabled={roles.length === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
                >
                  Guardar
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

    </DashboardLayout>
  );
}

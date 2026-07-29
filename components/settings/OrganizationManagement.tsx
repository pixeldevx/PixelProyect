"use client"

import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Plus, Edit2, Loader2, Trash2 } from 'lucide-react';
import { collection, query, onSnapshot, doc, setDoc, updateDoc, serverTimestamp, deleteDoc, getDocs } from '@/lib/supabase/document-store';
import { db } from '@/lib/backend';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { belongsToAnyOrganization } from '@/lib/organizations';

import { handleDataError, OperationType } from '@/lib/backend-utils';

export function OrganizationManagement() {
  const { user, userRole } = useAuth();
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<any>(null);
  const [deletingOrgId, setDeletingOrgId] = useState<string | null>(null);
  
  const [orgName, setOrgName] = useState('');
  const [contractorApprovers, setContractorApprovers] = useState({
    immediateBossId: '',
    operationsManagerId: '',
    qualityComplianceId: '',
    humanTalentId: '',
    accountingId: '',
  });

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
        handleDataError(error, OperationType.LIST, 'organizations');
        setLoading(false);
      }
    });
    const unsubscribeMembers = onSnapshot(
      query(collection(db, 'team_members')),
      (snapshot) => setTeamMembers(snapshot.docs.map((memberDoc) => ({ id: memberDoc.id, ...memberDoc.data() }))),
      (error) => handleDataError(error, OperationType.LIST, 'team_members')
    );

    return () => {
      active = false;
      unsubscribe();
      unsubscribeMembers();
    };
  }, [userRole]);

  const getMemberLabel = (member: any) =>
    member?.name || member?.displayName || member?.fullName || member?.email || 'Sin nombre';

  const getMemberOptionId = (member: any) =>
    String(member?.id || member?.authUserId || member?.email || '').trim();

  const memberNameById = (memberId?: string) => {
    if (!memberId) return 'Sin asignar';
    const normalized = String(memberId).trim().toLowerCase();
    const member = teamMembers.find((item) =>
      [item.id, item.authUserId, item.uid, item.email].some((value) => String(value || '').trim().toLowerCase() === normalized)
    );
    return member ? getMemberLabel(member) : memberId;
  };

  const scopedMembers = useMemo(() => {
    if (!editingOrg?.id) return teamMembers;
    return teamMembers.filter((member) => belongsToAnyOrganization(member, [editingOrg.id]));
  }, [editingOrg?.id, teamMembers]);

  const handleOpenModal = (org?: any) => {
    if (org) {
      setEditingOrg(org);
      setOrgName(org.name || '');
      setContractorApprovers({
        immediateBossId: org.contractorAccountApprovalConfig?.immediateBossId || '',
        operationsManagerId: org.contractorAccountApprovalConfig?.operationsManagerId || '',
        qualityComplianceId: org.contractorAccountApprovalConfig?.qualityComplianceId || '',
        humanTalentId: org.contractorAccountApprovalConfig?.humanTalentId || '',
        accountingId: org.contractorAccountApprovalConfig?.accountingId || '',
      });
    } else {
      setEditingOrg(null);
      setOrgName('');
      setContractorApprovers({
        immediateBossId: '',
        operationsManagerId: '',
        qualityComplianceId: '',
        humanTalentId: '',
        accountingId: '',
      });
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
          contractorAccountApprovalConfig: contractorApprovers,
          updatedAt: serverTimestamp()
        });
        toast.success("Organización actualizada");
      } else {
        const newOrgRef = doc(collection(db, 'organizations'));
        await setDoc(newOrgRef, {
          name: orgName,
          contractorAccountApprovalConfig: contractorApprovers,
          ownerId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        toast.success("Organización creada");
      }
      setIsModalOpen(false);
    } catch (error) {
      toast.error("Error al guardar la organización");
      handleDataError(error, OperationType.WRITE, 'organizations');
    }
  };

  const getOrganizationDependencies = async (organizationId: string) => {
    const [projectsSnapshot, teamMembersSnapshot, usersSnapshot] = await Promise.all([
      getDocs(query(collection(db, 'projects'))),
      getDocs(query(collection(db, 'team_members'))),
      getDocs(query(collection(db, 'users'))),
    ]);

    const projectCount = projectsSnapshot.docs.filter((projectDoc) =>
      belongsToAnyOrganization(projectDoc.data(), [organizationId])
    ).length;
    const memberCount = teamMembersSnapshot.docs.filter((memberDoc) =>
      belongsToAnyOrganization(memberDoc.data(), [organizationId])
    ).length;
    const userCount = usersSnapshot.docs.filter((userDoc) =>
      belongsToAnyOrganization(userDoc.data(), [organizationId])
    ).length;

    return { projectCount, memberCount, userCount };
  };

  const handleDeleteOrg = async (organization: any) => {
    if (!organization?.id) return;

    const organizationName = organization.name || organization.id;
    const confirmed = window.confirm(
      `¿Eliminar la organización "${organizationName}"?\n\nEsta acción no se puede deshacer. Pixel revisará primero que no tenga proyectos ni usuarios asociados.`
    );
    if (!confirmed) return;

    setDeletingOrgId(organization.id);
    try {
      const dependencies = await getOrganizationDependencies(organization.id);
      const dependencyMessages = [
        dependencies.projectCount > 0 ? `${dependencies.projectCount} proyecto${dependencies.projectCount === 1 ? '' : 's'}` : '',
        dependencies.memberCount > 0 ? `${dependencies.memberCount} miembro${dependencies.memberCount === 1 ? '' : 's'} de equipo` : '',
        dependencies.userCount > 0 ? `${dependencies.userCount} usuario${dependencies.userCount === 1 ? '' : 's'}` : '',
      ].filter(Boolean);

      if (dependencyMessages.length > 0) {
        toast.error(`No se puede eliminar "${organizationName}" porque tiene ${dependencyMessages.join(', ')} asociados.`);
        return;
      }

      await deleteDoc(doc(db, 'organizations', organization.id));
      toast.success(`Organización "${organizationName}" eliminada`);
    } catch (error) {
      toast.error("Error al eliminar la organización");
      handleDataError(error, OperationType.DELETE, `organizations/${organization.id}`);
    } finally {
      setDeletingOrgId(null);
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
                <TableHead>Flujo cuentas de cobro</TableHead>
                <TableHead>Fecha de Creación</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium text-slate-900">{o.name}</TableCell>
                  <TableCell className="text-xs text-slate-500">
                    <div className="space-y-1">
                      <p><span className="font-bold text-slate-700">Jefe:</span> {memberNameById(o.contractorAccountApprovalConfig?.immediateBossId)}</p>
                      <p><span className="font-bold text-slate-700">Operaciones:</span> {memberNameById(o.contractorAccountApprovalConfig?.operationsManagerId)}</p>
                      <p><span className="font-bold text-slate-700">Calidad:</span> {memberNameById(o.contractorAccountApprovalConfig?.qualityComplianceId)}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-500 text-sm">
                    {o.createdAt ? new Date(o.createdAt.toDate()).toLocaleDateString() : 'N/A'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => handleOpenModal(o)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                        title="Editar organización"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteOrg(o)}
                        disabled={deletingOrgId === o.id}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                        title="Eliminar organización"
                      >
                        {deletingOrgId === o.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Trash2 size={16} />
                        )}
                      </button>
                    </div>
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
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 m-4">
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
                <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-700">
                    Responsables de cuentas de cobro
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    Define quién recibe cada aprobación. Si un campo queda vacío, Pixel conserva la validación general por rol.
                  </p>
                  <div className="mt-3 grid gap-3">
                    {[
                      ['immediateBossId', 'Jefe inmediato'],
                      ['operationsManagerId', 'Gerente de operaciones'],
                      ['qualityComplianceId', 'Calidad y cumplimiento'],
                      ['humanTalentId', 'Talento humano'],
                      ['accountingId', 'Contabilidad / pago'],
                    ].map(([field, label]) => (
                      <label key={field} className="block">
                        <span className="mb-1 block text-xs font-bold text-slate-600">{label}</span>
                        <select
                          value={(contractorApprovers as any)[field]}
                          onChange={(event) => setContractorApprovers((current) => ({ ...current, [field]: event.target.value }))}
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="">Sin asignar</option>
                          {scopedMembers.map((member) => {
                            const memberId = getMemberOptionId(member);
                            return (
                              <option key={`${field}-${memberId}`} value={memberId}>
                                {getMemberLabel(member)}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                    ))}
                  </div>
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

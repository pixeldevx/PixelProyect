import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  Panel,
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/ui/button';
import { Save, Plus, Trash2, Users } from 'lucide-react';
import { doc, getDoc, setDoc } from '@/lib/supabase/document-store';
import { db } from '@/lib/backend';
import { toast } from 'sonner';
import { handleDataError, OperationType } from '@/lib/backend-utils';
import { OrgChartNode } from './OrgChartNode';

interface ProjectOrgChartProps {
  projectId: string;
  teamMembers: any[];
}

const initialEdges: Edge[] = [];

export function ProjectOrgChart({ projectId, teamMembers }: ProjectOrgChartProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);

  const nodeTypes = useMemo(() => ({ orgChartNode: OrgChartNode }), []);

  const handleNodeLabelChange = useCallback((id: string, newLabel: string) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          node.data = {
            ...node.data,
            label: newLabel,
          };
        }
        return node;
      })
    );
  }, [setNodes]);

  useEffect(() => {
    const fetchOrgChart = async () => {
      try {
        const docRef = doc(db, 'projects', projectId, 'orgChart', 'data');
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.nodes && data.nodes.length > 0) {
            // Re-attach onChange handler
            const loadedNodes = data.nodes.map((node: Node) => ({
              ...node,
              data: {
                ...node.data,
                onChange: (newLabel: string) => handleNodeLabelChange(node.id, newLabel)
              }
            }));
            setNodes(loadedNodes);
          } else {
            // Default node
            setNodes([{
              id: '1',
              type: 'orgChartNode',
              data: { 
                label: 'Director del Proyecto',
                onChange: (newLabel: string) => handleNodeLabelChange('1', newLabel)
              },
              position: { x: 250, y: 25 },
            }]);
          }
          if (data.edges) {
            setEdges(data.edges);
          }
        } else {
           // Default node
           setNodes([{
            id: '1',
            type: 'orgChartNode',
            data: { 
              label: 'Director del Proyecto',
              onChange: (newLabel: string) => handleNodeLabelChange('1', newLabel)
            },
            position: { x: 250, y: 25 },
          }]);
        }
      } catch (error) {
        console.error("Error fetching org chart:", error);
        handleDataError(error, OperationType.GET, `projects/${projectId}/orgChart/data`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrgChart();
  }, [projectId, setNodes, setEdges, handleNodeLabelChange]);

  const onConnect = useCallback(
    (params: Connection | Edge) => setEdges((eds) => addEdge({ ...params, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
    [setEdges],
  );

  const onSave = useCallback(async () => {
    setIsSaving(true);
    try {
      // Remove onChange function before saving
      const nodesToSave = nodes.map(node => {
        const { onChange, ...dataToSave } = node.data;
        return {
          ...node,
          data: dataToSave
        };
      });

      const docRef = doc(db, 'projects', projectId, 'orgChart', 'data');
      await setDoc(docRef, {
        nodes: nodesToSave,
        edges,
        updatedAt: new Date()
      });
      toast.success('Organigrama guardado correctamente');
    } catch (error: any) {
      console.error("Error saving org chart:", error);
      toast.error(`Error al guardar: ${error.message}`);
      handleDataError(error, OperationType.WRITE, `projects/${projectId}/orgChart/data`);
    } finally {
      setIsSaving(false);
    }
  }, [projectId, nodes, edges]);

  const addCustomNode = () => {
    const newId = `node_${new Date().getTime()}`;
    const newNode: Node = {
      id: newId,
      type: 'orgChartNode',
      data: { 
        label: 'Doble clic para editar',
        onChange: (newLabel: string) => handleNodeLabelChange(newId, newLabel)
      },
      position: { x: Math.random() * 300, y: Math.random() * 300 },
    };
    setNodes((nds) => nds.concat(newNode));
    setIsAddMenuOpen(false);
  };

  const addTeamMemberNode = (member: any) => {
    const newId = `node_${new Date().getTime()}`;
    const newNode: Node = {
      id: newId,
      type: 'orgChartNode',
      data: { 
        label: member.name || member.email || 'Miembro del equipo',
        member: member.role || 'Miembro',
        photoURL: member.photoURL || null,
        onChange: (newLabel: string) => handleNodeLabelChange(newId, newLabel)
      },
      position: { x: Math.random() * 300, y: Math.random() * 300 },
    };
    setNodes((nds) => nds.concat(newNode));
    setIsAddMenuOpen(false);
  };

  const deleteSelected = () => {
    setNodes((nds) => nds.filter((node) => !node.selected));
    setEdges((eds) => eds.filter((edge) => !edge.selected));
  };

  if (isLoading) {
    return <div className="h-[600px] flex items-center justify-center text-slate-500">Cargando organigrama...</div>;
  }

  return (
    <div className="h-[600px] w-full border border-slate-200 rounded-lg overflow-hidden bg-white relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        attributionPosition="bottom-right"
      >
        <Panel position="top-right" className="flex gap-2">
          <div className="relative">
            <Button onClick={() => setIsAddMenuOpen(!isAddMenuOpen)} variant="outline" size="sm" className="bg-white shadow-sm">
              <Plus size={16} className="mr-1" /> Nuevo Nodo
            </Button>
            
            {isAddMenuOpen && (
              <div className="absolute top-full mt-1 right-0 w-64 bg-white border border-slate-200 rounded-md shadow-lg z-50 max-h-80 overflow-y-auto">
                <div className="p-2">
                  <div className="text-xs font-semibold text-slate-500 mb-1 px-2">Básico</div>
                  <button 
                    onClick={addCustomNode}
                    className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 rounded-md"
                  >
                    Nodo Personalizado
                  </button>
                  
                  {teamMembers && teamMembers.length > 0 && (
                    <>
                      <div className="text-xs font-semibold text-slate-500 mt-3 mb-1 px-2">Miembros del Equipo</div>
                      {teamMembers.map(member => (
                        <button 
                          key={member.id}
                          onClick={() => addTeamMemberNode(member)}
                          className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-100 rounded-md flex items-center gap-2"
                        >
                          <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center overflow-hidden shrink-0">
                            {member.photoURL ? (
                              <img src={member.photoURL} alt={member.name} className="w-full h-full object-cover" />
                            ) : (
                              <Users size={12} />
                            )}
                          </div>
                          <div className="truncate">
                            <div className="font-medium">{member.name || member.email}</div>
                            <div className="text-xs text-slate-500">{member.role || 'Miembro'}</div>
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
          <Button onClick={deleteSelected} variant="outline" size="sm" className="bg-white shadow-sm text-red-600 hover:text-red-700">
            <Trash2 size={16} className="mr-1" /> Eliminar Selección
          </Button>
          <Button onClick={onSave} disabled={isSaving} size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
            <Save size={16} className="mr-1" /> {isSaving ? 'Guardando...' : 'Guardar'}
          </Button>
        </Panel>
        <MiniMap />
        <Controls />
        <Background color="#e2e8f0" gap={16} />
      </ReactFlow>
    </div>
  );
}

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
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import { handleFirestoreError, OperationType } from '@/lib/firebase-utils';
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
        handleFirestoreError(error, OperationType.GET, `projects/${projectId}/orgChart/data`);
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
      handleFirestoreError(error, OperationType.WRITE, `projects/${projectId}/orgChart/data`);
    } finally {
      setIsSaving(false);
    }
  }, [projectId, nodes, edges]);

  const addNode = () => {
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
          <Button onClick={addNode} variant="outline" size="sm" className="bg-white shadow-sm">
            <Plus size={16} className="mr-1" /> Nuevo Nodo
          </Button>
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

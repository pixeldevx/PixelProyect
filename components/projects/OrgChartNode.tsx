import React, { useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Input } from '@/components/ui/input';
import { Users } from 'lucide-react';
import Image from 'next/image';

export function OrgChartNode({ data, isConnectable, selected }: NodeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(data.label as string);

  const onBlur = () => {
    setIsEditing(false);
    if (typeof data.onChange === 'function') {
      (data.onChange as (label: string) => void)(label);
    }
  };

  return (
    <div className={`px-4 py-2 shadow-md rounded-md bg-white border-2 ${selected ? 'border-indigo-500' : 'border-slate-200'} min-w-[150px]`}>
      <Handle type="target" position={Position.Top} isConnectable={isConnectable} className="w-3 h-3 bg-indigo-400" />
      
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mb-2 overflow-hidden relative">
          {data.photoURL ? (
            <Image src={data.photoURL as string} alt={data.label as string} fill className="object-cover" referrerPolicy="no-referrer" />
          ) : (
            <Users size={16} />
          )}
        </div>
        
        {isEditing ? (
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={onBlur}
            autoFocus
            className="h-7 text-xs text-center px-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter') onBlur();
            }}
          />
        ) : (
          <div 
            className="text-sm font-medium text-slate-800 text-center cursor-pointer hover:text-indigo-600"
            onDoubleClick={() => setIsEditing(true)}
          >
            {label}
          </div>
        )}
        {data.member && (
          <div className="text-xs text-slate-500 mt-1 text-center">
            {data.member}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} className="w-3 h-3 bg-indigo-400" />
    </div>
  );
}

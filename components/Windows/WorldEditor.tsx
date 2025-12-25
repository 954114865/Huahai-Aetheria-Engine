
import React, { useState } from 'react';
import { GameState, GameAttribute, AttributeType, AttributeVisibility } from '../../types';
import { Button, Input } from '../ui/Button';
import { Save, Globe, Plus, Trash, Eye, EyeOff } from 'lucide-react';
import { Window } from '../ui/Window';

interface WorldEditorProps {
  gameState: GameState;
  onSave: (newAttributes: Record<string, GameAttribute>) => void;
  onClose: () => void;
}

export const WorldEditor: React.FC<WorldEditorProps> = ({ gameState, onSave, onClose }) => {
  const [attributes, setAttributes] = useState<Record<string, GameAttribute>>(JSON.parse(JSON.stringify(gameState.world.attributes)));

  const updateAttr = (key: string, field: keyof GameAttribute, val: any) => {
      setAttributes(prev => ({
          ...prev,
          [key]: { ...prev[key], [field]: val }
      }));
  };

  const addAttribute = () => {
      const id = `w_attr_${Date.now()}`;
      setAttributes(prev => ({
          ...prev,
          [id]: { id, name: '新环境', type: AttributeType.TEXT, value: 'Normal', visibility: AttributeVisibility.PUBLIC }
      }));
  };

  const removeAttribute = (key: string) => {
      const newAttrs = { ...attributes };
      delete newAttrs[key];
      setAttributes(newAttrs);
  };

  return (
    <Window
        title="编辑世界状态"
        icon={<Globe size={20}/>}
        onClose={onClose}
        maxWidth="max-w-lg"
        height="max-h-[80vh]"
        footer={
            <>
                <Button variant="secondary" onClick={onClose}>取消</Button>
                <Button onClick={() => onSave(attributes)}><Save size={16} className="mr-2"/> 保存状态</Button>
            </>
        }
    >
        <div className="space-y-4">
            <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-muted">定义全局可见或隐藏的环境变量。</span>
                <Button size="sm" variant="secondary" onClick={addAttribute}><Plus size={12} className="mr-1"/> 添加属性</Button>
            </div>

            <div className="space-y-2">
              {(Object.entries(attributes) as [string, GameAttribute][]).map(([key, attr]) => (
                  <div key={key} className="bg-surface-light p-3 rounded border border-border flex flex-col gap-2">
                       <div className="flex gap-2 items-center">
                          <Input 
                              className="h-8 w-1/3"
                              value={attr.name}
                              onChange={e => updateAttr(key, 'name', e.target.value)}
                              placeholder="名称"
                          />
                          <Input 
                              className="h-8 flex-1"
                              value={attr.value}
                              onChange={e => updateAttr(key, 'value', attr.type === AttributeType.NUMBER ? e.target.value : e.target.value)}
                              placeholder="值"
                          />
                           <button 
                              onClick={() => updateAttr(key, 'visibility', attr.visibility === AttributeVisibility.PUBLIC ? AttributeVisibility.PRIVATE : AttributeVisibility.PUBLIC)}
                              className={`p-1.5 rounded ${attr.visibility === AttributeVisibility.PUBLIC ? 'text-success-fg hover:bg-success-base/30' : 'text-danger-fg hover:bg-danger-base/30'}`}
                              title={attr.visibility === AttributeVisibility.PUBLIC ? "公开" : "隐藏"}
                          >
                              {attr.visibility === AttributeVisibility.PUBLIC ? <Eye size={14}/> : <EyeOff size={14}/>}
                          </button>
                          <button onClick={() => removeAttribute(key)} className="text-muted hover:text-danger-fg p-1.5"><Trash size={14}/></button>
                       </div>
                       <div className="flex gap-4 text-[10px] text-muted px-1">
                          <label className="flex items-center gap-1 cursor-pointer">
                              <input type="radio" checked={attr.type === AttributeType.TEXT} onChange={() => updateAttr(key, 'type', AttributeType.TEXT)} className="accent-primary"/> 文本
                          </label>
                          <label className="flex items-center gap-1 cursor-pointer">
                              <input type="radio" checked={attr.type === AttributeType.NUMBER} onChange={() => updateAttr(key, 'type', AttributeType.NUMBER)} className="accent-primary"/> 数字
                          </label>
                       </div>
                  </div>
              ))}
            </div>
        </div>
    </Window>
  );
};


import React, { useState } from 'react';
import { MapLocation, GameAttribute, AttributeType, AttributeVisibility } from '../../../types';
import { Button, Input, Label, TextArea } from '../../ui/Button';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import { Window } from '../../ui/Window';

interface LocationTemplateEditorProps {
    initialLoc: MapLocation;
    onSave: (l: MapLocation) => void;
    onClose: () => void;
}

export const LocationTemplateEditor: React.FC<LocationTemplateEditorProps> = ({ initialLoc, onSave, onClose }) => {
    const [loc, setLoc] = useState(initialLoc);
    
    const updateAttr = (key: string, field: keyof GameAttribute, val: any) => {
        setLoc(prev => ({
            ...prev,
            attributes: { ...prev.attributes, [key]: { ...prev.attributes![key], [field]: val } }
        }));
    };
    const addAttribute = () => {
        const id = `loc_attr_${Date.now()}`;
        setLoc(prev => ({
            ...prev,
            attributes: { ...prev.attributes, [id]: { id, name: '新属性', type: AttributeType.TEXT, value: '', visibility: AttributeVisibility.PUBLIC } }
        }));
    };
    const removeAttribute = (key: string) => {
        const newAttrs = { ...loc.attributes };
        delete newAttrs[key];
        setLoc(prev => ({ ...prev, attributes: newAttrs }));
    };

    return (
        <Window
            title="编辑地点模版"
            icon={<MapPin size={18}/>}
            onClose={onClose}
            zIndex={110}
            maxWidth="max-w-[700px]"
            height="max-h-[85vh]"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>取消</Button>
                    <Button onClick={() => onSave(loc)}>保存模版</Button>
                </>
            }
        >
            <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <Label>默认名称</Label>
                        <Input value={loc.name} onChange={e => setLoc({...loc, name: e.target.value})} />
                    </div>
                    <div>
                        <Label>默认半径 (米)</Label>
                        <Input type="number" value={loc.radius} onChange={e => setLoc({...loc, radius: parseInt(e.target.value)})} />
                    </div>
                </div>
                <div>
                    <Label>默认描述</Label>
                    <TextArea className="h-20" value={loc.description} onChange={e => setLoc({...loc, description: e.target.value})} />
                </div>

                <div className="border border-border rounded p-3 bg-surface-light">
                    <div className="flex justify-between items-center mb-2">
                        <Label>默认属性 (Attributes)</Label>
                        <Button size="sm" variant="secondary" onClick={addAttribute}><Plus size={12}/></Button>
                    </div>
                    <div className="space-y-2 max-h-[150px] overflow-y-auto">
                            {(Object.entries(loc.attributes || {}) as [string, GameAttribute][]).map(([key, attr]) => (
                            <div key={key} className="flex gap-1 items-center bg-surface p-1.5 rounded border border-border">
                                <Input className="h-6 text-xs w-16" value={attr.name} onChange={e => updateAttr(key, 'name', e.target.value)} placeholder="Name"/>
                                <Input className="h-6 text-xs flex-1" value={attr.value} onChange={e => updateAttr(key, 'value', e.target.value)} placeholder="Val"/>
                                <button onClick={() => removeAttribute(key)} className="text-muted hover:text-danger-fg"><Trash2 size={12}/></button>
                            </div>
                            ))}
                    </div>
                </div>
            </div>
        </Window>
    );
};

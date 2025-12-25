
import React, { useState, useEffect } from 'react';
import { GameState, Character } from '../../types';
import { Button } from '../ui/Button';
import { ListOrdered, ArrowUp, ArrowDown, Trash2, Plus, Check } from 'lucide-react';
import { Window } from '../ui/Window';

interface ManualOrderModalProps {
    isOpen: boolean;
    state: GameState;
    onConfirm: (order: string[]) => void;
    onCancel: () => void;
    addLog: (msg: string) => void;
}

export const ManualOrderModal: React.FC<ManualOrderModalProps> = ({ isOpen, state, onConfirm, onCancel, addLog }) => {
    const [manualOrderList, setManualOrderList] = useState<string[]>([]);
    const [charToAdd, setCharToAdd] = useState("");

    // Sync Manual List when modal opens
    useEffect(() => {
        if (isOpen) {
            // Fetch current location characters
            const locId = state.map.activeLocationId;
            const locChars = (Object.values(state.characters) as Character[]).filter(c => {
                const pos = state.map.charPositions[c.id];
                return pos && pos.locationId === locId;
            }).map(c => c.id);
            
            // Sort: Non-Environment first, then Environment at the end
            const envChars = locChars.filter(id => id.startsWith('env_'));
            const nonEnv = locChars.filter(id => !id.startsWith('env_'));
            
            setManualOrderList([...nonEnv, ...envChars]);
        }
    }, [isOpen, state.map.activeLocationId, state.map.charPositions, state.characters]);

    const moveOrderItem = (index: number, direction: -1 | 1) => {
        const newList = [...manualOrderList];
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= newList.length) return;
        const temp = newList[index];
        newList[index] = newList[targetIndex];
        newList[targetIndex] = temp;
        setManualOrderList(newList);
    };

    const removeOrderItem = (index: number) => {
        const newList = [...manualOrderList];
        newList.splice(index, 1);
        setManualOrderList(newList);
    };

    const handleConfirm = () => {
        onConfirm(manualOrderList);
        addLog(`系统: 手动设定轮次顺序: [${manualOrderList.map(id => state.characters[id]?.name || id).join(', ')}]`);
    };

    // Get available characters for manual add
    const availableChars = (Object.values(state.characters) as Character[]).filter(c => {
        const pos = state.map.charPositions[c.id];
        return pos && pos.locationId === state.map.activeLocationId;
    });

    if (!isOpen) return null;

    return (
        <Window
            title={<span className="flex items-center gap-2"><ListOrdered size={18}/> 手动轮次判定</span>}
            onClose={onCancel}
            maxWidth="max-w-md"
            height="h-[80vh]"
            zIndex={150}
            noPadding={true}
            footer={
                <div className="flex gap-3 w-full">
                    <Button variant="secondary" onClick={onCancel} className="flex-1">取消/暂停</Button>
                    <Button onClick={handleConfirm} className="flex-1">
                        <Check size={16} className="mr-1"/> 确认并开始
                    </Button>
                </div>
            }
        >
            <div className="flex flex-col h-full p-4 bg-surface/30">
                <p className="text-xs text-muted mb-4 shrink-0">
                    请调整本轮角色的行动顺序。您可以增加或删除任意角色（包括重复）。
                </p>
                
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 mb-4 bg-surface-highlight/50 p-2 rounded border border-border custom-scrollbar">
                    {manualOrderList.map((id, idx) => {
                        const char = state.characters[id];
                        if (!char) return null;
                        return (
                            <div key={`${id}_${idx}`} className="flex items-center bg-surface p-2 rounded border border-border gap-2 group hover:border-primary/50 transition-colors">
                                <span className="text-muted font-mono w-6 text-center text-xs">{idx + 1}</span>
                                <div className="flex-1 font-bold text-body text-sm truncate">{char.name}</div>
                                <div className="flex gap-1 shrink-0 opacity-100 md:opacity-50 md:group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => moveOrderItem(idx, -1)} disabled={idx === 0} className="p-1 hover:bg-surface-highlight rounded text-muted disabled:opacity-20"><ArrowUp size={14}/></button>
                                    <button onClick={() => moveOrderItem(idx, 1)} disabled={idx === manualOrderList.length - 1} className="p-1 hover:bg-surface-highlight rounded text-muted disabled:opacity-20"><ArrowDown size={14}/></button>
                                    <button onClick={() => removeOrderItem(idx)} className="p-1 hover:bg-danger/20 rounded text-muted hover:text-danger-fg"><Trash2 size={14}/></button>
                                </div>
                            </div>
                        )
                    })}
                    {manualOrderList.length === 0 && <div className="text-center text-muted italic py-4">列表为空</div>}
                </div>

                <div className="flex gap-2 shrink-0 border-t border-border pt-4">
                    <select 
                        className="flex-1 bg-surface-light border border-border rounded px-2 py-1 text-sm text-body"
                        value={charToAdd}
                        onChange={e => setCharToAdd(e.target.value)}
                    >
                        <option value="">-- 选择角色添加 --</option>
                        {availableChars.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                    <Button 
                        size="sm" 
                        disabled={!charToAdd}
                        onClick={() => {
                            if (charToAdd) {
                                setManualOrderList([...manualOrderList, charToAdd]);
                                setCharToAdd("");
                            }
                        }}
                    >
                        <Plus size={14}/> 添加
                    </Button>
                </div>
            </div>
        </Window>
    );
};

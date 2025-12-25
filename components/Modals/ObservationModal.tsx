
import React, { useState, useRef } from 'react';
import { GameState, Character, MapLocation } from '../../types';
import { Button, TextArea } from '../ui/Button';
import { Eye, Loader2, X } from 'lucide-react';
import { Window } from '../ui/Window';

interface ObservationModalProps {
    state: GameState;
    activeChar: Character;
    onClose: () => void;
    onConfirm: (query: string) => void;
    isProcessing: boolean;
}

export const ObservationModal: React.FC<ObservationModalProps> = ({ state, activeChar, onClose, onConfirm, isProcessing }) => {
    const [query, setQuery] = useState("");
    const textAreaRef = useRef<HTMLTextAreaElement>(null);

    const activeLocId = state.map.charPositions[activeChar.id]?.locationId;
    const localChars = (Object.values(state.characters) as Character[]).filter(c => 
        state.map.charPositions[c.id]?.locationId === activeLocId
    );

    const insertCharacter = (char: Character) => {
        if (!textAreaRef.current) return;
        const start = textAreaRef.current.selectionStart;
        const end = textAreaRef.current.selectionEnd;
        const text = query;
        const insertion = `[${char.name}]`;
        const newText = text.substring(0, start) + insertion + text.substring(end);
        setQuery(newText);
        setTimeout(() => {
            if (textAreaRef.current) {
                textAreaRef.current.focus();
                textAreaRef.current.setSelectionRange(start + insertion.length, start + insertion.length);
            }
        }, 0);
    };

    return (
        <Window
            title={<span className="flex items-center gap-2 text-accent-teal"><Eye size={16}/> 观测模式 (Observation)</span>}
            onClose={isProcessing ? undefined : onClose} // Prevent close during processing if desired, or handle in onClose
            maxWidth="max-w-xl"
            height="h-auto max-h-[90vh]"
            zIndex={150}
            noPadding={true}
        >
            <div className="p-4 flex flex-col gap-4 flex-1 min-h-0 bg-surface/30">
                <div className="text-xs text-muted">
                    作为 {activeChar.name}，你想仔细观察什么？点击下方头像可插入角色名。
                </div>

                <div className="flex flex-col gap-1 overflow-y-auto max-h-[150px] pr-1 custom-scrollbar border-b border-border pb-2 mb-2">
                    {localChars.length === 0 && <span className="text-xs text-muted italic self-center">无可见角色</span>}
                    {localChars.map(c => (
                        <button 
                            key={c.id}
                            onClick={() => insertCharacter(c)}
                            className="flex items-center gap-2 bg-surface-light/50 border border-border rounded px-2 py-1 hover:border-accent-teal hover:bg-teal-900/20 transition-colors text-left shrink-0"
                            title={`插入 [${c.name}]`}
                            disabled={isProcessing}
                        >
                            <div className="w-5 h-5 rounded-full bg-surface-highlight overflow-hidden shrink-0">
                                {c.avatarUrl ? <img src={c.avatarUrl} className="w-full h-full object-cover"/> : <div className="w-full h-full bg-slate-700"/>}
                            </div>
                            <span className="text-xs text-body flex-1 truncate">{c.name}</span>
                            {c.id === activeChar.id && <span className="text-[10px] text-accent-teal bg-teal-900/30 px-1 rounded">我</span>}
                        </button>
                    ))}
                </div>

                {/* Increased Height */}
                <TextArea 
                    ref={textAreaRef}
                    className="flex-1 resize-none bg-surface-light/50 border-border focus:border-accent-teal text-sm p-3 min-h-[200px] h-48"
                    placeholder="例如：那个角落里的阴影有什么奇怪？或者仔细观察 [某人] 的表情..."
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    disabled={isProcessing}
                    autoFocus
                />

                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={onClose} disabled={isProcessing}>取消</Button>
                    <Button 
                        className="bg-accent-teal hover:bg-teal-500 text-white font-bold"
                        onClick={() => onConfirm(query)}
                        disabled={!query.trim() || isProcessing}
                    >
                        {isProcessing ? <><Loader2 size={16} className="animate-spin mr-2"/> 观测中...</> : "开始观测"}
                    </Button>
                </div>
            </div>
        </Window>
    );
};

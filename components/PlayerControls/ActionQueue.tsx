
import React from 'react';
import { PendingAction } from '../../hooks/useEngine';
import { GameState } from '../../types';
import { ArrowRight, X } from 'lucide-react';

interface ActionQueueProps {
    pendingActions: PendingAction[];
    state: GameState;
    onRemove: (index: number) => void;
}

export const ActionQueue: React.FC<ActionQueueProps> = ({ pendingActions, state, onRemove }) => {
    if (pendingActions.length === 0) return null;

    return (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-1 border-b border-border px-1">
            <span className="text-[10px] font-bold text-primary uppercase tracking-wider shrink-0">Queue:</span>
            {pendingActions.map((act, idx) => {
                const targetName = act.targetId ? state.characters[act.targetId]?.name : "";
                const isOverLimit = idx >= 2;
                return (
                    <div key={act.id} className={`flex items-center gap-1 border rounded px-2 py-1 text-xs shrink-0 animate-in fade-in slide-in-from-left-2 ${isOverLimit ? 'bg-endorphin/20 border-endorphin text-endorphin' : 'bg-primary/20 border-primary/50 text-primary'}`}>
                        <span className="font-bold">{act.cardName}</span>
                        {targetName && <span className="text-[10px] opacity-80">➜ {targetName}</span>}
                        {isOverLimit && <span className="text-[9px] bg-endorphin px-1 rounded text-endorphin-fg ml-1 font-bold">燃命</span>}
                        <button onClick={() => onRemove(idx)} className="ml-1 opacity-60 hover:opacity-100 hover:text-highlight"><X size={10}/></button>
                        {idx < pendingActions.length - 1 && <ArrowRight size={10} className="text-muted ml-1"/>}
                    </div>
                );
            })}
        </div>
    );
};

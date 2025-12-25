
import React, { useState, useMemo } from 'react';
import { GameState, Character, PrizePool, PrizeItem, Card, AttributeVisibility } from '../../types';
import { Button, Label } from '../ui/Button';
import { Gift, X, CheckCircle } from 'lucide-react';
import { normalizeCard } from '../../services/aiService';
import { Window } from '../ui/Window';

interface LotteryModalProps {
    state: GameState;
    activeChar: Character;
    pendingCounts: Record<string, number>;
    onClose: () => void;
    onConfirm: (actionType: 'draw'|'deposit'|'peek', poolId: string, amount?: number, cardIds?: string[]) => void;
}

export const LotteryModal: React.FC<LotteryModalProps> = ({ state, activeChar, pendingCounts, onClose, onConfirm }) => {
    const [selectedPoolId, setSelectedPoolId] = useState<string>("");
    const [mode, setMode] = useState<'draw' | 'deposit' | 'peek'>('draw');
    const [drawAmount, setDrawAmount] = useState(1);
    const [peekAmount, setPeekAmount] = useState(1);
    
    const [selectedDepositIndices, setSelectedDepositIndices] = useState<Set<number>>(new Set());
    const [quickDepositCount, setQuickDepositCount] = useState(0);

    const activeLocId = state.map.charPositions[activeChar.id]?.locationId;
    const localPools = (Object.values(state.prizePools) as PrizePool[]).filter(p => p.locationIds && p.locationIds.includes(activeLocId || ""));

    const activePool = selectedPoolId ? state.prizePools[selectedPoolId] : null;

    React.useEffect(() => {
        if (!selectedPoolId && localPools.length > 0) setSelectedPoolId(localPools[0].id);
    }, [localPools]);

    const itemAvailability = useMemo((): boolean[] => {
        const availability: boolean[] = new Array(activeChar.inventory.length).fill(true);
        const counts: Record<string, number> = { ...pendingCounts };
        activeChar.inventory.forEach((id: string, idx: number) => {
            if ((counts[id] || 0) > 0) {
                availability[idx] = false;
                counts[id]--;
            }
        });
        return availability;
    }, [activeChar.inventory, pendingCounts]);

    const maxAvailableToDeposit = itemAvailability.filter(Boolean).length;

    const toggleDepositSelection = (idx: number) => {
        const newSet = new Set(selectedDepositIndices);
        if (newSet.has(idx)) newSet.delete(idx);
        else newSet.add(idx);
        setSelectedDepositIndices(newSet);
        setQuickDepositCount(newSet.size); 
    };

    const handleQuickDepositChange = (val: number) => {
        setQuickDepositCount(val);
        const newSet = new Set<number>();
        let added = 0;
        for (let i = 0; i < activeChar.inventory.length; i++) {
            if (added >= val) break;
            if (itemAvailability[i]) {
                newSet.add(i);
                added++;
            }
        }
        setSelectedDepositIndices(newSet);
    };

    const handleConfirm = () => {
        if (!selectedPoolId) return;
        if (mode === 'draw') {
            onConfirm('draw', selectedPoolId, drawAmount);
        } else if (mode === 'deposit') {
            const idsToDeposit = Array.from(selectedDepositIndices).map((idx) => activeChar.inventory[idx as number]);
            onConfirm('deposit', selectedPoolId, undefined, idsToDeposit);
        } else {
            onConfirm('peek', selectedPoolId, peekAmount);
        }
        onClose();
    };

    return (
        <Window
            title={<span className="flex items-center gap-2 text-accent-pink"><Gift size={16}/> 奖池互动</span>}
            onClose={onClose}
            maxWidth="max-w-lg"
            height="h-auto max-h-[85vh]"
            zIndex={150}
            noPadding={true}
        >
            <div className="flex flex-col h-full bg-surface/30">
                {localPools.length === 0 ? (
                    <div className="p-6 text-center text-muted text-sm italic">当前地点无可用奖池。</div>
                ) : (
                    <div className="p-4 flex flex-col gap-4 flex-1 min-h-0 overflow-hidden">
                        <div className="shrink-0">
                            <Label>选择奖池</Label>
                            <select 
                                className="w-full bg-surface-light/50 border border-border rounded text-sm p-2 outline-none focus:border-accent-pink text-body"
                                value={selectedPoolId}
                                onChange={e => setSelectedPoolId(e.target.value)}
                            >
                                {localPools.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>

                        <div className="flex rounded bg-surface-highlight p-1 border border-border shrink-0">
                            <button onClick={() => setMode('draw')} className={`flex-1 py-1.5 text-xs rounded font-bold transition-colors ${mode === 'draw' ? 'bg-accent-pink text-white shadow' : 'text-muted hover:text-body'}`}>抽取</button>
                            <button onClick={() => setMode('deposit')} className={`flex-1 py-1.5 text-xs rounded font-bold transition-colors ${mode === 'deposit' ? 'bg-primary text-white shadow' : 'text-muted hover:text-body'}`}>放入</button>
                            <button onClick={() => setMode('peek')} className={`flex-1 py-1.5 text-xs rounded font-bold transition-colors ${mode === 'peek' ? 'bg-accent-teal text-white shadow' : 'text-muted hover:text-body'}`}>查看</button>
                        </div>

                        <div className="bg-surface-light/50 rounded border border-border p-3 flex flex-col flex-1 min-h-0 overflow-hidden">
                            {mode === 'draw' && activePool && (
                                <div className="flex flex-col gap-3 overflow-y-auto">
                                    <div className="flex justify-between text-xs text-muted">
                                        <span>抽取数量: <span className="text-highlight font-bold">{drawAmount}</span></span>
                                        <span>(限 {activePool.minDraws || 1}-{activePool.maxDraws || 1})</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min={activePool.minDraws || 1} 
                                        max={activePool.maxDraws || 1} 
                                        step={1}
                                        value={drawAmount}
                                        onChange={e => setDrawAmount(parseInt(e.target.value))}
                                        className="accent-pink-500 w-full"
                                    />
                                    <div className="text-xs text-muted leading-relaxed mt-1 bg-surface-light/50 p-2 rounded border border-border/50">
                                        {activePool.description}
                                    </div>
                                </div>
                            )}

                            {mode === 'deposit' && (
                                <div className="flex-1 flex flex-col gap-2 min-h-0">
                                    <div className="flex justify-between text-xs text-muted shrink-0">
                                        <span>快速选择数量: <span className="text-highlight font-bold">{quickDepositCount}</span></span>
                                        <span>/ {maxAvailableToDeposit} (可用)</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min={0} 
                                        max={maxAvailableToDeposit} 
                                        step={1}
                                        value={quickDepositCount}
                                        onChange={e => handleQuickDepositChange(parseInt(e.target.value))}
                                        className="accent-primary w-full mb-2 shrink-0"
                                    />
                                    
                                    <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar border-t border-border pt-2">
                                        {activeChar.inventory.length === 0 && <div className="text-xs text-muted text-center mt-4">背包为空</div>}
                                        {maxAvailableToDeposit === 0 && activeChar.inventory.length > 0 && <div className="text-xs text-muted text-center mt-4">所有物品均已在行动队列中</div>}
                                        
                                        {activeChar.inventory.map((id, idx) => {
                                            if (!itemAvailability[idx]) return null;
                                            
                                            const card = state.cardPool.find(c => c.id === id);
                                            if(!card) return null;
                                            const isSelected = selectedDepositIndices.has(idx);
                                            return (
                                                <div 
                                                    key={`${id}_${idx}`} 
                                                    onClick={() => toggleDepositSelection(idx)}
                                                    className={`flex items-start gap-3 p-2 rounded cursor-pointer border text-xs transition-colors ${isSelected ? 'bg-primary/20 border-primary text-primary-fg' : 'bg-surface/50 border-border text-muted hover:bg-surface-highlight'}`}
                                                >
                                                    <div className="mt-0.5 shrink-0">
                                                        {isSelected ? <CheckCircle size={14} className="text-primary"/> : <div className="w-3.5 h-3.5 rounded-full border border-faint"/>}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className={`font-bold ${isSelected ? 'text-primary' : 'text-body'}`}>{card.name}</div>
                                                        <div className="text-[10px] text-muted truncate">{card.description}</div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {mode === 'peek' && activePool && (
                                <div className="flex flex-col gap-3 overflow-y-auto">
                                    <div className="flex justify-between text-xs text-muted">
                                        <span>尝试查看数量: <span className="text-highlight font-bold">{peekAmount}</span></span>
                                        <span>(限 {activePool.minDraws || 1}-{activePool.maxDraws || 1})</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min={activePool.minDraws || 1} 
                                        max={activePool.maxDraws || 1} 
                                        step={1}
                                        value={peekAmount}
                                        onChange={e => setPeekAmount(parseInt(e.target.value))}
                                        className="accent-teal-500 w-full"
                                    />
                                    <div className="text-xs text-muted text-center pt-2 leading-relaxed bg-surface-light/50 p-2 rounded">
                                        翻看奖池中的物品（不会取出）。<br/>
                                        此行为会消耗回合，但不会改变奖池内容。
                                    </div>
                                </div>
                            )}
                        </div>

                        <Button onClick={handleConfirm} className="h-10 text-sm font-bold bg-accent-pink hover:bg-pink-600 shrink-0 text-white">
                            {mode === 'draw' ? '确认抽取' : mode === 'deposit' ? `放入选定物品 (${selectedDepositIndices.size})` : '确认翻看'}
                        </Button>
                    </div>
                )}
            </div>
        </Window>
    );
};

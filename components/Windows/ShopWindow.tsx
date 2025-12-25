
import React, { useState } from 'react';
import { GameState, Card, Character, AttributeType, AttributeVisibility } from '../../types';
import { Button, Input, Label } from '../ui/Button';
import { X, ShoppingCart, Plus, Coins, Zap, Box, Edit2, Info } from 'lucide-react';
import { CardEditor } from './CardEditor';
import { normalizeCard } from '../../services/aiService';
import { Window } from '../ui/Window';

interface ShopWindowProps {
    winId: number;
    state: GameState;
    updateState: (updater: (current: GameState) => GameState) => void;
    closeWindow: (id: number) => void;
    addLog: (text: string) => void;
    activeCharId?: string;
}

export const ShopWindow: React.FC<ShopWindowProps> = ({ winId, state, updateState, closeWindow, addLog, activeCharId }) => {
    // "Create" is now the default and only mode
    const [isCreating, setIsCreating] = useState(false);
    
    // Default system creation cost
    const defaultCreationCost = state.defaultSettings.gameplay.defaultCreationCost;
    const [payAmount, setPayAmount] = useState<number>(defaultCreationCost);

    const activeChar = activeCharId ? state.characters[activeCharId] : null;
    
    // Helper to get CP
    const getCP = (char: Character) => {
        const attr = char.attributes['cp'] || char.attributes['创造点'];
        return Number(attr?.value || 0);
    };
    
    const currentCP = activeChar ? getCP(activeChar) : 0;
    
    // Calculated Card Value (Price) = Payment / 2
    const generatedCardCost = Math.max(1, Math.floor(payAmount / 2));

    const handleCreateSave = (newCard: Card) => {
        if (!activeChar) return;
        if (currentCP < payAmount) {
            alert("CP 不足！");
            return;
        }

        // Check if an identical card exists in pool
        const existingCard = state.cardPool.find(c => 
            c.name === newCard.name && c.description === newCard.description
        );

        // Normalize new card if it doesn't exist
        const finalCard = existingCard || normalizeCard({ ...newCard, id: `card_gen_${Date.now()}` });

        updateState(prev => {
            const newChars = { ...prev.characters };
            // Safely clone character and attributes
            const char = { ...newChars[activeChar.id] };
            char.attributes = { ...char.attributes };

            const cpAttr = char.attributes['cp'] || char.attributes['创造点'];
            
            // Deduct CP based on User Input (payAmount)
            if (cpAttr) {
                char.attributes[cpAttr.id] = { ...cpAttr, value: Number(cpAttr.value) - payAmount };
            }

            // --- Update Active Attribute (+30 on Buy/Create) ---
            const activeAttr = char.attributes['活跃'] || char.attributes['active'];
            if (activeAttr) {
                char.attributes[activeAttr.id] = { ...activeAttr, value: Math.min(100, Number(activeAttr.value) + 30) };
            } else {
                char.attributes['活跃'] = { id: '活跃', name: '活跃', type: AttributeType.NUMBER, value: 80, visibility: AttributeVisibility.PUBLIC };
            }
            // ---------------------------------------------------
            
            // Add to Inventory
            char.inventory = [...char.inventory, finalCard.id];
            
            newChars[activeChar.id] = char;
            
            // Add to Global Pool (if new)
            const newPool = existingCard ? prev.cardPool : [...prev.cardPool, finalCard];
            
            return { ...prev, cardPool: newPool, characters: newChars };
        });

        addLog(`> 创造: ${activeChar.name} 领悟了技能 [${finalCard.name}] (-${payAmount} CP) 并加入了背包。卡牌价值: ${finalCard.cost}CP。${existingCard ? '(复用现有技能)' : ''}`);
        setIsCreating(false);
        // Reset pay amount to default for next time
        setPayAmount(defaultCreationCost);
    };

    return (
        <Window
            title={<span className="flex items-center gap-2"><Zap size={18} className="text-primary"/> 创造能力 (Create Ability)</span>}
            onClose={() => closeWindow(winId)}
            maxWidth="max-w-2xl"
            height="h-auto max-h-[80vh]"
            headerActions={
                activeChar && (
                    <div className="flex items-center gap-2 bg-yellow-900/20 border border-yellow-900/50 px-3 py-1 rounded-full text-xs text-warning-fg">
                        <Coins size={12}/> 当前 CP: {currentCP}
                    </div>
                )
            }
        >
            {/* Visual Card Editor Overlay - CardEditor is already a Window/Portal */}
            {isCreating && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay p-4">
                    <CardEditor 
                        onClose={() => setIsCreating(false)}
                        onSave={handleCreateSave}
                        gameState={state}
                        // Pass the calculated half-price as fixed cost
                        fixedCost={generatedCardCost}
                        initialCard={{
                            id: `new_${Date.now()}`,
                            name: "新能力",
                            description: "描述...",
                            itemType: "skill",
                            triggerType: "active",
                            cost: generatedCardCost, // Initial display value
                            effects: [],
                            visibility: AttributeVisibility.PUBLIC
                        }}
                    />
                </div>
            )}

            <div className="flex flex-col items-center justify-center w-full gap-6 max-w-md text-center mx-auto py-8">
                {!activeChar ? (
                    <div className="flex items-center justify-center h-full text-muted py-10">
                        请先在主界面选择一个由你控制的角色。
                    </div>
                ) : (
                    <>
                        <div className="space-y-2 mt-4">
                            <h3 className="text-xl font-bold text-highlight">设计全新能力</h3>
                            <p className="text-xs text-muted leading-relaxed">
                                你可以投入任意数量的 CP 来创造能力。<br/>
                                生成的卡牌价值(Cost)将是你投入的一半。
                            </p>
                        </div>

                        <div className="w-full bg-surface-light/50 p-4 rounded-lg border border-border flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <Label className="text-muted">投入 CP (Payment)</Label>
                                <Input 
                                    type="number" 
                                    className="w-24 text-right h-8 border-primary/50 focus:border-primary text-warning-fg font-bold"
                                    value={payAmount}
                                    onChange={e => setPayAmount(Math.max(1, parseInt(e.target.value) || 0))}
                                />
                            </div>
                            <div className="flex items-center justify-between text-xs border-t border-border pt-2">
                                <span className="text-muted">生成卡牌价值 (Value)</span>
                                <span className="text-body font-mono">{generatedCardCost} CP</span>
                            </div>
                        </div>

                        <Button onClick={() => setIsCreating(true)} disabled={currentCP < payAmount} className="w-full py-2 text-sm font-bold bg-primary hover:bg-primary-hover mb-4">
                            {currentCP < payAmount ? "CP 不足" : "开始创造"}
                        </Button>
                    </>
                )}
            </div>
        </Window>
    );
};
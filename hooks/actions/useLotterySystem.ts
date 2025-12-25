
import { MutableRefObject } from 'react';
import { GameState, Character, PrizePool, PrizeItem, Card, AttributeVisibility, DebugLog } from '../../types';
import { normalizeCard, determineCharacterReaction } from '../../services/aiService';
import { removeInstances } from '../../services/attributeUtils';

interface UseLotterySystemProps {
    stateRef: MutableRefObject<GameState>;
    updateState: (updater: (current: GameState) => GameState) => void;
    addLog: (text: string, overrides?: Partial<any>) => void;
    addDebugLog: (log: DebugLog) => void;
    checkSession: () => number;
    handleTriggerUpdate: (id: string, updates: any) => void;
}

export const useLotterySystem = ({
    stateRef, updateState, addLog, addDebugLog, checkSession, handleTriggerUpdate
}: UseLotterySystemProps) => {

    const processLotteryAction = async (
        charId: string, 
        poolId: string, 
        action: 'draw' | 'deposit' | 'peek', 
        amount: number = 1, 
        cardIds?: string[], 
        itemName?: string, 
        isHidden: boolean = false
    ) => {
        const startSession = checkSession();
        const state = stateRef.current;
        const char = state.characters[charId];
        const pool = state.prizePools[poolId];
        
        if (!char) return;

        // Validation: Location check
        const currentLocId = state.map.charPositions[charId]?.locationId;
        if (!pool || (pool.locationIds && pool.locationIds.length > 0 && (!currentLocId || !pool.locationIds.includes(currentLocId)))) {
             addLog(`> 操作失败: ${char.name} 试图操作 [${pool ? pool.name : '未知奖池'}]，但该设施不在此地。`);
             return;
        }

        if (action === 'draw') {
            const drawAmount = Math.max(pool.minDraws || 1, Math.min(pool.maxDraws || 1, amount));
            const drawnItems: PrizeItem[] = [];
            let remainingItems = [...pool.items];
            
            for (let i = 0; i < drawAmount; i++) {
                const totalWeight = remainingItems.reduce((sum, item) => sum + (item.weight || 1), 0);
                if (totalWeight > 0) {
                    let r = Math.random() * totalWeight;
                    let selected: PrizeItem | null = null;
                    for (const item of remainingItems) {
                        if (r < (item.weight || 1)) {
                            selected = item;
                            break;
                        }
                        r -= (item.weight || 1);
                    }
                    if (selected) {
                        drawnItems.push(selected);
                        remainingItems = remainingItems.filter(itm => itm.id !== selected!.id);
                    }
                } else {
                    break;
                }
            }

            if (drawnItems.length > 0) {
                const newCardsToAdd: Card[] = [];
                const inventoryIdsToAdd: string[] = [];
                
                drawnItems.forEach(item => {
                    // Check if card already exists in pool (re-use definition)
                    const existing = state.cardPool.find(c => c.name === item.name && c.description === item.description) 
                                     || newCardsToAdd.find(c => c.name === item.name && c.description === item.description);
                    
                    if (existing) {
                        inventoryIdsToAdd.push(existing.id);
                    } else {
                        let newCard: Card = {
                            id: `prize_card_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                            name: item.name,
                            description: item.description,
                            itemType: 'consumable',
                            triggerType: 'active',
                            cost: 0,
                            effects: [
                                {
                                    id: `eff_prize_${Date.now()}`,
                                    name: "奖池物品",
                                    targetType: 'self',
                                    targetAttribute: '健康',
                                    value: 0,
                                    conditionDescription: "奖池内物品",
                                    conditionContextKeys: []
                                }
                            ],
                            visibility: item.isHidden ? AttributeVisibility.PRIVATE : AttributeVisibility.PUBLIC
                        };
                        newCard = normalizeCard(newCard);
                        newCardsToAdd.push(newCard);
                        inventoryIdsToAdd.push(newCard.id);
                    }
                });

                updateState(prev => ({
                    ...prev,
                    prizePools: {
                        ...prev.prizePools,
                        [pool.id]: {
                            ...pool,
                            items: remainingItems 
                        }
                    },
                    cardPool: [...prev.cardPool, ...newCardsToAdd],
                    characters: {
                        ...prev.characters,
                        [charId]: {
                            ...prev.characters[charId],
                            inventory: [...prev.characters[charId].inventory, ...inventoryIdsToAdd]
                        }
                    }
                }));

                const itemNames = drawnItems.map(i => `[${i.name}]`).join(", ");
                
                if (!isHidden) {
                    addLog(`> 抽取: ${char.name} 从 [${pool.name}] 中抽取了 ${itemNames}！`);
                } else {
                    addLog(`> 抽取: ${char.name} 从 [${pool.name}] 中抽取了 ${drawnItems.length} 件物品...`);
                }
            } else {
                addLog(`> 抽取失败: ${pool.name} 是空的。`);
            }

        } else if (action === 'deposit') {
            const cardIdsToDeposit: string[] = [];
            
            if (cardIds && Array.isArray(cardIds)) {
                cardIdsToDeposit.push(...cardIds);
            }
            
            // Legacy support for itemName from AI
            if (cardIdsToDeposit.length === 0 && itemName) {
                const card = state.cardPool.find(c => c.name === itemName && char.inventory.includes(c.id));
                if (card) cardIdsToDeposit.push(card.id);
            }

            if (cardIdsToDeposit.length > 0) {
                const availableDepositIds: string[] = [];
                const tempInv = [...char.inventory];
                
                cardIdsToDeposit.forEach(id => {
                    const idx = tempInv.indexOf(id);
                    if (idx > -1) {
                        availableDepositIds.push(id);
                        tempInv.splice(idx, 1);
                    }
                });
                
                if (availableDepositIds.length > 0) {
                    const validCards = availableDepositIds.map(id => state.cardPool.find(c => c.id === id)).filter(Boolean) as Card[];
                    
                    const newPrizeItems: PrizeItem[] = validCards.map(c => ({
                        id: `pitem_dep_${Date.now()}_${Math.random().toString(36).substr(2,5)}`,
                        name: c.name,
                        description: c.description,
                        weight: 1,
                        isHidden: c.visibility === AttributeVisibility.PRIVATE
                    }));

                    updateState(prev => ({
                        ...prev,
                        prizePools: {
                            ...prev.prizePools,
                            [pool.id]: {
                                ...pool,
                                items: [...pool.items, ...newPrizeItems]
                            }
                        },
                        characters: {
                            ...prev.characters,
                            [charId]: {
                                ...prev.characters[charId],
                                inventory: removeInstances(prev.characters[charId].inventory, availableDepositIds)
                            }
                        }
                    }));
                    
                    // Fixed: Log each item individually with description
                    validCards.forEach(c => {
                        addLog(`> 放入: ${char.name} 将 [${c.name}] 放回 [${pool.name}]：${c.description}`);
                    });
                }
            }
        } else if (action === 'peek') {
            // Updated PEEK Logic: "Take out and put back" simulation
            // 1. Enforce same limits as draw
            const peekAmount = Math.max(pool.minDraws || 1, Math.min(pool.maxDraws || 1, amount));
            
            if (pool.items.length > 0) {
                const peekedItems: PrizeItem[] = [];
                // Create a temporary copy to simulate drawing without replacement during this action
                let tempItems = [...pool.items];
                
                // Use Weighted Random Logic (Same as Draw)
                for (let k = 0; k < peekAmount; k++) {
                    if (tempItems.length === 0) break;
                    
                    const totalWeight = tempItems.reduce((sum, item) => sum + (item.weight || 1), 0);
                    if (totalWeight > 0) {
                        let r = Math.random() * totalWeight;
                        let selected: PrizeItem | null = null;
                        for (const item of tempItems) {
                            if (r < (item.weight || 1)) {
                                selected = item;
                                break;
                            }
                            r -= (item.weight || 1);
                        }
                        if (selected) {
                            peekedItems.push(selected);
                            tempItems = tempItems.filter(itm => itm.id !== selected!.id);
                        }
                    } else {
                        break;
                    }
                }

                if (peekedItems.length > 0) {
                    addLog(`> 查看: ${char.name} 翻看了 [${pool.name}] 的内容...`);
                    peekedItems.forEach(item => {
                         // Similar to deposit log: Show name and description
                         addLog(`> 发现: [${item.name}] - ${item.description}`);
                    });
                } else {
                    addLog(`> 查看: ${char.name} 试图查看 [${pool.name}]，但什么也没发现。`);
                }
            } else {
                addLog(`> 查看: ${char.name} 查看了 [${pool.name}]，里面空空如也。`);
            }
        }
    };

    return { processLotteryAction };
};

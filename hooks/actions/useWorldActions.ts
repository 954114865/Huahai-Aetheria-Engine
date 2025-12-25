
import { MutableRefObject } from 'react';
import { GameState, Character, MapLocation, Card, AttributeType, AttributeVisibility } from '../../types';
import { normalizeCard } from '../../services/aiService';
import { getAttr, getCP, removeInstances } from '../../services/attributeUtils';

interface UseWorldActionsProps {
    stateRef: MutableRefObject<GameState>;
    updateState: (updater: (current: GameState) => GameState) => void;
    addLog: (text: string) => void;
}

export const useWorldActions = ({ stateRef, updateState, addLog }: UseWorldActionsProps) => {

    const processMove = (charId: string, destinationId: string, destinationName?: string) => {
        const state = stateRef.current;
        const char = state.characters[charId];
        const dest = state.map.locations[destinationId];
        
        // Validation handled by caller mostly, but double check
        if (!char || !dest) {
            addLog(`> 移动失败: 目标地点无效。`);
            return;
        }

        // --- Physique Check (Threshold: 50) ---
        // Environment characters (env_*) bypass this check to ensure story progression.
        if (!char.id.startsWith('env_')) {
            const physiqueAttr = getAttr(char, '体能');
            const physiqueVal = physiqueAttr ? Number(physiqueAttr.value) : 0;
            
            if (!isNaN(physiqueVal) && physiqueVal < 50) {
                addLog(`> 行动拒绝: ${char.name} 体能不足 (${physiqueVal}/50)，身体过于疲惫，无法长途跋涉。`);
                return;
            }
        }
        // --------------------------------------

        updateState(prev => {
            const newChars = { ...prev.characters };
            const movingChar = { ...newChars[charId] };
            
            // --- Update Active Attribute (+30 on Move) ---
            const activeAttr = movingChar.attributes['活跃'] || movingChar.attributes['active'];
            if (activeAttr) {
                movingChar.attributes = {
                    ...movingChar.attributes,
                    [activeAttr.id]: { ...activeAttr, value: Math.min(100, Number(activeAttr.value) + 30) }
                };
            } else {
                movingChar.attributes = {
                    ...movingChar.attributes,
                    '活跃': { id: '活跃', name: '活跃', type: AttributeType.NUMBER, value: 80, visibility: AttributeVisibility.PUBLIC }
                };
            }
            // ---------------------------------------------
            
            // Add conflict on move
            let maxId = 0;
            Object.values(prev.characters).forEach(c => {
                c.conflicts?.forEach(x => {
                    const n = parseInt(x.id);
                    if (!isNaN(n) && n > maxId) maxId = n;
                });
            });
            const nextId = maxId + 1;

            movingChar.conflicts = [
                ...(movingChar.conflicts || []),
                {
                    id: String(nextId),
                    desc: "刚到此地，对当地情况不熟悉",
                    apReward: 2,
                    solved: false
                }
            ];
            newChars[charId] = movingChar;

            const newMap = { ...prev.map };
            
            // Update Char Position
            newMap.charPositions = {
                ...newMap.charPositions,
                [charId]: {
                    x: dest.coordinates.x,
                    y: dest.coordinates.y,
                    locationId: dest.id
                }
            };

            // Removed: Do NOT update activeLocationId when a character moves.
            // Players might want to stay observing the current location.

            return {
                ...prev,
                map: newMap,
                characters: newChars
            };
        });
        
        const isUnknown = !dest.isKnown;
        const nameToLog = destinationName || dest.name;
        addLog(`> 移动: ${char.name} 前往了 ${isUnknown ? "未知地点" : `[${nameToLog}]`}`);
    };

    const processCardCreation = (charId: string, cardTemplate: Card) => {
        const state = stateRef.current;
        const char = state.characters[charId];
        if (!char) return;

        const cost = state.defaultSettings.gameplay.defaultCreationCost;
        const currentCP = getCP(char);

        if (currentCP >= cost) {
            const cpAttr = getAttr(char, 'cp');
            if (cpAttr) {
                const newName = cardTemplate.name;
                const newDesc = cardTemplate.description || "AI Generated Skill";
                
                // Check for duplicate in pool
                const existing = state.cardPool.find(c => c.name === newName && c.description === newDesc);
                
                const finalCardCost = Math.max(1, Math.floor(cost / 2));

                const finalCard = existing || normalizeCard({ 
                    ...cardTemplate, 
                    itemType: cardTemplate.itemType || 'skill',
                    triggerType: cardTemplate.triggerType || 'active',
                    effects: cardTemplate.effects || [],
                    id: `card_gen_${Date.now()}`,
                    description: newDesc,
                    cost: finalCardCost 
                });
                
                updateState(prev => {
                    const newPool = existing ? prev.cardPool : [...prev.cardPool, finalCard];
                    
                    const newChars = { ...prev.characters };
                    const targetChar = { ...newChars[charId] };
                    
                    // Safe update of attributes
                    targetChar.attributes = { ...targetChar.attributes };

                    // Deduct CP
                    if (targetChar.attributes[cpAttr.id]) {
                        targetChar.attributes[cpAttr.id] = { ...targetChar.attributes[cpAttr.id], value: currentCP - cost };
                    }

                    // --- Update Active Attribute (+30 on Create) ---
                    const activeAttr = targetChar.attributes['活跃'] || targetChar.attributes['active'];
                    if (activeAttr) {
                        targetChar.attributes[activeAttr.id] = { ...activeAttr, value: Math.min(100, Number(activeAttr.value) + 30) };
                    } else {
                        targetChar.attributes['活跃'] = { id: '活跃', name: '活跃', type: AttributeType.NUMBER, value: 80, visibility: AttributeVisibility.PUBLIC };
                    }
                    // -----------------------------------------------

                    targetChar.inventory = [...targetChar.inventory, finalCard.id];
                    newChars[charId] = targetChar;

                    return {
                        ...prev,
                        cardPool: newPool,
                        characters: newChars
                    };
                });
                
                addLog(`> 创造: ${char.name} 领悟了技能 [${finalCard.name}] (-${cost} CP) 并加入了背包。${existing ? '(复用现有技能)' : ''}`);
            }
        } else {
            addLog(`> 创造失败: ${char.name} 想要创造 [${cardTemplate.name}] 但 CP 不足。`);
        }
    };

    const processRedeem = (charId: string, targetCharId: string, oldCardId: string, newCardTemplate: Card) => {
        const state = stateRef.current;
        const targetChar = state.characters[targetCharId];
        
        if (targetChar && targetChar.inventory.includes(oldCardId)) {
            let realCard: Card = {
                ...newCardTemplate,
                id: `card_redeem_${Date.now()}`,
                effects: (newCardTemplate.effects || []).map((e, idx) => ({...e, id: `eff_rd_${Date.now()}_${idx}`}))
            };
            realCard = normalizeCard(realCard);

            updateState(prev => ({
                ...prev,
                cardPool: [...prev.cardPool, realCard],
                characters: {
                    ...prev.characters,
                    [targetCharId]: {
                        ...prev.characters[targetCharId],
                        inventory: [...removeInstances(prev.characters[targetCharId].inventory, [oldCardId]), realCard.id]
                    }
                }
            }));
            addLog(`> [系统] 奖励兑现: ${targetChar.name} 的奖励已兑换为 [${realCard.name}]。`);
        }
    };

    return { processMove, processCardCreation, processRedeem };
};
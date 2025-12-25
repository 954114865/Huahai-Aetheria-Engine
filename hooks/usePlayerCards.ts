
import { useMemo } from 'react';
import { GameState, Character, Card } from '../types';
import { PendingAction } from './useEngine';

export const usePlayerCards = (
    state: GameState,
    activeCharId: string,
    pendingActions: PendingAction[]
) => {
    const activeChar = state.characters[activeCharId];

    const pendingCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        if (pendingActions) {
            pendingActions.forEach(act => {
                if (act.type === 'use_skill' && act.cardId) {
                    // Only count as "removal" if it is a CONSUMABLE item
                    // Skills/Equipment in inventory should remain available for multiple uses in one turn (unless deposited)
                    const card = state.cardPool.find(c => c.id === act.cardId);
                    if (card && card.itemType === 'consumable') {
                        counts[act.cardId] = (counts[act.cardId] || 0) + 1;
                    }
                }
                // Deposit always removes item from availability
                if (act.type === 'lottery' && act.action === 'deposit' && act.cardIds) {
                    act.cardIds.forEach(id => {
                        counts[id] = (counts[id] || 0) + 1;
                    });
                }
            });
        }
        return counts;
    }, [pendingActions, state.cardPool]);

    const availableCards = useMemo(() => {
        if (!activeChar) return [];
        
        // 1. Gather Innate Skills
        const skills = activeChar.skills
            .filter(c => c.triggerType === 'active' || c.triggerType === 'reaction')
            .map(c => ({ card: c, isInnate: true }));
            
        // 2. Gather Inventory Items
        const inventoryItems: { card: Card, isInnate: boolean }[] = [];
        const tempCounts = { ...pendingCounts };

        activeChar.inventory.forEach(itemId => {
            const card = state.cardPool.find(c => c.id === itemId);
            if (card && (card.triggerType === 'active' || card.triggerType === 'reaction')) {
                if ((tempCounts[itemId] || 0) > 0) {
                    tempCounts[itemId]--;
                } else {
                    inventoryItems.push({ card: card, isInnate: false });
                }
            }
        });

        // 3. Combine and Sort
        const all = [...skills, ...inventoryItems].sort((a, b) => {
            if (a.isInnate && !b.isInnate) return -1;
            if (!a.isInnate && b.isInnate) return 1;
            const nameComp = a.card.name.localeCompare(b.card.name);
            if (nameComp !== 0) return nameComp;
            return (a.card.description || "").localeCompare(b.card.description || "");
        });

        return all.map(wrapper => wrapper.card);
    }, [activeChar, state.cardPool, pendingCounts]);

    // Check if card needs target
    const doesCardNeedTarget = (card: Card) => {
        if (card.name === '互动' || card.name === 'Interact') return true;
        if (card.effects && card.effects.length > 0) {
            return card.effects.some(e => e.targetType === 'specific_char');
        }
        return false;
    };

    return {
        activeChar,
        pendingCounts,
        availableCards,
        doesCardNeedTarget
    };
};

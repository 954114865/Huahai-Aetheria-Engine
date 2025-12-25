
import { Card, Effect } from "../types";

// --- CARD NORMALIZATION UTILITY ---
/**
 * Normalizes a card to enforce game balance rules upon initial creation.
 * Rules:
 * 1. Numeric effect values are capped between -10 and 10.
 * 2. Effect list is trimmed to a maximum of 2 entries.
 */
export const normalizeCard = (card: Card): Card => {
    // Deep copy to avoid mutation of source object if it's reused
    const newCard = JSON.parse(JSON.stringify(card));

    // Rule 2: Max 2 effects (including hit check)
    if (newCard.effects && newCard.effects.length > 2) {
        newCard.effects = newCard.effects.slice(0, 2);
    }

    // Rule 1: Cap numeric values [-10, 10]
    if (newCard.effects) {
        newCard.effects = newCard.effects.map((e: Effect) => {
            // Check if value is numeric or can be cast to number
            const valNum = parseFloat(String(e.value));
            
            // Only clamp if it is a valid number. 
            // If it's a string attribute (e.g. status="Poisoned"), we generally don't clamp,
            // but the rule says "Numeric class effects".
            if (!isNaN(valNum)) {
                if (valNum > 10) e.value = 10;
                else if (valNum < -10) e.value = -10;
            }
            return e;
        });
    }

    return newCard;
};

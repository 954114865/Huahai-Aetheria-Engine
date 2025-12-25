
import { Character, AttributeType, AttributeVisibility } from '../types';

export const removeInstances = (inventory: string[], idsToRemove: string[]): string[] => {
    const newInventory = [...inventory];
    idsToRemove.forEach(id => {
        const idx = newInventory.indexOf(id);
        if (idx > -1) {
            newInventory.splice(idx, 1);
        }
    });
    return newInventory;
};

export const getAttr = (char: Character, key: string) => {
    if (!char || !char.attributes) return undefined;
    if (char.attributes[key]) return char.attributes[key];
    const map: Record<string, string> = {
        'health': '健康', '健康': 'health',
        'cp': '创造点', '创造点': 'cp',
        'status': '状态', '状态': 'status',
        'physique': '体能', '体能': 'physique',
        'pleasure': '快感', '快感': 'pleasure',
        'energy': '能量', '能量': 'energy'
    };
    const alias = map[key];
    if (alias && char.attributes[alias]) return char.attributes[alias];
    
    const lowerKey = key.toLowerCase();
    const foundKey = Object.keys(char.attributes).find(k => k.toLowerCase() === lowerKey);
    if (foundKey) return char.attributes[foundKey];

    return undefined;
};

export const getCP = (char: Character) => {
    const attr = getAttr(char, 'cp'); 
    return Number(attr?.value || 0);
};

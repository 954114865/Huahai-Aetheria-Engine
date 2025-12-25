
import { Character, Card } from "../types";

/**
 * Propagates a name change throughout a character's data fields.
 * Replaces occurrences of oldName with newName in:
 * - Appearance
 * - Description
 * - Skills (Name, Description, Effect Conditions)
 */
export const propagateCharacterNameChange = (char: Character, oldName: string, newName: string): Character => {
    if (!oldName || !newName || oldName === newName) return char;

    // Use split/join for global replacement to avoid regex special character issues
    const replaceText = (text: string) => {
        if (!text) return "";
        return text.split(oldName).join(newName);
    };

    // 1. Appearance & Description
    const newAppearance = replaceText(char.appearance || "");
    const newDescription = replaceText(char.description || "");

    // 2. Skills (Cards)
    const newSkills = char.skills.map(skill => {
        let skillChanged = false;
        let sName = skill.name;
        let sDesc = skill.description;
        
        // Name
        if (sName.includes(oldName)) {
            sName = replaceText(sName);
            skillChanged = true;
        }
        // Description
        if (sDesc.includes(oldName)) {
            sDesc = replaceText(sDesc);
            skillChanged = true;
        }

        // Effects Conditions
        let newEffects = skill.effects;
        if (skill.effects) {
            newEffects = skill.effects.map(eff => {
                if (eff.conditionDescription && eff.conditionDescription.includes(oldName)) {
                    skillChanged = true;
                    return { ...eff, conditionDescription: replaceText(eff.conditionDescription) };
                }
                return eff;
            });
        }

        if (skillChanged) {
            return { ...skill, name: sName, description: sDesc, effects: newEffects };
        }
        return skill;
    });

    return {
        ...char,
        appearance: newAppearance,
        description: newDescription,
        skills: newSkills
    };
};

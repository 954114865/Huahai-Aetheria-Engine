
/**
 * AI Service Facade
 * This file re-exports functionality from the split modules.
 */

// Core Utilities
export { createClient, robustGenerate, testModelConnection } from "./ai/core";
export { fillPrompt, buildContextMessages, getPleasureInstruction } from "./ai/promptUtils";
export { getGlobalMemory, getCharacterMemory } from "./ai/memoryUtils";

// Data Utilities
export { normalizeCard } from "./cardUtils";

// Feature Modules
export { generateCharacter } from "./ai/features/characterAI";
export { determineCharacterAction, determineCharacterReaction } from "./ai/features/actionAI";
export { checkConditionsBatch, analyzeSettlement } from "./ai/features/logicAI";
export { determineTurnOrder, generateLocationDetails } from "./ai/features/worldAI";
export { generateObservation, generateUnveil } from "./ai/features/narrativeAI";
export { generateLetter } from "./ai/features/mailAI";

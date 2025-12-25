
import { AIConfig, AppSettings, DefaultSettings, GameAttribute, GameState, LogEntry, Trigger, DebugLog } from "../../../types";
import { createClient, robustGenerate, supportsJsonMode } from "../core";
import { buildContextMessages, fillPrompt, parsePromptStructure } from "../promptUtils";
import { getGlobalMemory } from "../memoryUtils";
import { evaluateTriggers } from "../../triggerService";
import { DEFAULT_AI_CONFIG } from "../../../config";
import { ImageContextBuilder } from "../ImageContextBuilder";

export const checkConditionsBatch = async (
    config: AIConfig,
    items: any[],
    context: { history: string, world: any },
    appSettings: AppSettings,
    defaultSettings: DefaultSettings,
    globalContextConfig: any,
    entitiesContext: Record<string, any>,
    onDebug?: (log: DebugLog) => void,
    strictMode: boolean = false,
    fullGameState?: GameState,
    onLog?: (msg: string) => void,
    onTriggerUpdate?: (id: string, updates: Partial<Trigger>) => void,
    imageBuilder?: ImageContextBuilder // New Param
): Promise<any> => {
    const finalConfig = config.provider ? config : DEFAULT_AI_CONFIG;
    const client = createClient(finalConfig, appSettings.apiKeys);

    let prompt = fillPrompt(defaultSettings.prompts.checkConditionsBatch, {
        SHORT_HISTORY: context.history,
        WORLD: JSON.stringify(context.world, null, 2),
        ENTITIES: JSON.stringify(entitiesContext, null, 2),
        ITEMS: JSON.stringify(items, null, 2)
    }, appSettings);

    if (strictMode) {
        prompt += `\n${defaultSettings.prompts.checkConditionsStrictInstruction}`;
    }

    if (fullGameState) {
        const { promptSuffix, logs } = evaluateTriggers(fullGameState, 'checkConditionsBatch', onTriggerUpdate);
        prompt += promptSuffix;
        if (logs.length > 0 && onLog) logs.forEach(onLog);
    }

    // Handle Image Interleaving
    // If imageBuilder is provided, we use parsePromptStructure which calls imageBuilder.interleave via callback
    const interleaver = imageBuilder 
        ? (t: string) => imageBuilder.interleave(t) 
        : (t: string) => [{ text: t }];

    const promptParts = parsePromptStructure(prompt, interleaver);

    const messages = buildContextMessages(globalContextConfig, finalConfig.contextConfig, undefined, promptParts, appSettings);

    const result = await robustGenerate<{ results: any }>(
        () => client.models.generateContent({
            model: finalConfig.model || DEFAULT_AI_CONFIG.model!,
            contents: messages,
            // Optimization: Enable JSON mode for compatible providers
            config: { 
                responseMimeType: supportsJsonMode(finalConfig.provider) ? 'application/json' : undefined,
                maxOutputTokens: appSettings.maxOutputTokens
            }
        }),
        (json) => json && json.results,
        3,
        (error, rawResponse) => {
            // Failure Callback
            if (onDebug) {
                onDebug({
                    id: `debug_chk_fail_${Date.now()}`,
                    timestamp: Date.now(),
                    characterName: "System (Logic Failed)",
                    prompt: JSON.stringify(messages, null, 2),
                    response: `Error: ${error.message}\n\nRaw Response:\n${rawResponse || "(No Response)"}`
                });
            }
        }
    );

    if (onDebug && result) {
        onDebug({
            id: `debug_chk_${Date.now()}`,
            timestamp: Date.now(),
            characterName: "System (Logic)",
            prompt: JSON.stringify(messages, null, 2),
            response: JSON.stringify(result, null, 2)
        });
    }

    return result ? result.results : {};
};

export const analyzeSettlement = async (
    config: AIConfig,
    history: LogEntry[],
    activeConflicts: any[],
    activeDrives: any[],
    appSettings: AppSettings,
    defaultSettings: DefaultSettings,
    worldAttributes: Record<string, GameAttribute>,
    globalContextConfig: any,
    onDebug?: (log: DebugLog) => void,
    fullGameState?: GameState,
    onLog?: (msg: string) => void,
    onTriggerUpdate?: (id: string, updates: Partial<Trigger>) => void
): Promise<{ solvedConflictIds: string[], fulfilledDriveIds: string[] } | null> => {
    const finalConfig = config.provider ? config : DEFAULT_AI_CONFIG;
    const client = createClient(finalConfig, appSettings.apiKeys);

    // Initialize Image Builder for Settlement
    const imageBuilder = new ImageContextBuilder();

    let prompt = fillPrompt(defaultSettings.prompts.analyzeSettlement, {
        WORLD_STATE: JSON.stringify(worldAttributes, null, 2),
        // Pass imageBuilder to getGlobalMemory to capture images in history
        SHORT_HISTORY: getGlobalMemory(history, history[history.length-1].round, 5, appSettings.maxInputTokens, imageBuilder),
        CONFLICTS_LIST: JSON.stringify(activeConflicts, null, 2),
        DRIVES_LIST: JSON.stringify(activeDrives, null, 2)
    }, appSettings);

    if (fullGameState) {
        const { promptSuffix, logs } = evaluateTriggers(fullGameState, 'analyzeSettlement', onTriggerUpdate);
        prompt += promptSuffix;
        if (logs.length > 0 && onLog) logs.forEach(onLog);
    }

    const promptParts = parsePromptStructure(prompt, (t) => imageBuilder.interleave(t));
    const messages = buildContextMessages(globalContextConfig, finalConfig.contextConfig, undefined, promptParts, appSettings);

    const result = await robustGenerate<{ solvedConflictIds: string[], fulfilledDriveIds: string[] }>(
        () => client.models.generateContent({
            model: finalConfig.model || DEFAULT_AI_CONFIG.model!,
            contents: messages,
            // Optimization: Enable JSON mode for compatible providers
            config: { 
                responseMimeType: supportsJsonMode(finalConfig.provider) ? 'application/json' : undefined,
                maxOutputTokens: appSettings.maxOutputTokens
            }
        }),
        (json) => json && (Array.isArray(json.solvedConflictIds) || Array.isArray(json.fulfilledDriveIds)),
        3,
        (error, rawResponse) => {
            // Failure Callback
            if (onDebug) {
                onDebug({
                    id: `debug_settle_fail_${Date.now()}`,
                    timestamp: Date.now(),
                    characterName: "System (Settlement Failed)",
                    prompt: JSON.stringify(messages, null, 2),
                    response: `Error: ${error.message}\n\nRaw Response:\n${rawResponse || "(No Response)"}`
                });
            }
        }
    );

    if (onDebug && result) {
        onDebug({
            id: `debug_settle_${Date.now()}`,
            timestamp: Date.now(),
            characterName: "System (Settlement)",
            prompt: JSON.stringify(messages, null, 2),
            response: JSON.stringify(result, null, 2)
        });
    }

    return result;
};

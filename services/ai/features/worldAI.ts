
import { AIConfig, LogEntry, Character, AppSettings, GameAttribute, DefaultSettings, GameState, Trigger, DebugLog, GameImage } from "../../../types";
import { createClient, robustGenerate, supportsJsonMode } from "../core";
import { buildContextMessages, fillPrompt, parsePromptStructure } from "../promptUtils";
import { getGlobalMemory } from "../memoryUtils";
import { evaluateTriggers } from "../../triggerService";
import { DEFAULT_AI_CONFIG } from "../../../config";
import { ImageContextBuilder } from "../ImageContextBuilder";

export const determineTurnOrder = async (
    config: AIConfig,
    history: LogEntry[],
    currentOrder: string[],
    defaultOrder: string[],
    characters: Record<string, Character>,
    appSettings: AppSettings,
    worldAttributes: Record<string, GameAttribute>,
    defaultSettings: DefaultSettings,
    globalContextConfig: any,
    locationContext?: { name: string, activeCharIds: string[] },
    worldGuidance?: string,
    onDebug?: (log: DebugLog) => void,
    fullGameState?: GameState,
    onLog?: (msg: string) => void,
    onTriggerUpdate?: (id: string, updates: Partial<Trigger>) => void
): Promise<{ order: string[], worldUpdates?: Record<string, any> }> => {
    const finalConfig = config.provider ? config : DEFAULT_AI_CONFIG;
    const client = createClient(finalConfig, appSettings.apiKeys);

    // Image Builder
    const imageBuilder = new ImageContextBuilder();

    const activeIds = locationContext ? locationContext.activeCharIds : Object.keys(characters);
    const activeCharsList = activeIds.map(id => {
        const c = characters[id];
        return `${c.name} (ID: ${c.id}) - CP: ${c.attributes['cp']?.value || 0}, Health: ${c.attributes['health']?.value || 0}`;
    }).join('\n');

    let prompt = fillPrompt(defaultSettings.prompts.determineTurnOrder, {
        WORLD_STATE: JSON.stringify(worldAttributes, null, 2),
        LOCATION_NAME: locationContext ? locationContext.name : "未知",
        ACTIVE_CHARS: activeIds.join(", "),
        CHAR_LIST: activeCharsList,
        // Pass builder to capture context images
        SHORT_HISTORY: getGlobalMemory(history, history[history.length-1].round, 10, appSettings.maxInputTokens, imageBuilder)
    }, appSettings);

    if (fullGameState) {
        const { promptSuffix, logs } = evaluateTriggers(fullGameState, 'determineTurnOrder', onTriggerUpdate);
        prompt += promptSuffix;
        if (logs.length > 0 && onLog) logs.forEach(onLog);
    }

    const promptParts = parsePromptStructure(prompt, (t) => imageBuilder.interleave(t));
    const messages = buildContextMessages(globalContextConfig, finalConfig.contextConfig, undefined, promptParts, appSettings);

    const result = await robustGenerate<{ order: string[], worldUpdates?: Record<string, any> }>(
        () => client.models.generateContent({
            model: finalConfig.model || DEFAULT_AI_CONFIG.model!,
            contents: messages,
            // Optimization: Enable JSON mode for compatible providers
            config: { 
                responseMimeType: supportsJsonMode(finalConfig.provider) ? 'application/json' : undefined,
                maxOutputTokens: appSettings.maxOutputTokens
            }
        }),
        (json) => json && Array.isArray(json.order),
        3,
        (error, rawResponse) => {
            // Failure Callback
            if (onDebug) {
                onDebug({
                    id: `debug_order_fail_${Date.now()}`,
                    timestamp: Date.now(),
                    characterName: "System (Order Failed)",
                    prompt: JSON.stringify(messages, null, 2),
                    response: `Error: ${error.message}\n\nRaw Response:\n${rawResponse || "(No Response)"}`
                });
            }
        }
    );

    if (onDebug && result) {
        onDebug({
            id: `debug_order_${Date.now()}`,
            timestamp: Date.now(),
            characterName: "System (Order)",
            prompt: JSON.stringify(messages, null, 2),
            response: JSON.stringify(result, null, 2)
        });
    }

    return result || { order: defaultOrder };
};

export const generateLocationDetails = async (
    config: AIConfig,
    coords: { x: number, y: number, z: number },
    history: LogEntry[],
    worldAttributes: Record<string, GameAttribute>,
    appSettings: AppSettings,
    defaultSettings: DefaultSettings,
    globalContextConfig: any,
    worldGuidance: string,
    needsRegionGen: boolean,
    regionInfo: { name: string, description: string } | undefined,
    terrainAnalysis: any,
    regionStats: any,
    existingCharsContext: string,
    nearbyLocationsContext: string, // New: Nearby Locations Context
    suggestedNames: string[],
    onDebug?: (log: DebugLog) => void,
    fullGameState?: GameState,
    onLog?: (msg: string) => void,
    onTriggerUpdate?: (id: string, updates: Partial<Trigger>) => void,
    locationInstruction: string = "",
    cultureInstruction: string = "",
    locationImages: GameImage[] = [],
    characterImages: GameImage[] = []
): Promise<{ 
    name: string, 
    description: string, 
    region?: { name: string, description: string }, 
    localItems?: {name: string, description: string}[],
    chars?: { name: string, description: string, appearanceImageId?: string }[]
}> => {
    const finalConfig = config.provider ? config : DEFAULT_AI_CONFIG;
    const client = createClient(finalConfig, appSettings.apiKeys);

    const imageBuilder = new ImageContextBuilder();

    // Calculate Short History for Context
    const currentRound = history.length > 0 ? history[history.length - 1].round : 1;
    const shortHistory = getGlobalMemory(history, currentRound, appSettings.maxShortHistoryRounds || 5, appSettings.maxInputTokens, imageBuilder);

    // Register User Provided Images with Clear Labels
    const locImagesStr = imageBuilder.registerList(locationImages, "地点定义参考图");
    const charImagesStr = imageBuilder.registerList(characterImages, "人文/角色定义参考图");

    // Extract World Time
    const timeAttr = worldAttributes['worldTime'];
    const timeStr = timeAttr ? String(timeAttr.value) : "未知时间";

    let prompt = fillPrompt(defaultSettings.prompts.generateLocationDetails, {
        X: coords.x.toFixed(0),
        Y: coords.y.toFixed(0),
        Z: coords.z.toFixed(0),
        TIME: timeStr, // Inject Time
        WORLD_GUIDANCE: worldGuidance || "",
        SHORT_HISTORY: shortHistory, // Inject Short History
        REGION_CONTEXT_INSTRUCTION: regionInfo ? defaultSettings.prompts.instruction_existingRegionContext : "",
        REGION_GEN_INSTRUCTION: needsRegionGen ? defaultSettings.prompts.instruction_generateNewRegion : "",
        REGION_NAME: regionInfo?.name || "",
        REGION_DESC: regionInfo?.description || "",
        REGION_STATS_CONTEXT: regionStats ? `区域统计: ${JSON.stringify(regionStats)}` : "",
        TERRAIN_ANALYSIS: JSON.stringify(terrainAnalysis, null, 2),
        EXISTING_CHARS_CONTEXT: existingCharsContext ? defaultSettings.prompts.context_nearbyCharacters.replace("{{CHARS_LIST}}", existingCharsContext) : "",
        NEARBY_LOCATIONS_CONTEXT: nearbyLocationsContext || "（附近无已知地点）",
        LOCATION_INSTRUCTION: locationInstruction + locImagesStr,
        CULTURE_INSTRUCTION: cultureInstruction + charImagesStr,
        SUGGESTED_NAMES: suggestedNames.join(", ")
    }, appSettings);

    if (fullGameState) {
        const { promptSuffix, logs } = evaluateTriggers(fullGameState, 'generateLocationDetails', onTriggerUpdate);
        prompt += promptSuffix;
        if (logs.length > 0 && onLog) logs.forEach(onLog);
    }

    const promptParts = parsePromptStructure(prompt, (t) => imageBuilder.interleave(t));
    const messages = buildContextMessages(globalContextConfig, finalConfig.contextConfig, undefined, promptParts, appSettings);

    const result = await robustGenerate<{ 
        name: string, 
        description: string, 
        region?: any, 
        localItems?: {name: string, description: string}[],
        chars?: { name: string, description: string, appearanceImageId?: string }[]
    }>(
        () => client.models.generateContent({
            model: finalConfig.model || DEFAULT_AI_CONFIG.model!,
            contents: messages,
            // Optimization: Enable JSON mode for compatible providers
            config: { 
                responseMimeType: supportsJsonMode(finalConfig.provider) ? 'application/json' : undefined,
                maxOutputTokens: appSettings.maxOutputTokens
            }
        }),
        (json) => json && json.name && json.description,
        3,
        (error, rawResponse) => {
            // Failure Callback
            if (onDebug) {
                onDebug({
                    id: `debug_loc_fail_${Date.now()}`,
                    timestamp: Date.now(),
                    characterName: "System (Location Failed)",
                    prompt: JSON.stringify(messages, null, 2),
                    response: `Error: ${error.message}\n\nRaw Response:\n${rawResponse || "(No Response)"}`
                });
            }
        }
    );

    if (onDebug && result) {
        onDebug({
            id: `debug_loc_${Date.now()}`,
            timestamp: Date.now(),
            characterName: "System (Location)",
            prompt: JSON.stringify(messages, null, 2),
            response: JSON.stringify(result, null, 2)
        });
    }

    // Resolve Image IDs back to actual image objects if needed? 
    // The consumer (useLocationGeneration) will match the ID.
    
    return result || { name: "未知", description: "生成失败" };
};

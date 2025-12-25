
import { Character, LogEntry, GameAttribute, Card, AppSettings, DefaultSettings, MapLocation, MapRegion, GameState, AIConfig, DebugLog } from "../../../types";
import { createClient, robustGenerate, supportsJsonMode, dispatchAIStatus } from "../core";
import { buildContextMessages, fillPrompt, replaceGlobalVariables, parsePromptStructure } from "../promptUtils";
import { getGlobalMemory, getCharacterMemory } from "../memoryUtils";
import { DEFAULT_AI_CONFIG } from "../../../config";
import { formatCharacterPersona, formatLocationInfo, formatOtherCharacters, filterWorldAttributes, formatRegionConflicts } from "../../contextUtils";
import { ImageContextBuilder } from "../ImageContextBuilder";

export const generateObservation = async (
    char: Character,
    query: string,
    history: LogEntry[],
    worldAttributes: Record<string, GameAttribute>,
    otherChars: Character[],
    globalContextConfig: any,
    cardPool: Card[],
    appSettings: AppSettings,
    defaultSettings: DefaultSettings,
    currentLocation?: MapLocation,
    nearbyContext?: string,
    knownRegions?: Record<string, MapRegion>,
    onDebug?: (log: DebugLog) => void,
    fullGameState?: GameState
): Promise<string> => {
    // Determine AI Config: Priority: Char Override > Global Behavior/Judge
    // Observations are essentially "actions" or "reactions" so Behavior is appropriate if overridden
    const finalConfig = (char.useAiOverride && char.aiConfig?.provider)
        ? char.aiConfig
        : (fullGameState?.judgeConfig || DEFAULT_AI_CONFIG);

    const client = createClient(finalConfig, appSettings.apiKeys);

    // Initialize Image Context Builder
    const imageBuilder = new ImageContextBuilder();

    // Determine Memory Rounds
    const isEnv = char.id.startsWith('env_');
    let capacity = appSettings.maxCharacterMemoryRounds;
    if (char.memoryConfig?.useOverride) {
        capacity = char.memoryConfig.maxMemoryRounds;
    } else if (isEnv) {
        capacity = appSettings.maxEnvMemoryRounds ?? 5;
    }

    // Filtered Pools, Memory and Conflicts
    const locationId = fullGameState?.map.charPositions[char.id]?.locationId;
    const memoryStr = getCharacterMemory(
        history, 
        char.id, 
        locationId, 
        capacity, 
        imageBuilder, 
        appSettings.maxInputTokens,
        fullGameState?.characters, // Pass maps
        fullGameState?.map.locations
    );
    
    let regionConflicts = "(无区域数据)";
    if (fullGameState) {
        const regionId = locationId ? fullGameState.map.locations[locationId]?.regionId : undefined;
        regionConflicts = formatRegionConflicts(
            locationId,
            regionId,
            fullGameState.characters,
            fullGameState.map.locations,
            fullGameState.map.charPositions
        );
    }

    const worldGuidance = fullGameState?.world?.worldGuidance || "";

    const prompt = fillPrompt(defaultSettings.prompts.observation, {
        QUERY: query,
        SPECIFIC_CONTEXT: formatCharacterPersona(char, imageBuilder),
        LOCATION_CONTEXT: formatLocationInfo(currentLocation, imageBuilder),
        NEARBY_CONTEXT: nearbyContext || "未知",
        OTHERS_CONTEXT: formatOtherCharacters(char.id, otherChars, locationId, cardPool, imageBuilder),
        HISTORY_CONTEXT: memoryStr,
        WORLD_STATE: JSON.stringify(filterWorldAttributes(worldAttributes), null, 2),
        REGION_CONFLICT: regionConflicts,
        WORLD_GUIDANCE: worldGuidance
    }, appSettings);

    const promptParts = parsePromptStructure(prompt, (t) => imageBuilder.interleave(t));
    const messages = buildContextMessages(globalContextConfig, finalConfig.contextConfig, char.contextConfig, promptParts, appSettings);

    const requestId = `obs_${char.id}_${Date.now()}`;
    
    try {
        dispatchAIStatus(requestId, 'blue'); // Visualizer Start (Processing)
        
        // No JSON Mode enforcement, we want pure text
        const result = await client.models.generateContent({
            model: finalConfig.model || DEFAULT_AI_CONFIG.model!,
            contents: messages,
            config: { maxOutputTokens: appSettings.maxOutputTokens }
        });

        if (onDebug) {
            onDebug({
                id: `debug_obs_${char.name}_${Date.now()}`,
                timestamp: Date.now(),
                characterName: "System (Observation)",
                prompt: JSON.stringify(messages, null, 2),
                response: result.text
            });
        }
        dispatchAIStatus(requestId, 'green'); // Visualizer Success
        return result.text;
    } catch (e: any) {
        dispatchAIStatus(requestId, 'gray'); // Visualizer Fail
        if (onDebug) {
             onDebug({
                id: `debug_obs_fail_${char.name}_${Date.now()}`,
                timestamp: Date.now(),
                characterName: "System (Observation Failed)",
                prompt: JSON.stringify(messages, null, 2),
                response: `Error: ${e.message}`
            });
        }
        throw e;
    }
};

export const generateUnveil = async (
    config: AIConfig,
    history: LogEntry[],
    selectedLogs: string,
    targetCharsContext: string,
    appSettings: AppSettings,
    defaultSettings: DefaultSettings,
    globalContextConfig: any,
    onDebug?: (log: DebugLog) => void,
    playerIntent?: string, // New Optional Param
    fullGameState?: GameState
): Promise<{ results: Array<{ charId: string, unveilText: string }> } | null> => {
    const finalConfig = config.provider ? config : DEFAULT_AI_CONFIG;
    const client = createClient(finalConfig, appSettings.apiKeys);

    const imageBuilder = new ImageContextBuilder();

    // Short global history for context
    const currentRound = history.length > 0 ? history[history.length - 1].round : 1;
    // Inject images
    const shortHistory = getGlobalMemory(history, currentRound, 5, appSettings.maxInputTokens, imageBuilder);

    const worldGuidance = fullGameState?.world?.worldGuidance || "";

    let prompt = fillPrompt(defaultSettings.prompts.generateUnveil, {
        SHORT_HISTORY: shortHistory,
        SELECTED_LOGS: selectedLogs,
        TARGET_CHARS: targetCharsContext,
        WORLD_GUIDANCE: worldGuidance
    }, appSettings);

    // Append Player Intent if present, and process it for global variables
    if (playerIntent && playerIntent.trim()) {
        const processedIntent = replaceGlobalVariables(playerIntent, appSettings);
        prompt += `\n\n[玩家指定的揭露方向 / Player Specific Request]\n${processedIntent}`;
    }

    const promptParts = parsePromptStructure(prompt, (t) => imageBuilder.interleave(t));

    const messages = buildContextMessages(globalContextConfig, finalConfig.contextConfig, undefined, promptParts, appSettings);

    const result = await robustGenerate<{ results: Array<{ charId: string, unveilText: string }> }>(
        () => client.models.generateContent({
            model: finalConfig.model || DEFAULT_AI_CONFIG.model!,
            contents: messages,
            config: { 
                responseMimeType: supportsJsonMode(finalConfig.provider) ? 'application/json' : undefined,
                maxOutputTokens: appSettings.maxOutputTokens
            }
        }),
        (json) => json && Array.isArray(json.results),
        3,
        (error, rawResponse) => {
            // Failure Callback
            if (onDebug) {
                onDebug({
                    id: `debug_unveil_fail_${Date.now()}`,
                    timestamp: Date.now(),
                    characterName: "System (Unveil Failed)",
                    prompt: JSON.stringify(messages, null, 2),
                    response: `Error: ${error.message}\n\nRaw Response:\n${rawResponse || "(No Response)"}`
                });
            }
        }
    );

    if (onDebug && result) {
        onDebug({
            id: `debug_unveil_${Date.now()}`,
            timestamp: Date.now(),
            characterName: "System (Unveil)",
            prompt: JSON.stringify(messages, null, 2),
            response: JSON.stringify(result, null, 2)
        });
    }

    return result;
};

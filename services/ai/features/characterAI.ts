
import { AIConfig, AppSettings, DefaultSettings, LogEntry, GameState, Trigger, DebugLog, GameImage } from "../../../types";
import { createClient, robustGenerate, supportsJsonMode } from "../core";
import { buildContextMessages, fillPrompt, parsePromptStructure } from "../promptUtils";
import { getGlobalMemory } from "../memoryUtils";
import { evaluateTriggers } from "../../triggerService";
import { formatRegionConflicts, formatLocationInfo } from "../../contextUtils";
import { DEFAULT_AI_CONFIG } from "../../../config";
import { ImageContextBuilder } from "../ImageContextBuilder";

export const generateCharacter = async (
    config: AIConfig,
    desc: string,
    style: string,
    locationName: string,
    regionName: string,
    existingChars: string,
    history: LogEntry[],
    appSettings: AppSettings,
    defaultSettings: DefaultSettings,
    globalContextConfig: any,
    worldGuidance?: string, 
    suggestedNames: string[] = [],
    fullGameState?: GameState,
    onLog?: (msg: string) => void,
    onTriggerUpdate?: (id: string, updates: Partial<Trigger>) => void,
    onDebug?: (log: DebugLog) => void,
    appearanceImages?: GameImage[],
    settingImages?: GameImage[]
): Promise<any> => {
    const finalConfig = config.provider ? config : DEFAULT_AI_CONFIG;
    const client = createClient(finalConfig, appSettings.apiKeys);

    // Initialize Image Builder for multimodal context
    const imageBuilder = new ImageContextBuilder();

    const currentRound = history.length > 0 ? history[history.length - 1].round : 1;
    // Pass imageBuilder to capture scene images
    const historyStr = getGlobalMemory(history, currentRound, 10, appSettings.maxInputTokens, imageBuilder);

    // Context Preparation
    let regionConflicts = "(无区域数据)";
    let locationContextStr = `位于 ${locationName}`;

    if (fullGameState) {
        const activeLocId = fullGameState.map.activeLocationId;
        const regionId = activeLocId ? fullGameState.map.locations[activeLocId]?.regionId : undefined;
        
        regionConflicts = formatRegionConflicts(
            activeLocId, 
            regionId, 
            fullGameState.characters, 
            fullGameState.map.locations, 
            fullGameState.map.charPositions
        );

        // Resolve rich location context (Description etc.)
        let targetLoc = activeLocId ? fullGameState.map.locations[activeLocId] : undefined;
        // If active location name doesn't match requested name, search for it
        if (targetLoc?.name !== locationName) {
            targetLoc = Object.values(fullGameState.map.locations).find(l => l.name === locationName);
        }
        if (targetLoc) {
            locationContextStr = formatLocationInfo(targetLoc, imageBuilder);
        }
    }

    // Register provided images
    const appearanceRefStr = imageBuilder.registerList(appearanceImages, "外观参考图");
    const settingRefStr = imageBuilder.registerList(settingImages, "设定参考图");

    let prompt = fillPrompt(defaultSettings.prompts.generateCharacter, {
        DESC: desc + appearanceRefStr + settingRefStr,
        STYLE: style,
        LOCATION_NAME: locationName,
        REGION_NAME: regionName,
        LOCATION_CONTEXT: locationContextStr,
        EXISTING_CHARS: existingChars || "无",
        SHORT_HISTORY: historyStr,
        SUGGESTED_NAMES: suggestedNames.join(", "),
        CHAR_TEMPLATE: JSON.stringify(defaultSettings.templates.character, null, 2),
        REGION_CONFLICT: regionConflicts,
        WORLD_GUIDANCE: worldGuidance || ""
    }, appSettings);

    if (fullGameState) {
        const { promptSuffix, logs } = evaluateTriggers(fullGameState, 'generateCharacter', onTriggerUpdate);
        prompt += promptSuffix;
        if (logs.length > 0 && onLog) logs.forEach(onLog);
    }

    const promptParts = parsePromptStructure(prompt, (t) => imageBuilder.interleave(t));

    const messages = buildContextMessages(globalContextConfig, finalConfig.contextConfig, undefined, promptParts, appSettings);

    const result = await robustGenerate(
        () => client.models.generateContent({
            model: finalConfig.model || DEFAULT_AI_CONFIG.model!,
            contents: messages,
            // Optimization: Enable JSON mode for compatible providers
            config: { 
                responseMimeType: supportsJsonMode(finalConfig.provider) ? 'application/json' : undefined,
                maxOutputTokens: appSettings.maxOutputTokens
            }
        }),
        (json) => json && (json.name || json.description),
        3,
        (error, rawResponse) => {
            // Failure Callback
            if (onDebug) {
                onDebug({
                    id: `debug_char_gen_fail_${Date.now()}`,
                    timestamp: Date.now(),
                    characterName: "System (Char Gen Failed)",
                    prompt: JSON.stringify(messages, null, 2),
                    response: `Error: ${error.message}\n\nRaw Response:\n${rawResponse || "(No Response)"}`
                });
            }
        }
    );

    if (onDebug && result) {
        onDebug({
            id: `debug_char_gen_${Date.now()}`,
            timestamp: Date.now(),
            characterName: "System (Char Gen)",
            prompt: JSON.stringify(messages, null, 2),
            response: JSON.stringify(result, null, 2)
        });
    }

    return result;
};

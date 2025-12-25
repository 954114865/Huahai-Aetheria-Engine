
import { AIConfig, AppSettings, Character, GameState, LetterTemplate, DebugLog, GameAttribute, MapLocation, MapRegion, GameImage } from "../../../types";
import { createClient, robustGenerate, supportsJsonMode } from "../core";
import { buildContextMessages, fillPrompt, replaceGlobalVariables } from "../promptUtils";
import { getCharacterMemory } from "../memoryUtils";
import { formatCharacterPersona, formatLocationInfo, formatSelfDetailed, filterWorldAttributes } from "../../contextUtils";
import { DEFAULT_AI_CONFIG } from "../../../config";
import { ImageContextBuilder } from "../ImageContextBuilder";

export const generateLetter = async (
    char: Character,
    template: LetterTemplate,
    userRequest: string,
    gameState: GameState,
    onDebug?: (log: DebugLog) => void,
    attachedImages?: GameImage[]
): Promise<any> => {
    // Determine AI Config: Priority: Char Override > Global Behavior > Global Judge
    const finalConfig = (char.useAiOverride && char.aiConfig?.provider)
        ? char.aiConfig 
        : (gameState.charBehaviorConfig || gameState.judgeConfig || DEFAULT_AI_CONFIG);
        
    const client = createClient(finalConfig, gameState.appSettings.apiKeys);

    // Initialize Image Context Builder
    const imageBuilder = new ImageContextBuilder();

    // Register User Attached Images
    const userRequestWithImages = imageBuilder.registerAndAppend(userRequest, attachedImages, "附图");

    // Context Preparation
    const history = gameState.world.history;
    const worldAttributes = gameState.world.attributes;
    const locationId = gameState.map.charPositions[char.id]?.locationId;
    let currentLocation: MapLocation | undefined;
    if (locationId) currentLocation = gameState.map.locations[locationId];

    // Determine Memory Rounds
    const isEnv = char.id.startsWith('env_');
    let capacity = gameState.appSettings.maxCharacterMemoryRounds;
    if (char.memoryConfig?.useOverride) {
        capacity = char.memoryConfig.maxMemoryRounds;
    } else if (isEnv) {
        capacity = gameState.appSettings.maxEnvMemoryRounds ?? 5;
    }

    const memoryStr = getCharacterMemory(
        history, 
        char.id, 
        locationId, 
        capacity, 
        imageBuilder, 
        gameState.appSettings.maxInputTokens,
        gameState.characters, // Pass Maps
        gameState.map.locations
    ); 
    
    // Nearby Context
    const nearbyKnown: string[] = [];
    if (currentLocation) {
         Object.values(gameState.map.locations).forEach(l => {
             if (l.id === currentLocation?.id) return;
             const dist = Math.sqrt((l.coordinates.x - currentLocation!.coordinates.x)**2 + (l.coordinates.y - currentLocation!.coordinates.y)**2);
             if (dist <= 1000 && l.isKnown) {
                 const regionName = (l.regionId && gameState.map.regions[l.regionId]) ? gameState.map.regions[l.regionId].name : "未知区域";
                 nearbyKnown.push(`${l.name}(${regionName})`);
             }
         });
    }
    const nearbyContext = nearbyKnown.length > 0 ? nearbyKnown.join(", ") : "无";

    // Construct JSON Structure Example based on Template
    const structureExample: Record<string, any> = {
        "语言":"中文",
        intro: "（可选）在此处写一些寒暄或回复的话（纯文本，非表格内容）"
    };
    template.paragraphs.forEach(p => {
        const fragObj: Record<string, string> = {};
        p.fragments.forEach(f => {
            fragObj[f.key] = `(${f.label}的内容)`;
        });
        structureExample[p.key] = fragObj;
    });

    // Use prompt from settings
    const promptTemplate = gameState.defaultSettings.prompts.generateLetter;
    const worldGuidance = gameState.world.worldGuidance || "";

    const prompt = fillPrompt(promptTemplate, {
        CHAR_NAME: char.name,
        WORLD_STATE: JSON.stringify(filterWorldAttributes(worldAttributes), null, 2),
        LOCATION_CONTEXT: formatLocationInfo(currentLocation, imageBuilder),
        NEARBY_CONTEXT: nearbyContext,
        SPECIFIC_CONTEXT: formatCharacterPersona(char, imageBuilder),
        SELF_CONTEXT: formatSelfDetailed(char, gameState.cardPool, locationId, imageBuilder),
        HISTORY_CONTEXT: memoryStr,
        USER_REQUEST: userRequestWithImages,
        JSON_STRUCTURE_EXAMPLE: JSON.stringify(structureExample, null, 2),
        WORLD_GUIDANCE: worldGuidance,
        SPEECH_STYLE: char.style || "（未定义风格）"
    }, gameState.appSettings);

    // Append user's template specific prompt instructions if any, and process them for global variables
    let finalPrompt = prompt;
    if (template.prompt) {
        const processedTemplatePrompt = replaceGlobalVariables(template.prompt, gameState.appSettings);
        finalPrompt += `\n\n[额外指示]\n${processedTemplatePrompt}`;
    }

    const promptParts = imageBuilder.interleave(finalPrompt);

    const messages = buildContextMessages(gameState.globalContext, finalConfig.contextConfig, char.contextConfig, promptParts, gameState.appSettings);

    const result = await robustGenerate<any>(
        () => client.models.generateContent({
            model: finalConfig.model || DEFAULT_AI_CONFIG.model!,
            contents: messages,
            config: { 
                responseMimeType: supportsJsonMode(finalConfig.provider) ? 'application/json' : undefined,
                maxOutputTokens: gameState.appSettings.maxOutputTokens
            }
        }),
        (json) => {
            // Validator: Check if it has at least one key from the template paragraphs OR an intro
            return template.paragraphs.some(p => json[p.key]) || json.intro;
        },
        3,
        (error, rawResponse) => {
            // Failure Callback
            if (onDebug) {
                onDebug({
                    id: `debug_mail_fail_${char.name}_${Date.now()}`,
                    timestamp: Date.now(),
                    characterName: `Mail System (${char.name}) Failed`,
                    prompt: JSON.stringify(messages, null, 2),
                    response: `Error: ${error.message}\n\nRaw Response:\n${rawResponse || "(No Response)"}`
                });
            }
        }
    );

    if (onDebug && result) {
        onDebug({
            id: `debug_mail_${char.name}_${Date.now()}`,
            timestamp: Date.now(),
            characterName: `Mail System (${char.name})`,
            prompt: JSON.stringify(messages, null, 2),
            response: JSON.stringify(result, null, 2)
        });
    }

    return result;
};

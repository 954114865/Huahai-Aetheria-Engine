
import { AIConfig, Character, LogEntry, GameAttribute, Card, MapLocation, MapRegion, PrizePool, TurnAction, AppSettings, DefaultSettings, GameState, Trigger, DebugLog } from "../../../types";
import { createClient, robustGenerate, supportsJsonMode, dispatchAIStatus } from "../core";
import { buildContextMessages, fillPrompt, getPleasureInstruction, parsePromptStructure } from "../promptUtils";
import { getCharacterMemory } from "../memoryUtils";
import { evaluateTriggers } from "../../triggerService";
import { DEFAULT_AI_CONFIG } from "../../../config";
import { 
    formatCharacterPersona, formatLocationInfo, formatKnownRegions, 
    formatOtherCharacters, formatSelfDetailed, formatPrizePools,
    filterWorldAttributes, formatRegionConflicts
} from "../../contextUtils";
import { ImageContextBuilder } from "../ImageContextBuilder";
import { getNaturalTimeDelta } from "../../timeUtils";

// Helper to extract JSON-like string content from partial stream buffer
// Matches "narrative": "..." or "speech": "..." even if broken
const extractStreamContent = (buffer: string, key: 'narrative' | 'speech'): string => {
    // Regex explanation:
    // Match "key": "
    // Capture content until:
    // 1. Unescaped quote (") -> End of string
    // 2. End of buffer ($) -> Stream incomplete
    // Non-greedy capture via [^"\\]* with escape handling is complex in partial state.
    // Simpler approach for stream: Match from start quote until we hit an unescaped quote OR EOF.
    
    // Find key start position
    const keyRegex = new RegExp(`"${key}"\\s*:\\s*"`);
    const match = keyRegex.exec(buffer);
    if (!match) return "";
    
    const startIdx = match.index + match[0].length;
    let content = "";
    let isEscaped = false;
    
    for (let i = startIdx; i < buffer.length; i++) {
        const char = buffer[i];
        if (isEscaped) {
            content += char;
            isEscaped = false;
        } else {
            if (char === '\\') {
                isEscaped = true;
            } else if (char === '"') {
                // End of string found
                break;
            } else {
                content += char;
            }
        }
    }
    
    // Basic cleanup of JSON escapes for display (e.g. \n -> newline)
    return content.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
};

// --- NEW HELPER: Calculate Last Present Time ---
const calculateLastPresentTime = (charId: string, history: LogEntry[], currentWorldTimeStr: string): string => {
    let actionIndex = -1;
    
    // 1. Find last action index (Reverse search)
    // We look for where the character ACTED or REACTED (actingCharId matches)
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].actingCharId === charId) {
            actionIndex = i;
            break;
        }
    }

    // If character never acted, assume "First Appearance" logic
    if (actionIndex === -1) return "很长时间";

    let foundTimeStr = "";
    
    // Regex: Robustly find the time pattern "YYYY年MM月DD日..."
    // We do NOT rely on the comma separator or "当前故事时间：" label prefix strictly capturing the group.
    // Instead, we scan the whole line for a valid date string.
    // Matches: 2077年1月1日 or 2077年01月01日08时00分
    const timeRegex = /(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日(?:\s*\d{1,2}\s*时\s*\d{1,2}\s*分)?)/;

    // 2. Strategy A: Find SUBSEQUENT world time log (Forward search from actionIndex)
    // This represents time *after* action completed.
    for (let i = actionIndex; i < history.length; i++) {
         const match = history[i].content.match(timeRegex);
         if (match) {
             foundTimeStr = match[1];
             break;
         }
    }

    // 3. Strategy B: If no subsequent log, Find PRECEDING world time log (Backward search)
    // This represents time *before* action started. Approximate "action time" to this.
    if (!foundTimeStr) {
        for (let i = actionIndex; i >= 0; i--) {
             const match = history[i].content.match(timeRegex);
             if (match) {
                 foundTimeStr = match[1];
                 break;
             }
        }
    }

    // If still no time log found, assume "Just now" (Start of world)
    if (!foundTimeStr) return "片刻";

    return getNaturalTimeDelta(currentWorldTimeStr, foundTimeStr);
};

export const determineCharacterAction = async (
    char: Character,
    history: LogEntry[],
    worldAttributes: Record<string, GameAttribute>,
    otherChars: Character[],
    globalContextConfig: any,
    cardPool: Card[],
    appSettings: AppSettings,
    defaultSettings: DefaultSettings,
    worldGuidance?: string,
    currentLocation?: MapLocation,
    nearbyContext?: string,
    knownRegions?: Record<string, MapRegion>,
    prizePools?: Record<string, PrizePool>,
    allLocations?: Record<string, MapLocation>,
    onDebug?: (log: DebugLog) => void,
    fullGameState?: GameState,
    onLog?: (msg: string) => void,
    onTriggerUpdate?: (id: string, updates: Partial<Trigger>) => void,
    onStream?: (text: string) => void // New Streaming Callback
): Promise<TurnAction> => {
    // Priority: Char Override > Global Behavior Config > Global Judge Config > Default
    // Use Override Flag
    const finalConfig = (char.useAiOverride && char.aiConfig?.provider)
        ? char.aiConfig 
        : (fullGameState?.charBehaviorConfig || fullGameState?.judgeConfig || DEFAULT_AI_CONFIG);
        
    const client = createClient(finalConfig, appSettings.apiKeys);

    // Initialize Image Context Builder
    const imageBuilder = new ImageContextBuilder();

    // Filter pools at current location
    const locationId = fullGameState?.map.charPositions[char.id]?.locationId;
    const poolsStr = formatPrizePools(prizePools, locationId, allLocations);

    // --- Action Memory Logic (Updated for Overrides & Env) ---
    const isEnv = char.id.startsWith('env_');
    
    // 1. Determine Capacity
    let capacity = appSettings.maxCharacterMemoryRounds;
    if (char.memoryConfig?.useOverride) {
        capacity = char.memoryConfig.maxMemoryRounds;
    } else if (isEnv) {
        capacity = appSettings.maxEnvMemoryRounds ?? 5; // Default 5 for env if setting missing
    }

    // 2. Determine Dropout Rate
    const dropoutProb = char.memoryConfig?.useOverride 
        ? (char.memoryConfig.actionDropoutProbability ?? 0.34)
        : (appSettings.actionMemoryDropoutProbability ?? 0.34);

    let effectiveMemoryRounds = capacity;
    
    // 3. Apply Dropout
    if (Math.random() < dropoutProb) {
        effectiveMemoryRounds = 4; // Force short memory (4 rounds) for Action
        if (onDebug) {
            onDebug({
                id: `debug_dropout_act_${char.name}_${Date.now()}`,
                timestamp: Date.now(),
                characterName: "System (Action Dropout)",
                prompt: "Action Memory Dropout Triggered",
                response: `Memory reduced from ${capacity} to ${effectiveMemoryRounds} rounds to prevent repetition loop.`
            });
        }
    }
    // -----------------------------------

    // Get Filtered Character Memory
    const memoryStr = getCharacterMemory(
        history, 
        char.id, 
        locationId, 
        effectiveMemoryRounds, // Use effective rounds
        imageBuilder, 
        appSettings.maxInputTokens,
        fullGameState?.characters, // Pass Chars Map
        fullGameState?.map.locations // Pass Locs Map
    );

    // Calculate Pleasure Instruction
    const pleasureInstruction = getPleasureInstruction(char);

    // Calculate Region Conflicts
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
    
    // Calculate Time Span
    const currentTimeStr = String(worldAttributes['worldTime']?.value || "2077:01:01:00:00:00");
    const lastPresentTime = calculateLastPresentTime(char.id, history, currentTimeStr);

    let prompt = fillPrompt(defaultSettings.prompts.determineCharacterAction, {
        WORLD_STATE: JSON.stringify(filterWorldAttributes(worldAttributes), null, 2),
        SELF_CONTEXT: formatSelfDetailed(char, cardPool, locationId, imageBuilder),
        LOCATION_CONTEXT: formatLocationInfo(currentLocation, imageBuilder),
        KNOWN_REGIONS: formatKnownRegions(knownRegions),
        NEARBY_CONTEXT: nearbyContext || "未知",
        OTHERS_CONTEXT: formatOtherCharacters(char.id, otherChars, locationId, cardPool, imageBuilder),
        HISTORY_CONTEXT: memoryStr,
        SPECIFIC_CONTEXT: formatCharacterPersona(char, imageBuilder),
        SHOP_CONTEXT: "（此处可列出商店物品，暂略）", 
        PRIZE_POOLS: poolsStr,
        COST: String(defaultSettings.gameplay.defaultCreationCost),
        PLEASURE_GOAL: pleasureInstruction,
        REGION_CONFLICT: regionConflicts,
        WORLD_GUIDANCE: worldGuidance || "",
        SPEECH_STYLE: char.style || "（未定义风格）",
        LAST_PRESENT_TIME: lastPresentTime // Inject Time Span
    }, appSettings);

    if (fullGameState) {
        const { promptSuffix, logs } = evaluateTriggers(fullGameState, 'determineCharacterAction', onTriggerUpdate, char.id);
        prompt += promptSuffix;
        if (logs.length > 0 && onLog) logs.forEach(onLog);
    }

    // Use Parser to handle <user>/<assistant> tags and interleave images via callback
    const promptMessages = parsePromptStructure(prompt, (t) => imageBuilder.interleave(t));

    const messages = buildContextMessages(globalContextConfig, finalConfig.contextConfig, char.contextConfig, promptMessages, appSettings);
    
    // Create Request ID for Visualizer
    const requestId = `act_${char.id}_${Date.now()}`;

    const genConfig = {
        responseMimeType: supportsJsonMode(finalConfig.provider) ? 'application/json' : undefined,
        maxOutputTokens: appSettings.maxOutputTokens
    };

    // STREAMING LOGIC
    if (appSettings.enableStreaming !== false && client.models.generateContentStream && onStream) {
        try {
            dispatchAIStatus(requestId, 'blue'); // Visualizer Start (Processing)

            const stream = await client.models.generateContentStream({
                model: finalConfig.model || DEFAULT_AI_CONFIG.model!,
                contents: messages,
                config: genConfig
            });

            let fullBuffer = "";
            let currentNarrative = "";
            let currentSpeech = "";

            for await (const chunk of stream) {
                if (chunk.text) {
                    fullBuffer += chunk.text;
                    
                    // Attempt extraction
                    const newNarrative = extractStreamContent(fullBuffer, 'narrative');
                    const newSpeech = extractStreamContent(fullBuffer, 'speech');
                    
                    if (newNarrative !== currentNarrative || newSpeech !== currentSpeech) {
                        currentNarrative = newNarrative;
                        currentSpeech = newSpeech;
                        
                        let display = "";
                        if (currentNarrative) display += `<span class="italic">* ${currentNarrative} *</span>`;
                        // Remove quotes around speech
                        if (currentSpeech) display += (display ? "<br/>" : "") + `${currentSpeech}`;
                        
                        onStream(display);
                    }
                }
            }

            // Stream finished, parse final JSON
            let cleanText = fullBuffer.replace(/```json/g, '').replace(/```/g, '').trim();
            const json = JSON.parse(cleanText);

            if (onDebug) {
                onDebug({
                    id: `debug_act_stream_${char.name}_${Date.now()}`,
                    timestamp: Date.now(),
                    characterName: char.name,
                    prompt: JSON.stringify(messages, null, 2),
                    response: fullBuffer
                });
            }

            dispatchAIStatus(requestId, 'green'); // Visualizer Success
            return json as TurnAction;

        } catch (e: any) {
            console.warn("Stream/Parse failed, falling back or returning partial state:", e);
            dispatchAIStatus(requestId, 'gray'); // Visualizer Fail
            
            // If we have some content, try to salvage it manually into a TurnAction
            return { narrative: "", speech: "", commands: [] };
        }
    }

    // FALLBACK TO NON-STREAMING
    const result = await robustGenerate<TurnAction>(
        () => client.models.generateContent({
            model: finalConfig.model || DEFAULT_AI_CONFIG.model!,
            contents: messages,
            config: genConfig
        }),
        (json) => json && (json.narrative || json.speech || json.commands),
        3,
        (error, rawResponse) => {
            // Failure Callback
            if (onDebug) {
                onDebug({
                    id: `debug_act_fail_${char.name}_${Date.now()}`,
                    timestamp: Date.now(),
                    characterName: `${char.name} (Failed)`,
                    prompt: JSON.stringify(messages, null, 2),
                    response: `Error: ${error.message}\n\nRaw Response:\n${rawResponse || "(No Response)"}`
                });
            }
        }
    );

    if (onDebug && result) {
        onDebug({
            id: `debug_act_${char.name}_${Date.now()}`,
            timestamp: Date.now(),
            characterName: char.name,
            prompt: JSON.stringify(messages, null, 2),
            response: JSON.stringify(result, null, 2)
        });
    }

    return result || { narrative: "...", commands: [] };
};

export const determineCharacterReaction = async (
    char: Character,
    triggerEvent: string,
    appSettings: AppSettings,
    defaultSettings: DefaultSettings,
    worldAttributes: Record<string, GameAttribute>,
    history: LogEntry[],
    locationId: string | undefined,
    memoryRounds: number,
    onDebug?: (log: DebugLog) => void,
    otherChars?: Character[],
    cardPool?: Card[],
    globalContextConfig?: any,
    fullGameState?: GameState,
    onLog?: (msg: string) => void,
    onTriggerUpdate?: (id: string, updates: Partial<Trigger>) => void,
    onStream?: (text: string) => void // New Streaming Callback
): Promise<string> => {
    // Priority: Char Override > Global Behavior Config > Global Judge Config > Default
    const finalConfig = (char.useAiOverride && char.aiConfig?.provider)
        ? char.aiConfig 
        : (fullGameState?.charBehaviorConfig || fullGameState?.judgeConfig || DEFAULT_AI_CONFIG);
        
    const client = createClient(finalConfig, appSettings.apiKeys);

    // Initialize Image Context Builder
    const imageBuilder = new ImageContextBuilder();

    // --- Reaction Memory Logic (Updated for Overrides & Env) ---
    const isEnv = char.id.startsWith('env_');
    
    // 1. Determine Capacity
    let capacity = memoryRounds; // Default passed in (usually from appSettings)
    if (char.memoryConfig?.useOverride) {
        capacity = char.memoryConfig.maxMemoryRounds;
    } else if (isEnv) {
        capacity = appSettings.maxEnvMemoryRounds ?? 5;
    }

    // 2. Determine Dropout Rate
    const dropoutProb = char.memoryConfig?.useOverride 
        ? (char.memoryConfig.reactionDropoutProbability ?? 0.34)
        : (appSettings.reactionMemoryDropoutProbability ?? 0.34);
    
    let effectiveMemoryRounds = capacity;

    // 3. Apply Dropout
    if (Math.random() < dropoutProb) {
        effectiveMemoryRounds = 2; // Force short memory (2 rounds) for Reaction
        if (onDebug) {
            onDebug({
                id: `debug_dropout_react_${char.name}_${Date.now()}`,
                timestamp: Date.now(),
                characterName: "System (Reaction Dropout)",
                prompt: "Reaction Memory Dropout Triggered",
                response: `Memory reduced from ${capacity} to ${effectiveMemoryRounds} rounds to prevent repetition.`
            });
        }
    }
    // ----------------------------

    const memoryStr = getCharacterMemory(
        history, 
        char.id, 
        locationId, 
        effectiveMemoryRounds, // Use effective rounds
        imageBuilder, 
        appSettings.maxInputTokens,
        fullGameState?.characters, // Pass Maps
        fullGameState?.map.locations
    );
    const othersStr = otherChars ? formatOtherCharacters(char.id, otherChars, locationId, cardPool, imageBuilder) : "无";
    
    // Calculate Pleasure Instruction
    const pleasureInstruction = getPleasureInstruction(char);

    // Inject Images for Reaction Trigger if available in the last log
    let enhancedTriggerEvent = triggerEvent;
    const lastLog = history[history.length - 1];
    if (lastLog && lastLog.images && lastLog.images.length > 0) {
         // If trigger event matches last log, append images inline
         if (triggerEvent.includes(lastLog.content) || lastLog.content.includes(triggerEvent)) {
             enhancedTriggerEvent = imageBuilder.registerAndAppend(enhancedTriggerEvent, lastLog.images, "附件");
         }
    }
    
    // Extract Guidance
    const worldGuidance = fullGameState?.world?.worldGuidance || "";

    // Calculate Time Span
    const currentTimeStr = String(worldAttributes['worldTime']?.value || "2077:01:01:00:00:00");
    const lastPresentTime = calculateLastPresentTime(char.id, history, currentTimeStr);

    let prompt = fillPrompt(defaultSettings.prompts.determineCharacterReaction, {
        CHAR_NAME: char.name,
        CHAR_ID: char.id,
        CHAR_DESC: char.description,
        SPECIFIC_CONTEXT: formatCharacterPersona(char, imageBuilder),
        PLEASURE_GOAL: pleasureInstruction,
        WORLD_STATE: JSON.stringify(filterWorldAttributes(worldAttributes), null, 2),
        OTHERS_CONTEXT: othersStr,
        RECENT_HISTORY: memoryStr, // Use filtered memory with images
        TRIGGER_EVENT: enhancedTriggerEvent,
        WORLD_GUIDANCE: worldGuidance,
        SPEECH_STYLE: char.style || "（未定义风格）",
        LAST_PRESENT_TIME: lastPresentTime // Inject Time Span
    }, appSettings);

    if (fullGameState) {
        const { promptSuffix, logs } = evaluateTriggers(fullGameState, 'determineCharacterReaction', onTriggerUpdate, char.id);
        prompt += promptSuffix;
        if (logs.length > 0 && onLog) logs.forEach(onLog);
    }

    // Use Parser for reaction as well
    const promptMessages = parsePromptStructure(prompt, (t) => imageBuilder.interleave(t));

    const messages = buildContextMessages(globalContextConfig || { messages: [] }, finalConfig.contextConfig, char.contextConfig, promptMessages, appSettings);

    // Create Request ID for Visualizer
    const requestId = `react_${char.id}_${Date.now()}`;

    const genConfig = {
        responseMimeType: supportsJsonMode(finalConfig.provider) ? 'application/json' : undefined,
        maxOutputTokens: appSettings.maxOutputTokens
    };

    // STREAMING LOGIC
    if (appSettings.enableStreaming !== false && client.models.generateContentStream && onStream) {
        try {
            dispatchAIStatus(requestId, 'blue'); // Visualizer Start (Processing)

            const stream = await client.models.generateContentStream({
                model: finalConfig.model || DEFAULT_AI_CONFIG.model!,
                contents: messages,
                config: genConfig
            });

            let fullBuffer = "";
            let currentSpeech = "";

            for await (const chunk of stream) {
                if (chunk.text) {
                    fullBuffer += chunk.text;
                    const newSpeech = extractStreamContent(fullBuffer, 'speech');
                    if (newSpeech !== currentSpeech) {
                        currentSpeech = newSpeech;
                        // Remove quotes around speech
                        onStream(`${currentSpeech}`);
                    }
                }
            }

            let cleanText = fullBuffer.replace(/```json/g, '').replace(/```/g, '').trim();
            const json = JSON.parse(cleanText);

            if (onDebug) {
                onDebug({
                    id: `debug_react_stream_${char.name}_${Date.now()}`,
                    timestamp: Date.now(),
                    characterName: char.name,
                    prompt: JSON.stringify(messages, null, 2),
                    response: fullBuffer
                });
            }

            dispatchAIStatus(requestId, 'green'); // Visualizer Success
            return json.speech || "";

        } catch (e: any) {
            console.warn("Reaction Stream/Parse failed:", e);
            dispatchAIStatus(requestId, 'gray'); // Visualizer Fail
            // Return what we got or empty string
            return extractStreamContent(e.message || "", 'speech');
        }
    }

    const result = await robustGenerate<{ speech: string }>(
        () => client.models.generateContent({
            model: finalConfig.model || DEFAULT_AI_CONFIG.model!,
            contents: messages,
            config: genConfig
        }),
        (json) => json && json.speech,
        2,
        (error, rawResponse) => {
            // Failure Callback
            if (onDebug) {
                onDebug({
                    id: `debug_react_fail_${char.name}_${Date.now()}`,
                    timestamp: Date.now(),
                    characterName: `${char.name} (Failed)`,
                    prompt: JSON.stringify(messages, null, 2),
                    response: `Error: ${error.message}\n\nRaw Response:\n${rawResponse || "(No Response)"}`
                });
            }
        }
    );

    if (onDebug && result) {
        onDebug({
            id: `debug_react_${char.name}_${Date.now()}`,
            timestamp: Date.now(),
            characterName: char.name,
            prompt: JSON.stringify(messages, null, 2),
            response: JSON.stringify(result, null, 2)
        });
    }

    return result ? result.speech : "";
};

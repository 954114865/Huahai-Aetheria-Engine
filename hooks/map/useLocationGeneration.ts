
import { MutableRefObject } from 'react';
import { GameState, MapLocation, MapRegion, AttributeVisibility, Card, PrizeItem, PrizePool, DebugLog, Trigger, Character, GameImage, GameAttribute, AttributeType } from '../../types';
import { generateRegion, analyzeRegionStats, analyzeTerrainAround, createEnvironmentCharacter, isPointInPolygon, checkMapExpansion } from '../../services/mapUtils';
import { generateLocationDetails, normalizeCard, generateCharacter } from '../../services/aiService';
import { getRandomChineseNames } from '../../services/nameService';
import { DEFAULT_AI_CONFIG } from '../../config';
import { generateRandomFlagAvatar } from '../../assets/imageLibrary';
import { defaultAcquireCard, defaultInteractCard, defaultTradeCard } from '../../services/DefaultSettings';

interface UseLocationGenerationProps {
    stateRef: MutableRefObject<GameState>;
    updateState: (updater: (current: GameState) => GameState) => void;
    addLog: (text: string, overrides?: Partial<any>) => void;
    setIsProcessingAI: (val: boolean) => void;
    setProcessingLabel: (val: string) => void;
    handleAiFailure: (context: string, e: any) => void;
    addDebugLog: (log: DebugLog) => void;
    checkSession: () => number;
}

export interface ExplorationResult {
    success: boolean;
    shouldPopulate: boolean;
}

// Helper to get nearby locations string
const getNearbyLocationsContext = (state: GameState, currentLoc: MapLocation): string => {
    const nearbyLocs: string[] = [];
    Object.values(state.map.locations).forEach(l => {
        if (l.id === currentLoc.id) return;
        if (!l.isKnown) return;
        const dist = Math.sqrt((l.coordinates.x - currentLoc.coordinates.x)**2 + (l.coordinates.y - currentLoc.coordinates.y)**2);
        if (dist <= 2000) {
             const rName = (l.regionId && state.map.regions[l.regionId]) ? state.map.regions[l.regionId].name : "未知区域";
             nearbyLocs.push(`${l.name}(${rName})`);
        }
    });
    return nearbyLocs.length > 0 ? nearbyLocs.join(', ') : "（附近无已知地点）";
};

// Duplicate helper to avoid dependency cycles if not exported
const getNextConflictId = (characters: Record<string, Character>): number => {
    let max = 0;
    Object.values(characters).forEach(c => {
        c.conflicts?.forEach(x => {
            const n = parseInt(x.id);
            if (!isNaN(n) && n > max) max = n;
        });
    });
    return max + 1;
};

export const useLocationGeneration = ({
    stateRef, updateState, addLog, setIsProcessingAI, setProcessingLabel, handleAiFailure, addDebugLog, checkSession
}: UseLocationGenerationProps) => {

    const handleTriggerUpdate = (id: string, updates: Partial<Trigger>) => {
        updateState(prev => ({
            ...prev,
            triggers: {
                ...prev.triggers,
                [id]: { ...prev.triggers[id], ...updates }
            }
        }));
    };

    const performExploration = async (
        loc: MapLocation, 
        isManual: boolean = false, 
        locationInstructions: string = "",
        cultureInstructions: string = "",
        locationImages: GameImage[] = [],
        characterImages: GameImage[] = []
    ): Promise<ExplorationResult> => {
        const startSession = checkSession();
        const currentState = stateRef.current;
        const seed = (Object.values(currentState.map.chunks) as any[])[0]?.seed || Math.random();

        // 1. Manual Exploration Override
        if (currentState.map.manualExplorationNext || isManual) {
            addLog(`系统: 进入空地点 (手动模式)。`);
            
            let regionId = loc.regionId;
            let newRegion: MapRegion | undefined;
            const existingRegions = Object.values(currentState.map.regions) as MapRegion[];

            if (!regionId) {
                for (const r of existingRegions) {
                    if (isPointInPolygon(loc.coordinates, r.vertices)) {
                        regionId = r.id;
                        break;
                    }
                }
            }

            if (!regionId) {
                newRegion = generateRegion(loc.coordinates.x, loc.coordinates.y, seed + loc.coordinates.x, existingRegions);
                newRegion.name = "新区域";
                newRegion.description = "";
            }

            const terrainAnalysis = analyzeTerrainAround(
                loc.coordinates.x, 
                loc.coordinates.y, 
                seed, 
                currentState.map.chunks, 
                currentState.map.settlements 
            );

            const safeConfig = currentState.judgeConfig || DEFAULT_AI_CONFIG;

            updateState(prev => {
                const newMap = { 
                    ...prev.map, 
                    locations: { ...prev.map.locations }, 
                    regions: { ...prev.map.regions },
                    manualExplorationNext: false 
                };
                const newChars = { ...prev.characters };
                
                if (newRegion) {
                    newMap.regions[newRegion.id] = newRegion;
                    regionId = newRegion.id;
                    
                    Object.values(newMap.locations).forEach(l => {
                        if (!l.regionId && isPointInPolygon(l.coordinates, newRegion!.vertices)) {
                             newMap.locations[l.id] = { ...l, regionId: newRegion!.id };
                        }
                    });
                }

                // If user provided a location image for manual, use the first one as avatar
                const manualAvatar = locationImages.length > 0 ? locationImages[0].base64 : generateRandomFlagAvatar(true);

                newMap.locations[loc.id] = {
                    ...loc,
                    name: "新地点",
                    description: "",
                    isKnown: true,
                    regionId: regionId,
                    terrainType: terrainAnalysis.terrainType, 
                    associatedNpcIds: [],
                    avatarUrl: manualAvatar,
                    images: locationImages // Attach images
                };

                const envChar = createEnvironmentCharacter(loc.id, "新地点");
                envChar.avatarUrl = generateRandomFlagAvatar();
                envChar.aiConfig = { ...safeConfig };
                
                newChars[envChar.id] = envChar;
                newMap.charPositions[envChar.id] = {
                    x: loc.coordinates.x,
                    y: loc.coordinates.y,
                    locationId: loc.id
                };
                
                newMap.locations[loc.id].associatedNpcIds = [envChar.id];

                // FIX: Trigger Map Expansion for the newly discovered location
                const expandedMap = checkMapExpansion(loc.coordinates.x, loc.coordinates.y, newMap, seed);

                return {
                    ...prev,
                    map: expandedMap,
                    characters: newChars,
                    world: {
                        ...prev.world,
                        history: [...prev.world.history, {
                            id: `log_exp_manual_${Date.now()}`,
                            round: prev.round.roundNumber,
                            turnIndex: prev.round.turnIndex,
                            content: `系统: 发现新地点 [新地点]。已标记为已知。请手动编辑详细信息。`,
                            timestamp: Date.now(),
                            type: 'system',
                            locationId: loc.id
                        }]
                    }
                };
            });
            // Manual mode explicitly skips population
            return { success: true, shouldPopulate: false }; 
        }

        // 2. AI Exploration Start
        // NOTE: We do NOT lock global UI (setIsProcessingAI) here to allow background exploration.
        addLog(`系统: 正在探索未知地点...`);
        
        const safeConfig = currentState.judgeConfig || DEFAULT_AI_CONFIG;
        
        try {
            // A. Location Generation Logic
            let regionId = loc.regionId;
            let regionInfo = undefined;
            let needsRegionGen = false;
            let newRegion: MapRegion | undefined;
            let regionStats = undefined;

            const existingRegions = Object.values(currentState.map.regions) as MapRegion[];

            if (!regionId) {
                for (const r of existingRegions) {
                    if (isPointInPolygon(loc.coordinates, r.vertices)) {
                        regionId = r.id;
                        break;
                    }
                }
            }

            if (regionId) {
                const r = currentState.map.regions[regionId];
                if (r) regionInfo = { name: r.name, description: r.description };
            } else {
                needsRegionGen = true;
                newRegion = generateRegion(loc.coordinates.x, loc.coordinates.y, seed + loc.coordinates.x, existingRegions);
                
                regionStats = analyzeRegionStats(
                    newRegion, 
                    seed, 
                    currentState.map.chunks, 
                    currentState.map.settlements
                );
                
                addLog(`系统: 该地点位于未探明区域，正在观察区域地貌...`);
            }

            const terrainAnalysis = analyzeTerrainAround(
                loc.coordinates.x, 
                loc.coordinates.y, 
                seed, 
                currentState.map.chunks, 
                currentState.map.settlements 
            );

            const suggestedNames = await getRandomChineseNames(10);
            const nearbyLocationsContext = getNearbyLocationsContext(currentState, loc);

            if (checkSession() !== startSession) return { success: false, shouldPopulate: false };

            const details = await generateLocationDetails(
                safeConfig, 
                loc.coordinates, 
                currentState.world.history,
                currentState.world.attributes,
                currentState.appSettings,
                currentState.defaultSettings,
                currentState.globalContext,
                currentState.world.worldGuidance,
                needsRegionGen,
                regionInfo,
                terrainAnalysis, 
                regionStats,      
                "", 
                nearbyLocationsContext,
                suggestedNames,
                addDebugLog,
                currentState, 
                (msg) => addLog(msg),
                handleTriggerUpdate,
                locationInstructions,
                cultureInstructions,
                locationImages,
                characterImages
            );

            if (checkSession() !== startSession) return { success: false, shouldPopulate: false };

            // --- VALIDATE RESULT ---
            if (!details || (details.name === "未知" && details.description === "生成失败")) {
                addLog(`系统: 探索失败 (AI 生成无效或超时)。地点保持未知状态。`, { type: 'system' });
                return { success: false, shouldPopulate: false };
            }

            // --- PROCESS LOCAL PRIZE POOL ITEMS ---
            const localItems = (details.localItems || []) as any[];
            const prizeItems: PrizeItem[] = [];

            if (localItems.length > 0) {
                localItems.forEach((item: any, idx: number) => {
                    prizeItems.push({
                        id: `pi_loc_${loc.id}_${Date.now()}_${idx}`,
                        name: item.name,
                        description: item.description,
                        weight: 10,
                        isHidden: false
                    });
                });
            }

            let newPool: PrizePool | undefined;
            if (prizeItems.length > 0) {
                newPool = {
                    id: `pool_loc_${loc.id}`,
                    name: `「${details.name}」的角落`,
                    description: `「${details.name}」四处散落的物品，也许能找到一些当地记忆`,
                    locationIds: [loc.id],
                    items: prizeItems,
                    minDraws: 1,
                    maxDraws: 1
                };
            }

            // B. Apply Location Update
            const locName = details.name;
            const envChar = createEnvironmentCharacter(loc.id, locName);
            envChar.avatarUrl = generateRandomFlagAvatar();
            envChar.aiConfig = { ...safeConfig };
            
            // Apply Location Images
            const finalLocImages = locationImages.length > 0 ? locationImages : [];
            const locAvatarUrl = finalLocImages.length > 0 ? finalLocImages[0].base64 : generateRandomFlagAvatar(true);

            // C. Parallel Character Generation
            // Instead of sequential calls via usePopulation, we execute parallel generation here using the specs from `details.chars`.
            // We use Promise.allSettled to ensure all attempts run even if one fails.

            const newCharacters: Character[] = [];
            
            if (details.chars && details.chars.length > 0) {
                addLog(`系统: 正在根据人文定义并行生成 ${details.chars.length} 位居民...`);
                
                // Combine all available images for lookup, allowing loc images to be used for characters
                const allAvailableImages = [...characterImages, ...locationImages];

                const charGenPromises = details.chars.map(async (charSpec, index) => {
                    // Match image if ID provided. Search in BOTH char and loc images.
                    const matchedImage = charSpec.appearanceImageId 
                        ? allAvailableImages.find(img => img.id === charSpec.appearanceImageId) 
                        : undefined;
                    
                    const specAppearanceImages = matchedImage ? [matchedImage] : [];
                    
                    // Generate
                    const npcData = await generateCharacter(
                        currentState.charGenConfig || safeConfig, 
                        // Specific Description from Location Gen
                        charSpec.description || `请根据地点[${locName}]的故事生成一名契合当地故事的主角。`, 
                        "", // Style blank
                        locName, 
                        details.region?.name || "未知区域", 
                        "暂无角色", // Initial gen context is empty for parallel
                        currentState.world.history, 
                        currentState.appSettings, 
                        currentState.defaultSettings, 
                        currentState.globalContext, 
                        currentState.world.worldGuidance, 
                        [charSpec.name], // Force name
                        currentState, 
                        undefined, 
                        undefined, 
                        addDebugLog,
                        specAppearanceImages, // Pass specific image
                        undefined
                    ) as any;
                    
                    if (npcData && npcData.name) {
                        return { npcData, index, matchedImage };
                    }
                    return null;
                });
                
                const results = await Promise.allSettled(charGenPromises);
                
                // Process Successful Characters
                results.forEach((res) => {
                    if (res.status === 'fulfilled' && res.value) {
                        const { npcData, index, matchedImage } = res.value;
                        
                        // --- Character Construction Logic (Duplicated from usePopulation but adapted) ---
                        // Note: Using a consistent ID generation strategy
                        const id = `npc_${Date.now()}_${index}_${Math.floor(Math.random()*1000)}`;
                        
                        // Construct Character Object (Simplified for brevity, ensuring critical fields)
                        // ... reusing logic for skills/attributes mapping ...
                        const triggers = [];
                        if (npcData.drives && Array.isArray(npcData.drives)) {
                            npcData.drives.forEach((d: any, i: number) => triggers.push({ id: `drv_${id}_${i}`, condition: d.condition, amount: d.amount || 10, weight: d.weight || 50 }));
                        } else {
                            triggers.push({ id: `trig_${id}_def`, condition: "做出符合人设的有效行动", amount: 5, weight: 50 });
                        }

                        const sourceCards = (npcData.cards || npcData.skills || []) as any[];
                        const generatedCards: Card[] = sourceCards.map((sItem: any, i: number) => {
                            const s: any = sItem || {};
                            const isSettlement = s.trigger === 'settlement';
                            const targetType = isSettlement ? 'self' : 'specific_char';
                            let effectVal = s.effect_val;
                            const effectAttr = s.effect_attr || '健康';
                            const isDynamic = (effectVal === undefined || effectVal === null);
                            if (isDynamic) effectVal = isSettlement ? 5 : -5;

                            const card: Card = {
                                id: `card_${id}_${i}`,
                                name: String(s.name || "未命名"),
                                description: String(s.description || (isSettlement ? "被动事件/特性" : "主动技能")),
                                itemType: 'skill', 
                                triggerType: s.trigger || 'active', 
                                cost: 0,
                                effects: [
                                    { id: `eff_hit_${i}`, name: '命中/触发判定', targetType: targetType, targetAttribute: '健康', targetId: '', value: 0, conditionDescription: s.condition || 'True', conditionContextKeys: [] },
                                    { id: `eff_res_${i}`, name: '实际效果', targetType: targetType, targetAttribute: effectAttr, value: effectVal, dynamicValue: false, conditionDescription: 'True', conditionContextKeys: [] }
                                ],
                                visibility: AttributeVisibility.PUBLIC
                            };
                            return normalizeCard(card);
                        });
                        
                        const defAcquire = defaultAcquireCard as Card;
                        const defTrade = defaultTradeCard as Card;
                        const defInteract = defaultInteractCard as Card;

                        if (!generatedCards.some((s: Card) => (s.name && s.name.includes("获取")) || s.id === defaultAcquireCard.id)) generatedCards.push(defAcquire);
                        if (!generatedCards.some((s: Card) => s.id === defTrade.id)) generatedCards.push(defTrade);
                        if (!generatedCards.some((s: Card) => s.id === defInteract.id)) generatedCards.push(defInteract);
                        
                        const conflictIdStart = Date.now(); // Temp base
                        const generatedConflicts = (npcData.conflicts || []).map((c: any, ci: number) => ({
                             id: String(conflictIdStart + ci),
                             desc: c.desc, apReward: c.apReward || 5, solved: false
                        }));

                        const rawAttributes = npcData.attributes || {};
                        const finalAttributes: Record<string, GameAttribute> = {};
                        const defaults: Record<string, GameAttribute> = {
                            '健康': { id: '健康', name: '健康', type: AttributeType.NUMBER, value: 50, visibility: AttributeVisibility.PUBLIC },
                            '快感': { id: '快感', name: '快感', type: AttributeType.NUMBER, value: 50, visibility: AttributeVisibility.PUBLIC },
                            '创造点': { id: '创造点', name: '创造点', type: AttributeType.NUMBER, value: 50, visibility: AttributeVisibility.PUBLIC },
                            '状态': { id: '状态', name: '状态', type: AttributeType.TEXT, value: '正常', visibility: AttributeVisibility.PUBLIC },
                            '体能': { id: '体能', name: '体能', type: AttributeType.NUMBER, value: 50, visibility: AttributeVisibility.PUBLIC }
                        };
                        Object.assign(finalAttributes, defaults);
                        Object.entries(rawAttributes).forEach(([key, val]: [string, any]) => {
                            if (val === null || val === undefined) return;
                            let finalVal: string | number = 50;
                            let type = AttributeType.NUMBER;
                            if (typeof val === 'number' || typeof val === 'string') finalVal = val;
                            else if (typeof val === 'object') { if ('value' in val) finalVal = val.value; }
                            if (typeof finalVal === 'number' || (!isNaN(Number(finalVal)) && String(finalVal).trim() !== '')) { type = AttributeType.NUMBER; finalVal = Number(finalVal); } 
                            else { type = AttributeType.TEXT; finalVal = String(finalVal); }
                            finalAttributes[key] = { id: key, name: key, type: type, value: finalVal, visibility: AttributeVisibility.PUBLIC };
                        });
                        
                        const behaviorConfig = currentState.charBehaviorConfig || currentState.judgeConfig || DEFAULT_AI_CONFIG;

                        newCharacters.push({
                            id, isPlayer: false, name: npcData.name,
                            appearance: npcData.appearance || "普通的样貌",
                            description: npcData.description,
                            avatarUrl: matchedImage ? matchedImage.base64 : generateRandomFlagAvatar(),
                            attributes: finalAttributes, 
                            skills: generatedCards, inventory: [],
                            drives: triggers, conflicts: generatedConflicts,
                            aiConfig: { ...behaviorConfig }, 
                            contextConfig: { messages: [] },
                            appearanceCondition: `在此地`,
                            enableAppearanceCheck: true,
                            appearanceImages: matchedImage ? [matchedImage] : []
                        });
                    }
                });
            }

            // D. Batch State Update
            updateState(prev => {
                const newMap = { ...prev.map, locations: { ...prev.map.locations }, regions: { ...prev.map.regions } };
                const newChars = { ...prev.characters };
                let nextConflictId = getNextConflictId(prev.characters);
                
                if (newRegion) {
                    newRegion.name = details.region?.name || "新发现区域";
                    newRegion.description = details.region?.description || "一片充满未知的土地。";
                    newMap.regions[newRegion.id] = newRegion;
                    regionId = newRegion.id;
                    Object.values(newMap.locations).forEach(l => {
                        if (!l.regionId && isPointInPolygon(l.coordinates, newRegion!.vertices)) {
                             newMap.locations[l.id] = { ...l, regionId: newRegion!.id };
                        }
                    });
                }

                // Append new characters to associated list
                const npcIds = [envChar.id, ...newCharacters.map(c => c.id)];

                newMap.locations[loc.id] = {
                    ...loc,
                    name: locName,
                    description: details.description,
                    isKnown: true,
                    regionId: regionId,
                    terrainType: terrainAnalysis.terrainType, 
                    associatedNpcIds: npcIds,
                    avatarUrl: locAvatarUrl,
                    images: finalLocImages
                };

                newChars[envChar.id] = envChar;
                newMap.charPositions[envChar.id] = { x: loc.coordinates.x, y: loc.coordinates.y, locationId: loc.id };

                // Add newly generated characters to state
                newCharacters.forEach(c => {
                    // Re-assign conflict IDs to ensure uniqueness in global state
                    if (c.conflicts) {
                        c.conflicts = c.conflicts.map(conf => ({ ...conf, id: String(nextConflictId++) }));
                    }
                    newChars[c.id] = c;
                    // Jitter position slightly
                    newMap.charPositions[c.id] = { 
                        x: loc.coordinates.x + (Math.random()-0.5)*20, 
                        y: loc.coordinates.y + (Math.random()-0.5)*20, 
                        locationId: loc.id 
                    };
                });

                const ts = Date.now();
                const newLogs: any[] = [];
                newLogs.push({
                    id: `log_exp_${ts}_0`,
                    round: prev.round.roundNumber, turnIndex: prev.round.turnIndex,
                    content: `系统: 发现新地点 [${locName}]`,
                    timestamp: ts, type: 'system', locationId: loc.id
                });
                
                if (newRegion) {
                    newLogs.push({
                        id: `log_exp_${ts}_1`,
                        round: prev.round.roundNumber, turnIndex: prev.round.turnIndex,
                        content: `系统: 探明新区域 [${newRegion.name}]`,
                        timestamp: ts, type: 'system', locationId: loc.id
                    });
                }

                const nextPrizePools = { ...prev.prizePools };
                if (newPool) {
                    nextPrizePools[newPool.id] = newPool;
                }
                
                const expandedMap = checkMapExpansion(loc.coordinates.x, loc.coordinates.y, newMap, seed);

                return {
                    ...prev,
                    map: expandedMap,
                    characters: newChars,
                    world: { ...prev.world, history: [...prev.world.history, ...newLogs] },
                    prizePools: nextPrizePools
                };
            });

            if (prizeItems.length > 0) {
                addLog(`系统: 在 [${locName}] 发现了 ${prizeItems.length} 件散落物品。`);
            }
            
            if (newCharacters.length > 0) {
                 addLog(`系统: 发现当地居民: ${newCharacters.map(c => c.name).join(', ')}。`);
            } else if (details.chars && details.chars.length > 0) {
                 // Defined but failed to generate
                 addLog(`系统: 似乎有人影晃动，但未能看清 (生成失败)。`);
            } else {
                 addLog(`系统: 此地似乎空无一人。`);
            }

            return { success: true, shouldPopulate: false }; // Handled internally now

        } catch (e: any) {
            console.error("Exploration Background Error", e);
            // Don't crash global state, just log error locally
            addLog(`系统: 探索遇到问题: ${e.message}`, { type: 'system' });
            return { success: false, shouldPopulate: false };
        }
    };

    const performReset = async (
        loc: MapLocation, 
        keepRegion: boolean, 
        instructions: string = "",
        cultureInstructions: string = "",
        locationImages: GameImage[] = [],
        characterImages: GameImage[] = []
    ) => {
        const startSession = checkSession();
        const currentState = stateRef.current;

        // Reset still locks UI because it's an admin action
        setIsProcessingAI(true);
        setProcessingLabel("正在重构现实...");
        addLog(`系统: 正在重置地点 [${loc.name}] (保留区域: ${keepRegion ? '是' : '否'})...`);

        const safeConfig = currentState.judgeConfig || DEFAULT_AI_CONFIG;
        const seed = (Object.values(currentState.map.chunks) as any[])[0]?.seed || Math.random();

        try {
            let regionId = loc.regionId;
            let regionInfo = undefined;
            let needsRegionGen = !keepRegion; 
            let newRegion: MapRegion | undefined;
            let regionStats = undefined;
            
            const existingRegions = Object.values(currentState.map.regions) as MapRegion[];

            if (keepRegion && regionId) {
                const r = currentState.map.regions[regionId];
                if (r) regionInfo = { name: r.name, description: r.description };
            } else {
                newRegion = generateRegion(loc.coordinates.x, loc.coordinates.y, seed + loc.coordinates.x + Date.now(), existingRegions);
                regionStats = analyzeRegionStats(
                    newRegion, 
                    seed, 
                    currentState.map.chunks, 
                    currentState.map.settlements
                );
            }

            const relevantChars: Character[] = [];
            (Object.values(currentState.characters) as Character[]).forEach(c => {
                const pos = currentState.map.charPositions[c.id];
                if (!pos) return;
                if (pos.locationId === loc.id || (regionId && pos.locationId && currentState.map.locations[pos.locationId]?.regionId === regionId)) {
                    relevantChars.push(c);
                }
            });
            const existingCharsContext = relevantChars.length > 0 
                ? relevantChars.map(c => `${c.name}: ${c.description.substring(0, 50)}...`).join('\n') 
                : "";
            
            const nearbyLocationsContext = getNearbyLocationsContext(currentState, loc);

            const terrainAnalysis = analyzeTerrainAround(
                loc.coordinates.x, 
                loc.coordinates.y, 
                seed, 
                currentState.map.chunks, 
                currentState.map.settlements 
            );

            const suggestedNames = await getRandomChineseNames(10);

            if (checkSession() !== startSession) return;

            const details = await generateLocationDetails(
                safeConfig, 
                loc.coordinates, 
                currentState.world.history,
                currentState.world.attributes,
                currentState.appSettings,
                currentState.defaultSettings,
                currentState.globalContext,
                currentState.world.worldGuidance,
                needsRegionGen,
                regionInfo,
                terrainAnalysis,
                regionStats,
                existingCharsContext,
                nearbyLocationsContext,
                suggestedNames,
                addDebugLog,
                currentState, 
                (msg) => addLog(msg),
                handleTriggerUpdate,
                instructions, // Pass reset instructions
                cultureInstructions, // Pass culture
                locationImages, // Pass images
                characterImages
            ) as any;

            if (checkSession() !== startSession) return;

            const localItems = (details.localItems || []) as any[];
            const prizeItems: PrizeItem[] = [];

            if (localItems.length > 0) {
                localItems.forEach((item: any, idx: number) => {
                    prizeItems.push({
                        id: `pi_loc_${loc.id}_${Date.now()}_${idx}`,
                        name: item.name,
                        description: item.description,
                        weight: 10,
                        isHidden: false
                    });
                });
            }

            let newPool: PrizePool | undefined;
            if (prizeItems.length > 0) {
                newPool = {
                    id: `pool_loc_${loc.id}`,
                    name: `「${details.name}」的角落`,
                    description: `「${details.name}」四处散落的物品，也许能找到一些当地记忆`,
                    locationIds: [loc.id],
                    items: prizeItems,
                    minDraws: 1,
                    maxDraws: 1
                };
            }

            // Apply manual override if provided (e.g. user uploaded specific image during reset)
            const finalAvatarUrl = locationImages.length > 0 
                ? locationImages[0].base64 
                : (loc.avatarUrl || generateRandomFlagAvatar(true));
            
            const finalImages = locationImages.length > 0 ? locationImages : loc.images;

            updateState(prev => {
                const newMap = { ...prev.map, locations: { ...prev.map.locations }, regions: { ...prev.map.regions } };
                
                if (newRegion) {
                    newRegion.name = details.region?.name || "重置区域";
                    newRegion.description = details.region?.description || "区域已被重新认知。";
                    newMap.regions[newRegion.id] = newRegion;
                    regionId = newRegion.id;
                    
                    Object.values(newMap.locations).forEach(l => {
                         if (l.id === loc.id || (!l.regionId && isPointInPolygon(l.coordinates, newRegion!.vertices))) {
                             newMap.locations[l.id] = { ...l, regionId: newRegion!.id };
                         }
                    });
                }

                newMap.locations[loc.id] = {
                    ...loc,
                    name: details.name,
                    description: details.description,
                    isKnown: true,
                    regionId: regionId,
                    terrainType: terrainAnalysis.terrainType, 
                    avatarUrl: finalAvatarUrl,
                    images: finalImages
                };
                
                const newChars = { ...prev.characters };
                const envCharId = `env_${loc.id}`;
                if (newChars[envCharId]) {
                    newChars[envCharId] = {
                        ...newChars[envCharId],
                        name: `${details.name}的环境`,
                        description: `【世界代理】${details.name}的自然环境。`,
                        aiConfig: { ...safeConfig },
                        avatarUrl: newChars[envCharId].avatarUrl || generateRandomFlagAvatar()
                    };
                }

                const nextPrizePools = { ...prev.prizePools };
                if (newPool) {
                    nextPrizePools[newPool.id] = newPool;
                }

                return {
                    ...prev,
                    map: newMap,
                    characters: newChars,
                    prizePools: nextPrizePools
                };
            });
            
            addLog(`系统: 地点已重置为 [${details.name}]。`);
            if (prizeItems.length > 0) {
                addLog(`系统: 在 [${details.name}] 发现了 ${prizeItems.length} 件散落物品。`);
            }

        } catch (e: any) {
            handleAiFailure("Reset Location", e);
        } finally {
            setIsProcessingAI(false);
        }
    };

    return { performExploration, performReset };
};
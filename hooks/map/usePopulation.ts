
import { MutableRefObject } from 'react';
import { GameState, Character, GameAttribute, AttributeType, AttributeVisibility, Card, DebugLog } from '../../types';
import { generateCharacter, normalizeCard } from '../../services/aiService';
import { getRandomChineseNames } from '../../services/nameService';
import { defaultAcquireCard, defaultInteractCard, defaultTradeCard } from '../../services/DefaultSettings';
import { generateRandomFlagAvatar } from '../../assets/imageLibrary';
import { DEFAULT_AI_CONFIG } from '../../config';

interface UsePopulationProps {
    stateRef: MutableRefObject<GameState>;
    updateState: (updater: (current: GameState) => GameState) => void;
    addLog: (text: string) => void;
    checkSession: () => number;
    addDebugLog: (log: DebugLog) => void;
}

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

export const usePopulation = ({ stateRef, updateState, addLog, checkSession, addDebugLog }: UsePopulationProps) => {

    const startPopulation = async (locationId: string) => {
        const startSession = checkSession();
        
        // Internal recursive function
        const generateNextNpc = async (attemptIndex: number) => {
            // Probabilistic Logic:
            // Index 0: First char -> Always run (100%)
            // Index 1: Second char -> 70% chance
            // Index 2: Third char -> 30% chance
            // Index 3+: Stop
            
            if (attemptIndex > 2) return; 
            
            if (attemptIndex === 1 && Math.random() > 0.7) {
                addLog("系统: (后台) 似乎没有发现更多人。");
                return;
            }
            if (attemptIndex === 2 && Math.random() > 0.3) {
                addLog("系统: (后台) 探索结束。");
                return;
            }

            if (checkSession() !== startSession) return;

            addLog(`系统: (后台) 正在寻找第 ${attemptIndex + 1} 位当地居民...`);

            // 1. Get Fresh State for Context
            const currentFreshState = stateRef.current;
            const loc = currentFreshState.map.locations[locationId];
            if (!loc) return;

            const locName = loc.name;
            const regionName = (loc.regionId && currentFreshState.map.regions[loc.regionId]) ? currentFreshState.map.regions[loc.regionId].name : "未知区域";
            
            // NEW: Calculate existing characters dynamically from state
            const charsAtLocation = (Object.values(currentFreshState.characters) as Character[]).filter(c => 
                currentFreshState.map.charPositions[c.id]?.locationId === locationId
            );
            
            // Format the context string including the Environment char and any previously generated NPCs
            const dynamicExistingChars = charsAtLocation.length > 0 
                ? charsAtLocation.map(c => `${c.name}: ${c.description.substring(0, 80)}...`).join('\n')
                : "暂无角色";

            const freshNpcNames = await getRandomChineseNames(10);
            const charGenConfig = currentFreshState.charGenConfig || currentFreshState.judgeConfig || DEFAULT_AI_CONFIG;
            
            try {
                // 2. Generate
                const npcData = await generateCharacter(
                    charGenConfig, 
                    `请根据地点[${locName}](${regionName})的故事，以及当前在场的角色，生成一名契合当地故事的主角。`,
                    "请根据角色个人经历赋予技能。",
                    locName, regionName, 
                    dynamicExistingChars, // Use dynamic context
                    currentFreshState.world.history, 
                    currentFreshState.appSettings, 
                    currentFreshState.defaultSettings, 
                    currentFreshState.globalContext, 
                    currentFreshState.world.worldGuidance, 
                    freshNpcNames,
                    currentFreshState, 
                    undefined, 
                    undefined, 
                    addDebugLog,
                    undefined, // No appearance images for auto-gen
                    undefined  // No setting images for auto-gen
                ) as any;

                if (checkSession() !== startSession) return;

                if (npcData && npcData.name) {
                    // 3. Update State with NEW NPC
                    updateState((prev: GameState) => {
                        const newChars = { ...prev.characters };
                        // Note: We read the latest associatedNpcIds from previous state to ensure we append
                        const newNpcIds = [...(prev.map.locations[locationId]?.associatedNpcIds || [])];
                        let nextConflictId = getNextConflictId(prev.characters);
                        
                        const id = `npc_${Date.now()}_${attemptIndex}`;
                        newNpcIds.push(id);

                        // --- Basic NPC Construction ---
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

                        if (!generatedCards.some((s: Card) => (s.name && s.name.includes("获取")) || s.id === defAcquire.id)) generatedCards.push(defAcquire);
                        if (!generatedCards.some((s: Card) => s.id === defTrade.id)) generatedCards.push(defTrade);
                        if (!generatedCards.some((s: Card) => s.id === defInteract.id)) generatedCards.push(defInteract);

                        const generatedConflicts = (npcData.conflicts || []).map((c: any) => ({
                             id: String(nextConflictId++),
                             desc: c.desc, apReward: c.apReward || 5, solved: false
                        }));

                        const rawAttributes = npcData.attributes || {};
                        const finalAttributes: Record<string, GameAttribute> = {};
                        const defaults: Record<string, GameAttribute> = {
                            '健康': { id: '健康', name: '健康', type: AttributeType.NUMBER, value: 50, visibility: AttributeVisibility.PUBLIC },
                            '快感': { id: '快感', name: '快感', type: AttributeType.NUMBER, value: 50, visibility: AttributeVisibility.PUBLIC },
                            '创造点': { id: '创造点', name: '创造点', type: AttributeType.NUMBER, value: 50, visibility: AttributeVisibility.PUBLIC },
                            '状态': { id: '状态', name: '状态', type: AttributeType.TEXT, value: '正常', visibility: AttributeVisibility.PUBLIC },
                            '体能': { id: '体能', name: '体能', type: AttributeType.NUMBER, value: 50, visibility: AttributeVisibility.PUBLIC },
                            '活跃': { id: '活跃', name: '活跃', type: AttributeType.NUMBER, value: 50, visibility: AttributeVisibility.PUBLIC }
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

                        const behaviorConfig = prev.charBehaviorConfig || prev.judgeConfig || DEFAULT_AI_CONFIG;

                        newChars[id] = {
                            id, isPlayer: false, name: npcData.name,
                            appearance: npcData.appearance || "普通的样貌",
                            description: npcData.description,
                            avatarUrl: generateRandomFlagAvatar(),
                            attributes: finalAttributes, 
                            skills: generatedCards, inventory: [],
                            drives: triggers, conflicts: generatedConflicts,
                            aiConfig: { ...behaviorConfig }, 
                            contextConfig: { messages: [] },
                            useAiOverride: false, // Default
                            memoryConfig: {
                                useOverride: false,
                                maxMemoryRounds: 10,
                                actionDropoutProbability: 0.34,
                                reactionDropoutProbability: 0.34
                            },
                            appearanceCondition: `位于当前故事发生的地点`,
                            enableAppearanceCheck: true
                        };

                        const newMap = { ...prev.map, charPositions: { ...prev.map.charPositions } };
                        // Random jitter pos
                        newMap.charPositions[id] = { x: loc.coordinates.x + (Math.random()-0.5)*20, y: loc.coordinates.y + (Math.random()-0.5)*20, locationId: loc.id };
                        
                        const newLocations = { ...prev.map.locations };
                        if (newLocations[locationId]) {
                            newLocations[locationId] = { ...newLocations[locationId], associatedNpcIds: newNpcIds };
                        }

                        return {
                            ...prev,
                            characters: newChars,
                            map: { ...newMap, locations: newLocations }
                        };
                    });

                    addLog(`系统: 发现当地角色 [${npcData.name}]`);
                    
                    // 4. Trigger Next in Chain
                    await generateNextNpc(attemptIndex + 1);
                }
            } catch (e) {
                console.error("NPC Gen Error", e);
                // Stop chain on error
            }
        };

        // Start chain
        generateNextNpc(0);
    };

    return { startPopulation };
};
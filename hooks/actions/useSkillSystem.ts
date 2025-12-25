
import { MutableRefObject } from 'react';
import { GameState, Character, Card, AttributeType, AttributeVisibility, DebugLog, Trigger } from '../../types';
import { checkConditionsBatch, determineCharacterReaction, getGlobalMemory, normalizeCard } from '../../services/aiService';
import { DEFAULT_AI_CONFIG } from '../../config';
import { getAttr, getCP, removeInstances } from '../../services/attributeUtils';
import { ImageContextBuilder } from '../../services/ai/ImageContextBuilder';

interface UseSkillSystemProps {
    stateRef: MutableRefObject<GameState>;
    updateState: (updater: (current: GameState) => GameState) => void;
    addLog: (text: string, overrides?: Partial<any>) => void;
    addDebugLog: (log: DebugLog) => void;
    checkSession: () => number;
    requestPlayerReaction?: (charId: string, title: string, message: string) => Promise<string | null>;
    handleTriggerUpdate: (id: string, updates: Partial<Trigger>) => void;
}

export const useSkillSystem = ({
    stateRef, updateState, addLog, addDebugLog, checkSession, requestPlayerReaction, handleTriggerUpdate
}: UseSkillSystemProps) => {

    const formatReason = (rawReason: string) => {
        if (!rawReason) return "未知原因";
        let cleaned = rawReason.replace(/eff_\d+/g, '').replace(/\(Hit Check\)/gi, '').trim();
        cleaned = cleaned.replace(/^(Because|Reason:|原因:|由于)/i, '').trim();
        return cleaned;
    };

    const executeSkill = async (card: Card, sourceCharId: string, targetId?: string, effectOverrides?: Record<number, string | number>, isBurningLife: boolean = false): Promise<void> => {
        const startSession = checkSession();
        const currentState = stateRef.current;
        const sourceChar = currentState.characters[sourceCharId];
        if (!sourceChar) return;

        // --- Physique Cost & Burning Life Logic ---
        let costToPay = 0;
        let healthPenalty = 0;

        // Rule 1 & 3: Only 'active' skills incur Physique cost.
        // Environment characters (env_*) bypass this check.
        if (card.triggerType === 'active' && !sourceCharId.startsWith('env_')) {
            costToPay = 20; // Base cost for any active skill

            // Rule 2: Burning Life adds extra cost (for 3rd+ action or special flag)
            if (isBurningLife) {
                costToPay += 20;
            }

            const physiqueAttr = getAttr(sourceChar, '体能');
            const currentPhy = physiqueAttr ? Number(physiqueAttr.value) : 0;

            // Updated Logic: Always allow burning life if physique is insufficient
            // Instead of blocking, we deduct from Health.
            if (currentPhy < costToPay) {
                healthPenalty = costToPay - currentPhy;
                costToPay = currentPhy; // Drain remaining physique
            }

            // Apply Deduction Immediately
            if (costToPay > 0 || healthPenalty > 0) {
                updateState(prev => {
                    const newChars = { ...prev.characters };
                    const c = newChars[sourceCharId];
                    if (c) {
                        // Deduct Physique
                        if (costToPay > 0) {
                            const pAttr = getAttr(c, '体能');
                            if (pAttr) pAttr.value = Math.max(0, Number(pAttr.value) - costToPay);
                        }
                        // Deduct Health (Penalty)
                        if (healthPenalty > 0) {
                            const hAttr = getAttr(c, '健康');
                            // Ensure we don't clamp to 0 if it goes below, but allow it to go negative for death logic
                            if (hAttr) hAttr.value = Math.max(-1, Number(hAttr.value) - healthPenalty);
                        }
                    }
                    return { ...prev, characters: newChars };
                });

                if (healthPenalty > 0) {
                    addLog(`> ⚠️ 燃命: ${sourceChar.name} 体能不足，强行发动 [${card.name}] (体能-${costToPay}, 健康-${healthPenalty})!`);
                }
            }
        }
        // ---------------------------------------------------------

        let primaryTargetId = targetId || "";
        const activeLocId = currentState.map.activeLocationId;
        
        // Auto-target logic
        if (!primaryTargetId) {
             const firstTargetEffect = card.effects.find(e => e.targetType === 'specific_char' || e.targetType === 'ai_choice');
             if (firstTargetEffect) {
                 if (firstTargetEffect.targetId) primaryTargetId = firstTargetEffect.targetId;
                 else {
                    const candidates = (Object.values(currentState.characters) as Character[]).filter(c => {
                         const pos = currentState.map.charPositions[c.id];
                         return c.id !== sourceCharId && pos && pos.locationId === activeLocId;
                    }).map(c => c.id);
                    primaryTargetId = candidates[Math.floor(Math.random() * candidates.length)] || sourceCharId;
                 }
             }
        }

        // Inline Target Logging
        let logMsg = `${sourceChar.name} 发动了${card.triggerType === 'reaction' ? '反应' : ''}技能「${card.name}」`;
        if (primaryTargetId && currentState.characters[primaryTargetId]) {
             logMsg += ` (目标: ${currentState.characters[primaryTargetId].name})`;
        }
        addLog(logMsg, { actingCharId: sourceCharId });

        // --- Active Attribute Logic Part 1: Reaction Usage ---
        // If it is a reaction card, increase Active immediately by 20
        if (card.triggerType === 'reaction' && !sourceCharId.startsWith('env_')) {
             updateState(prev => {
                 const newChars = { ...prev.characters };
                 const c = newChars[sourceCharId];
                 if (c) {
                     const activeAttr = getAttr(c, '活跃');
                     if (activeAttr) {
                         activeAttr.value = Math.min(100, Number(activeAttr.value) + 20);
                     } else {
                         // Init if missing
                         c.attributes['活跃'] = { id: '活跃', name: '活跃', type: AttributeType.NUMBER, value: 70, visibility: AttributeVisibility.PUBLIC };
                     }
                 }
                 return { ...prev, characters: newChars };
             });
        }

        const localChars = (Object.values(currentState.characters) as Character[]).filter(c => {
            const p = currentState.map.charPositions[c.id];
            return p && p.locationId === activeLocId;
        });

        // 1. Pure RP Cards (No Effects) - e.g. "Interact"
        if (!card.effects || card.effects.length === 0) {
            addLog(`> (行为生效)`, { isReaction: true });
            
            // Consume if item
            if (card.itemType === 'consumable') {
                 updateState(prev => ({
                     ...prev,
                     characters: {
                         ...prev.characters,
                         [sourceCharId]: {
                             ...prev.characters[sourceCharId],
                             inventory: removeInstances(prev.characters[sourceCharId].inventory, [card.id])
                         }
                     }
                 }));
            }

            // Trigger Reaction
            if (primaryTargetId) {
                // --- Active Attribute Logic Part 2: Target (Pure RP) ---
                if (!primaryTargetId.startsWith('env_')) {
                    updateState(prev => {
                        const newChars = { ...prev.characters };
                        const t = newChars[primaryTargetId];
                        if (t) {
                            const activeAttr = getAttr(t, '活跃');
                            if (activeAttr) {
                                activeAttr.value = Math.min(100, Number(activeAttr.value) + 10);
                            } else {
                                t.attributes['活跃'] = { id: '活跃', name: '活跃', type: AttributeType.NUMBER, value: 60, visibility: AttributeVisibility.PUBLIC };
                            }
                        }
                        return { ...prev, characters: newChars };
                    });
                }

                const tChar = currentState.characters[primaryTargetId];
                if (tChar) {
                    let reaction = "";
                    const descInfo = `(描述: ${card.description})`;
                    const prompt = `${sourceChar.name} 对你使用了 [${card.name}] ${descInfo}。你如何回应？`;
                    
                    if (tChar.isPlayer && !stateRef.current.round.autoReaction && requestPlayerReaction) {
                        const manual = await requestPlayerReaction(tChar.id, `反应 (Reaction)`, prompt);
                        if (manual === null) return;
                        reaction = manual;
                    } else {
                        if (checkSession() !== startSession) return;
                        reaction = await determineCharacterReaction(
                            tChar, 
                            prompt,
                            stateRef.current.appSettings, 
                            stateRef.current.defaultSettings, 
                            stateRef.current.world.attributes, 
                            stateRef.current.world.history,
                            activeLocId,
                            stateRef.current.appSettings.maxCharacterMemoryRounds,
                            addDebugLog,
                            localChars,
                            stateRef.current.cardPool,
                            stateRef.current.globalContext,
                            stateRef.current, 
                            (msg) => addLog(msg, { type: 'system' }),
                            handleTriggerUpdate
                        );
                    }
                    
                    if (checkSession() === startSession) {
                        if (reaction) {
                            // Remove quotes around reaction
                            addLog(`${tChar.name}: ${reaction}`, { isReaction: true, actingCharId: tChar.id });
                        } else {
                            addLog(`${tChar.name}没有反应。`, { type: 'action', actingCharId: tChar.id });
                        }
                    }
                }
            }
            return; 
        }

        // 2. Pre-Check Reaction Phase (For Trade/Acquire/etc.)
        let preReactionText = "";
        
        if (card.triggerType === 'reaction' && primaryTargetId && primaryTargetId !== sourceCharId) {
            const tChar = currentState.characters[primaryTargetId];
            if (tChar) {
                const descInfo = `(描述: ${card.description})`;
                const prompt = `${sourceChar.name} 试图对你使用 [${card.name}] ${descInfo}。你同意吗？或者你如何回应？`;
                
                if (tChar.isPlayer && !stateRef.current.round.autoReaction && requestPlayerReaction) {
                    const manual = await requestPlayerReaction(tChar.id, `前置反应 (Pre-Reaction)`, prompt);
                    if (manual === null) return; // Cancelled
                    preReactionText = manual;
                } else {
                    if (checkSession() !== startSession) return;
                    preReactionText = await determineCharacterReaction(
                        tChar, 
                        prompt,
                        stateRef.current.appSettings, 
                        stateRef.current.defaultSettings, 
                        stateRef.current.world.attributes, 
                        stateRef.current.world.history,
                        activeLocId,
                        stateRef.current.appSettings.maxCharacterMemoryRounds,
                        addDebugLog,
                        localChars,
                        stateRef.current.cardPool,
                        stateRef.current.globalContext,
                        stateRef.current, 
                        (msg) => addLog(msg, { type: 'system' }),
                        handleTriggerUpdate
                    );
                }

                if (checkSession() === startSession && preReactionText) {
                    // Remove quotes around pre-reaction
                    addLog(`${tChar.name}: ${preReactionText}`, { isReaction: true, actingCharId: tChar.id });
                }
            }
        }

        // 3. AI Check Logic (Active + Passive Interaction)
        const updatedState = stateRef.current;
        const checkRequests: any[] = [];
        const metaList: any[] = [];
        
        const getFullCharContext = (c: Character) => {
             const inventoryCards = c.inventory.map(id => updatedState.cardPool.find(card => card.id === id)).filter(Boolean) as Card[];
             return {
                 attributes: c.attributes,
                 skills: c.skills.map(s => ({ name: s.name, description: s.description, type: s.triggerType, visibility: s.visibility })),
                 inventory: inventoryCards.map(i => ({ name: i.name, description: i.description, type: i.itemType, visibility: i.visibility })),
                 description: c.description
             };
        };

        const entitiesContext: Record<string, any> = {
            [sourceChar.name]: getFullCharContext(sourceChar)
        };
        
        const activeLoc = activeLocId ? updatedState.map.locations[activeLocId] : null;
        if (activeLoc) {
            entitiesContext['Current_Location'] = {
                name: activeLoc.name,
                description: activeLoc.description,
                ...activeLoc.attributes
            };
        }
        
        let targetChar: Character | undefined;
        if (primaryTargetId && updatedState.characters[primaryTargetId]) {
            targetChar = updatedState.characters[primaryTargetId];
            entitiesContext[targetChar.name] = getFullCharContext(targetChar);
        }

        const isEnvironmentTarget = card.effects && card.effects[0]?.targetType === 'world';

        // --- Active Card Requests ---
        const effects = card.effects || [];
        for (let i = 0; i < effects.length; i++) {
            const effect = effects[i];
            let actualTargetId = "";

            if (effect.targetType === 'specific_char' || effect.targetType === 'ai_choice') {
                actualTargetId = primaryTargetId; 
            } else if (effect.targetType === 'self') actualTargetId = sourceCharId;
            else if (effect.targetType === 'hit_target') actualTargetId = primaryTargetId;

            if (actualTargetId && updatedState.characters[actualTargetId]) {
                entitiesContext[updatedState.characters[actualTargetId].name] = getFullCharContext(updatedState.characters[actualTargetId]);
            }

            const overrideVal = effectOverrides?.[i];
            const isOverridden = overrideVal !== undefined && overrideVal !== null;

            checkRequests.push({
                id: `eff_${i}`, // Active prefix implicitly assumed by index
                type: 'active',
                condition: effect.conditionDescription || "True",
                needsDynamicValue: effect.dynamicValue && !isOverridden,
                context: { 
                    source: sourceChar.name, 
                    target: updatedState.characters[actualTargetId]?.name || "World",
                    actionName: card.name,
                    // Inject pre-reaction for AI judgment
                    targetReaction: preReactionText || undefined
                },
                name: card.name
            });
            metaList.push({ 
                effect, 
                actualTargetId, 
                index: i, 
                overrideVal, 
                type: 'active',
                cardName: card.name // Fix: Pass card name for Active skills too
            });
        }

        // --- Passive Card Requests (Interaction) ---
        // Only if we have a valid target character and it's not self-targeting
        if (targetChar && primaryTargetId !== sourceCharId) {
            const passives: Card[] = [];
            // Gather skills
            targetChar.skills.forEach(s => {
                if (s.triggerType === 'passive') passives.push(s);
            });
            // Gather inventory
            targetChar.inventory.forEach(invId => {
                const item = updatedState.cardPool.find(c => c.id === invId);
                if (item && item.triggerType === 'passive') passives.push(item);
            });

            passives.forEach(pCard => {
                (pCard.effects || []).forEach((pEffect, pEffIdx) => {
                    const pReqId = `passive_${pCard.id}_${pEffIdx}`;
                    
                    // Determine passive target (usually source of attack)
                    let pTargetId = sourceCharId; 
                    if (pEffect.targetType === 'self') pTargetId = primaryTargetId;

                    checkRequests.push({
                        id: pReqId,
                        type: 'passive',
                        condition: pEffect.conditionDescription,
                        context: {
                            owner: targetChar?.name,
                            incomingAction: `${sourceChar.name}使用了[${card.name}] (描述:${card.description})`,
                            target: sourceChar.name,
                            // Pass reaction context to passive too (e.g. Counter only works if angry)
                            ownerReaction: preReactionText
                        },
                        name: pCard.name
                    });
                    
                    metaList.push({
                        effect: pEffect,
                        actualTargetId: pTargetId, // Passive effect targets the Attacker usually
                        index: pReqId, // Use string ID for passives
                        type: 'passive',
                        cardName: pCard.name,
                        cardDescription: pCard.description, // Added description for reaction context
                        effIndex: pEffIdx // Fix: Track index for logging filter
                    });
                });
            });
        }

        let results: Record<string, any> = {};
        if (isEnvironmentTarget) {
            results = {};
            checkRequests.forEach(req => {
                results[req.id] = { result: true, reason: "Environmental Effect Always Succeeds" };
            });
        } else {
            if (checkSession() !== startSession) return;
            const currentRound = updatedState.round.roundNumber;
            
            const imageBuilder = new ImageContextBuilder();
            const historyStr = getGlobalMemory(
                updatedState.world.history, 
                currentRound, 
                updatedState.appSettings.maxShortHistoryRounds || 5,
                updatedState.appSettings.maxInputTokens,
                imageBuilder
            );
            
            results = await checkConditionsBatch(
                updatedState.judgeConfig || DEFAULT_AI_CONFIG,
                checkRequests,
                { history: historyStr, world: updatedState.world.attributes },
                updatedState.appSettings,
                updatedState.defaultSettings,
                updatedState.globalContext,
                entitiesContext,
                addDebugLog,
                false,
                updatedState, 
                (msg) => addLog(msg, { type: 'system' }),
                handleTriggerUpdate,
                imageBuilder
            );
        }

        if (checkSession() !== startSession) return;

        // 4. Trade Logic (Only for Active Effect 0)
        const firstReqId = `eff_0`;
        if (results[firstReqId]?.tradeResult) {
            // ... (Trade logic remains same) ...
            const trade = results[firstReqId].tradeResult;
            const itemName = trade.itemName;
            const price = Math.round(Number(trade.price || 0));
            const transactionType = trade.transactionType || 'buy';
            let tradeTargetName = trade.sourceCharacterName; 

            let buyerId = '';
            let sellerId = '';
            
            if (transactionType === 'sell') {
                sellerId = sourceCharId;
                buyerId = primaryTargetId; 
                if (!buyerId) {
                    addLog(`> 出售失败: 必须要指定一个买家才能出售物品。`);
                    return;
                }
            } else {
                buyerId = sourceCharId;
                sellerId = primaryTargetId; 
                if (tradeTargetName && tradeTargetName !== sourceChar.name) {
                    const sellerChar = (Object.values(updatedState.characters) as Character[]).find(c => c.name === tradeTargetName);
                    if (sellerChar) sellerId = sellerChar.id;
                }
            }

            const buyerChar = updatedState.characters[buyerId];
            const sellerChar = sellerId ? updatedState.characters[sellerId] : null;

            if (buyerChar) {
                const buyerCP = getCP(buyerChar);
                if (price > 0 && buyerCP < price) {
                    addLog(`> 交易中断: 买方 [${buyerChar.name}] 没有足够的 CP 支付 (${buyerCP}/${price})。`);
                    return;
                }
            }

            let tradeSuccess = false;

            updateState(prev => {
                const next = { ...prev };
                const nextChars = { ...next.characters };
                const nextBuyer = buyerId ? nextChars[buyerId] : null;
                const nextSeller = sellerId ? nextChars[sellerId] : null;
                
                if (price > 0 && nextBuyer) {
                    const cpAttr = getAttr(nextBuyer, 'cp');
                    if (cpAttr) cpAttr.value = Math.round(Number(cpAttr.value) - price);
                }

                if (price > 0 && nextSeller) {
                    const tCpAttr = getAttr(nextSeller, 'cp');
                    if (tCpAttr) tCpAttr.value = Math.round(Number(tCpAttr.value) + price);
                }

                let cardIdToTransfer = '';
                
                if (nextSeller) {
                    const poolCandidates = next.cardPool.filter(c => c.name === itemName);
                    const inventoryId = nextSeller.inventory.find(invId => poolCandidates.some(pc => pc.id === invId));
                    
                    if (inventoryId) {
                        cardIdToTransfer = inventoryId;
                        nextSeller.inventory = removeInstances(nextSeller.inventory, [inventoryId]);
                    }
                }

                if (!cardIdToTransfer) {
                    let targetCard = next.cardPool.find(c => c.name === itemName);
                    if (!targetCard) {
                        targetCard = {
                            id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                            name: itemName,
                            description: trade.description || "交易获得的物品。",
                            itemType: trade.itemType || 'consumable',
                            triggerType: 'active',
                            cost: 5,
                            effects: []
                        };
                        targetCard = normalizeCard(targetCard);
                        next.cardPool = [...next.cardPool, targetCard];
                    }
                    cardIdToTransfer = targetCard.id;
                }

                if (nextBuyer) {
                    nextBuyer.inventory = [...nextBuyer.inventory, cardIdToTransfer];
                    tradeSuccess = true;
                }

                next.characters = nextChars;
                return next;
            });

            if (tradeSuccess) {
                const sellerName = sellerChar ? sellerChar.name : "未知来源";
                const buyerName = buyerChar ? buyerChar.name : "未知买家";
                const priceSuffix = price > 0 ? `，价格${price}CP` : '';
                
                addLog(`> ${buyerName}从${sellerName}处成功获得[${itemName}]${priceSuffix}。`);
            }
            return; 
        }

        // 5. Result Processing (Active vs Passive)
        let executionSummary = "";
        const reactors = new Set<string>();
        const triggeredPassiveDescs = new Set<string>();
        const deadChars: string[] = [];
        const newCharUpdates: Record<string, Character> = {};
        let attrAdded = false;

        // 5.1 Check New Attributes
        metaList.forEach(meta => {
            const key = meta.type === 'active' ? `eff_${meta.index}` : meta.index;
            const res = results[key];
            if (res && res.newAttribute && meta.actualTargetId) {
                const tChar = updatedState.characters[meta.actualTargetId];
                const attrName = res.newAttribute.name;
                if (tChar && !getAttr(tChar, attrName)) {
                    const attrType = res.newAttribute.type === 'TEXT' ? AttributeType.TEXT : AttributeType.NUMBER;
                    const defaultValue = attrType === AttributeType.NUMBER ? 50 : "None";
                    if (!newCharUpdates[tChar.id]) newCharUpdates[tChar.id] = { ...tChar, attributes: { ...tChar.attributes } };
                    newCharUpdates[tChar.id].attributes[attrName] = { id: attrName, name: attrName, type: attrType, value: defaultValue, visibility: AttributeVisibility.PUBLIC };
                    addLog(`> 属性觉醒: ${res.reason || `发现新属性 [${attrName}]`}`);
                    attrAdded = true;
                }
            }
        });
        if (attrAdded) {
             updateState(prev => ({ ...prev, characters: { ...prev.characters, ...newCharUpdates } }));
        }

        // 5.2 Apply Effects
        const activeHitRes = results[`eff_0`];
        const activeFailed = !activeHitRes || !activeHitRes.result;
        
        // --- Active Attribute Logic Part 3: Source Success ---
        // If Active Skill, and ANY active effect succeeds (checked here via metaList loop), increase Source Active by 30 per success.
        // We will do this inside the apply loop. But `applyEffectChange` runs inside updater.
        // Let's do it cleaner: Count successes first.
        let activeSuccessCount = 0;
        if (!activeFailed && !sourceCharId.startsWith('env_')) {
             metaList.filter(m => m.type === 'active').forEach(meta => {
                 const key = `eff_${meta.index}`;
                 const res = results[key];
                 if (res && res.result) activeSuccessCount++;
             });
        }
        
        // Batch Attribute Updates (Active +10 for Target, Active +30 per success for Source)
        // We need to merge this into the updateState call inside applyEffectChange or do it once here.
        // Doing it once here is safer for the source.
        if (activeSuccessCount > 0 && !sourceCharId.startsWith('env_')) {
             updateState(prev => {
                 const newChars = { ...prev.characters };
                 const c = newChars[sourceCharId];
                 if (c) {
                     const val = getAttr(c, '活跃');
                     if (val) val.value = Math.min(100, Number(val.value) + (activeSuccessCount * 30));
                     else c.attributes['活跃'] = { id: '活跃', name: '活跃', type: AttributeType.NUMBER, value: 50 + (activeSuccessCount * 30), visibility: AttributeVisibility.PUBLIC };
                 }
                 return { ...prev, characters: newChars };
             });
        }

        if (activeFailed) {
            const reason = formatReason(activeHitRes?.reason || "判定未通过");
            const failureLog = `> 「${card.name}」 判定失效: ${reason}`;
            addLog(failureLog, { isReaction: true });
            executionSummary += failureLog + "。";
        } else {
             // Active Succeeded
             // Apply Active Effects
             metaList.filter(m => m.type === 'active').forEach(meta => {
                 const key = `eff_${meta.index}`;
                 const res = results[key];
                 if (res && res.result) {
                     // Apply Logic
                     applyEffectChange(meta, res, meta.actualTargetId, updatedState);
                 }
             });
        }

        // Apply Passive Effects
        metaList.filter(m => m.type === 'passive').forEach(meta => {
            const key = meta.index; // is string ID
            const res = results[key];
            if (res && res.result) {
                applyEffectChange(meta, res, meta.actualTargetId, updatedState);
                if (meta.cardDescription) {
                    triggeredPassiveDescs.add(`${meta.cardName}: ${meta.cardDescription}`);
                }
            }
        });

        // Helper for applying changes
        function applyEffectChange(meta: any, res: any, targetId: string, baseState: GameState) {
             const tChar = stateRef.current.characters[targetId];
             if (!tChar) return;
             
             let val = meta.effect.value;
             if (meta.overrideVal !== undefined && meta.overrideVal !== null) {
                 val = meta.overrideVal;
             } else if (meta.effect.dynamicValue && res.derivedValue) {
                 val = res.derivedValue;
             }
             
             let newValue: string | number = val;

             updateState(prev => {
                 const nextChars = { ...prev.characters };
                 const t = nextChars[targetId];
                 if (t) {
                     // --- Active Attribute Logic Part 4: Targeted ---
                     // Any effect applied to a target increases their active (unless it's environment)
                     if (!targetId.startsWith('env_') && targetId !== sourceCharId) {
                         const actAttr = getAttr(t, '活跃');
                         if (actAttr) actAttr.value = Math.min(100, Number(actAttr.value) + 10);
                         else t.attributes['活跃'] = { id: '活跃', name: '活跃', type: AttributeType.NUMBER, value: 60, visibility: AttributeVisibility.PUBLIC };
                     }

                     let attr = getAttr(t, meta.effect.targetAttribute);
                     if (!attr) {
                         t.attributes[meta.effect.targetAttribute] = { id: meta.effect.targetAttribute, name: meta.effect.targetAttribute, type: AttributeType.NUMBER, value: 50, visibility: AttributeVisibility.PUBLIC };
                         attr = t.attributes[meta.effect.targetAttribute];
                     }
                     
                     if (attr.type === AttributeType.NUMBER) {
                         const rawNewVal = Number(attr.value) + Number(val);
                         const roundedVal = Math.round(rawNewVal);
                         const isCP = attr.id === 'cp' || attr.id === '创造点' || attr.name.toLowerCase() === 'cp' || attr.name === '创造点';
                         if (isCP) {
                             attr.value = Math.max(-1, roundedVal);
                         } else {
                             attr.value = Math.max(-1, Math.min(100, roundedVal));
                         }
                         newValue = attr.value;
                         if ((attr.name === '健康' || attr.name === 'Health') && newValue <= 0 && !targetId.startsWith('env_')) {
                             deadChars.push(targetId);
                         }
                     } else {
                         attr.value = String(val);
                         newValue = String(val);
                     }
                 }
                 return { ...prev, characters: nextChars };
             });

             const isFirstHitCheck = (meta.type === 'active' && meta.index === 0) || (meta.type === 'passive' && meta.effIndex === 0);
             if (isFirstHitCheck && Number(val) === 0 && typeof val === 'number') {
                 // Skip logging 0 value hit checks
             } else {
                 const sign = Number(val) > 0 ? '+' : '';
                 const valStr = typeof val === 'string' ? `"${val}"` : `${sign}${val}`;
                 const skillName = meta.cardName || meta.name;
                 const logMsg = `> ${meta.type === 'passive' ? '被动触发' : '生效'}: [${skillName}] ${tChar.name} ${meta.effect.targetAttribute} ${valStr} (当前: ${newValue})`;
                 addLog(logMsg);
                 executionSummary += logMsg + "。";
             }
             
             if ((targetId === primaryTargetId && targetId !== sourceCharId) || (Number(val) != 0)) {
                 reactors.add(targetId);
             }
        }

        // Death Check
        if (deadChars.length > 0) {
            const uniqueDead = Array.from(new Set(deadChars));
            uniqueDead.forEach(id => {
                const deadName = stateRef.current.characters[id]?.name;
                addLog(`系统: [${deadName}] 已死亡或失去意识 (HP <= 0)。`);
            });
        }

        // Consumption
        if (card.itemType === 'consumable') {
             updateState(prev => ({
                 ...prev,
                 characters: {
                     ...prev.characters,
                     [sourceCharId]: {
                         ...prev.characters[sourceCharId],
                         inventory: removeInstances(prev.characters[sourceCharId].inventory, [card.id])
                     }
                 }
             }));
        }

        // 6. Post-Effect Reaction
        if (activeFailed) {
            reactors.add(sourceCharId);
        }
        
        for (const reactId of reactors) {
            if (!stateRef.current.characters[reactId]) continue;
            const targetChar = stateRef.current.characters[reactId];

            let targetReaction = "";
            let triggerPrompt = "";
            
            const passiveDetails = triggeredPassiveDescs.size > 0 
                ? `\n\n[触发的被动技能详情]:\n${Array.from(triggeredPassiveDescs).join('\n')}`
                : "";

            if (reactId === sourceCharId) {
                triggerPrompt = `你使用了 [${card.name}] (描述: ${card.description})。 结果: ${executionSummary}${passiveDetails}`;
            } else {
                triggerPrompt = `被 ${sourceChar.name} 的 [${card.name}] (描述: ${card.description}) 击中/影响。 结果: ${executionSummary}${passiveDetails}`;
            }

            if (targetChar.isPlayer && !stateRef.current.round.autoReaction && requestPlayerReaction) {
                const manual = await requestPlayerReaction(targetChar.id, `受击/效果反应`, triggerPrompt);
                if (manual === null) continue; // Cancelled
                targetReaction = manual;
            } else {
                if (checkSession() !== startSession) return;
                targetReaction = await determineCharacterReaction(
                targetChar, 
                triggerPrompt, 
                stateRef.current.appSettings, 
                stateRef.current.defaultSettings, 
                stateRef.current.world.attributes, 
                stateRef.current.world.history,
                activeLocId,
                stateRef.current.appSettings.maxCharacterMemoryRounds,
                addDebugLog,
                localChars,
                stateRef.current.cardPool,
                stateRef.current.globalContext,
                stateRef.current, 
                (msg) => addLog(msg, { type: 'system' }),
                handleTriggerUpdate
                );
            }
            
            if (checkSession() === startSession) {
                if (targetReaction) {
                    addLog(`${targetChar.name}: ${targetReaction}`, { isReaction: true, actingCharId: reactId });
                } else {
                    addLog(`${targetChar.name}没有反应。`, { type: 'action', actingCharId: reactId });
                }
            }
        }
    };

    return { executeSkill };
};
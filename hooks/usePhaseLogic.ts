
import { MutableRefObject } from 'react';
import { GameState, GamePhase, DebugLog, AttributeType, AttributeVisibility, Character, LogEntry, Trigger, Card, Conflict, Drive } from '../types';
import { analyzeSettlement } from '../services/aiService';
import { DEFAULT_AI_CONFIG } from '../config';

interface UsePhaseLogicProps {
    stateRef: MutableRefObject<GameState>;
    updateState: (updater: (current: GameState) => GameState) => void;
    addLog: (text: string, overrides?: Partial<LogEntry>) => void;
    setIsProcessingAI: (val: boolean) => void;
    setProcessingLabel: (val: string) => void;
    handleAiFailure: (context: string, e: any) => void;
    setPhase: (phase: GamePhase) => void;
    addDebugLog: (log: DebugLog) => void;
    checkSession: () => number;
}

const getAttrVal = (char: Character, key: string): number => {
    if (!char || !char.attributes) return 0;
    if (char.attributes[key]) return Number(char.attributes[key].value);
    const map: Record<string, string> = {
        'health': '健康', '健康': 'health',
        'physique': '体能', '体能': 'physique',
        'active': '活跃', '活跃': 'active'
    };
    const alias = map[key];
    if (alias && char.attributes[alias]) return Number(char.attributes[alias].value);
    // Default Active to 50 if missing
    if (key === 'active' || key === '活跃') return 50; 
    return 0;
};

// Helper: Check if character holds a specific card (Innate or Inventory)
const hasHiddenRoundCard = (char: Character, cardPool: Card[]): boolean => {
    // 1. Check Skills
    if (char.skills.some(c => c.name.includes("隐藏轮次"))) return true;
    
    // 2. Check Inventory (Look up in pool)
    return char.inventory.some(id => {
        const card = cardPool.find(c => c.id === id);
        return card && card.name.includes("隐藏轮次");
    });
};

export const usePhaseLogic = ({
    stateRef, updateState, addLog, setIsProcessingAI, setProcessingLabel, handleAiFailure, setPhase, addDebugLog, checkSession
}: UsePhaseLogicProps) => {

    const handleTriggerUpdate = (id: string, updates: Partial<Trigger>) => {
        updateState(prev => ({
            ...prev,
            triggers: {
                ...prev.triggers,
                [id]: { ...prev.triggers[id], ...updates }
            }
        }));
    };

    const phaseOrderDetermination = async () => {
        const startSession = checkSession();
        const currentState = stateRef.current;
        
        if (currentState.round.useManualTurnOrder) {
            if ((currentState.round.autoAdvanceCount || 0) > 0 && currentState.round.defaultOrder.length > 0) {
                 updateState(prev => ({
                    ...prev,
                    round: { 
                        ...prev.round, 
                        currentOrder: prev.round.defaultOrder, 
                        turnIndex: 0, 
                        phase: 'turn_start', 
                        isWaitingForManualOrder: false
                    }
                }));
                addLog(`系统: 自动推进中，沿用手动设定的行动顺序: [${currentState.round.defaultOrder.map(id => stateRef.current.characters[id]?.name || id).join(', ')}]`);
                return;
            }

            updateState(prev => ({
                ...prev,
                round: { 
                    ...prev.round, 
                    isWaitingForManualOrder: true,
                    currentOrder: prev.round.defaultOrder.length > 0 ? prev.round.defaultOrder : Object.keys(prev.characters)
                }
            }));
            return;
        }

        const locationId = currentState.map.activeLocationId;
        const allChars = Object.values(currentState.characters) as Character[];
        
        let locChars = allChars.filter(c => {
            const pos = currentState.map.charPositions[c.id];
            return pos && pos.locationId === locationId;
        });

        // --- HIDDEN ROUND FILTERING ---
        if (currentState.round.isHiddenRound) {
            addLog("系统: --- 隐藏轮次 (Hidden Round) ---");
            // Only keep Environment Characters OR Characters with Hidden Round Card
            locChars = locChars.filter(c => c.id.startsWith('env_') || hasHiddenRoundCard(c, currentState.cardPool));
        }

        const aliveChars = locChars.filter(c => {
            const hp = getAttrVal(c, '健康'); 
            return hp > 0;
        });

        const envChars = aliveChars.filter(c => c.id.startsWith('env_'));
        const normalChars = aliveChars.filter(c => !c.id.startsWith('env_'));

        let finalOrder: string[] = [];

        // --- NEW: Active Attribute Weighted Selection ---
        if (!currentState.round.isHiddenRound) {
            const playerChars = normalChars.filter(c => c.isPlayer);
            const npcChars = normalChars.filter(c => !c.isPlayer);
            
            const maxNPCs = currentState.defaultSettings.gameplay.maxNPCsPerRound || 4;
            let selectedNPCs: Character[] = [];

            if (npcChars.length > 0) {
                // Weighted Random Selection (Pick up to maxNPCs)
                const pool = [...npcChars];
                const candidates: Character[] = [];
                
                // Pick N candidates
                for (let i = 0; i < maxNPCs; i++) {
                    if (pool.length === 0) break;
                    
                    const totalWeight = pool.reduce((sum, c) => sum + Math.max(1, getAttrVal(c, '活跃') + 2), 0);
                    let r = Math.random() * totalWeight;
                    
                    for (let j = 0; j < pool.length; j++) {
                        const w = Math.max(1, getAttrVal(pool[j], '活跃') + 2);
                        if (r < w) {
                            candidates.push(pool[j]);
                            pool.splice(j, 1);
                            break;
                        }
                        r -= w;
                    }
                }

                // Filtering candidates
                if (candidates.length > 0) {
                    // 1. Highest Active is Guaranteed
                    candidates.sort((a, b) => getAttrVal(b, '活跃') - getAttrVal(a, '活跃'));
                    selectedNPCs.push(candidates[0]); // Best one
                    
                    // 2. Others probabilistic
                    for (let i = 1; i < candidates.length; i++) {
                        const active = getAttrVal(candidates[i], '活跃');
                        const chance = (active + 2) / 100;
                        if (Math.random() < chance) {
                            selectedNPCs.push(candidates[i]);
                        }
                    }
                }
            }

            // Combine PC + Selected NPCs
            const participants = [...playerChars, ...selectedNPCs];
            
            // Sort by Physique
            participants.sort((a, b) => {
                const physA = getAttrVal(a, '体能');
                const physB = getAttrVal(b, '体能');
                return physB - physA;
            });

            // Add Environment Chars Probabilistically
            const nonEnvCount = participants.length;
            const envChance = Math.min(1.0, nonEnvCount * 0.2);
            
            finalOrder = participants.map(c => c.id);
            
            if (envChars.length > 0 && Math.random() < envChance) {
                // Usually just one env char per location, add it at the end
                finalOrder.push(envChars[0].id);
            }

        } else {
            // Hidden Round: Just sort all valid (filtered above) by physique
            normalChars.sort((a, b) => getAttrVal(b, '体能') - getAttrVal(a, '体能'));
            finalOrder = [...normalChars.map(c => c.id), ...envChars.map(c => c.id)];
        }

        if (finalOrder.length === 0) {
             addLog(`系统: 当前地点无有效活跃单位。流程已自动暂停。`);
        } else {
             const names = finalOrder.map(id => currentState.characters[id]?.name || id).join(', ');
             const label = currentState.round.isHiddenRound ? "隐藏轮次行动顺序" : "本轮行动顺序";
             addLog(`系统: ${label}: [${names}]`);
        }

        if (checkSession() !== startSession) return;

        updateState(prev => {
            return {
                ...prev,
                round: { 
                    ...prev.round, 
                    currentOrder: finalOrder, 
                    turnIndex: 0, 
                    phase: 'turn_start',
                    defaultOrder: finalOrder,
                    isPaused: finalOrder.length === 0 
                }
            };
        });

        const nextWorldAttrs = currentState.world.attributes; 
        const timeAttr = nextWorldAttrs['worldTime'];
        const statusAttr = nextWorldAttrs['world_status'] || nextWorldAttrs['weather'];
        const timeStr = timeAttr ? String(timeAttr.value) : "未知时间";
        const statusStr = statusAttr ? String(statusAttr.value) : "未知";

        const parts = timeStr.split(':');
        const formattedTime = parts.length >= 5
            ? `${parts[0]}年${parts[1]}月${parts[2]}日${parts[3]}时${parts[4]}分`
            : timeStr;

        addLog(`当前故事时间：${formattedTime}，世界状态：${statusStr}`, { type: 'system' });
    };

    const phaseTurnStart = () => {
        const { currentOrder, turnIndex } = stateRef.current.round;
        
        if (turnIndex >= currentOrder.length) {
            setPhase('settlement');
            return;
        }

        const activeCharId = currentOrder[turnIndex];
        if (!stateRef.current.characters[activeCharId]) {
            updateState(prev => ({
                ...prev,
                round: { ...prev.round, turnIndex: prev.round.turnIndex + 1 }
            }));
            return;
        }

        updateState(prev => ({
            ...prev,
            round: { ...prev.round, activeCharId, phase: 'char_acting' }
        }));
    };

    const phaseSettlement = async () => {
        const startSession = checkSession();
        const snapshotState: GameState = stateRef.current; // Snapshot for AI & Data
        
        // --- 1. SKIP SETTLEMENT CHECK (Hidden Round End or Manual Skip) ---
        if (snapshotState.round.skipSettlement || snapshotState.round.isHiddenRound) {
            if (snapshotState.round.isHiddenRound) {
                addLog("系统: 隐藏轮次结束，跳过结算阶段。", { type: 'system' });
                // Reset Hidden Flag immediately
                updateState(s => ({ ...s, round: { ...s.round, isHiddenRound: false } }));
            }
            phaseRoundEnd();
            return;
        }

        // 1. Immediate UI Feedback & Next Round Transition (Non-blocking)
        addLog("--- 轮次结算中，游戏继续 ---", { type: 'system' });

        const remainingAuto = snapshotState.round.autoAdvanceCount || 0;
        const nextAutoCount = remainingAuto > 0 ? remainingAuto - 1 : 0;
        const shouldContinue = nextAutoCount > 0;
        const apRecovery = 5; 
        const nextRoundNumber = snapshotState.round.roundNumber + 1;

        // --- HIDDEN ROUND TRIGGER CHECK ---
        const locationId = snapshotState.map.activeLocationId;
        let triggerHiddenRound = false;
        
        if (locationId) {
            const locChars = Object.values(snapshotState.characters).filter(c => {
                const pos = snapshotState.map.charPositions[c.id];
                return pos && pos.locationId === locationId;
            });
            // Check if ANY character has the special card
            if (locChars.some(c => hasHiddenRoundCard(c, snapshotState.cardPool))) {
                triggerHiddenRound = true;
            }
        }

        // Prepare Logs
        const ts = Date.now();
        const newLogs: LogEntry[] = [];

        // Round Start Log
        newLogs.push({
            id: `log_round_${nextRoundNumber}_start_${ts}`,
            round: nextRoundNumber,
            turnIndex: 0,
            content: `--- 第 ${nextRoundNumber} 轮 开始 ---`,
            timestamp: ts,
            type: 'system',
            snapshot: { 
                ...snapshotState.round,
                roundNumber: nextRoundNumber,
                turnIndex: 0,
                phase: 'init',
                currentOrder: [],
                activeCharId: undefined,
                isPaused: triggerHiddenRound ? false : !shouldContinue, // FORCE continue if hidden round
                autoAdvanceCount: nextAutoCount,
                actionPoints: snapshotState.round.actionPoints + apRecovery,
                isHiddenRound: triggerHiddenRound // Set flag for next round
            }
        });

        // Immediate State Update: Advance Round, Recover AP, Weather RNG
        updateState(prev => {
            let worldAttrsUpdate = { ...prev.world.attributes };

            if (Math.random() < (prev.defaultSettings.weatherChangeProbability || 0.1)) {
                const weatherConfig = prev.defaultSettings.weatherConfig;
                if (weatherConfig.length > 0) {
                    const totalW = weatherConfig.reduce((a, b) => a + b.weight, 0);
                    let r = Math.random() * totalW;
                    let newStatus = weatherConfig[0].name;
                    for (const w of weatherConfig) {
                        if (r < w.weight) { newStatus = w.name; break; }
                        r -= w.weight;
                    }
                    worldAttrsUpdate = {
                        ...worldAttrsUpdate,
                        'world_status': { 
                            ...(worldAttrsUpdate['world_status'] || { id: 'world_status', name: '状态', type: AttributeType.TEXT, value: '', visibility: AttributeVisibility.PUBLIC }),
                            value: newStatus
                        }
                    };
                }
            }

            return {
                ...prev,
                world: {
                    ...prev.world,
                    attributes: worldAttrsUpdate,
                    history: [...prev.world.history, ...newLogs]
                },
                round: {
                    ...prev.round,
                    roundNumber: nextRoundNumber,
                    turnIndex: 0,
                    phase: 'init', // Start new round immediately
                    currentOrder: [],
                    activeCharId: undefined,
                    isPaused: triggerHiddenRound ? false : !shouldContinue, // Ensure continuity for Hidden Round
                    autoAdvanceCount: nextAutoCount,
                    actionPoints: prev.round.actionPoints + apRecovery,
                    isHiddenRound: triggerHiddenRound
                }
            };
        });

        // 2. Background AI Processing
        (async () => {
            try {
                // Prepare data from SNAPSHOT (Previous Round context)
                const activeConflicts: any[] = [];
                const activeDrives: any[] = [];
                
                const participantsIds: string[] = (snapshotState.round.currentOrder as string[]).filter((id: string) => !id.startsWith('env_'));
                const participants: Character[] = participantsIds
                    .map((id: string) => snapshotState.characters[id])
                    .filter((c: Character | undefined): c is Character => c !== undefined);
                
                participants.forEach((c: Character) => {
                    (c.conflicts || []).forEach(conf => {
                        if (!conf.solved) activeConflicts.push({ id: conf.id, charName: c.name, desc: conf.desc });
                    });
                    (c.drives || []).forEach(drv => {
                        activeDrives.push({ drive: drv, charName: c.name });
                    });
                });

                // Call AI
                let settlementResult = null;
                if (activeConflicts.length > 0 || activeDrives.length > 0) {
                    settlementResult = await analyzeSettlement(
                        snapshotState.judgeConfig || DEFAULT_AI_CONFIG,
                        snapshotState.world.history,
                        activeConflicts,
                        activeDrives,
                        snapshotState.appSettings,
                        snapshotState.defaultSettings,
                        snapshotState.world.attributes,
                        snapshotState.globalContext, 
                        addDebugLog,
                        snapshotState, 
                        undefined, 
                        undefined
                    );
                }

                if (checkSession() !== startSession) return;

                if (settlementResult) {
                    const solvedIds = settlementResult.solvedConflictIds || [];
                    const fulfilledDriveIds = settlementResult.fulfilledDriveIds || [];
                    
                    updateState((prev: GameState) => {
                        const nextChars = { ...prev.characters };
                        
                        Object.keys(nextChars).forEach(charId => {
                            const char: Character = nextChars[charId];
                            const isEnv = char.id.startsWith('env_');
                            const isParticipating = participantsIds.includes(charId);

                            if (char.conflicts) {
                                char.conflicts = char.conflicts.map((c: Conflict) => {
                                    if (solvedIds.includes(c.id) && !c.solved) {
                                        const cpAttr = char.attributes['cp'] || char.attributes['创造点'];
                                        if (cpAttr) {
                                            cpAttr.value = Math.round(Number(cpAttr.value) + c.apReward);
                                        }
                                        return { ...c, solved: true, solvedTimestamp: Date.now() };
                                    }
                                    return c;
                                });
                            }

                            if (char.drives) {
                                const fulfilled = char.drives.filter((t: Drive) => fulfilledDriveIds.includes(t.id));
                                if (fulfilled.length > 0) {
                                    let totalPleasure = 0;
                                    fulfilled.forEach(t => {
                                        totalPleasure += t.amount;
                                        t.weight = (t.weight || 50) + 20;
                                    });
                                    const pleasureAttr = char.attributes['快感'] || char.attributes['pleasure'];
                                    if (pleasureAttr) {
                                        const currentP = Number(pleasureAttr.value);
                                        pleasureAttr.value = Math.round(Math.min(100, currentP + totalPleasure));
                                    }
                                }
                            }

                            // Natural Decay/Recovery for participants
                            if (!isEnv && isParticipating) {
                                // 1. Pleasure Decay: 20%
                                const pleasureAttr = char.attributes['快感'] || char.attributes['pleasure'];
                                if (pleasureAttr) {
                                    const currentP = Number(pleasureAttr.value);
                                    pleasureAttr.value = Math.round(Math.max(0, currentP * 0.8));
                                }

                                // 2. Physique Recovery: 20% of missing
                                const physiqueAttr = char.attributes['体能'] || char.attributes['physique'];
                                if (physiqueAttr) {
                                    const currentPhy = Number(physiqueAttr.value);
                                    const missing = 100 - currentPhy;
                                    const recovery = missing * 0.2;
                                    physiqueAttr.value = Math.round(Math.min(100, currentPhy + recovery));
                                }

                                // 3. Active (活跃) Decay: 20%
                                const activeAttr = char.attributes['活跃'] || char.attributes['active'];
                                if (activeAttr) {
                                    const currentAct = Number(activeAttr.value);
                                    activeAttr.value = Math.round(Math.max(-1, currentAct * 0.8)); // Allow -1 minimum
                                } else {
                                    // Init if missing
                                    char.attributes['活跃'] = { id: '活跃', name: '活跃', type: AttributeType.NUMBER, value: 40, visibility: AttributeVisibility.PUBLIC };
                                }

                                // 4. Drive Weight Decay
                                if (char.drives) {
                                    char.drives.forEach(d => {
                                        d.weight = Math.round((d.weight || 50) - 10);
                                    });
                                    char.drives = char.drives.filter(d => (d.weight || 0) > 0);
                                }
                            }
                        });
                        return { ...prev, characters: nextChars };
                    });

                    if (solvedIds.length > 0) addLog(`系统: (第${snapshotState.round.roundNumber}轮结算) ${solvedIds.length} 个矛盾已解决。`);
                    if (fulfilledDriveIds.length > 0) addLog(`系统: (第${snapshotState.round.roundNumber}轮结算) ${fulfilledDriveIds.length} 个欲望已满足。`);
                }

            } catch (e: any) {
                console.error("Background Settlement Failed", e);
                if (checkSession() === startSession) {
                    addDebugLog({
                        id: `err_settle_${Date.now()}`,
                        timestamp: Date.now(),
                        characterName: "System",
                        prompt: "Background Settlement",
                        response: `Failed: ${e.message}`
                    });
                }
            }
        })();
    };

    const phaseRoundEnd = () => {
        // This is only called when manually skipping settlement or other edge cases
        // It mimics the atomic logic inside phaseSettlement
        updateState(prev => {
            const remainingAuto = prev.round.autoAdvanceCount || 0;
            const nextAutoCount = remainingAuto > 0 ? remainingAuto - 1 : 0;
            const shouldContinue = nextAutoCount > 0;
            const apRecovery = 5; 
            const nextRoundNumber = prev.round.roundNumber + 1;

            const roundStartLog: LogEntry = {
                id: `log_round_${nextRoundNumber}_start_${Date.now()}`,
                round: nextRoundNumber,
                turnIndex: 0,
                content: `--- 第 ${nextRoundNumber} 轮 开始 ---`,
                timestamp: Date.now(),
                type: 'system',
                snapshot: {
                    ...prev.round,
                    roundNumber: nextRoundNumber,
                    turnIndex: 0,
                    phase: 'init',
                    currentOrder: [],
                    activeCharId: undefined,
                    isPaused: !shouldContinue, 
                    autoAdvanceCount: nextAutoCount,
                    actionPoints: prev.round.actionPoints + apRecovery,
                    isHiddenRound: false // Reset hidden round flag on manual skip/force end
                }
            };

            return {
                ...prev,
                world: {
                    ...prev.world,
                    history: [...prev.world.history, roundStartLog]
                },
                round: {
                    ...prev.round,
                    roundNumber: nextRoundNumber,
                    turnIndex: 0,
                    phase: 'init',
                    currentOrder: [],
                    activeCharId: undefined,
                    isPaused: !shouldContinue, 
                    autoAdvanceCount: nextAutoCount,
                    actionPoints: prev.round.actionPoints + apRecovery,
                    isHiddenRound: false
                }
            };
        });
    };

    return {
        phaseOrderDetermination,
        phaseTurnStart,
        phaseSettlement,
        phaseRoundEnd
    };
};
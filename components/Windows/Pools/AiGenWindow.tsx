
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { GameState, Character, Card, AttributeType, AttributeVisibility, DebugLog, GameAttribute, GameImage } from '../../../types';
import { X, User, Bot, Loader2 } from 'lucide-react';
import { Input, TextArea, Label, Button } from '../../ui/Button';
import { generateCharacter, normalizeCard } from '../../../services/aiService';
import { DEFAULT_AI_CONFIG } from '../../../config';
import { getRandomChineseNames } from '../../../services/nameService';
import { defaultAcquireCard, defaultInteractCard, defaultTradeCard } from '../../../services/DefaultSettings';
import { generateRandomFlagAvatar } from '../../../assets/imageLibrary';
import { useImageAttachments } from '../../../hooks/useImageAttachments';
import { ImageAttachmentList } from '../../ui/ImageAttachmentList';
import { ImageUploadModal } from '../../Modals/ImageUploadModal';

// Helper for generating conflict IDs
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

export const AiGenWindow: React.FC<{
    state: GameState,
    updateState: (updater: (current: GameState) => GameState) => void,
    addLog: (text: string, overrides?: any) => void,
    onClose: () => void,
    isPlayerMode?: boolean,
    addDebugLog?: (log: DebugLog) => void;
    onGenerationComplete?: () => void;
    targetLocationId?: string; // New: Optional override for location
    cost?: number; // New: Cost for generation (AP)
}> = ({ state, updateState, addLog, onClose, isPlayerMode = false, addDebugLog, onGenerationComplete, targetLocationId, cost = 0 }) => {
    const [genName, setGenName] = useState("");
    const [genDesc, setGenDesc] = useState("");
    const [genStyle, setGenStyle] = useState("");
    
    // Image Attachments: Appearance
    const appImgs = useImageAttachments();
    // Image Attachments: Description/Settings
    const setImgs = useImageAttachments();

    // Determine effective location
    const activeLocId = targetLocationId || state.map.activeLocationId;
    const activeLocName = activeLocId ? state.map.locations[activeLocId]?.name : "未知区域";

    const handleGenerate = () => {
        // 1. Check Cost
        const currentAP = state.round.actionPoints;
        if (cost > 0 && currentAP < cost) {
            alert("行动点 (AP) 不足！");
            return;
        }

        // 2. Pre-deduct Cost
        if (cost > 0) {
            updateState(prev => ({
                ...prev,
                round: { ...prev.round, actionPoints: prev.round.actionPoints - cost }
            }));
            addLog(`系统: 消耗 ${cost} AP，开始${isPlayerMode ? '创建玩家' : '生成'}角色...`);
        } else {
             addLog(`系统: [${activeLocName}] 添加角色中${isPlayerMode ? '(玩家)' : ''}`, { type: 'system' });
        }

        // 3. Close the window immediately to unblock user
        onClose();

        // 4. Prepare Context Variables (Synchronously capture current state)
        const loc = state.map.locations[activeLocId || ""];
        const region = loc && loc.regionId ? state.map.regions[loc.regionId] : null;
        
        const localChars = (Object.values(state.characters) as Character[])
            .filter(c => state.map.charPositions[c.id]?.locationId === activeLocId)
            .map(c => `${c.name}: ${c.description.substring(0, 50)}...`)
            .join('\n');

        const modelConfig = state.charGenConfig || state.judgeConfig || DEFAULT_AI_CONFIG;

        const finalDesc = genDesc.trim() || "请根据当前地点和区域的背景设定，随机创作一个符合氛围的角色。";
        const finalStyle = genStyle.trim() || "请根据角色设定自动搭配合适的技能组。";

        const targetNameInput = genName.trim();

        const appearanceImages = appImgs.images;
        const settingImages = setImgs.images;

        // 5. Run AI logic in background (Detached Promise)
        (async () => {
            try {
                const suggestedNames = targetNameInput 
                    ? [targetNameInput] 
                    : await getRandomChineseNames(10);

                const genData = await generateCharacter(
                    modelConfig,
                    finalDesc,
                    finalStyle,
                    loc ? loc.name : "未知荒野",
                    region ? region.name : "未探明区域",
                    localChars,
                    state.world.history,
                    state.appSettings,
                    state.defaultSettings,
                    state.globalContext,
                    state.world.worldGuidance,
                    suggestedNames,
                    state,
                    (msg) => addLog(msg, { type: 'system' }), // Forward logs to system
                    undefined, 
                    addDebugLog,
                    appearanceImages,
                    settingImages
                ) as any;

                if (genData) {
                    const newId = `gen_${isPlayerMode ? 'player' : 'npc'}_${Date.now()}`;
                    
                    // Note: We access state inside updateState updater to ensure we use the LATEST state at write time
                    updateState(prev => {
                        let nextConflictId = getNextConflictId(prev.characters);
                        const newConflicts = (genData.conflicts || []).map((c: any) => ({
                            ...c,
                            id: String(nextConflictId++)
                        }));

                        const rawSkills = genData.skills || [];
                        const uniqueAiSkills = rawSkills.filter((s: any) => {
                            const n = (s.name || "").toLowerCase();
                            return !['交易', '互动', '获取', 'trade', 'interact', 'acquire', '尝试获取'].some(k => n.includes(k));
                        });

                        const newSkills: Card[] = uniqueAiSkills.map((s: any, i: number) => {
                            const isSettlement = s.trigger === 'settlement';
                            const targetType = isSettlement ? 'self' : 'specific_char';
                            
                            let effectVal = s.effect_val;
                            const effectAttr = s.effect_attr || '健康';
                            
                            const isDynamic = (effectVal === undefined || effectVal === null);
                            if (isDynamic) {
                                effectVal = isSettlement ? 5 : -5;
                            }

                            return {
                                id: `card_${newId}_${i}`,
                                name: s.name,
                                description: s.description || "AI Generated Skill",
                                itemType: 'skill',
                                triggerType: s.trigger || 'active',
                                cost: 0,
                                effects: [
                                    {
                                        id: `eff_hit_${i}`,
                                        name: '命中/触发判定',
                                        targetType: targetType,
                                        targetAttribute: '健康',
                                        value: 0,
                                        conditionDescription: s.condition || "True",
                                        conditionContextKeys: []
                                    },
                                    {
                                        id: `eff_res_${i}`,
                                        name: '实际效果',
                                        targetType: targetType,
                                        targetAttribute: effectAttr,
                                        value: effectVal,
                                        dynamicValue: false,
                                        conditionDescription: "True",
                                        conditionContextKeys: []
                                    }
                                ]
                            };
                        }).map(normalizeCard);

                        if (!newSkills.some((s: any) => s.name.includes("获取") || s.id === defaultAcquireCard.id)) {
                            newSkills.push(defaultAcquireCard);
                        }
                        if (!newSkills.some((s: any) => s.id === defaultTradeCard.id)) {
                            newSkills.push(defaultTradeCard);
                        }
                        if (!newSkills.some((s: any) => s.id === defaultInteractCard.id)) {
                            newSkills.push(defaultInteractCard);
                        }

                        const rawAttributes = genData.attributes || {};
                        const finalAttributes: Record<string, GameAttribute> = {};

                        Object.entries(rawAttributes).forEach(([key, val]: [string, any]) => {
                            if (val === null || val === undefined) return;

                            let finalVal: string | number = 50;
                            let type = AttributeType.NUMBER;

                            if (typeof val === 'number' || typeof val === 'string') {
                                finalVal = val;
                            } 
                            else if (typeof val === 'object') {
                                if ('value' in val) finalVal = val.value;
                                else finalVal = 50;
                            }

                            if (typeof finalVal === 'number' || (!isNaN(Number(finalVal)) && String(finalVal).trim() !== '')) {
                                type = AttributeType.NUMBER;
                                finalVal = Math.round(Number(finalVal));
                            } else {
                                type = AttributeType.TEXT;
                                finalVal = String(finalVal);
                            }

                            finalAttributes[key] = {
                                id: key,
                                name: key,
                                type: type,
                                value: finalVal,
                                visibility: AttributeVisibility.PUBLIC
                            };
                        });

                        // Ensure Core Attributes
                        if (!finalAttributes['创造点']) finalAttributes['创造点'] = { id: '创造点', name: '创造点', type: AttributeType.NUMBER, value: 50, visibility: AttributeVisibility.PUBLIC };
                        if (!finalAttributes['健康']) finalAttributes['健康'] = { id: '健康', name: '健康', type: AttributeType.NUMBER, value: 50, visibility: AttributeVisibility.PUBLIC };
                        if (!finalAttributes['体能']) finalAttributes['体能'] = { id: '体能', name: '体能', type: AttributeType.NUMBER, value: 50, visibility: AttributeVisibility.PUBLIC };
                        if (!finalAttributes['快感']) finalAttributes['快感'] = { id: '快感', name: '快感', type: AttributeType.NUMBER, value: 50, visibility: AttributeVisibility.PUBLIC };
                        if (!finalAttributes['活跃']) finalAttributes['活跃'] = { id: '活跃', name: '活跃', type: AttributeType.NUMBER, value: 50, visibility: AttributeVisibility.PUBLIC };

                        const behaviorConfig = prev.charBehaviorConfig || prev.judgeConfig || DEFAULT_AI_CONFIG;

                        const newChar: Character = {
                            id: newId,
                            isPlayer: isPlayerMode,
                            name: genData.name || "AI角色",
                            appearance: genData.appearance || "普通的样貌",
                            description: genData.description || "...",
                            style: genData.style || "",
                            avatarUrl: appearanceImages.length > 0 ? appearanceImages[0].base64 : generateRandomFlagAvatar(),
                            attributes: finalAttributes,
                            skills: newSkills,
                            inventory: [],
                            drives: genData.drives || genData.creationTriggers || [],
                            conflicts: newConflicts,
                            aiConfig: { ...behaviorConfig }, 
                            contextConfig: { messages: [] },
                            appearanceCondition: "在此地",
                            enableAppearanceCheck: true,
                            isFollowing: isPlayerMode,
                            appearanceImages: appearanceImages,
                            descriptionImages: settingImages
                        };

                        let newOrder = prev.round.currentOrder;
                        if (isPlayerMode && !newOrder.includes(newId)) {
                            newOrder = [...newOrder, newId];
                        }

                        return {
                            ...prev,
                            characters: { ...prev.characters, [newId]: newChar },
                            map: {
                                ...prev.map,
                                charPositions: {
                                    ...prev.map.charPositions,
                                    [newId]: { x: loc?.coordinates.x || 0, y: loc?.coordinates.y || 0, locationId: activeLocId }
                                }
                            },
                            round: {
                                ...prev.round,
                                currentOrder: newOrder,
                                defaultOrder: isPlayerMode ? [...prev.round.defaultOrder, newId] : prev.round.defaultOrder
                            }
                        };
                    });
                    
                    addLog(`系统: ${isPlayerMode ? '神秘人物' : '当地人'} [${genData.name}] 已加入当前地点。`);
                    
                    if (onGenerationComplete) {
                        onGenerationComplete();
                    }
                } else {
                    throw new Error("生成数据为空或无效");
                }
            } catch (e: any) {
                console.error("BG Gen Error", e);
                // Refund cost on error
                if (cost > 0) {
                     updateState(prev => ({
                        ...prev,
                        round: { ...prev.round, actionPoints: prev.round.actionPoints + cost }
                    }));
                    addLog(`系统: 角色生成失败 (${e.message})，已返还 ${cost} AP。`, { type: 'system' });
                } else {
                    addLog(`系统: 角色生成失败 (${e.message})`, { type: 'system' });
                }
            }
        })();
    };

    return createPortal(
        <div className="fixed inset-0 bg-overlay z-[9999] flex items-center justify-center p-6 animate-in fade-in"
             onClick={(e) => {
                 if (e.target === e.currentTarget) onClose();
             }}
        >
            {(appImgs.isModalOpen || appImgs.editingImage) && (
                <ImageUploadModal 
                    onClose={appImgs.closeModal} 
                    onConfirm={appImgs.addImage}
                    initialImage={appImgs.editingImage}
                />
            )}
            {(setImgs.isModalOpen || setImgs.editingImage) && (
                <ImageUploadModal 
                    onClose={setImgs.closeModal} 
                    onConfirm={setImgs.addImage}
                    initialImage={setImgs.editingImage}
                />
            )}

            <div className="w-full max-w-5xl glass-panel p-6 relative flex flex-col max-h-[90vh]">
                <button onClick={onClose} className="absolute top-4 right-4 text-muted hover:text-highlight"><X size={20}/></button>
                
                <h3 className="text-lg font-bold text-highlight mb-4 flex items-center gap-2">
                    {isPlayerMode ? <User className="text-primary"/> : <Bot className="text-accent-teal"/>}
                    {isPlayerMode ? "创建玩家角色 (Player Generation)" : "NPC 快速生成 (NPC Generation)"}
                </h3>
                
                <div className="mb-4 text-sm text-muted bg-surface-highlight p-3 rounded border border-border">
                    <p>生成地点: <span className="text-primary font-bold">{activeLocName}</span></p>
                    {isPlayerMode && <p className="text-primary mt-1 text-xs font-bold">将在生成后自动开启跟随模式。</p>}
                    {cost > 0 && <p className="text-warning-fg mt-1 text-xs font-bold flex items-center gap-1">消耗: {cost} AP (失败返还)</p>}
                </div>

                <div className="space-y-6 overflow-y-auto flex-1 mb-4 flex flex-col custom-scrollbar">
                    <div className="flex flex-col gap-2">
                        <Label>角色姓名 (Name)</Label>
                        <Input 
                            value={genName}
                            onChange={e => setGenName(e.target.value)}
                            placeholder="指定姓名 (留空则随机)"
                        />
                    </div>

                    <div className="flex flex-col gap-2 flex-1">
                        <Label>角色描述 / 身份背景 (Description)</Label>
                        <TextArea 
                            className="h-48 resize-none text-sm bg-surface-light" 
                            placeholder="例如: 一个精通机械的女性冒险家，性格冷静，专业水平过硬... (留空则由AI根据地点自动发挥)"
                            value={genDesc}
                            onChange={e => setGenDesc(e.target.value)}
                        />
                    </div>
                    
                    {/* Image Attachments */}
                    <div className="space-y-4 bg-surface-light/30 p-3 rounded border border-border">
                        <ImageAttachmentList 
                            images={appImgs.images}
                            onRemove={appImgs.removeImage}
                            onAdd={appImgs.openModal}
                            onImageClick={appImgs.editImage}
                            maxImages={1}
                            label="外观参考图 (Appearance)"
                        />
                        <ImageAttachmentList 
                            images={setImgs.images}
                            onRemove={setImgs.removeImage}
                            onAdd={setImgs.openModal}
                            onImageClick={setImgs.editImage}
                            maxImages={3}
                            label="设定参考图 (Setting/Context)"
                        />
                        <p className="text-[10px] text-muted italic">
                            上传的图片将作为参考信息发送给 AI，用于辅助生成角色的外观描述和设定细节。
                        </p>
                    </div>

                    <div className="flex flex-col gap-2 flex-1">
                        <Label>技能 / 战斗风格 (Skill Style)</Label>
                        <TextArea 
                            className="h-32 resize-none text-sm bg-surface-light" 
                            placeholder="例如: 喜欢说话，擅长用语言干扰敌人；或者擅长使用重型火器... (留空则由AI自动搭配)"
                            value={genStyle}
                            onChange={e => setGenStyle(e.target.value)}
                        />
                        <p className="text-[10px] text-muted mt-1">AI 将根据此风格生成角色的固有卡牌(Skills)。</p>
                    </div>
                </div>

                <div className="flex justify-end gap-2 mt-auto pt-4 border-t border-border">
                    <Button variant="secondary" onClick={onClose}>
                        取消
                    </Button>
                    <Button onClick={handleGenerate}>
                        确认生成
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    );
};
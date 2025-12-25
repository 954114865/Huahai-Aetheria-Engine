
import React from 'react';
import { AppSettings, AIConfig, DefaultSettings, GlobalVariable, Provider } from '../../../types';
import { ModelConfigCard } from './ModelConfigCard';
import { Button, Input, Label } from '../../ui/Button';
import { Globe, BrainCircuit, Bot, Clock, FastForward, MessageSquare, History, Scissors, User, Variable, Plus, Trash2, Palette, Image as ImageIcon, Smartphone, Activity, ArrowDownCircle, Eraser, Users } from 'lucide-react';

interface GeneralTabProps {
    localSettings: AppSettings;
    setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
    localJudge: AIConfig;
    setLocalJudge: React.Dispatch<React.SetStateAction<AIConfig>>;
    localCharGen: AIConfig;
    setLocalCharGen: React.Dispatch<React.SetStateAction<AIConfig>>;
    localCharBehavior: AIConfig;
    setLocalCharBehavior: React.Dispatch<React.SetStateAction<AIConfig>>;
    localDefaults: DefaultSettings;
    setLocalDefaults: React.Dispatch<React.SetStateAction<DefaultSettings>>;
    isKeysUnlocked: boolean;
    testingConnection: string | null;
    handleTestConnection: (config: AIConfig, name: string) => void;
    setContextEditorTarget: (target: 'judge' | 'behavior' | 'gen') => void;
    handleSyncAllClick: () => void;
    providerDefaults: Record<string, string>;
    onOpenThemeEditor?: () => void;
}

export const GeneralTab: React.FC<GeneralTabProps> = ({
    localSettings, setLocalSettings,
    localJudge, setLocalJudge,
    localCharGen, setLocalCharGen,
    localCharBehavior, setLocalCharBehavior,
    localDefaults, setLocalDefaults,
    isKeysUnlocked,
    testingConnection,
    handleTestConnection,
    setContextEditorTarget,
    handleSyncAllClick,
    providerDefaults,
    onOpenThemeEditor
}) => {

    // Logic: Editable if unlocked via dev password OR if the specific feature is NOT locked.
    // If lock is enabled, you need dev password to edit. If lock is disabled, anyone can edit.
    const isModelEditable = isKeysUnlocked || !localSettings.lockedFeatures.modelInterface;

    const addGlobalVar = () => {
        const newVar: GlobalVariable = { id: `var_${Date.now()}`, key: 'NewVar', value: '' };
        setLocalSettings(prev => ({ ...prev, globalVariables: [...(prev.globalVariables || []), newVar] }));
    };

    const updateGlobalVar = (idx: number, field: keyof GlobalVariable, val: string) => {
        const newVars = [...(localSettings.globalVariables || [])];
        if (field === 'key') val = val.replace(/[{}]/g, '').trim();
        newVars[idx] = { ...newVars[idx], [field]: val };
        setLocalSettings(prev => ({ ...prev, globalVariables: newVars }));
    };

    const removeGlobalVar = (idx: number) => {
        setLocalSettings(prev => ({
            ...prev,
            globalVariables: prev.globalVariables.filter((_, i) => i !== idx)
        }));
    };

    return (
        <div className="space-y-6">
            
            {/* Visual Settings */}
            <div className="bg-surface-highlight/30 p-4 rounded border border-border">
                <Label className="text-primary uppercase tracking-wider font-bold flex items-center gap-2 mb-4">
                    <Palette size={16}/> 视觉与外观 (Appearance)
                </Label>
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-sm font-bold text-highlight">主题配色 (Color Theme)</div>
                            <div className="text-[10px] text-muted">自定义应用的基础色调、主色调和强调色。</div>
                        </div>
                        {onOpenThemeEditor && (
                            <Button size="sm" onClick={onOpenThemeEditor} variant="secondary">
                                <Palette size={14} className="mr-2"/> 编辑主题
                            </Button>
                        )}
                    </div>

                    <div className="bg-surface p-3 rounded border border-border">
                        <label className="flex items-center gap-2 text-sm text-body cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={localSettings.autoScrollOnNewLog ?? false}
                                onChange={e => setLocalSettings({...localSettings, autoScrollOnNewLog: e.target.checked})}
                                className="accent-primary"
                            /> 
                            <span className="font-bold flex items-center gap-2"><ArrowDownCircle size={14}/> 新消息自动滚动到底部 (Auto-Scroll)</span>
                        </label>
                        <p className="text-[10px] text-muted ml-6 mt-1">
                            若开启，当有新日志生成时，视图将自动跳转到最新消息。若关闭，视口将保持在当前阅读位置不动。
                        </p>
                    </div>
                </div>
            </div>

            {/* Android Specific */}
            <div className="bg-surface-highlight/30 p-4 rounded border border-border">
                <Label className="text-primary uppercase tracking-wider font-bold flex items-center gap-2 mb-4">
                    <Smartphone size={16}/> 安卓特定设置 (Android Specific)
                </Label>
                <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-body cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={localSettings.useNativeChooser || false} 
                            onChange={e => setLocalSettings({...localSettings, useNativeChooser: e.target.checked})}
                            className="accent-primary"
                        /> 
                        <span className="font-bold">使用广义文件选择器 (Force Native Chooser)</span>
                    </label>
                    <p className="text-[10px] text-muted ml-6">
                        在安卓设备上，勾选此项将解除对文件类型的限制，从而允许唤起非安卓原生文件选择工具。应用将在选择后手动校验文件类型。
                    </p>
                </div>
            </div>

            {/* JUDGE AI CONFIG */}
            <ModelConfigCard
                title="System/World AI (Judge)"
                icon={<Globe size={14}/>}
                description="此模型处理规则、世界事件和默认行为。"
                config={localJudge}
                onChange={setLocalJudge}
                onTest={name => handleTestConnection(localJudge, name)}
                onContextEdit={() => setContextEditorTarget('judge')}
                isLocked={isModelEditable}
                testingConnectionName={testingConnection}
                configName="Judge AI"
                providerDefaults={providerDefaults}
                accentColorClass="text-primary"
            />

            {/* CHAR BEHAVIOR AI CONFIG */}
            <ModelConfigCard
                title="角色行为 AI (Character Behavior)"
                icon={<BrainCircuit size={14}/>}
                description="处理角色的行动(Action)和被动反应(Reaction)。如果角色没有独立配置，将使用此配置。"
                config={localCharBehavior}
                onChange={setLocalCharBehavior}
                onTest={name => handleTestConnection(localCharBehavior, name)}
                onContextEdit={() => setContextEditorTarget('behavior')}
                isLocked={isModelEditable}
                testingConnectionName={testingConnection}
                configName="Behavior AI"
                onSync={handleSyncAllClick}
                providerDefaults={providerDefaults}
                accentColorClass="text-primary"
            />

            {/* CHAR GEN AI CONFIG */}
            <ModelConfigCard
                title="角色生成 AI (Character Generator)"
                icon={<Bot size={14}/>}
                description="此模型专门用于自动生成 NPC 和玩家角色。"
                config={localCharGen}
                onChange={setLocalCharGen}
                onTest={name => handleTestConnection(localCharGen, name)}
                onContextEdit={() => setContextEditorTarget('gen')}
                isLocked={isModelEditable}
                testingConnectionName={testingConnection}
                configName="Generator AI"
                providerDefaults={providerDefaults}
                accentColorClass="text-primary"
            />

            {/* Image Processing Settings */}
            <div className="bg-surface-highlight/30 p-4 rounded border border-border">
                <Label className="text-primary uppercase tracking-wider font-bold flex items-center gap-2 mb-4">
                    <ImageIcon size={16}/> 图片预处理 (Image Processing)
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <Label>短边最大值 (px)</Label>
                        <Input 
                            type="number"
                            value={localSettings.imageSettings?.maxShortEdge ?? 896}
                            onChange={e => setLocalSettings({...localSettings, imageSettings: { ...localSettings.imageSettings, maxShortEdge: parseInt(e.target.value) || 0 }})}
                        />
                        <p className="text-[10px] text-muted mt-1">超过此宽度的图片将被等比缩小。</p>
                    </div>
                    <div>
                        <Label>缩放后长边上限 (px)</Label>
                        <Input 
                            type="number"
                            value={localSettings.imageSettings?.maxLongEdge ?? 4480}
                            onChange={e => setLocalSettings({...localSettings, imageSettings: { ...localSettings.imageSettings, maxLongEdge: parseInt(e.target.value) || 0 }})}
                        />
                        <p className="text-[10px] text-muted mt-1">如果缩放后长边仍超过此值，将拒绝上传。</p>
                    </div>
                    <div>
                        <Label>压缩质量 (0.1 - 1.0)</Label>
                        <Input 
                            type="number"
                            step="0.1"
                            max="1"
                            min="0.1"
                            value={localSettings.imageSettings?.compressionQuality ?? 0.8}
                            onChange={e => setLocalSettings({...localSettings, imageSettings: { ...localSettings.imageSettings, compressionQuality: parseFloat(e.target.value) || 0 }})}
                        />
                        <p className="text-[10px] text-muted mt-1">控制 JPEG 压缩率，越低体积越小。</p>
                    </div>
                </div>
            </div>

            {/* Game Rules / World Time Section */}
            <div className="bg-surface-highlight/30 p-4 rounded border border-border">
                <Label className="text-primary uppercase tracking-wider font-bold flex items-center gap-2 mb-4">
                    <Clock size={16}/> 游戏世界规则 (Game Rules)
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <Label className="flex items-center gap-1"><FastForward size={12}/> 时间流逝倍率 (World Time Scale)</Label>
                        <div className="flex gap-2 items-center">
                                <Input 
                                type="number" 
                                step="0.1"
                                min="0.1"
                                className="w-full"
                                value={localDefaults.gameplay.worldTimeScale || 1} 
                                onChange={e => setLocalDefaults({...localDefaults, gameplay: {...localDefaults.gameplay, worldTimeScale: parseFloat(e.target.value) || 0}})} 
                            />
                        </div>
                        <p className="text-[10px] text-muted mt-1">
                            控制现实时间与游戏时间的比例。例如设为 60，则现实 1 秒 = 游戏 1 分钟。默认 1。
                        </p>
                    </div>
                    
                    <div>
                        <Label className="flex items-center gap-1"><Users size={12}/> 轮次非玩家角色数 (Max NPCs)</Label>
                        <div className="flex gap-2 items-center">
                            <Input 
                                type="number" 
                                step="1"
                                min="1"
                                className="w-full"
                                value={localDefaults.gameplay.maxNPCsPerRound || 4}
                                onChange={e => setLocalDefaults({...localDefaults, gameplay: {...localDefaults.gameplay, maxNPCsPerRound: parseInt(e.target.value) || 4}})}
                            />
                        </div>
                        <p className="text-[10px] text-muted mt-1">
                            每轮筛选出的活跃 NPC 数量。数量越多，轮次等待时间越长，但剧情更丰富。默认 4。
                        </p>
                    </div>
                </div>
            </div>

                <div className="bg-surface-highlight/30 p-4 rounded border border-border space-y-4">
                    <Label className="text-primary uppercase tracking-wider font-bold flex items-center gap-2">
                        <MessageSquare size={16}/> 上下文设置 (Context Settings)
                    </Label>
                    
                    <div className="bg-surface p-3 rounded border border-border">
                        <label className="flex items-center gap-2 text-sm text-body cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={localSettings.enableStreaming !== false} // Default true
                                onChange={e => setLocalSettings({...localSettings,enableStreaming: e.target.checked})}
                                className="accent-primary"
                            /> 
                            <span className="font-bold flex items-center gap-2"><Activity size={14}/> 启用流式传输 (Streaming Response)</span>
                        </label>
                        <p className="text-[10px] text-muted ml-6 mt-1">
                            如果启用，角色的描述和台词将实时显示，增加沉浸感。如果关闭，将等待完整回复后一次性显示。
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <Label>Max Output Tokens (单次生成最大长度)</Label>
                            <Input 
                                type="number"
                                value={localSettings.maxOutputTokens || 2000}
                                onChange={e => setLocalSettings({...localSettings, maxOutputTokens: parseInt(e.target.value) || 0})}
                                className="font-mono text-xs"
                            />
                            <p className="text-[10px] text-muted mt-1">
                                决定了 AI 单次回复的最大字数。建议 2000-4000。
                            </p>
                        </div>
                        <div>
                            <Label>Max Input Tokens (最大输入上下文)</Label>
                            <Input 
                                type="number"
                                value={localSettings.maxInputTokens || 64000}
                                onChange={e => setLocalSettings({...localSettings, maxInputTokens: parseInt(e.target.value) || 0})}
                                className="font-mono text-xs"
                            />
                            <p className="text-[10px] text-muted mt-1">
                                估算值。当总上下文超过此限制时，将自动裁切最早的故事日志以释放空间。
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border pt-4 mt-2">
                    <div>
                        <Label className="flex items-center gap-2"><History size={12}/> 全局历史轮数 (Long)</Label>
                        <Input 
                            type="number" 
                            value={localSettings.maxHistoryRounds || 20} 
                            onChange={e => setLocalSettings({...localSettings, maxHistoryRounds: parseInt(e.target.value) || 0})}
                        />
                    </div>
                    <div>
                        <Label className="flex items-center gap-2"><Scissors size={12}/> 逻辑判定轮数 (Short)</Label>
                        <Input 
                            type="number" 
                            value={localSettings.maxShortHistoryRounds || 5} 
                            onChange={e => setLocalSettings({...localSettings, maxShortHistoryRounds: parseInt(e.target.value) || 0})}
                        />
                    </div>
                    <div>
                        <Label className="flex items-center gap-2"><User size={12}/> 角色记忆能力 (Capacity)</Label>
                        <Input 
                            type="number" 
                            value={localSettings.maxCharacterMemoryRounds || 10} 
                            onChange={e => setLocalSettings({...localSettings, maxCharacterMemoryRounds: parseInt(e.target.value) || 0})}
                        />
                        <p className="text-[9px] text-muted mt-0.5">决定长期记忆的采样密度。</p>
                    </div>
                    
                    {/* New Environment Memory Setting */}
                    <div>
                        <Label className="flex items-center gap-2"><Globe size={12}/> 环境记忆能力 (Env Capacity)</Label>
                        <Input 
                            type="number" 
                            value={localSettings.maxEnvMemoryRounds || 5} 
                            onChange={e => setLocalSettings({...localSettings, maxEnvMemoryRounds: parseInt(e.target.value) || 0})}
                        />
                        <p className="text-[9px] text-muted mt-0.5">专门用于“环境”角色的记忆轮数。通常较低以节省Token。</p>
                    </div>
                    
                    {/* Memory Dropout Section */}
                    <div className="col-span-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border pt-2 mt-2">
                        <div>
                            <Label className="flex items-center gap-2"><Eraser size={12}/> 行动记忆丢失概率 (Action Dropout)</Label>
                            <Input 
                                type="number" 
                                step="0.01"
                                min="0"
                                max="1"
                                value={localSettings.actionMemoryDropoutProbability ?? 0.34} 
                                onChange={e => setLocalSettings({...localSettings, actionMemoryDropoutProbability: Math.min(1, Math.max(0, parseFloat(e.target.value) || 0))})}
                            />
                            <p className="text-[9px] text-muted mt-0.5">仅在【行动回合】生效。触发时记忆能力临时降为 <b>4</b> 轮。</p>
                        </div>
                        <div>
                            <Label className="flex items-center gap-2"><Eraser size={12}/> 反应记忆丢失概率 (Reaction Dropout)</Label>
                            <Input 
                                type="number" 
                                step="0.01"
                                min="0"
                                max="1"
                                value={localSettings.reactionMemoryDropoutProbability ?? 0.34} 
                                onChange={e => setLocalSettings({...localSettings, reactionMemoryDropoutProbability: Math.min(1, Math.max(0, parseFloat(e.target.value) || 0))})}
                            />
                            <p className="text-[9px] text-muted mt-0.5">仅在【反应回合】生效。触发时记忆能力临时降为 <b>2</b> 轮。</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Global Variables Section */}
            <div className="bg-surface-highlight/30 p-4 rounded border border-border space-y-4">
                <div className="flex justify-between items-center">
                    <Label className="text-primary uppercase tracking-wider font-bold flex items-center gap-2">
                        <Variable size={16}/> 通用变量 (Global Variables)
                    </Label>
                    <Button size="sm" variant="secondary" onClick={addGlobalVar}><Plus size={12} className="mr-1"/> 添加变量</Button>
                </div>
                <p className="text-[10px] text-muted">
                    定义的变量可以在游戏中的任何文本框（提示词、设定、对话等）中使用 {`{{变量名}}`} 进行引用。系统将在提交给 AI 前自动替换。
                </p>
                <div className="space-y-2">
                    {(localSettings.globalVariables || []).map((v, idx) => (
                        <div key={v.id} className="flex items-center gap-2 bg-surface p-2 rounded border border-border">
                            <div className="flex items-center bg-surface-light px-2 rounded border border-border text-muted text-xs font-mono shrink-0">
                                {'{{'}
                                <input 
                                    className="bg-transparent border-none outline-none text-highlight w-24 px-1 py-1" 
                                    value={v.key} 
                                    onChange={e => updateGlobalVar(idx, 'key', e.target.value)}
                                    placeholder="Key"
                                />
                                {'}}'}
                            </div>
                            <span className="text-muted text-xs">=</span>
                            <Input 
                                className="flex-1 h-8 text-xs font-mono" 
                                value={v.value} 
                                onChange={e => updateGlobalVar(idx, 'value', e.target.value)}
                                placeholder="Value"
                            />
                            <button onClick={() => removeGlobalVar(idx)} className="text-muted hover:text-danger-fg p-1"><Trash2 size={14}/></button>
                        </div>
                    ))}
                    {(localSettings.globalVariables || []).length === 0 && (
                        <div className="text-center text-muted text-xs italic py-2">暂无通用变量</div>
                    )}
                </div>
            </div>
        </div>
    );
};
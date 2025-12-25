
import React, { useState } from 'react';
import { AppSettings, DefaultSettings, LockedFeatures, GlobalContextConfig, WeatherType, Provider } from '../../../types';
import { Button, Input, Label, TextArea } from '../../ui/Button';
import { Lock, Unlock, Terminal, ShieldCheck, Clock, LayoutTemplate, Globe, Edit, Wind, Plus, Trash, FileText } from 'lucide-react';

interface DeveloperTabProps {
    localSettings: AppSettings;
    setLocalSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
    localDefaults: DefaultSettings;
    setLocalDefaults: React.Dispatch<React.SetStateAction<DefaultSettings>>;
    localContext: GlobalContextConfig;
    setLocalContext: React.Dispatch<React.SetStateAction<GlobalContextConfig>>;
    localDevMode: boolean;
    setLocalDevMode: React.Dispatch<React.SetStateAction<boolean>>;
    isKeysUnlocked: boolean;
    passwordInput: string;
    setPasswordInput: (val: string) => void;
    errorMsg: string;
    unlockKeys: () => void;
    toggleLock: (key: keyof LockedFeatures) => void;
    setEditingTemplateType: (type: 'character' | 'location' | 'card_skill' | 'card_item' | 'card_event') => void;
    onEditGlobalContext: () => void;
}

export const DeveloperTab: React.FC<DeveloperTabProps> = ({
    localSettings, setLocalSettings,
    localDefaults, setLocalDefaults,
    localContext, setLocalContext,
    localDevMode, setLocalDevMode,
    isKeysUnlocked,
    passwordInput, setPasswordInput,
    errorMsg,
    unlockKeys,
    toggleLock,
    setEditingTemplateType,
    onEditGlobalContext
}) => {
    const [promptKey, setPromptKey] = useState<keyof typeof localDefaults.prompts>('determineCharacterAction');

    const handlePasswordKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') unlockKeys();
    };

    const toLocalISO = (isoStr: string | undefined) => {
        if (!isoStr) return "";
        try {
            const d = new Date(isoStr);
            const tzOffset = d.getTimezoneOffset() * 60000;
            const localISOTime = (new Date(d.getTime() - tzOffset)).toISOString().slice(0, 16);
            return localISOTime;
        } catch(e) { return ""; }
    };

    const fromLocalISO = (localStr: string) => {
        if (!localStr) return "";
        const d = new Date(localStr);
        return d.toISOString();
    };

    const updateWeather = (idx: number, field: keyof WeatherType, val: any) => {
        const newWeather = [...localDefaults.weatherConfig];
        newWeather[idx] = { ...newWeather[idx], [field]: val };
        setLocalDefaults(prev => ({ ...prev, weatherConfig: newWeather }));
    };

    const addWeather = () => {
        setLocalDefaults(prev => ({ 
            ...prev, 
            weatherConfig: [...prev.weatherConfig, { name: "新状态", weight: 1 }] 
        }));
    };

    const removeWeather = (idx: number) => {
         setLocalDefaults(prev => ({ 
            ...prev, 
            weatherConfig: prev.weatherConfig.filter((_, i) => i !== idx) 
        }));
    };

    // Unified toggle for World Composition (Characters + Locations)
    const toggleWorldCompositionLock = () => {
        const current = localSettings.lockedFeatures.characterEditor && localSettings.lockedFeatures.locationEditor;
        const newValue = !current;
        setLocalSettings(prev => ({
            ...prev,
            lockedFeatures: {
                ...prev.lockedFeatures,
                characterEditor: newValue,
                locationEditor: newValue
            }
        }));
    };

    const isWorldCompositionLocked = localSettings.lockedFeatures.characterEditor && localSettings.lockedFeatures.locationEditor;

    return (
        <div className="space-y-4">
            {!isKeysUnlocked ? (
                <div className="flex flex-col items-center justify-center h-64 bg-surface-highlight/20 rounded border border-border gap-4">
                    <Lock size={32} className="text-muted"/>
                    <p className="text-muted text-sm text-center px-4">请输入密码以访问开发者设置、API 密钥及默认模版。</p>
                    <div className="flex gap-2">
                        <Input 
                            type="password" 
                            placeholder="输入密码" 
                            className={`w-40 ${errorMsg ? 'border-danger focus:border-danger' : ''}`}
                            value={passwordInput} 
                            onChange={e => setPasswordInput(e.target.value)}
                            onKeyDown={handlePasswordKeyDown}
                        />
                        <Button onClick={unlockKeys}>解锁</Button>
                    </div>
                    {errorMsg && <p className="text-xs text-danger font-bold animate-pulse">{errorMsg}</p>}
                    {!localSettings.devPassword && !errorMsg && (
                        <p className="text-[10px] text-faint">提示: 当前未设置密码，请直接点击解锁。</p>
                    )}
                </div>
            ) : (
                <div className="space-y-6 animate-in fade-in">
                    
                    {/* Security Options */}
                    <div className="space-y-4 border-b border-border pb-6">
                        <Label className="text-primary uppercase tracking-wider font-bold flex items-center gap-2"><ShieldCheck size={16}/> 安全设置 (Security)</Label>
                        
                        <div className="flex justify-between items-center bg-success-base/10 p-2 rounded border border-success-base/30">
                            <div className="flex items-center gap-2 text-success-fg">
                                <Unlock size={16}/> <span className="text-xs font-bold">开发者模式已解锁 (Session Unlocked)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-muted hidden sm:inline">设置访问密码:</span>
                                <Input 
                                    type="password" 
                                    placeholder="留空为无密码" 
                                    className="h-6 w-24 sm:w-32 text-xs"
                                    value={localSettings.devPassword || ""}
                                    onChange={e => setLocalSettings({...localSettings, devPassword: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="bg-surface-highlight/30 p-3 rounded border border-border space-y-4">
                            <div className="space-y-1">
                                <label className="flex items-center gap-2 text-xs text-body cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={localSettings.encryptSaveFiles || false} 
                                        onChange={e => setLocalSettings({...localSettings, encryptSaveFiles: e.target.checked})}
                                        className="accent-primary"
                                    /> 
                                    <span>启用存档加密 (Encrypt Save Files)</span>
                                </label>
                                <p className="text-[10px] text-muted ml-5">
                                    启用后，存档文件内容将被加密，且只能通过文件名作为密钥进行解密。
                                </p>
                            </div>

                            <div className="border-t border-border pt-2">
                                <div className="flex items-center justify-between mb-1">
                                    <Label className="text-xs flex items-center gap-1"><Clock size={12}/> 存档过期时间 (Save Expiration)</Label>
                                    {localSettings.saveExpirationDate && (
                                        <button 
                                            onClick={() => setLocalSettings({...localSettings, saveExpirationDate: ""})} 
                                            className="text-[10px] text-danger hover:underline"
                                        >
                                            清除限制
                                        </button>
                                    )}
                                </div>
                                <Input 
                                    type="datetime-local" 
                                    className="w-full text-xs"
                                    value={toLocalISO(localSettings.saveExpirationDate)}
                                    onChange={e => setLocalSettings({...localSettings, saveExpirationDate: fromLocalISO(e.target.value)})}
                                />
                                <p className="text-[10px] text-muted mt-1">
                                    设置一个绝对时间。在此时间之后，加载存档将强制要求输入开发者密码进行在线验证。
                                    (当前: {localSettings.saveExpirationDate ? new Date(localSettings.saveExpirationDate).toLocaleString() : "无限制"})
                                </p>
                            </div>

                            <div className="border-t border-border pt-2">
                                <Label className="text-danger uppercase tracking-wider font-bold flex items-center gap-2"><Lock size={12}/> 功能锁定 (Locked Features)</Label>
                                <p className="text-[10px] text-muted mb-2">锁定后，普通用户将无法使用这些编辑功能。这些设置将随安全配置一起保存。</p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-app p-2 rounded">
                                    <label className="flex items-center gap-2 text-xs text-body cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={isWorldCompositionLocked} 
                                            onChange={toggleWorldCompositionLock} 
                                            className="accent-danger-base"
                                        />
                                        世界构成锁定 (角色/地点)
                                    </label>
                                    
                                    {[
                                        { key: 'cardPoolEditor', label: '卡池编辑器' },
                                        { key: 'prizePoolEditor', label: '奖池编辑器' },
                                        { key: 'triggerEditor', label: '触发器编辑器' },
                                        { key: 'actionPoints', label: '行动点数编辑' },
                                        { key: 'worldState', label: '世界状态编辑' },
                                        { key: 'directorInstructions', label: '导演指令/设定' },
                                        { key: 'mapView', label: '地图视角锁定' },
                                        { key: 'modelInterface', label: '模型接口配置' },
                                    ].map(item => (
                                        <label key={item.key} className="flex items-center gap-2 text-xs text-body cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={localSettings.lockedFeatures?.[item.key as keyof LockedFeatures]} 
                                                onChange={() => toggleLock(item.key as keyof LockedFeatures)} 
                                                className="accent-danger-base"
                                            />
                                            {item.label}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Debug Mode Toggle */}
                    <div className="bg-surface-highlight/30 p-3 rounded border border-border">
                        <label className="flex items-center gap-2 text-sm text-body cursor-pointer hover:text-highlight transition-colors">
                            <input type="checkbox" checked={localDevMode} onChange={e => setLocalDevMode(e.target.checked)} className="accent-success-base"/> 
                            <Terminal size={14} className="text-success-fg"/>
                            <span className="font-bold">Debug Mode (显示 AI 原始 Prompt)</span>
                        </label>
                        <p className="text-[10px] text-muted mt-1 ml-6">开启后，可以在主界面顶部访问 Debug Console 查看 AI 的原始输入输出。</p>
                    </div>
                    
                    {/* API Keys Section */}
                    <div className="space-y-4 border-b border-border pb-6">
                        <Label className="text-primary uppercase tracking-wider font-bold">API 密钥管理</Label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {[
                                { key: Provider.GEMINI, label: 'Google Gemini Key' },
                                { key: Provider.XAI, label: 'xAI Key (Grok)' },
                                { key: Provider.VOLCANO, label: 'Volcengine Key (Doubao)' },
                                { key: Provider.OPENROUTER, label: 'OpenRouter Key' },
                                { key: Provider.OPENAI, label: 'OpenAI Key' },
                                { key: Provider.CLAUDE, label: 'Claude Key (Anthropic)' },
                            ].map(item => (
                                <div key={item.key}>
                                    <Label>{item.label}</Label>
                                    <Input 
                                        type="password" 
                                        value={localSettings.apiKeys[item.key as Provider] || ''} 
                                        onChange={e => setLocalSettings({...localSettings, apiKeys: {...localSettings.apiKeys, [item.key]: e.target.value}})}
                                        placeholder=""
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Defaults & Templates Section */}
                    <div className="space-y-4 border-b border-border pb-6">
                        <Label className="text-primary uppercase tracking-wider font-bold flex items-center gap-2"><LayoutTemplate size={16}/> 默认值与模版 (Defaults)</Label>
                        
                        <div className="bg-surface-highlight/30 p-4 rounded border border-border">
                            <Label className="mb-2 text-xs text-muted uppercase">初始参数</Label>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                                <div>
                                    <Label>初始 CP</Label>
                                    <Input type="number" value={localDefaults.gameplay.defaultInitialCP} onChange={e => setLocalDefaults({...localDefaults, gameplay: {...localDefaults.gameplay, defaultInitialCP: parseInt(e.target.value)}})} />
                                </div>
                                <div>
                                    <Label>创造基础消耗 (CP)</Label>
                                    <Input type="number" value={localDefaults.gameplay.defaultCreationCost} onChange={e => setLocalDefaults({...localDefaults, gameplay: {...localDefaults.gameplay, defaultCreationCost: parseInt(e.target.value)}})} />
                                </div>
                                <div>
                                    <Label>初始行动点 (AP)</Label>
                                    <Input type="number" value={localDefaults.gameplay.defaultInitialAP} onChange={e => setLocalDefaults({...localDefaults, gameplay: {...localDefaults.gameplay, defaultInitialAP: parseInt(e.target.value)}})} />
                                </div>
                            </div>

                            <Label className="mb-2 text-xs text-muted uppercase flex items-center gap-2">
                                <Globe size={12}/> 初始世界设定 (Initial World Config)
                            </Label>
                            <div className="space-y-3 mb-4 bg-black/10 p-3 rounded border border-border">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label>初始区域名称</Label>
                                        <Input 
                                            value={localDefaults.initialWorldConfig?.startRegionName || ""} 
                                            onChange={e => setLocalDefaults({...localDefaults, initialWorldConfig: {...localDefaults.initialWorldConfig!, startRegionName: e.target.value}})}
                                            placeholder="城市边缘"
                                        />
                                    </div>
                                    <div>
                                        <Label>初始地点名称</Label>
                                        <Input 
                                            value={localDefaults.initialWorldConfig?.startLocationName || ""} 
                                            onChange={e => setLocalDefaults({...localDefaults, initialWorldConfig: {...localDefaults.initialWorldConfig!, startLocationName: e.target.value}})}
                                            placeholder="温馨小窝"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Label>初始地点/区域描述</Label>
                                    <Input 
                                        value={localDefaults.initialWorldConfig?.startRegionDesc || ""} 
                                        onChange={e => setLocalDefaults({...localDefaults, initialWorldConfig: {...localDefaults.initialWorldConfig!, startRegionDesc: e.target.value}})}
                                        placeholder="区域描述"
                                        className="mb-2"
                                    />
                                        <Input 
                                        value={localDefaults.initialWorldConfig?.startLocationDesc || ""} 
                                        onChange={e => setLocalDefaults({...localDefaults, initialWorldConfig: {...localDefaults.initialWorldConfig!, startLocationDesc: e.target.value}})}
                                        placeholder="地点描述"
                                    />
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="col-span-1">
                                        <Label>环境角色后缀</Label>
                                        <Input 
                                            value={localDefaults.initialWorldConfig?.environmentCharNameSuffix || ""} 
                                            onChange={e => setLocalDefaults({...localDefaults, initialWorldConfig: {...localDefaults.initialWorldConfig!, environmentCharNameSuffix: e.target.value}})}
                                            placeholder="的环境"
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <Label>环境角色描述模版 (使用 {'{{LOCATION_NAME}}'})</Label>
                                        <Input 
                                            value={localDefaults.initialWorldConfig?.environmentCharDescTemplate || ""} 
                                            onChange={e => setLocalDefaults({...localDefaults, initialWorldConfig: {...localDefaults.initialWorldConfig!, environmentCharDescTemplate: e.target.value}})}
                                            placeholder="【系统代理】..."
                                        />
                                    </div>
                                </div>
                            </div>

                            <Label className="mb-2 text-xs text-muted uppercase">实体模版 (Visual Editor)</Label>
                            <div className="flex flex-wrap gap-2 mb-4">
                                <Button size="sm" variant="secondary" onClick={() => setEditingTemplateType('character')} className="flex items-center gap-2">
                                    <Edit size={14}/> 编辑角色模版
                                </Button>
                                <Button size="sm" variant="secondary" onClick={() => setEditingTemplateType('location')} className="flex items-center gap-2">
                                    <Edit size={14}/> 编辑地点模版
                                </Button>
                                <Button size="sm" variant="secondary" onClick={() => setEditingTemplateType('card_skill')} className="flex items-center gap-2">
                                    <Edit size={14}/> 编辑技能模版
                                </Button>
                                <Button size="sm" variant="secondary" onClick={() => setEditingTemplateType('card_item')} className="flex items-center gap-2">
                                    <Edit size={14}/> 编辑物品模版
                                </Button>
                                <Button size="sm" variant="secondary" onClick={() => setEditingTemplateType('card_event')} className="flex items-center gap-2">
                                    <Edit size={14}/> 编辑事件模版
                                </Button>
                            </div>

                            <Label className="mb-2 text-xs text-muted uppercase">Prompt Engineering</Label>
                            <div className="bg-black/10 p-2 rounded border border-border">
                                <div className="flex mb-2">
                                    <select 
                                        className="bg-surface border border-border rounded px-2 py-1 text-xs text-body w-full"
                                        value={promptKey}
                                        onChange={e => setPromptKey(e.target.value as any)}
                                    >
                                        {Object.keys(localDefaults.prompts).map(k => (
                                            <option key={k} value={k}>{k}</option>
                                        ))}
                                    </select>
                                </div>
                                <TextArea 
                                    className="h-32 font-mono text-xs leading-relaxed w-full"
                                    value={localDefaults.prompts[promptKey]}
                                    onChange={e => setLocalDefaults(prev => ({
                                        ...prev,
                                        prompts: { ...prev.prompts, [promptKey]: e.target.value }
                                    }))}
                                />
                            </div>
                        </div>
                    </div>
                    
                    {/* Weather/Status Config */}
                    <div className="space-y-4 border-b border-border pb-6">
                            <div className="flex justify-between items-center">
                                <Label className="text-primary uppercase tracking-wider font-bold flex items-center gap-2"><Wind size={16}/> 世界状态配置 (World Status)</Label>
                                <Button size="sm" variant="secondary" onClick={addWeather}><Plus size={12} className="mr-1"/> 添加状态</Button>
                            </div>
                            <div className="bg-surface-highlight/30 p-4 rounded border border-border">
                                <div className="mb-4 border-b border-border pb-4">
                                    <div className="flex justify-between items-center mb-2">
                                        <Label>状态变化概率 (每轮结算)</Label>
                                        <span className="text-xs text-secondary-fg font-mono font-bold">
                                            {(localDefaults.weatherChangeProbability || 0.1) * 100}%
                                        </span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0" max="1" step="0.01"
                                        className="w-full accent-secondary-base"
                                        value={localDefaults.weatherChangeProbability ?? 0.1}
                                        onChange={e => setLocalDefaults(prev => ({
                                            ...prev,
                                            weatherChangeProbability: parseFloat(e.target.value)
                                        }))}
                                    />
                                    <p className="text-[10px] text-muted mt-1">每一轮结束时触发世界状态重新随机的概率。设为 0 则完全不自动变化。</p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {localDefaults.weatherConfig.map((w, idx) => (
                                            <div key={idx} className="flex items-center gap-2 bg-surface p-2 rounded border border-border">
                                                <Input value={w.name} onChange={e => updateWeather(idx, 'name', e.target.value)} placeholder="名称" className="flex-1 min-w-0"/>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <span className="text-xs text-muted">权重:</span>
                                                    <Input type="number" value={w.weight} onChange={e => updateWeather(idx, 'weight', parseFloat(e.target.value))} className="w-16"/>
                                                </div>
                                                <button onClick={() => removeWeather(idx)} className="text-muted hover:text-danger-fg p-1 shrink-0"><Trash size={14}/></button>
                                            </div>
                                        ))}
                                </div>
                            </div>
                    </div>

                    {/* Global Context Section */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <Label className="text-primary uppercase tracking-wider font-bold">全局上下文工程 (Global Context)</Label>
                            <Button size="sm" variant="secondary" onClick={onEditGlobalContext}>
                                <FileText size={12} className="mr-1"/> 编辑内容
                            </Button>
                        </div>
                        <p className="text-[10px] text-muted mb-2">
                            此处定义的消息将在所有 AI 请求中作为<b>最前置</b>的 System Instruction 插入。<br/>
                        </p>
                        
                        <div className="bg-surface-highlight/30 p-4 rounded border border-border text-center">
                            <span className="text-muted text-xs">
                                包含 {localContext.messages.length} 条全局指令。点击上方按钮进行编辑。
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

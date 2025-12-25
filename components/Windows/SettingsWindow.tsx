
import React, { useState, useEffect } from 'react';
import { AppSettings, AIConfig, GlobalContextConfig, DefaultSettings, Provider, Character, Card, MapLocation, GlobalContextMessage, DebugLog, WindowState } from '../../types';
import { Button } from '../ui/Button';
import { Settings, Lock, AlertTriangle, RefreshCw } from 'lucide-react';
import { DEFAULT_AI_CONFIG } from '../../config';
import { CharacterEditor } from './CharacterEditor';
import { CardEditor } from './CardEditor';
import { testModelConnection } from '../../services/aiService';

import { ContextEditorModal } from './Settings/ContextEditorModal';
import { LocationTemplateEditor } from './Settings/LocationTemplateEditor';
import { GeneralTab } from './Settings/GeneralTab';
import { DeveloperTab } from './Settings/DeveloperTab';
import { Window } from '../ui/Window';

const PROVIDER_DEFAULTS: Record<string, string> = {
    [Provider.XAI]: 'grok-4-1-fast',
    [Provider.GEMINI]: 'gemini-3-pro-preview',
    [Provider.OPENAI]: 'gpt-5-2025-08-07',
    [Provider.CLAUDE]: 'claude-sonnet-4-5-20250929',
    [Provider.VOLCANO]: 'doubao-seed-1-6-251015',
    [Provider.OPENROUTER]: 'deepseek/deepseek-v3.2'
};

interface SettingsWindowProps {
    settings: AppSettings;
    judgeConfig: AIConfig;
    charGenConfig?: AIConfig;
    charBehaviorConfig?: AIConfig;
    globalContext: GlobalContextConfig;
    defaultSettings: DefaultSettings;
    devMode: boolean;
    onSave: (settings: AppSettings, judge: AIConfig, charGen: AIConfig, charBehavior: AIConfig, ctx: GlobalContextConfig, defaults: DefaultSettings, devMode: boolean) => void;
    onSyncAllChars?: (config: AIConfig, settings: AppSettings) => void;
    onClose: () => void;
    addDebugLog?: (log: DebugLog) => void;
    openWindow?: (type: WindowState['type'], data?: any) => void; 
}

export const SettingsWindow: React.FC<SettingsWindowProps> = ({ settings, judgeConfig, charGenConfig, charBehaviorConfig, globalContext, defaultSettings, devMode, onSave, onClose, onSyncAllChars, addDebugLog, openWindow }) => {
    const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
    const [localJudge, setLocalJudge] = useState<AIConfig>(judgeConfig || DEFAULT_AI_CONFIG);
    const [localCharGen, setLocalCharGen] = useState<AIConfig>(charGenConfig || judgeConfig || DEFAULT_AI_CONFIG);
    const [localCharBehavior, setLocalCharBehavior] = useState<AIConfig>(charBehaviorConfig || judgeConfig || DEFAULT_AI_CONFIG);
    const [localContext, setLocalContext] = useState<GlobalContextConfig>(globalContext);
    const [localDefaults, setLocalDefaults] = useState<DefaultSettings>(defaultSettings);
    const [localDevMode, setLocalDevMode] = useState(devMode);
    
    const [passwordInput, setPasswordInput] = useState("");
    const [errorMsg, setErrorMsg] = useState(""); 
    const [activeTab, setActiveTab] = useState<'general' | 'developer'>('general');
    
    const [showSyncConfirm, setShowSyncConfirm] = useState(false);
    const [editingTemplateType, setEditingTemplateType] = useState<'character' | 'location' | 'card_skill' | 'card_item' | 'card_event' | null>(null);
    const [testingConnection, setTestingConnection] = useState<string | null>(null);

    const [contextEditorTarget, setContextEditorTarget] = useState<'judge' | 'behavior' | 'gen' | 'global' | null>(null);

    // Sync theme config if it changes externally (e.g. from ThemeEditor)
    useEffect(() => {
        if (settings.themeConfig) {
            setLocalSettings(prev => ({
                ...prev,
                themeConfig: settings.themeConfig
            }));
        }
    }, [settings.themeConfig]);

    const isKeysUnlocked = localSettings.devOptionsUnlocked;

    const unlockKeys = () => {
        const targetPwd = localSettings.devPassword || "";
        if (passwordInput === targetPwd) {
            const newSettings = { ...localSettings, devOptionsUnlocked: true };
            setLocalSettings(newSettings);
            setErrorMsg("");
        } else {
            setErrorMsg("密码错误 (Invalid Password)");
        }
    };

    const toggleLock = (key: keyof typeof localSettings.lockedFeatures) => {
        setLocalSettings(prev => ({
            ...prev,
            lockedFeatures: {
                ...prev.lockedFeatures,
                [key]: !prev.lockedFeatures[key]
            }
        }));
    };

    const handleSyncAllClick = () => {
        setShowSyncConfirm(true);
    };
    
    const confirmSyncAll = () => {
        if (onSyncAllChars) {
            onSyncAllChars(localCharBehavior, localSettings);
        }
        setShowSyncConfirm(false);
    };
    
    const handleSaveTemplateChar = (char: Character) => {
        setLocalDefaults(prev => ({
            ...prev,
            templates: { ...prev.templates, character: char }
        }));
        setEditingTemplateType(null);
    };

    const handleSaveTemplateCard = (card: Card) => {
        if (editingTemplateType === 'card_skill') {
            setLocalDefaults(prev => ({ ...prev, templates: { ...prev.templates, cards: { ...prev.templates.cards, skill: card } } }));
        } else if (editingTemplateType === 'card_item') {
             setLocalDefaults(prev => ({ ...prev, templates: { ...prev.templates, cards: { ...prev.templates.cards, item: card } } }));
        } else if (editingTemplateType === 'card_event') {
             setLocalDefaults(prev => ({ ...prev, templates: { ...prev.templates, cards: { ...prev.templates.cards, event: card } } }));
        }
        setEditingTemplateType(null);
    };
    
    const handleSaveTemplateLocation = (loc: MapLocation) => {
         setLocalDefaults(prev => ({ ...prev, templates: { ...prev.templates, location: loc } }));
         setEditingTemplateType(null);
    };

    const handleTestConnection = async (config: AIConfig, configName: string) => {
        if (!config.model) {
            alert("请先填写模型名称 (Model Name)。");
            return;
        }
        
        setTestingConnection(configName);
        
        const apiKey = config.apiKey || localSettings.apiKeys[config.provider] || "";
        
        if (!apiKey) {
            alert("未找到 API Key。请在开发者选项卡设置全局 Key，或在此处填写覆盖 Key。");
            setTestingConnection(null);
            return;
        }

        try {
            const result = await testModelConnection(config, apiKey);
            
            if (addDebugLog) {
                addDebugLog({
                    id: `test_conn_${Date.now()}`,
                    timestamp: Date.now(),
                    characterName: `System (${configName} Test)`,
                    prompt: JSON.stringify(result.requestDetails, null, 2),
                    response: result.response
                });
            }

            if (result.success) {
                alert(`连接成功！\n延时: ${result.latency}ms\n响应: "${result.response}"\n(详细信息已写入 Debug Console)`);
            } else {
                alert(`连接失败！\n错误: ${result.response}\n(详细信息已写入 Debug Console)`);
            }
        } catch (e: any) {
            alert(`测试过程发生意外错误: ${e.message}`);
        } finally {
            setTestingConnection(null);
        }
    };

    const dummyState: any = {
        characters: {},
        map: { charPositions: {}, activeLocationId: '', locations: {} },
        cardPool: [],
        defaultSettings: localDefaults,
        judgeConfig: localJudge
    };

    const getContextEditorProps = () => {
        if (contextEditorTarget === 'judge') {
            return {
                title: "System/World AI Context",
                messages: localJudge.contextConfig?.messages || [],
                onMessagesChange: (msgs: GlobalContextMessage[]) => setLocalJudge(prev => ({ ...prev, contextConfig: { ...prev.contextConfig, messages: msgs } }))
            };
        }
        if (contextEditorTarget === 'behavior') {
            return {
                title: "Character Behavior AI Context",
                messages: localCharBehavior.contextConfig?.messages || [],
                onMessagesChange: (msgs: GlobalContextMessage[]) => setLocalCharBehavior(prev => ({ ...prev, contextConfig: { ...prev.contextConfig, messages: msgs } }))
            };
        }
        if (contextEditorTarget === 'gen') {
            return {
                title: "Character Generation AI Context",
                messages: localCharGen.contextConfig?.messages || [],
                onMessagesChange: (msgs: GlobalContextMessage[]) => setLocalCharGen(prev => ({ ...prev, contextConfig: { ...prev.contextConfig, messages: msgs } }))
            };
        }
        if (contextEditorTarget === 'global') {
            return {
                title: "全局上下文 (Global Context)",
                messages: localContext.messages || [],
                onMessagesChange: (msgs: GlobalContextMessage[]) => setLocalContext({ messages: msgs })
            };
        }
        return null;
    };

    const contextProps = getContextEditorProps();

    return (
        <Window
            title="引擎配置 (Engine Config)"
            onClose={onClose}
            maxWidth="max-w-4xl"
            height="h-full max-h-[85vh]" 
            disableContentScroll={true}
            noPadding={true}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>取消</Button>
                    <Button onClick={() => onSave(localSettings, localJudge, localCharGen, localCharBehavior, localContext, localDefaults, localDevMode)}>保存全局设置</Button>
                </>
            }
        >
            <div className="flex flex-col h-full relative p-4 md:p-6 overflow-hidden">
                {contextEditorTarget && contextProps && (
                    <ContextEditorModal
                        title={contextProps.title}
                        messages={contextProps.messages}
                        onMessagesChange={contextProps.onMessagesChange}
                        onClose={() => setContextEditorTarget(null)}
                    />
                )}

                {showSyncConfirm && (
                    <div className="absolute inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 rounded-lg">
                        <div className="bg-surface border border-danger/50 p-6 rounded-lg shadow-2xl max-w-md w-full animate-in zoom-in-95 text-body">
                            <h3 className="text-lg font-bold text-danger mb-4 flex items-center gap-2">
                                <AlertTriangle size={20} className="text-danger"/> 确认强制应用？
                            </h3>
                            <p className="text-sm text-muted mb-6 leading-relaxed">
                                此操作将把当前的 <b>角色行为 AI 配置</b> 和 <b>API 密钥</b> 强制覆盖到游戏中的<b>所有角色</b>身上。<br/><br/>
                                <span className="text-danger">角色原有的个性化模型设置将被丢失。</span>
                            </p>
                            <div className="flex justify-end gap-3">
                                <Button variant="secondary" onClick={() => setShowSyncConfirm(false)}>取消</Button>
                                <Button onClick={confirmSyncAll} className="bg-danger hover:bg-danger-hover text-white border-transparent">
                                    <RefreshCw size={14} className="mr-2"/> 确认覆盖
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {editingTemplateType === 'character' && (
                     <div className="absolute inset-0 z-[100] bg-surface flex items-center justify-center">
                          <CharacterEditor 
                              character={localDefaults.templates.character}
                              onClose={() => setEditingTemplateType(null)}
                              onSave={handleSaveTemplateChar}
                              gameState={dummyState}
                              isTemplate={true}
                          />
                     </div>
                )}
                {editingTemplateType === 'location' && (
                    <LocationTemplateEditor 
                        initialLoc={localDefaults.templates.location}
                        onSave={handleSaveTemplateLocation}
                        onClose={() => setEditingTemplateType(null)}
                    />
                )}
                {editingTemplateType && ['card_skill', 'card_item', 'card_event'].includes(editingTemplateType) && (
                     <div className="absolute inset-0 z-[100] bg-surface/95 flex items-center justify-center p-4">
                          <CardEditor 
                              initialCard={
                                  editingTemplateType === 'card_skill' ? localDefaults.templates.cards.skill :
                                  editingTemplateType === 'card_item' ? localDefaults.templates.cards.item :
                                  localDefaults.templates.cards.event
                              }
                              onClose={() => setEditingTemplateType(null)}
                              onSave={handleSaveTemplateCard}
                              gameState={dummyState}
                          />
                     </div>
                )}

                {/* Tabs */}
                <div className="flex bg-surface-highlight border-b border-border p-1 gap-1 shrink-0 mb-4 rounded">
                    <button onClick={() => setActiveTab('general')} className={`flex-1 py-2 text-xs font-bold rounded flex items-center justify-center gap-2 ${activeTab === 'general' ? 'bg-primary text-primary-fg' : 'text-muted hover:bg-surface'}`}>
                        <Settings size={14}/> 常规配置
                    </button>
                    <button onClick={() => setActiveTab('developer')} className={`flex-1 py-2 text-xs font-bold rounded flex items-center justify-center gap-2 ${activeTab === 'developer' ? 'bg-primary text-primary-fg' : 'text-muted hover:bg-surface'}`}>
                       {!isKeysUnlocked && <Lock size={12}/>} 开发者与默认值 (Developer)
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 min-h-0">
                    {activeTab === 'general' && (
                        <GeneralTab 
                            localSettings={localSettings} setLocalSettings={setLocalSettings}
                            localJudge={localJudge} setLocalJudge={setLocalJudge}
                            localCharGen={localCharGen} setLocalCharGen={setLocalCharGen}
                            localCharBehavior={localCharBehavior} setLocalCharBehavior={setLocalCharBehavior}
                            localDefaults={localDefaults} setLocalDefaults={setLocalDefaults}
                            isKeysUnlocked={isKeysUnlocked}
                            testingConnection={testingConnection}
                            handleTestConnection={handleTestConnection}
                            setContextEditorTarget={setContextEditorTarget}
                            handleSyncAllClick={handleSyncAllClick}
                            providerDefaults={PROVIDER_DEFAULTS}
                            onOpenThemeEditor={openWindow ? () => openWindow('theme') : undefined}
                        />
                    )}

                    {activeTab === 'developer' && (
                        <DeveloperTab 
                            localSettings={localSettings} setLocalSettings={setLocalSettings}
                            localDefaults={localDefaults} setLocalDefaults={setLocalDefaults}
                            localContext={localContext} setLocalContext={setLocalContext}
                            localDevMode={localDevMode} setLocalDevMode={setLocalDevMode}
                            isKeysUnlocked={isKeysUnlocked}
                            passwordInput={passwordInput} setPasswordInput={setPasswordInput}
                            errorMsg={errorMsg}
                            unlockKeys={unlockKeys}
                            toggleLock={toggleLock}
                            setEditingTemplateType={setEditingTemplateType}
                            onEditGlobalContext={() => setContextEditorTarget('global')}
                        />
                    )}
                </div>
            </div>
        </Window>
    );
};


import React, { useState } from 'react';
import { GameState, WindowState } from '../../types';
import { Button } from '../ui/Button';
import { Download, Upload, Layers, Settings, Globe, Coins, MapPin, BookOpen, Map, Terminal, RotateCcw, Trash2, Menu, X, Lock, Gift, Clock, Pause, Play, Zap, Sun, Moon } from 'lucide-react';

interface TopBarProps {
    state: GameState;
    updateState: (updater: (current: GameState) => GameState) => void;
    openWindow: (type: WindowState['type'], data?: any) => void;
    restartGame: () => void;
    onSaveClick: () => void;
    onLoadClick: (e: React.ChangeEvent<HTMLInputElement>) => void;
    fileInputRef: React.RefObject<HTMLInputElement>;
    setSelectedCharId: (id: string) => void;
    onTogglePause?: () => void; 
    mobileView?: 'story' | 'map' | 'char';
    setMobileView?: (view: 'story' | 'map' | 'char') => void;
    onConfirm?: (title: string, msg: string, action: () => void) => void;
}

export const TopBar: React.FC<TopBarProps> = ({ 
    state, updateState, openWindow, onSaveClick, onLoadClick, fileInputRef, setSelectedCharId, mobileView, setMobileView, restartGame, onConfirm
}) => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    
    const locked = state.appSettings.lockedFeatures || ({} as any);
    const isLightMode = state.appSettings.storyLogLightMode;
    const useNativeChooser = state.appSettings.useNativeChooser || false;

    const handleAction = (action: () => void) => {
        action();
        setIsMobileMenuOpen(false);
    };

    const toggleLightMode = () => {
        updateState(s => ({
            ...s,
            appSettings: { ...s.appSettings, storyLogLightMode: !s.appSettings.storyLogLightMode }
        }));
    };

    const handleLoadFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (useNativeChooser && !file.name.endsWith('.json')) {
                alert(`文件类型错误 (${file.name})。请选择 .json 格式的存档文件。`);
                e.target.value = ''; // Reset
                return;
            }
            onLoadClick(e);
        }
    };

    // New: Strict lock for World Composition
    const isWorldLocked = locked.characterEditor && locked.locationEditor;

    return (
      <div className="h-16 bg-app border-b border-border flex items-center px-4 shadow-lg z-50 shrink-0 justify-between gap-2 relative">
         <style>{`
            @keyframes marquee {
                0% { transform: translateX(0); }
                100% { transform: translateX(-50%); }
            }
            .animate-scroll-left {
                display: inline-flex;
                white-space: nowrap;
                animation: marquee 20s linear infinite;
            }
            .mask-gradient {
                mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent);
                -webkit-mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent);
            }
         `}</style>

         {/* Logo */}
         <div className="flex items-center shrink-0 mr-2">
             <h1 className="text-xl font-bold tracking-tight text-primary hidden sm:flex items-center gap-2">
                 <span>花海</span>
                 <div className="relative w-32 lg:w-64 h-5 overflow-hidden mask-gradient select-none">
                     <div className="absolute whitespace-nowrap animate-scroll-left text-[10px] text-muted flex items-center h-full">
                         <span className="mr-8">V1 github.com/954114865/Huahai-Aetheria-Engine</span>
                         <span className="mr-8">V1 github.com/954114865/Huahai-Aetheria-Engine</span>
                     </div>
                 </div>
             </h1>
             <h1 className="text-lg font-bold tracking-tight text-primary sm:hidden">花海</h1>
         </div>
         
         {/* MOBILE: Navigation Tabs (Center) */}
         <div className="flex lg:hidden bg-surface rounded-lg p-1 border border-border items-center gap-1">
             <button 
                onClick={() => setMobileView && setMobileView('map')}
                className={`p-2 rounded flex items-center justify-center ${mobileView === 'map' ? 'bg-primary text-primary-fg shadow' : 'text-muted hover:text-body'}`}
             >
                 <Map size={18}/>
             </button>
             <button 
                onClick={() => setMobileView && setMobileView('story')}
                className={`p-2 rounded flex items-center justify-center ${mobileView === 'story' ? 'bg-primary text-primary-fg shadow' : 'text-muted hover:text-body'}`}
             >
                 <BookOpen size={18}/>
             </button>
             <button 
                onClick={() => setMobileView && setMobileView('char')}
                className={`p-2 rounded flex items-center justify-center ${mobileView === 'char' ? 'bg-primary text-primary-fg shadow' : 'text-muted hover:text-body'}`}
             >
                 <Globe size={18}/>
             </button>
         </div>

         {/* Spacer to push right utilities */}
         <div className="flex-1"></div>

         {/* Right Utilities (Desktop / Tablet) */}
         <div className="hidden md:flex gap-2 items-center shrink-0 z-20 bg-app pl-2">
             
             {/* GROUP A: Utility Buttons (Hidden on Narrow Screens < LG) */}
             <div className="hidden lg:flex items-center gap-2">
                 {/* Time Flow Toggle */}
                 <button 
                    onClick={() => updateState(s => ({...s, round: {...s.round, isWorldTimeFlowPaused: !s.round.isWorldTimeFlowPaused}}))} 
                    className="p-2 rounded transition-colors flex items-center gap-1 text-muted hover:text-body hover:bg-surface-highlight"
                    title={state.round.isWorldTimeFlowPaused ? "时间已暂停 (点击恢复)" : "时间流逝中 (点击暂停)"}
                 >
                     <Clock size={16}/>
                     {state.round.isWorldTimeFlowPaused ? <Pause size={12} className="text-danger-fg"/> : <Play size={12}/>}
                 </button>

                 {/* Light Mode Toggle */}
                 <button
                    onClick={toggleLightMode}
                    className="p-2 text-muted hover:text-dopamine hover:bg-surface-highlight rounded transition-colors"
                    title={isLightMode ? "切换至暗黑模式" : "切换至明亮模式 (阅读)"}
                 >
                     {isLightMode ? <Moon size={16}/> : <Sun size={16}/>}
                 </button>

                 <div className="w-px h-4 bg-border mx-1"></div>

                 <div className="flex items-center gap-1 border-r border-border pr-2 mr-2">
                     <button onClick={restartGame} className="p-2 text-muted hover:text-endorphin hover:bg-surface-highlight rounded transition-colors" title="重置游戏"><RotateCcw size={16}/></button>
                     <div className="w-px h-4 bg-border mx-1"></div>
                     <button onClick={() => openWindow('story_edit')} className="p-2 text-muted hover:text-endorphin hover:bg-surface-highlight rounded transition-colors" title="故事编辑/清空"><BookOpen size={16}/></button>
                     <div className="w-px h-4 bg-border mx-1"></div>
                     <button onClick={onSaveClick} className="p-2 text-muted hover:text-body hover:bg-surface-highlight rounded"><Download size={16}/></button>
                     <button onClick={() => { if(fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click(); } }} className="p-2 text-muted hover:text-body hover:bg-surface-highlight rounded"><Upload size={16}/></button>
                 </div>
             </div>

             {/* GROUP B: Pool Buttons (Always visible on Tablet+) */}
             {state.devMode && (
                <Button size="sm" variant="secondary" onClick={() => openWindow('dev')} className="px-2 text-success-fg border-success/30" title="Debug Console">
                    <Terminal size={16}/>
                </Button>
             )}

             <Button size="sm" variant="secondary" onClick={() => openWindow('settings')} className="px-2 sm:px-3"><Settings size={16} /></Button>
             <div className="flex gap-2">
                 <Button 
                    size="sm" 
                    variant="secondary" 
                    onClick={() => !locked.cardPoolEditor && openWindow('pool')} 
                    className={`px-2 ${locked.cardPoolEditor ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title={locked.cardPoolEditor ? "已锁定 (Locked)" : "卡池"}
                 >
                     {locked.cardPoolEditor ? <Lock size={16}/> : <Layers size={16}/>}
                 </Button>
                 
                 {/* Unified World Composition Button */}
                 <Button 
                    size="sm" 
                    variant="secondary" 
                    onClick={() => !isWorldLocked && openWindow('world_composition' as any)} 
                    className={`px-2 ${isWorldLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title={isWorldLocked ? "已锁定 (Locked)" : "世界构成 (角色/地点)"}
                    disabled={isWorldLocked}
                 >
                     {isWorldLocked ? <Lock size={16}/> : <Globe size={16}/>}
                 </Button>

                 <Button 
                    size="sm" 
                    variant="secondary" 
                    onClick={() => !locked.prizePoolEditor && openWindow('prize_pool')} 
                    className={`px-2 ${locked.prizePoolEditor ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title={locked.prizePoolEditor ? "已锁定 (Locked)" : "奖池 (Lottery)"}
                 >
                     {locked.prizePoolEditor ? <Lock size={16}/> : <Gift size={16}/>}
                 </Button>
                 <Button 
                    size="sm" 
                    variant="secondary" 
                    onClick={() => !locked.triggerEditor && openWindow('trigger_pool')} 
                    className={`px-2 ${locked.triggerEditor ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title={locked.triggerEditor ? "已锁定 (Locked)" : "触发器 (Triggers)"}
                 >
                     {locked.triggerEditor ? <Lock size={16}/> : <Zap size={16}/>}
                 </Button>
             </div>
         </div>

         {/* Mobile Menu Toggle (Visible < LG) */}
         {/* Updated breakpoint: Shows on Tablet/Narrow screens now too */}
         <div className="lg:hidden flex items-center gap-2">
             <Button size="sm" variant="ghost" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="px-2 text-muted">
                 {isMobileMenuOpen ? <X size={24}/> : <Menu size={24}/>}
             </Button>
         </div>

         {/* Mobile Dropdown Menu - Styled as Glass Panel */}
         {isMobileMenuOpen && (
             <>
                 <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setIsMobileMenuOpen(false)} />
                 <div className="absolute top-16 right-4 w-52 glass-panel z-50 flex flex-col p-2 animate-in fade-in slide-in-from-top-2 border-primary/20">
                     <div className="flex flex-col gap-1 border-b border-border pb-2 mb-2">
                         {/* Time & Utility Toggles - Always visible in menu when opened (since button is lg:hidden) */}
                         <button 
                            onClick={() => handleAction(() => updateState(s => ({...s, round: {...s.round, isWorldTimeFlowPaused: !s.round.isWorldTimeFlowPaused}})))}
                            className="flex items-center gap-2 p-2 rounded text-sm text-left text-muted hover:bg-surface-highlight hover:text-body"
                         >
                             <Clock size={16}/> {state.round.isWorldTimeFlowPaused ? "时间已暂停" : "时间流逝中"}
                         </button>

                         <button 
                            onClick={() => handleAction(toggleLightMode)}
                            className="flex items-center gap-2 p-2 hover:bg-surface-highlight rounded text-sm text-dopamine text-left"
                         >
                             {isLightMode ? <><Moon size={16}/> 切换暗黑模式</> : <><Sun size={16}/> 切换明亮模式</>}
                         </button>

                         <button onClick={() => handleAction(onSaveClick)} className="flex items-center gap-2 p-2 hover:bg-surface-highlight rounded text-sm text-muted hover:text-body text-left">
                             <Download size={16}/> 保存进度
                         </button>
                         <button onClick={() => { if(fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click(); } setIsMobileMenuOpen(false); }} className="flex items-center gap-2 p-2 hover:bg-surface-highlight rounded text-sm text-muted hover:text-body text-left">
                             <Upload size={16}/> 读取进度
                         </button>
                         
                         <button onClick={() => handleAction(() => openWindow('story_edit'))} className="flex items-center gap-2 p-2 hover:bg-surface-highlight rounded text-sm text-endorphin text-left">
                             <BookOpen size={16}/> 故事编辑
                         </button>
                         <button onClick={() => handleAction(restartGame)} className="flex items-center gap-2 p-2 hover:bg-surface-highlight rounded text-sm text-endorphin text-left">
                             <RotateCcw size={16}/> 重置游戏
                         </button>
                     </div>

                     {/* Pool Buttons - Only visible in Menu on very small screens (md:hidden) */}
                     {/* Because on Tablet (MD), they are already on the TopBar */}
                     <div className="flex flex-col gap-1 md:hidden">
                         <button onClick={() => handleAction(() => openWindow('settings'))} className="flex items-center gap-2 p-2 hover:bg-surface-highlight rounded text-sm text-body text-left">
                             <Settings size={16}/> 设置
                         </button>
                         <button 
                            onClick={() => !locked.cardPoolEditor && handleAction(() => openWindow('pool'))} 
                            className={`flex items-center gap-2 p-2 hover:bg-surface-highlight rounded text-sm text-body text-left ${locked.cardPoolEditor ? 'opacity-50 cursor-not-allowed' : ''}`}
                         >
                             {locked.cardPoolEditor ? <Lock size={16}/> : <Layers size={16}/>} 卡池
                         </button>
                         
                         <button 
                            onClick={() => !isWorldLocked && handleAction(() => openWindow('world_composition' as any))} 
                            className={`flex items-center gap-2 p-2 hover:bg-surface-highlight rounded text-sm text-body text-left ${isWorldLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                            disabled={isWorldLocked}
                         >
                             {isWorldLocked ? <Lock size={16}/> : <Globe size={16}/>} 世界构成
                         </button>

                         <button 
                            onClick={() => !locked.prizePoolEditor && handleAction(() => openWindow('prize_pool'))} 
                            className={`flex items-center gap-2 p-2 hover:bg-surface-highlight rounded text-sm text-body text-left ${locked.prizePoolEditor ? 'opacity-50 cursor-not-allowed' : ''}`}
                         >
                             {locked.prizePoolEditor ? <Lock size={16}/> : <Gift size={16}/>} 奖池
                         </button>
                         <button 
                            onClick={() => !locked.triggerEditor && handleAction(() => openWindow('trigger_pool'))} 
                            className={`flex items-center gap-2 p-2 hover:bg-surface-highlight rounded text-sm text-body text-left ${locked.triggerEditor ? 'opacity-50 cursor-not-allowed' : ''}`}
                         >
                             {locked.triggerEditor ? <Lock size={16}/> : <Zap size={16}/>} 触发器
                         </button>
                         {state.devMode && (
                            <button onClick={() => handleAction(() => openWindow('dev'))} className="flex items-center gap-2 p-2 hover:bg-surface-highlight rounded text-sm text-success-fg text-left">
                                <Terminal size={16}/> Debug Console
                            </button>
                         )}
                     </div>
                 </div>
             </>
         )}

         {/* Hidden File Input */}
         <input 
            key={useNativeChooser ? 'native-file-load' : 'restricted-file-load'}
            type="file" 
            ref={fileInputRef} 
            onChange={handleLoadFileChange} 
            className="hidden" 
            // If native chooser forced, remove accept to allow all file pickers (including raw file managers)
            // Otherwise use explicit .json and mime type for broad compatibility in web mode
            {...(useNativeChooser ? {} : { accept: ".json,application/json" })}
         />
      </div>
    );
};

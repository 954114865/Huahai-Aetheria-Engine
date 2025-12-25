
import React, { useState, useMemo } from 'react';
import { GameState, Card, AttributeVisibility, Character } from '../../../types';
import { Layers, Eye, EyeOff, Plus, Box, Zap, Coins, Edit2, Trash2, Gift, ChevronDown, ChevronRight, Search, Activity, ShieldAlert, Hourglass } from 'lucide-react';
import { CardEditor } from '../../Windows/CardEditor';
import { Window } from '../../ui/Window';

interface PoolWindowProps {
    winId: number;
    state: GameState;
    updateState: (updater: (current: GameState) => GameState) => void;
    closeWindow: (id: number) => void;
    openWindow: (type: any, data?: any) => void;
    addLog: (text: string) => void;
    selectedCharId?: string | null;
    onSaveCard?: (card: Card) => void;
}

const TRIGGER_TYPE_MAP: Record<string, { label: string, color: string }> = {
    'active': { label: '主动', color: 'text-primary border-primary/30 bg-primary/5' },
    'passive': { label: '被动', color: 'text-muted border-border bg-surface-highlight' },
    'reaction': { label: '反应', color: 'text-warning-fg border-warning-base/30 bg-warning-base/5' },
    'settlement': { label: '结算', color: 'text-info-fg border-info-base/30 bg-info-base/5' },
    'hidden_settlement': { label: '暗结算', color: 'text-faint border-border bg-black/20' },
};

export const CardPoolWindow: React.FC<PoolWindowProps> = ({ winId, state, updateState, closeWindow, openWindow, addLog, onSaveCard }) => {
  const [editingPoolCard, setEditingPoolCard] = useState<Card | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showPublicOnly, setShowPublicOnly] = useState(false); // 默认显示全部，方便GM管理
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  // Filter & Sort Logic
  const displayCards = useMemo(() => {
      // 1. Filter
      const filtered = state.cardPool.filter(c => {
          if (showPublicOnly && c.visibility === AttributeVisibility.PRIVATE) return false;
          if (searchQuery) {
              const q = searchQuery.toLowerCase();
              return c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
          }
          return true;
      });

      // 2. Sort by Owner Count (Descending)
      return filtered.sort((a, b) => {
          const countA = (Object.values(state.characters) as Character[]).filter(char => 
              char.inventory.includes(a.id) || char.skills.some(s => s.id === a.id)
          ).length;
          const countB = (Object.values(state.characters) as Character[]).filter(char => 
              char.inventory.includes(b.id) || char.skills.some(s => s.id === b.id)
          ).length;
          return countB - countA; // Descending
      });
  }, [state.cardPool, state.characters, showPublicOnly, searchQuery]);

  // Helper to find owners
  const getCardOwners = (cardId: string) => {
      return (Object.values(state.characters) as Character[]).filter(c => 
          c.inventory.includes(cardId) || c.skills.some(s => s.id === cardId)
      );
  };

  const handleDelete = (cardId: string) => {
      if (deleteConfirmId === cardId) {
          updateState(prev => ({
              ...prev,
              cardPool: prev.cardPool.filter(c => c.id !== cardId)
          }));
          setDeleteConfirmId(null);
          addLog("系统: 卡牌已从公共池中永久移除。");
      } else {
          setDeleteConfirmId(cardId);
          setTimeout(() => setDeleteConfirmId(null), 3000);
      }
  };

  const handleGive = (card: Card) => {
      // Open WorldComposition in Selection Mode
      openWindow('world_composition', { targetCardId: card.id, targetCardName: card.name });
  };

  if (editingPoolCard) {
      return (
           <CardEditor 
               initialCard={editingPoolCard}
               gameState={state}
               onSave={(c) => { if(onSaveCard) onSaveCard(c); setEditingPoolCard(null); }}
               onClose={() => setEditingPoolCard(null)}
           />
      );
  }

  return (
      <Window
          title="游戏卡池 (Card Pool)"
          icon={<Layers size={18}/>}
          onClose={() => closeWindow(winId)}
          maxWidth="max-w-4xl"
          height="h-[85vh]"
          disableContentScroll={true}
          noPadding={true}
          headerActions={
              <div className="flex gap-2">
                  <div className="relative">
                      <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted"/>
                      <input 
                        className="h-7 w-32 bg-surface border border-border rounded pl-7 text-xs focus:w-48 transition-all" 
                        placeholder="搜索..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                      />
                  </div>
                  <button 
                      onClick={() => setShowPublicOnly(!showPublicOnly)}
                      className={`
                          flex items-center gap-2 px-3 py-1 rounded text-xs font-bold border transition-colors whitespace-nowrap
                          ${showPublicOnly ? 'bg-primary/20 border-primary text-primary' : 'bg-surface border-border text-muted hover:text-body'}
                      `}
                      title="切换显示范围"
                  >
                      {showPublicOnly ? <Eye size={14}/> : <EyeOff size={14}/>}
                  </button>
              </div>
          }
      >
          <div className="flex flex-col h-full bg-surface-light/30">
                {/* Toolbar - Transparent Glass Style */}
                <div className="p-3 border-b border-border/40 shrink-0">
                    <button 
                        onClick={() => openWindow('card')}
                        className="w-full flex items-center justify-center gap-2 p-2 rounded border border-dashed border-border/60 text-muted hover:text-primary hover:border-primary hover:bg-surface-highlight/50 transition-all group"
                    >
                        <Plus size={16} className="group-hover:scale-110 transition-transform"/>
                        <span className="text-sm font-bold">新建卡牌定义</span>
                    </button>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                    {displayCards.length === 0 && (
                        <div className="text-center text-muted text-sm py-10">没有找到匹配的卡牌。</div>
                    )}

                    {displayCards.map(card => {
                        const isExpanded = expandedCardId === card.id;
                        const owners = isExpanded ? getCardOwners(card.id) : []; // Calculate owners only when expanded for performance
                        // For sorting display (optional), we can calculate length cheaply if needed, but owners list needs instantiation
                        const ownerCount = isExpanded ? owners.length : (Object.values(state.characters) as Character[]).filter(c => c.inventory.includes(card.id) || c.skills.some(s => s.id === card.id)).length;
                        
                        const triggerStyle = TRIGGER_TYPE_MAP[card.triggerType] || TRIGGER_TYPE_MAP['active'];

                        return (
                            <div 
                                key={card.id} 
                                className={`
                                    bg-surface border border-border rounded-lg overflow-hidden transition-all shadow-sm
                                    ${isExpanded ? 'ring-1 ring-primary/30' : 'hover:border-highlight'}
                                `}
                            >
                                {/* Main Row */}
                                <div 
                                    className="p-3 cursor-pointer hover:bg-surface-highlight/50 transition-colors"
                                    onClick={() => setExpandedCardId(isExpanded ? null : card.id)}
                                >
                                    <div className="flex items-start gap-3">
                                        {/* Avatar/Icon */}
                                        <div className="w-10 h-10 rounded bg-black/20 border border-border shrink-0 overflow-hidden relative group mt-0.5">
                                            {card.imageUrl ? (
                                                <img src={card.imageUrl} className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }}/>
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-muted">
                                                    {card.itemType === 'consumable' ? <Box size={20}/> : <Zap size={20}/>}
                                                </div>
                                            )}
                                            {card.visibility === AttributeVisibility.PRIVATE && (
                                                <div className="absolute top-0 right-0 p-0.5 bg-black/60 rounded-bl text-white">
                                                    <EyeOff size={8}/>
                                                </div>
                                            )}
                                            {ownerCount > 0 && (
                                                <div className="absolute bottom-0 right-0 bg-primary/80 text-primary-fg text-[9px] px-1 rounded-tl font-bold" title="持有者数量">
                                                    {ownerCount}
                                                </div>
                                            )}
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start">
                                                {/* Card Name & Badges Container (Flex-1 to take space, min-w-0 to allow truncate) */}
                                                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0 pr-2">
                                                    <span className="font-bold text-sm text-body truncate block max-w-full">{card.name}</span>
                                                    
                                                    {/* Item Type Badge */}
                                                    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase shrink-0 ${card.itemType === 'skill' ? 'border-indigo-500/30 text-indigo-400 bg-indigo-500/10' : 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'}`}>
                                                        {card.itemType === 'skill' ? 'SKILL' : 'ITEM'}
                                                    </span>

                                                    {/* Trigger Type Badge */}
                                                    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono shrink-0 ${triggerStyle.color}`}>
                                                        {triggerStyle.label}
                                                    </span>

                                                    {card.cost > 0 && (
                                                        <span className="text-[10px] text-dopamine flex items-center gap-1 font-mono shrink-0">
                                                            <Coins size={10}/> {card.cost}
                                                        </span>
                                                    )}
                                                </div>
                                                
                                                {/* Actions & Expand Arrow (Fixed on right) */}
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                                        <button 
                                                            onClick={() => handleGive(card)}
                                                            className="w-7 h-7 flex items-center justify-center rounded hover:bg-success-base/20 text-muted hover:text-success-fg transition-colors"
                                                            title="分发给角色"
                                                        >
                                                            <Gift size={14}/>
                                                        </button>
                                                        <button 
                                                            onClick={() => setEditingPoolCard(card)}
                                                            className="w-7 h-7 flex items-center justify-center rounded hover:bg-primary/20 text-muted hover:text-primary transition-colors"
                                                            title="编辑"
                                                        >
                                                            <Edit2 size={14}/>
                                                        </button>
                                                        <button 
                                                            onClick={() => handleDelete(card.id)}
                                                            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${deleteConfirmId === card.id ? 'bg-danger text-white' : 'hover:bg-danger/20 text-muted hover:text-danger-fg'}`}
                                                            title={deleteConfirmId === card.id ? "确认删除?" : "删除"}
                                                        >
                                                            {deleteConfirmId === card.id ? <span className="font-bold text-xs">!</span> : <Trash2 size={14}/>}
                                                        </button>
                                                    </div>
                                                    
                                                    {/* Chevron OUTSIDE of stopPropagation div */}
                                                    <div className="text-muted hover:text-body transition-colors w-6 flex justify-center">
                                                        {isExpanded ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Effects Summary */}
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {card.effects.length === 0 && <span className="text-[10px] text-faint italic">无特殊效果</span>}
                                                {card.effects.map((e, idx) => (
                                                    <span key={idx} className="text-[10px] bg-surface-highlight border border-border px-1.5 rounded text-muted truncate max-w-[150px]">
                                                        {e.name}: {e.targetAttribute} {Number(e.value) > 0 ? '+' : ''}{e.value}
                                                    </span>
                                                ))}
                                            </div>
                                            
                                            {/* Description Preview */}
                                            {!isExpanded && (
                                                <div className="text-[10px] text-muted mt-1 truncate opacity-70">
                                                    {card.description}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded Area */}
                                {isExpanded && (
                                    <div className="bg-black/5 border-t border-border p-3 animate-in slide-in-from-top-1">
                                        <div className="text-xs text-muted mb-3 whitespace-pre-wrap leading-relaxed">
                                            {card.description}
                                        </div>

                                        <div className="border-t border-border/50 pt-2">
                                            <div className="text-[10px] font-bold text-muted uppercase mb-2">
                                                当前持有者 ({owners.length})
                                            </div>
                                            {owners.length === 0 ? (
                                                <span className="text-xs text-faint italic">暂无角色持有</span>
                                            ) : (
                                                <div className="flex flex-wrap gap-2">
                                                    {owners.map(char => (
                                                        <div key={char.id} className="flex items-center gap-1.5 bg-surface border border-border rounded-full pr-2 pl-1 py-1">
                                                            <div className="w-4 h-4 rounded-full overflow-hidden bg-black">
                                                                {char.avatarUrl && <img src={char.avatarUrl} className="w-full h-full object-cover"/>}
                                                            </div>
                                                            <span className="text-[10px] text-body">{char.name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
          </div>
      </Window>
  );
};

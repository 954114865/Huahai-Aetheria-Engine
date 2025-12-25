
import React, { useState } from 'react';
import { Card, Effect, GameState, Character, AttributeVisibility } from '../../types';
import { Button, Input, Label, TextArea } from '../ui/Button';
import { Plus, Trash2, Sparkles, Box, Zap, Coins, Hourglass, ShieldAlert, Wand2, EyeOff, Eye, MessageSquare, Lock, Edit2 } from 'lucide-react';
import { ImageUploader } from '../ui/ImageUploader';
import { Window } from '../ui/Window';

interface CardEditorProps {
  onSave: (card: Card) => void;
  onClose: () => void;
  initialCard?: Card;
  gameState: GameState; 
  fixedCost?: number; // New prop to lock cost
  readOnly?: boolean; // New prop for view-only mode
}

export const CardEditor: React.FC<CardEditorProps> = ({ onSave, onClose, initialCard, gameState, fixedCost, readOnly = false }) => {
  const ensureHitEffect = (c: Card): Card => {
      if (!c.effects || c.effects.length === 0) {
          return {
              ...c,
              effects: [{
                  id: 'effect_hit_' + Date.now(),
                  name: '命中判定',
                  targetType: 'specific_char',
                  targetAttribute: '健康', 
                  targetId: '',
                  value: 0, 
                  conditionDescription: '无', 
                  conditionContextKeys: []
              }]
          };
      }
      return c;
  };

  const [card, setCard] = useState<Card>(ensureHitEffect(initialCard || {
    id: `card_${Date.now()}`,
    name: '新卡牌',
    description: '',
    imageUrl: '',
    itemType: 'skill',
    triggerType: 'active',
    cost: fixedCost !== undefined ? fixedCost : 5,
    effects: [],
    visibility: AttributeVisibility.PUBLIC
  }));

  const addEffect = () => {
    const newEffect: Effect = {
      id: Date.now().toString(),
      name: '附加效果',
      targetType: 'specific_char',
      targetId: '',
      targetAttribute: '健康',
      value: 0, 
      dynamicValue: false,
      conditionDescription: '当上一个效果命中时', 
      conditionContextKeys: []
    };
    setCard({ ...card, effects: [...(card.effects || []), newEffect] });
  };

  const updateEffect = (index: number, updates: Partial<Effect>) => {
    const newEffects = [...(card.effects || [])];
    newEffects[index] = { ...newEffects[index], ...updates };
    setCard({ ...card, effects: newEffects });
  };

  const removeEffect = (index: number) => {
    // Prevent deleting the last effect if it's the only one (keep at least one hit check)
    if ((card.effects || []).length <= 1) {
        alert("卡牌必须至少包含一个效果（通常为命中判定）。");
        return;
    }
    setCard({ ...card, effects: (card.effects || []).filter((_, i) => i !== index) });
  };

  return (
    <Window
      title={readOnly ? '查看卡牌详情' : '卡牌编辑器'}
      icon={<Edit2 size={18}/>}
      onClose={onClose}
      zIndex={200}
      maxWidth="max-w-2xl"
      footer={
        readOnly ? (
            <Button variant="secondary" onClick={onClose} className="w-full">关闭</Button>
        ) : (
            <>
              <Button variant="secondary" onClick={onClose}>取消</Button>
              <Button onClick={() => onSave(card)}>保存配置</Button>
            </>
        )
      }
    >
      <div className="space-y-6">
          {/* Basic Card Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <div className="flex justify-between items-center">
                  <Label>名称</Label>
                  <button 
                    className={`text-[10px] flex items-center gap-1 px-2 py-0.5 rounded ${card.visibility === AttributeVisibility.PRIVATE ? 'bg-danger/20 text-danger-fg' : 'bg-surface-highlight text-muted'}`}
                    onClick={() => !readOnly && setCard({...card, visibility: card.visibility === AttributeVisibility.PUBLIC ? AttributeVisibility.PRIVATE : AttributeVisibility.PUBLIC})}
                    disabled={readOnly}
                  >
                      {card.visibility === AttributeVisibility.PRIVATE ? <><EyeOff size={10}/> 隐藏 (本人可见)</> : <><Eye size={10}/> 公开</>}
                  </button>
              </div>
              <Input value={card.name} onChange={e => setCard({ ...card, name: e.target.value })} disabled={readOnly} />
            </div>
            <div>
              <Label>图片</Label>
              <div className={readOnly ? "pointer-events-none opacity-90" : ""}>
                  <ImageUploader value={card.imageUrl || ''} onChange={(val) => setCard({...card, imageUrl: val})} placeholder="URL or Paste"/>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
               <div>
                   <Label>类型</Label>
                   <div className="flex gap-4 mt-2 bg-surface-light p-2 rounded border border-border">
                       <label className={`flex items-center gap-2 text-sm text-muted ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}>
                           <input type="radio" checked={card.itemType === 'skill'} onChange={() => setCard({...card, itemType: 'skill'})} disabled={readOnly} className="accent-primary"/>
                           <Zap size={14} className="text-warning-fg"/> 技能
                       </label>
                       <label className={`flex items-center gap-2 text-sm text-muted ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}>
                           <input type="radio" checked={card.itemType === 'consumable'} onChange={() => setCard({...card, itemType: 'consumable'})} disabled={readOnly} className="accent-info-fg"/>
                           <Box size={14} className="text-info-fg"/> 物品
                       </label>
                   </div>
               </div>
               <div className="sm:col-span-2">
                   <Label>触发方式</Label>
                   <div className="flex flex-wrap gap-3 mt-2 bg-surface-light p-2 rounded border border-border">
                       <label className={`flex items-center gap-2 text-sm text-muted ${readOnly ? 'cursor-default' : 'cursor-pointer'}`} title="手动使用">
                           <input type="radio" checked={card.triggerType === 'active'} onChange={() => setCard({...card, triggerType: 'active'})} disabled={readOnly} />
                           主动
                       </label>
                       <label className={`flex items-center gap-2 text-sm text-muted ${readOnly ? 'cursor-default' : 'cursor-pointer'}`} title="手动使用，但先触发目标反应">
                           <input type="radio" checked={card.triggerType === 'reaction'} onChange={() => setCard({...card, triggerType: 'reaction'})} disabled={readOnly} />
                           <MessageSquare size={14} className="text-success-fg"/> 反应
                       </label>
                       <label className={`flex items-center gap-2 text-sm text-muted ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}>
                           <input type="radio" checked={card.triggerType === 'passive'} onChange={() => setCard({...card, triggerType: 'passive'})} disabled={readOnly} />
                           被动
                       </label>
                       <label className={`flex items-center gap-2 text-sm text-muted ${readOnly ? 'cursor-default' : 'cursor-pointer'}`} title="回合结束时自动判定">
                           <input type="radio" checked={card.triggerType === 'settlement'} onChange={() => setCard({...card, triggerType: 'settlement'})} disabled={readOnly} />
                           <Hourglass size={14} className="text-primary"/> 结算
                       </label>
                       <label className={`flex items-center gap-2 text-sm text-muted ${readOnly ? 'cursor-default' : 'cursor-pointer'}`} title="回合结束时触发，但不显示来源">
                           <input type="radio" checked={card.triggerType === 'hidden_settlement'} onChange={() => setCard({...card, triggerType: 'hidden_settlement'})} disabled={readOnly} />
                           <EyeOff size={14} className="text-danger-fg"/> 隐藏结算
                       </label>
                   </div>
               </div>
               <div>
                  <Label>价格 (CP)</Label>
                  <div className="flex items-center gap-2 mt-2 relative">
                      <Coins size={16} className={fixedCost !== undefined || readOnly ? "text-muted" : "text-warning-fg"}/>
                      <Input 
                          type="number" 
                          value={card.cost} 
                          onChange={e => {
                              if (fixedCost === undefined && !readOnly) {
                                  setCard({...card, cost: parseInt(e.target.value) || 0})
                              }
                          }} 
                          className={`flex-1 ${fixedCost !== undefined || readOnly ? 'text-muted cursor-not-allowed bg-surface-highlight' : ''}`}
                          disabled={fixedCost !== undefined || readOnly}
                      />
                      {fixedCost !== undefined && (
                          <div className="absolute right-2 top-2 text-muted" title="价格已固定 (支付额的一半)">
                              <Lock size={14}/>
                          </div>
                      )}
                  </div>
               </div>
          </div>

          <div>
            <Label>描述</Label>
            <TextArea 
              rows={2}
              value={card.description}
              onChange={e => setCard({ ...card, description: e.target.value })}
              placeholder="请填写自然语言描述（如：使用者用力挥舞巨剑...）。此描述将作为AI判断效果的依据。"
              disabled={readOnly}
            />
            {!readOnly && <p className="text-[10px] text-muted mt-1">提示: 描述不只是展示文本，它定义了动作的具体方式，AI会参考此内容来生成动态效果。</p>}
          </div>

          {/* Effects Section */}
          <div className="border-t border-border pt-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-highlight flex items-center gap-2"><Sparkles size={16}/> 效果配置序列</h3>
              {!readOnly && <Button size="sm" onClick={addEffect} variant="secondary"><Plus size={14} className="mr-1" /> 添加效果</Button>}
            </div>
            
            {!readOnly && (
                <p className="text-xs text-muted mb-4 bg-surface-highlight p-2 rounded border border-border">
                系统提示: 
                1. <b>序列1</b> 通常为「命中/条件判定」，修改值建议设为 0。如果此判定失败，后续效果将不执行。<br/>
                2. <b>序列2+</b> 为实际效果（如伤害）。请使用中文自然语言描述判定条件。
                </p>
            )}

            <div className="space-y-4">
              {(card.effects || []).map((effect, idx) => {
                const isHitEffect = idx === 0;
                return (
                  <div key={effect.id} className={`bg-surface-light p-4 rounded border ${isHitEffect ? 'border-primary/50 bg-primary/5' : 'border-border'} text-sm relative group hover:border-highlight transition-colors`}>
                    {isHitEffect && (
                        <div className="absolute -top-2 -left-2 bg-primary text-primary-fg text-[10px] px-2 py-0.5 rounded shadow flex items-center gap-1 z-10">
                            <ShieldAlert size={10}/> 基础命中/触发判定
                        </div>
                    )}
                    
                    {!readOnly && (
                        <div className={`absolute top-2 right-2 transition-opacity ${isHitEffect ? '' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'}`}>
                            <button onClick={() => removeEffect(idx)} className="text-danger-fg hover:bg-danger/20 p-1 rounded" title="删除效果"><Trash2 size={16} /></button>
                        </div>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3 mt-2">
                      {/* Column 1: Target Scope */}
                      <div>
                          <Label>目标范围</Label>
                          <select 
                              className="w-full bg-surface border border-border rounded px-2 py-2.5 text-body mb-2 focus:outline-none focus:border-primary disabled:opacity-70"
                              value={effect.targetType}
                              onChange={e => updateEffect(idx, { targetType: e.target.value as any, targetId: '' })}
                              disabled={readOnly}
                          >
                              <option value="specific_char">指定角色</option>
                              <option value="ai_choice">AI 自主选择 (Smart)</option>
                              <option value="self">使用者自身 (Self)</option>
                              <option value="all_chars">所有角色 (All)</option>
                              <option value="world">世界环境 (World)</option>
                              {!isHitEffect && <option value="hit_target">命中目标 (同首位)</option>}
                          </select>

                          {effect.targetType === 'specific_char' && (
                              <select 
                                  className="w-full bg-surface border border-border rounded px-2 py-2 text-body focus:outline-none focus:border-primary disabled:opacity-70"
                                  value={effect.targetId || ''}
                                  onChange={e => updateEffect(idx, { targetId: e.target.value })}
                                  disabled={readOnly}
                              >
                                  <option value="">-- 固定目标 (可选) --</option>
                                  {(Object.values(gameState.characters) as Character[]).map(c => (
                                      <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                              </select>
                          )}
                      </div>

                      {/* Column 2: Attribute Input */}
                      <div>
                          <Label>目标属性</Label>
                          <Input 
                              value={effect.targetAttribute}
                              onChange={e => updateEffect(idx, { targetAttribute: e.target.value })}
                              placeholder="例如: 健康"
                              disabled={readOnly}
                          />
                      </div>

                      {/* Column 3: Modification Value */}
                      <div className="relative">
                          <div className="flex justify-between items-center">
                              <Label>修改值/状态</Label>
                              {!readOnly && (
                                  <label className="text-[10px] text-primary flex items-center gap-1 cursor-pointer" title="勾选后，数值将由AI根据上下文决定">
                                      <input 
                                          type="checkbox" 
                                          checked={effect.dynamicValue || false}
                                          onChange={e => updateEffect(idx, { dynamicValue: e.target.checked })}
                                          className="accent-primary"
                                      /> 
                                      <Wand2 size={10}/> AI 决定
                                  </label>
                              )}
                              {readOnly && effect.dynamicValue && (
                                  <span className="text-[10px] text-primary flex items-center gap-1">
                                      <Wand2 size={10}/> AI 决定
                                  </span>
                              )}
                          </div>
                          <Input 
                              value={effect.value} 
                              onChange={e => updateEffect(idx, { value: e.target.value })} 
                              placeholder={effect.dynamicValue ? "参考范围 (如: 10-50)" : "+10, -5, 或 文本"}
                              disabled={readOnly} 
                              className={effect.dynamicValue ? "border-primary/50 text-primary" : ""}
                          />
                          {isHitEffect && Number(effect.value) === 0 && !readOnly && (
                               <span className="text-[9px] text-primary absolute bottom-[-18px] left-0">命中判定建议值为 0</span>
                          )}
                      </div>
                    </div>

                    {/* Condition Logic */}
                    <div>
                      <Label>生效条件 (中文自然语言 / Natural Language)</Label>
                      <TextArea 
                          value={effect.conditionDescription} 
                          onChange={e => updateEffect(idx, { conditionDescription: e.target.value })} 
                          placeholder={isHitEffect ? "无 (默认为真) 或: 目标健康值小于30" : "无 (默认跟随命中)"}
                          className={`w-full resize-none ${isHitEffect ? "border-primary/30" : ""}`}
                          rows={3}
                          disabled={readOnly}
                      />
                      {!readOnly && <span className="text-[10px] text-muted">示例: "使用者是男性", "目标处于虚弱状态"。</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
      </div>
    </Window>
  );
};


import React, { useState, useEffect } from 'react';
import { Character, Provider, AttributeType, Card, GameState, GameAttribute, AttributeVisibility, Drive, MapLocation, Conflict, GameImage } from '../../types';
import { Button, Input, Label, TextArea } from '../ui/Button';
import { Save, BrainCircuit, Plus, Edit, Trash, Eye, EyeOff, Coins, Cpu, User, AlertTriangle, Footprints, Dices, MessageSquare, Heart, VenetianMask, Info, Activity, Layers, Package, Upload, RefreshCw, Eraser, Settings2, Globe } from 'lucide-react';
import { CardEditor } from './CardEditor';
import { generateRandomFlagAvatar } from '../../assets/imageLibrary';
import { getCharacterMemory } from '../../services/aiService';
import { defaultAcquireCard, defaultInteractCard, defaultTradeCard } from '../../services/DefaultSettings';
import { ContextEditorModal } from './Settings/ContextEditorModal';
import { Window } from '../ui/Window';
import { ImageAttachmentList } from '../ui/ImageAttachmentList';
import { ImageUploadModal } from '../Modals/ImageUploadModal';

interface CharacterEditorProps {
  character?: Character; // Or Partial with special config
  onSave: (char: Character, locationId?: string) => void; 
  onClose: () => void;
  gameState: GameState; 
  onUpdatePoolCard?: (card: Card) => void; 
  isTemplate?: boolean;
}

export const CharacterEditor: React.FC<CharacterEditorProps> = ({ character, onSave, onClose, gameState, onUpdatePoolCard, isTemplate = false }) => {
  
  const generateNextId = () => {
      const existingIds = Object.keys(gameState.characters).map(id => Number(id)).filter(n => !isNaN(n));
      let next = 1;
      while (existingIds.includes(next)) {
          next++;
      }
      return next.toString();
  };

  const getInitialState = (): Character => {
      if (character && character.id) return character;
      
      const tmpl = JSON.parse(JSON.stringify(gameState.defaultSettings.templates.character));
      tmpl.id = generateNextId();
      
      if (!tmpl.avatarUrl) {
          tmpl.avatarUrl = generateRandomFlagAvatar();
      }
      
      if (tmpl.attributes.cp) {
          tmpl.attributes.cp.value = gameState.defaultSettings.gameplay.defaultInitialCP;
      }
      
      // Default to FALSE for overrides on new characters
      tmpl.useAiOverride = false;
      tmpl.memoryConfig = {
          useOverride: false,
          maxMemoryRounds: gameState.appSettings.maxCharacterMemoryRounds || 10,
          actionDropoutProbability: gameState.appSettings.actionMemoryDropoutProbability || 0.34,
          reactionDropoutProbability: gameState.appSettings.reactionMemoryDropoutProbability || 0.34
      };

      // Ensure AI config structure exists even if disabled, populated with global defaults for reference
      tmpl.aiConfig = gameState.charBehaviorConfig || gameState.judgeConfig || {
          provider: Provider.XAI,
          model: 'grok-4-1-fast-reasoning',
          temperature: 1.0
      };

      if (!tmpl.skills) tmpl.skills = [];
      const currentSkillIds = new Set(tmpl.skills.map((s: Card) => s.id));
      
      if (!currentSkillIds.has(defaultAcquireCard.id)) tmpl.skills.push(defaultAcquireCard);
      if (!currentSkillIds.has(defaultTradeCard.id)) tmpl.skills.push(defaultTradeCard);
      if (!currentSkillIds.has(defaultInteractCard.id)) tmpl.skills.push(defaultInteractCard);
      
      return tmpl;
  };

  const [char, setChar] = useState<Character>(getInitialState());

  // Effect to sync external character prop changes (if any)
  useEffect(() => {
      if (character && character.id && character.id === char.id) {
          // If character prop updates from outside, we might want to sync
          // But usually this component manages local state until save.
          // Skipping deep sync for now to avoid overwriting local edits.
      }
  }, [character]);

  // Determine initial location logic
  const currentPos = gameState.map.charPositions[char.id];
  const passedInitialLoc = (character as any)?.initialLocationId;
  const initialLocId = currentPos?.locationId || passedInitialLoc || gameState.map.activeLocationId || '';

  const [selectedLocationId, setSelectedLocationId] = useState<string>(initialLocId);

  const [editingCard, setEditingCard] = useState<{ card: Card, source: 'deck' | 'pool' } | null>(null);
  const [activeTab, setActiveTab] = useState<'basic' | 'attributes' | 'deck' | 'inventory' | 'brain'>('basic');
  const [confirmDeleteSkillId, setConfirmDeleteSkillId] = useState<string | null>(null);

  const [showContextModal, setShowContextModal] = useState(false);
  
  // Image Upload State - Extended to include 'avatar'
  const [showImageUpload, setShowImageUpload] = useState<{ target: 'appearance' | 'description' | 'avatar' } | null>(null);
  const [editingImage, setEditingImage] = useState<{ target: 'appearance' | 'description', image: GameImage } | null>(null);

  const knownLocations = (Object.values(gameState.map.locations) as MapLocation[]).filter(l => l.isKnown);

  const updateAttr = (key: string, field: keyof GameAttribute, val: any) => {
      setChar(prev => ({
          ...prev,
          attributes: {
              ...prev.attributes,
              [key]: { ...prev.attributes[key], [field]: val }
          }
      }));
  };

  const addAttribute = () => {
      const id = `attr_${Date.now()}`;
      setChar(prev => ({
          ...prev,
          attributes: {
              ...prev.attributes,
              [id]: { id, name: '新属性', type: AttributeType.NUMBER, value: 0, visibility: AttributeVisibility.PUBLIC }
          }
      }));
  };

  const removeAttribute = (key: string) => {
      const cores = ['cp', 'health', 'physique', 'pleasure', 'energy'];
      if (cores.includes(key)) {
          alert("核心属性无法删除");
          return;
      }
      const newAttrs = { ...char.attributes };
      delete newAttrs[key];
      setChar(prev => ({ ...prev, attributes: newAttrs }));
  };

  const addDrive = () => {
      setChar(prev => ({
          ...prev,
          drives: [...(prev.drives || []), { id: `drive_${Date.now()}`, condition: '', amount: 10, weight: 50 }]
      }));
  };
  
  const updateDrive = (index: number, field: keyof Drive, val: any) => {
      const newDrives = [...(char.drives || [])];
      newDrives[index] = { ...newDrives[index], [field]: val };
      setChar(prev => ({ ...prev, drives: newDrives }));
  };

  const removeDrive = (index: number) => {
      setChar(prev => ({ ...prev, drives: (prev.drives || []).filter((_, i) => i !== index) }));
  };

  const addConflict = () => {
      let maxId = 0;
      (Object.values(gameState.characters) as Character[]).forEach(c => {
          c.conflicts?.forEach(x => {
              const n = parseInt(x.id);
              if(!isNaN(n) && n > maxId) maxId = n;
          });
      });
      char.conflicts?.forEach(x => {
          const n = parseInt(x.id);
          if(!isNaN(n) && n > maxId) maxId = n;
      });

      setChar(prev => ({
          ...prev,
          conflicts: [...(prev.conflicts || []), { id: String(maxId + 1), desc: '', apReward: 5, solved: false }]
      }));
  };

  const updateConflict = (index: number, field: keyof Conflict, val: any) => {
      const newConf = [...(char.conflicts || [])];
      newConf[index] = { ...newConf[index], [field]: val };
      setChar(prev => ({ ...prev, conflicts: newConf }));
  };

  const removeConflict = (index: number) => {
      setChar(prev => ({ ...prev, conflicts: (prev.conflicts || []).filter((_, i) => i !== index) }));
  };

  const handleCardSave = (updatedCard: Card) => {
      if (editingCard?.source === 'deck') {
          setChar(prev => ({
              ...prev,
              skills: prev.skills.map(c => c.id === updatedCard.id ? updatedCard : c)
          }));
      } else {
          if (onUpdatePoolCard) onUpdatePoolCard(updatedCard);
      }
      setEditingCard(null);
  };

  const addSkill = () => {
      const newCard: Card = {
          id: `skill_${Date.now()}`,
          name: '新技能',
          description: '',
          itemType: 'skill',
          triggerType: 'active',
          cost: 0,
          effects: []
      };
      setChar(prev => ({ ...prev, skills: [...prev.skills, newCard] }));
      setEditingCard({ card: newCard, source: 'deck' });
  };

  const removeSkill = (id: string) => {
      if (confirmDeleteSkillId === id) {
          setChar(prev => ({ ...prev, skills: prev.skills.filter(c => c.id !== id) }));
          setConfirmDeleteSkillId(null);
      } else {
          setConfirmDeleteSkillId(id);
          setTimeout(() => setConfirmDeleteSkillId(null), 3000);
      }
  };

  const refreshAvatar = () => {
      const newUrl = generateRandomFlagAvatar();
      setChar(prev => ({ ...prev, avatarUrl: newUrl }));
  };

  const getAttrValue = (key: string) => {
      const attr = char.attributes[key];
      return attr ? attr.value : 0;
  };

  // Image Handling Helpers
  const handleAddOrUpdateImage = (image: GameImage) => {
      const target = showImageUpload?.target || editingImage?.target;
      if (!target) return;

      if (target === 'avatar') {
          // Special handling for avatar update
          setChar(prev => ({ ...prev, avatarUrl: image.base64 }));
      } else if (target === 'appearance') {
          setChar(prev => {
              const currentList = prev.appearanceImages || [];
              const exists = currentList.some(img => img.id === image.id);
              if (exists) {
                  return { ...prev, appearanceImages: currentList.map(img => img.id === image.id ? image : img) };
              }
              return { ...prev, appearanceImages: [...currentList, image] };
          });
      } else {
          setChar(prev => {
              const currentList = prev.descriptionImages || [];
              const exists = currentList.some(img => img.id === image.id);
              if (exists) {
                  return { ...prev, descriptionImages: currentList.map(img => img.id === image.id ? image : img) };
              }
              return { ...prev, descriptionImages: [...currentList, image] };
          });
      }
      setShowImageUpload(null);
      setEditingImage(null);
  };

  const handleRemoveImage = (target: 'appearance' | 'description', id: string) => {
      if (target === 'appearance') {
          setChar(prev => ({
              ...prev,
              appearanceImages: (prev.appearanceImages || []).filter(img => img.id !== id)
          }));
      } else {
          setChar(prev => ({
              ...prev,
              descriptionImages: (prev.descriptionImages || []).filter(img => img.id !== id)
          }));
      }
  };

  const openImageEditor = (target: 'appearance' | 'description', image: GameImage) => {
      setEditingImage({ target, image });
  };

  const TabButton = ({ id, label, icon: Icon }: { id: typeof activeTab, label: string, icon: any }) => (
      <button 
          onClick={() => setActiveTab(id)} 
          className={`px-3 py-1.5 rounded transition-colors flex items-center justify-center gap-1.5 ${activeTab === id ? 'bg-primary text-primary-fg' : 'text-muted hover:bg-surface-highlight hover:text-body'}`}
          title={label}
      >
          <Icon size={14}/>
          <span className="hidden sm:inline text-xs font-bold">{label}</span>
      </button>
  );

  return (
    <Window
        title={isTemplate ? '编辑角色模版' : '角色编辑器'}
        icon={<User size={20}/>}
        onClose={onClose}
        isOverlay={!isTemplate}
        maxWidth="max-w-4xl"
        height="max-h-[95vh] h-full"
        className={isTemplate ? "h-full border-none shadow-none" : ""}
        headerActions={
            <div className="flex bg-surface rounded p-1 border border-border overflow-x-auto scrollbar-hide max-w-[200px] sm:max-w-none">
                <TabButton id="basic" label="信息" icon={Info} />
                <TabButton id="attributes" label="属性" icon={Activity} />
                <TabButton id="deck" label="能力" icon={Layers} />
                <TabButton id="inventory" label="物品" icon={Package} />
                <TabButton id="brain" label="大脑" icon={BrainCircuit} />
            </div>
        }
        footer={
            <div className="flex justify-between w-full items-center">
                <div className="flex gap-2">
                   {activeTab === 'attributes' && (
                       <Button size="sm" variant="secondary" onClick={() => {
                           if(confirm("确定恢复初始值？")) setChar(getInitialState());
                       }}>重置</Button>
                   )}
                </div>

                <div className="flex gap-2">
                    <Button variant="secondary" onClick={onClose}>取消</Button>
                    <Button onClick={() => onSave(char, selectedLocationId)} className="px-6 font-bold">
                        <Save size={16} className="mr-2"/> 保存
                    </Button>
                </div>
            </div>
        }
    >
        {editingCard && (
            <CardEditor 
                initialCard={editingCard.card}
                onClose={() => setEditingCard(null)}
                onSave={handleCardSave}
                gameState={gameState}
            />
        )}

        {showContextModal && (
            <ContextEditorModal
                title={`角色上下文: ${char.name}`}
                messages={char.contextConfig?.messages || []}
                onMessagesChange={(msgs) => setChar({...char, contextConfig: { ...char.contextConfig, messages: msgs }})}
                onClose={() => setShowContextModal(false)}
            />
        )}

        {(showImageUpload || editingImage) && (
            <ImageUploadModal 
                onClose={() => { setShowImageUpload(null); setEditingImage(null); }}
                onConfirm={handleAddOrUpdateImage}
                initialImage={editingImage?.image}
                initialUrl={showImageUpload?.target === 'avatar' ? char.avatarUrl : undefined}
            />
        )}

        <div className="h-full">
            {/* BASIC TAB */}
            {activeTab === 'basic' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full overflow-y-auto pr-2">
                    <div className="flex flex-col items-center gap-4 shrink-0">
                        {/* Avatar Area with New Upload Logic */}
                        <div className="flex items-start gap-2 w-full justify-center">
                            <div 
                                className="w-24 h-24 relative group cursor-pointer rounded-xl overflow-hidden border-2 border-border hover:border-primary transition-all shadow-md"
                                onClick={() => setShowImageUpload({ target: 'avatar' })}
                                title="点击更换头像"
                            >
                                {char.avatarUrl ? (
                                    <img src={char.avatarUrl} className="w-full h-full object-cover pixelated" style={{ imageRendering: 'pixelated' }} alt="Avatar"/>
                                ) : (
                                    <div className="w-full h-full bg-surface-highlight flex items-center justify-center text-muted">
                                        <User size={32}/>
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs gap-1">
                                    <Upload size={16}/>
                                    <span>更换</span>
                                </div>
                            </div>
                            
                            <Button 
                                size="sm" 
                                variant="secondary" 
                                onClick={refreshAvatar} 
                                title="随机生成旗帜头像"
                                className="h-8 w-8 p-0 flex items-center justify-center mt-2"
                            >
                                <Dices size={16} />
                            </Button>
                        </div>
                        <div className="text-xs text-muted text-center">点击头像上传，或随机生成</div>
                        
                        <div className="w-full border-t border-border pt-4 mt-2 space-y-2">
                            <label className="flex items-center gap-2 p-2 rounded bg-surface-highlight border border-border cursor-pointer hover:border-primary">
                                <input type="checkbox" checked={char.isPlayer} onChange={e => setChar({...char, isPlayer: e.target.checked})} />
                                <div className="flex-1">
                                    <div className="text-sm font-bold text-primary">玩家角色 (PC)</div>
                                    <div className="text-[10px] text-muted">由玩家手动操控</div>
                                </div>
                                <User size={16} className={char.isPlayer ? "text-primary" : "text-faint"}/>
                            </label>

                            <label className="flex items-center gap-2 p-2 rounded bg-surface-highlight border border-border cursor-pointer hover:border-secondary">
                                <input type="checkbox" checked={char.isFollowing || false} onChange={e => setChar({...char, isFollowing: e.target.checked})} />
                                <div className="flex-1">
                                    <div className="text-sm font-bold text-secondary-fg">跟随模式 (Follow)</div>
                                    <div className="text-[10px] text-muted">随玩家移动到新地点</div>
                                </div>
                                <Footprints size={16} className={char.isFollowing ? "text-secondary-fg" : "text-faint"}/>
                            </label>
                        </div>
                    </div>
                    <div className="md:col-span-2 space-y-4 w-full">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>姓名</Label>
                                <Input value={char.name} onChange={e => setChar({...char, name: e.target.value})} />
                            </div>
                            {!isTemplate && (
                                <div>
                                    <Label>当前位置 (传送)</Label>
                                    <select 
                                        className="w-full h-10 bg-surface-light border border-border rounded px-3 text-sm text-body focus:outline-none focus:border-primary"
                                        value={selectedLocationId}
                                        onChange={e => setSelectedLocationId(e.target.value)}
                                    >
                                        <option value="">(未知/虚空)</option>
                                        {knownLocations.map(l => (
                                            <option key={l.id} value={l.id}>{l.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                        
                        <div className="flex flex-col w-full">
                            <Label className="flex items-center gap-1 text-secondary-fg justify-between">
                                <span className="flex items-center gap-1"><VenetianMask size={12}/> 外观描述 (公开可见)</span>
                            </Label>
                            <TextArea 
                                rows={4}
                                value={char.appearance || ""}
                                onChange={e => setChar({...char, appearance: e.target.value})}
                                placeholder="描述角色的外貌特征，如身高、体型、衣着、配饰等。场景中所有人可见。"
                                className="border-border bg-surface-highlight w-full resize-y mb-2"
                            />
                            <ImageAttachmentList 
                                images={char.appearanceImages || []}
                                onRemove={(id) => handleRemoveImage('appearance', id)}
                                onAdd={() => setShowImageUpload({ target: 'appearance' })}
                                onImageClick={(img) => openImageEditor('appearance', img)}
                                maxImages={1}
                                label="外观参考图"
                            />
                        </div>

                        <div className="flex flex-col w-full">
                            <Label>人设描述 / 个人传记 (私密)</Label>
                            <TextArea 
                                rows={6} 
                                value={char.description} 
                                onChange={e => setChar({...char, description: e.target.value})}
                                placeholder="描述角色的性格、背景故事、私人秘密以及行为逻辑..."
                                className="w-full mb-2"
                            />
                            <ImageAttachmentList 
                                images={char.descriptionImages || []}
                                onRemove={(id) => handleRemoveImage('description', id)}
                                onAdd={() => setShowImageUpload({ target: 'description' })}
                                onImageClick={(img) => openImageEditor('description', img)}
                                maxImages={3}
                                label="设定参考图"
                            />
                        </div>

                        <div className="flex flex-col w-full">
                            <Label>说话风格 / 试读样本 (Speech Style)</Label>
                            <TextArea 
                                rows={3}
                                value={char.style || ""}
                                onChange={e => setChar({...char, style: e.target.value})}
                                placeholder="用于引导AI的说话语气。例如：'杂鱼~杂鱼~竟敢命令我？' 或一段典型的台词。"
                                className="w-full mb-2 bg-surface-highlight border-border"
                            />
                            <p className="text-[10px] text-muted">此内容将引导模型语言风格。</p>
                        </div>
                        
                        <div className="bg-surface-highlight p-3 rounded border border-border flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Heart size={18} className="text-accent-pink" fill="currentColor"/>
                                <div>
                                    <div className="text-sm font-bold text-accent-pink">快感 (Pleasure)</div>
                                    <div className="text-[10px] text-muted">驱动角色行为的核心动力</div>
                                </div>
                            </div>
                            <Input 
                                type="number" 
                                className="w-24 text-center font-bold text-accent-pink border-border"
                                value={getAttrValue('快感') || getAttrValue('pleasure')}
                                onChange={e => {
                                    const key = char.attributes['快感'] ? '快感' : 'pleasure';
                                    const val = Math.round(parseFloat(e.target.value) || 0); 
                                    if (char.attributes[key]) {
                                        updateAttr(key, 'value', val);
                                    } else {
                                        setChar(prev => ({
                                            ...prev,
                                            attributes: {
                                                ...prev.attributes,
                                                '快感': { id: '快感', name: '快感', type: AttributeType.NUMBER, value: val, visibility: AttributeVisibility.PUBLIC }
                                            }
                                        }));
                                    }
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* ATTRIBUTES TAB */}
            {activeTab === 'attributes' && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-muted">核心属性与状态</span>
                        <Button size="sm" variant="secondary" onClick={addAttribute}><Plus size={14} className="mr-1"/> 添加属性</Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {(Object.values(char.attributes) as GameAttribute[])
                            .filter(attr => attr.name !== '快感' && attr.name !== 'pleasure') 
                            .map((attr) => (
                            <div key={attr.id} className="bg-surface-highlight p-3 rounded border border-border flex flex-col gap-2">
                                <div className="flex justify-between items-center">
                                    <Input 
                                        className="h-7 text-xs w-24 border-transparent bg-transparent font-bold text-primary p-0" 
                                        value={attr.name} 
                                        onChange={e => updateAttr(attr.id, 'name', e.target.value)}
                                    />
                                    <div className="flex gap-1">
                                        <button 
                                            onClick={() => updateAttr(attr.id, 'visibility', attr.visibility === AttributeVisibility.PUBLIC ? AttributeVisibility.PRIVATE : AttributeVisibility.PUBLIC)}
                                            className="text-muted hover:text-body p-1"
                                            title={attr.visibility === AttributeVisibility.PUBLIC ? "公开" : "隐藏"}
                                        >
                                            {attr.visibility === AttributeVisibility.PUBLIC ? <Eye size={14}/> : <EyeOff size={14}/>}
                                        </button>
                                        <button onClick={() => removeAttribute(attr.id)} className="text-muted hover:text-danger-fg p-1"><Trash size={14}/></button>
                                    </div>
                                </div>
                                <div className="flex gap-2 items-center">
                                    <Input 
                                        className="h-8 text-sm" 
                                        value={attr.value} 
                                        onChange={e => {
                                            const val = attr.type === AttributeType.NUMBER ? (parseFloat(e.target.value) || 0) : e.target.value;
                                            updateAttr(attr.id, 'value', val);
                                        }}
                                        type={attr.type === AttributeType.NUMBER ? "number" : "text"}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* DECK TAB */}
            {activeTab === 'deck' && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-muted">固有技能与能力 (Deck)</span>
                        <Button size="sm" variant="secondary" onClick={addSkill}><Plus size={14} className="mr-1"/> 新建技能</Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {char.skills.map(skill => (
                            <div key={skill.id} className="bg-surface-highlight border border-border rounded-lg p-3 relative group hover:border-primary transition-colors">
                                <div className="flex justify-between items-start mb-2">
                                    <h4 className="font-bold text-sm text-highlight truncate">{skill.name}</h4>
                                    <div className="flex gap-1">
                                        <button onClick={() => setEditingCard({ card: skill, source: 'deck' })} className="text-muted hover:text-body"><Edit size={14}/></button>
                                        <button onClick={() => removeSkill(skill.id)} className={confirmDeleteSkillId === skill.id ? "text-danger-fg" : "text-muted hover:text-danger-fg"}>
                                            <Trash size={14}/>
                                        </button>
                                    </div>
                                </div>
                                <p className="text-[10px] text-muted line-clamp-3 h-10">{skill.description}</p>
                                <div className="mt-2 pt-2 border-t border-border flex justify-between text-[10px] text-faint">
                                    <span>{skill.triggerType}</span>
                                    <span className="text-dopamine">{skill.cost} CP</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* INVENTORY TAB */}
            {activeTab === 'inventory' && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-muted">背包物品 (Inventory References)</span>
                        <span className="text-[10px] text-faint">物品定义在公共卡池中，此处仅存储引用。</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {char.inventory.map(itemId => {
                            const item = gameState.cardPool.find(c => c.id === itemId);
                            if (!item) return null;
                            return (
                                <div key={itemId} className="bg-surface-highlight border border-border rounded-lg p-3 relative group hover:border-info-fg transition-colors">
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="font-bold text-sm text-highlight truncate">{item.name}</h4>
                                        <div className="flex gap-1">
                                             <button 
                                                onClick={() => setEditingCard({ card: item, source: 'pool' })} 
                                                className="text-muted hover:text-body"
                                                title="编辑公共卡牌定义"
                                             >
                                                <Edit size={14}/>
                                             </button>
                                             <button 
                                                onClick={() => setChar(prev => ({...prev, inventory: prev.inventory.filter(id => id !== itemId)}))}
                                                className="text-muted hover:text-danger-fg"
                                                title="从背包移除"
                                             >
                                                <Trash size={14}/>
                                             </button>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-muted line-clamp-2">{item.description}</p>
                                </div>
                            );
                        })}
                        {char.inventory.length === 0 && (
                            <div className="col-span-full text-center py-10 text-muted border-2 border-dashed border-border rounded">
                                背包空空如也。请在卡池中将物品分配给角色。
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* BRAIN TAB */}
            {activeTab === 'brain' && (
                <div className="space-y-6">
                    {/* AI Config */}
                    <div className="bg-surface-highlight p-4 rounded border border-border">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xs font-bold text-primary uppercase flex items-center gap-2">
                                <Cpu size={14}/> AI 模型配置 (Model Override)
                            </h3>
                            <label className="flex items-center gap-2 cursor-pointer text-xs">
                                <span className={char.useAiOverride ? "text-primary font-bold" : "text-muted"}>
                                    {char.useAiOverride ? "启用独立配置" : "使用全局配置"}
                                </span>
                                <div className="relative">
                                    <input 
                                        type="checkbox" 
                                        className="sr-only peer"
                                        checked={char.useAiOverride || false}
                                        onChange={e => setChar({...char, useAiOverride: e.target.checked})}
                                    />
                                    <div className="w-9 h-5 bg-surface-light peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                                </div>
                            </label>
                        </div>
                        
                        {char.useAiOverride ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in">
                                <div>
                                    <Label>Provider</Label>
                                    <select 
                                        className="w-full bg-surface border border-border rounded px-2 py-2 text-sm text-body"
                                        value={char.aiConfig?.provider}
                                        onChange={e => setChar({...char, aiConfig: { ...char.aiConfig, provider: e.target.value as Provider }})}
                                    >
                                        <option value={Provider.XAI}>xAI (Grok)</option>
                                        <option value={Provider.GEMINI}>Google Gemini</option>
                                        <option value={Provider.VOLCANO}>Volcengine</option>
                                        <option value={Provider.OPENROUTER}>OpenRouter</option>
                                        <option value={Provider.OPENAI}>OpenAI</option>
                                        <option value={Provider.CLAUDE}>Anthropic (Claude)</option>
                                    </select>
                                </div>
                                <div>
                                    <Label>Model Name</Label>
                                    <Input 
                                        value={char.aiConfig?.model || ''} 
                                        onChange={e => setChar({...char, aiConfig: { ...char.aiConfig!, model: e.target.value }})}
                                        placeholder="Inherit Global if empty"
                                    />
                                </div>
                                <div>
                                    <Label>Temperature</Label>
                                    <Input 
                                        type="number" step="0.1"
                                        value={char.aiConfig?.temperature ?? 1.0} 
                                        onChange={e => setChar({...char, aiConfig: { ...char.aiConfig!, temperature: parseFloat(e.target.value) || 0 }})}
                                    />
                                </div>
                                <div>
                                    <Label>API Key (Optional Override)</Label>
                                    <Input 
                                        type="password"
                                        value={char.aiConfig?.apiKey || ''} 
                                        onChange={e => setChar({...char, aiConfig: { ...char.aiConfig!, apiKey: e.target.value }})}
                                        placeholder="Leave empty to use global key"
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="text-xs text-muted italic p-2 bg-black/10 rounded">
                                当前正在使用全局「角色行为 AI」配置。如需为该角色单独指定模型（例如更聪明的模型），请开启上方开关。
                            </div>
                        )}
                    </div>
                    
                    {/* Memory Config */}
                    <div className="bg-surface-highlight p-4 rounded border border-border">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xs font-bold text-secondary-fg uppercase flex items-center gap-2">
                                <BrainCircuit size={14}/> 记忆与遗忘 (Memory & Dropout)
                            </h3>
                            <label className="flex items-center gap-2 cursor-pointer text-xs">
                                <span className={char.memoryConfig?.useOverride ? "text-secondary-fg font-bold" : "text-muted"}>
                                    {char.memoryConfig?.useOverride ? "启用独立设置" : "使用全局设置"}
                                </span>
                                <div className="relative">
                                    <input 
                                        type="checkbox" 
                                        className="sr-only peer"
                                        checked={char.memoryConfig?.useOverride || false}
                                        onChange={e => setChar({
                                            ...char, 
                                            memoryConfig: { 
                                                ...(char.memoryConfig || { maxMemoryRounds: 10, actionDropoutProbability: 0.34, reactionDropoutProbability: 0.34 }), 
                                                useOverride: e.target.checked 
                                            }
                                        })}
                                    />
                                    <div className="w-9 h-5 bg-surface-light peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-secondary-base"></div>
                                </div>
                            </label>
                        </div>
                        
                        {char.memoryConfig?.useOverride ? (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-in fade-in">
                                <div>
                                    <Label>记忆能力 (Rounds)</Label>
                                    <Input 
                                        type="number"
                                        value={char.memoryConfig.maxMemoryRounds}
                                        onChange={e => setChar({...char, memoryConfig: { ...char.memoryConfig!, maxMemoryRounds: parseInt(e.target.value) || 0 }})}
                                    />
                                    <p className="text-[9px] text-muted mt-1">长期记忆的采样密度。</p>
                                </div>
                                <div>
                                    <Label>行动遗忘率 (Action Dropout)</Label>
                                    <Input 
                                        type="number" step="0.01" max="1" min="0"
                                        value={char.memoryConfig.actionDropoutProbability}
                                        onChange={e => setChar({...char, memoryConfig: { ...char.memoryConfig!, actionDropoutProbability: parseFloat(e.target.value) || 0 }})}
                                    />
                                    <p className="text-[9px] text-muted mt-1">主动回合降低记忆以防止复读。</p>
                                </div>
                                <div>
                                    <Label>反应遗忘率 (Reaction Dropout)</Label>
                                    <Input 
                                        type="number" step="0.01" max="1" min="0"
                                        value={char.memoryConfig.reactionDropoutProbability}
                                        onChange={e => setChar({...char, memoryConfig: { ...char.memoryConfig!, reactionDropoutProbability: parseFloat(e.target.value) || 0 }})}
                                    />
                                    <p className="text-[9px] text-muted mt-1">被动回合大幅降低记忆以专注当下。</p>
                                </div>
                            </div>
                        ) : (
                            <div className="text-xs text-muted italic p-2 bg-black/10 rounded flex flex-col gap-1">
                                <div>当前正在使用全局记忆设置。</div>
                                <div className="opacity-70">
                                    全局设定：
                                    记忆能力 {char.id.startsWith('env_') ? (gameState.appSettings.maxEnvMemoryRounds || 5) + " (环境)" : gameState.appSettings.maxCharacterMemoryRounds} 轮 | 
                                    行动遗忘 {gameState.appSettings.actionMemoryDropoutProbability} | 
                                    反应遗忘 {gameState.appSettings.reactionMemoryDropoutProbability}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Drives (Pleasure Sources) */}
                    <div className="bg-surface-highlight p-4 rounded border border-border">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xs font-bold text-accent-pink uppercase flex items-center gap-2">
                                <Heart size={14}/> 驱力 / 快感获取 (Drives & Pleasure)
                            </h3>
                            <Button size="sm" variant="secondary" onClick={addDrive}><Plus size={12}/></Button>
                        </div>
                        <div className="space-y-2">
                            {(char.drives || []).map((drv, idx) => (
                                <div key={drv.id} className="flex gap-2 items-center">
                                    <Input 
                                        className="flex-1 text-xs" 
                                        value={drv.condition} 
                                        onChange={e => updateDrive(idx, 'condition', e.target.value)}
                                        placeholder="条件描述 (如: 探索未知)"
                                    />
                                    <div className="flex items-center gap-1 w-20">
                                        <span className="text-xs text-muted">奖励:</span>
                                        <Input 
                                            type="number" className="w-10 text-xs border-pink-900/50 focus:border-pink-500" 
                                            value={drv.amount} 
                                            onChange={e => updateDrive(idx, 'amount', parseInt(e.target.value) || 0)}
                                        />
                                    </div>
                                    <div className="flex items-center gap-1 w-20" title="权重 (决定被选中概率)">
                                        <span className="text-xs text-muted">权重:</span>
                                        <Input 
                                            type="number" className="w-10 text-xs border-border focus:border-primary" 
                                            value={drv.weight || 50} 
                                            onChange={e => updateDrive(idx, 'weight', parseInt(e.target.value) || 0)}
                                        />
                                    </div>
                                    <button onClick={() => removeDrive(idx)} className="text-muted hover:text-danger-fg"><Trash size={14}/></button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Conflicts */}
                    <div className="bg-surface-highlight p-4 rounded border border-border">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xs font-bold text-primary uppercase flex items-center gap-2">
                                <AlertTriangle size={14}/> 内在与外在矛盾 (Conflicts)
                            </h3>
                            <Button size="sm" variant="secondary" onClick={addConflict}><Plus size={12}/></Button>
                        </div>
                        <div className="space-y-2">
                            {(char.conflicts || []).map((conf, idx) => (
                                <div key={conf.id} className={`flex gap-2 items-start p-2 rounded border ${conf.solved ? 'border-success-base/30 bg-success-base/10 opacity-50' : 'border-warning-base/30 bg-warning-base/10'}`}>
                                    <div className="text-[10px] font-mono text-muted pt-2 w-6">#{conf.id}</div>
                                    <div className="flex-1 space-y-1">
                                        <TextArea 
                                            className="w-full h-10 text-xs resize-none bg-transparent border-border" 
                                            value={conf.desc} 
                                            onChange={e => updateConflict(idx, 'desc', e.target.value)}
                                            placeholder="矛盾描述"
                                        />
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-2 text-[10px] text-muted">
                                                <span>奖励(CP/AP):</span>
                                                <Input 
                                                    type="number" className="w-12 h-6 text-[10px]" 
                                                    value={conf.apReward} 
                                                    onChange={e => updateConflict(idx, 'apReward', parseInt(e.target.value) || 0)}
                                                />
                                            </div>
                                            <label className="flex items-center gap-1 text-[10px] cursor-pointer">
                                                <input 
                                                    type="checkbox" 
                                                    checked={conf.solved} 
                                                    onChange={e => updateConflict(idx, 'solved', e.target.checked)}
                                                /> 已解决
                                            </label>
                                        </div>
                                    </div>
                                    <button onClick={() => removeConflict(idx)} className="text-muted hover:text-danger-fg pt-2"><Trash size={14}/></button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Context Engineering */}
                    <div className="bg-surface-highlight p-4 rounded border border-border">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xs font-bold text-info-fg uppercase flex items-center gap-2">
                                <MessageSquare size={14}/> 角色专属上下文 (Context Engineering)
                            </h3>
                            <Button size="sm" variant="secondary" onClick={() => setShowContextModal(true)}><Edit size={12} className="mr-1"/> 编辑上下文</Button>
                        </div>
                        
                        <div className="text-center text-muted text-xs italic py-4 bg-black/10 rounded border border-border/50">
                            包含 {char.contextConfig?.messages?.length || 0} 条角色专用指令。点击上方按钮进行编辑。
                        </div>
                        <p className="text-[10px] text-muted mt-2">
                            此处定义的消息将作为"长期记忆"或"系统指令"在每次请求时发送给AI。<br/>
                        </p>
                    </div>

                    {/* Memory Viewer */}
                    {!isTemplate && (
                        <div className="bg-surface-highlight p-4 rounded border border-border">
                             <h3 className="text-xs font-bold text-secondary-fg uppercase mb-4 flex items-center gap-2">
                                <BrainCircuit size={14}/> 角色记忆查看 (Memory Dump)
                            </h3>
                            <TextArea 
                                readOnly
                                className="w-full h-48 font-mono text-xs text-muted bg-black/10 border-border resize-none"
                                value={getCharacterMemory(
                                    gameState.world.history, 
                                    char.id, 
                                    gameState.map.activeLocationId, 
                                    // Use override or global logic for preview
                                    char.memoryConfig?.useOverride ? char.memoryConfig.maxMemoryRounds : (gameState.appSettings.maxCharacterMemoryRounds),
                                    undefined, // No Image Builder
                                    gameState.appSettings.maxInputTokens,
                                    gameState.characters, // Pass Chars Map
                                    gameState.map.locations // Pass Locs Map
                                )}
                                placeholder="暂无记忆..."
                            />
                            <p className="text-[10px] text-muted mt-2">
                                这是系统自动提取的、发送给AI作为该角色记忆的历史片段。
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    </Window>
  );
};

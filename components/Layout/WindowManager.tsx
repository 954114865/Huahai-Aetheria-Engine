
import React from 'react';
import { GameState, WindowState, Character, Card, GameAttribute, AppSettings, AIConfig, GlobalContextConfig, DefaultSettings, LogEntry, DebugLog, MapLocation } from '../../types';
import { CharacterEditor } from '../Windows/CharacterEditor';
import { CardEditor } from '../Windows/CardEditor';
import { WorldEditor } from '../Windows/WorldEditor';
import { SettingsWindow } from '../Windows/SettingsWindow';
import { DevConsole } from '../Windows/DevConsole';
// import { CharacterPoolWindow } from '../Windows/Pools/CharacterPoolWindow'; // Deprecated
import { CardPoolWindow } from '../Windows/Pools/CardPoolWindow';
// import { LocationPoolWindow } from '../Windows/Pools/LocationPoolWindow'; // Deprecated
import { WorldCompositionWindow } from '../Windows/WorldCompositionWindow'; // New Unified Window
import { AiGenWindow } from '../Windows/Pools/AiGenWindow';
import { PrizePoolWindow } from '../Windows/PrizePoolWindow'; 
import { TriggerPoolWindow } from '../Windows/TriggerPoolWindow';
import { ShopWindow } from '../Windows/ShopWindow';
import { LetterWindow } from '../Windows/LetterWindow';
import { ThemeEditorWindow } from '../Windows/ThemeEditorWindow';
import { LocationEditor } from '../Windows/LocationEditor';
import { StoryEditWindow } from '../Windows/StoryEditWindow';
import { propagateCharacterNameChange } from '../../services/characterUtils';

interface WindowManagerProps {
    windows: WindowState[];
    closeWindow: (id: number) => void;
    state: GameState;
    updateState: (updater: (current: GameState) => GameState) => void;
    openWindow: (type: WindowState['type'], data?: any) => void;
    addLog: (text: string, overrides?: Partial<LogEntry>) => void;
    selectedCharId: string | null;
    addDebugLog: (log: DebugLog) => void; 
}

export const WindowManager: React.FC<WindowManagerProps> = ({ 
    windows, closeWindow, state, updateState, openWindow, addLog, selectedCharId, addDebugLog
}) => {

  const handleSaveCharacter = (char: Character, locationId?: string) => {
    // Diff Logic to detect manual changes
    const oldChar = state.characters[char.id];
    let changesLog = "";
    let locationChanged = false;
    let nameChanged = false;
    let finalChar = char;
    
    if (oldChar) {
        const changes: string[] = [];
        
        // Name/Desc
        if (oldChar.name !== char.name) {
            changes.push(`姓名 '${oldChar.name}'->'${char.name}'`);
            nameChanged = true;
        }
        if (oldChar.description !== char.description) changes.push(`设定变更`);

        // Attributes
        Object.keys(char.attributes).forEach(key => {
             const oldVal = oldChar.attributes[key]?.value;
             const newVal = char.attributes[key]?.value;
             if (oldVal !== newVal) {
                 changes.push(`${char.attributes[key].name} ${oldVal}->${newVal}`);
             }
        });

        // Location
        const oldPos = state.map.charPositions[char.id];
        if (locationId && (!oldPos || oldPos.locationId !== locationId)) {
            const oldLocName = oldPos?.locationId ? state.map.locations[oldPos.locationId]?.name : "未知";
            const newLocName = state.map.locations[locationId]?.name || locationId;
            changes.push(`位置转移 ${oldLocName}->${newLocName}`);
            locationChanged = true;
        }

        if (changes.length > 0) {
            changesLog = `因为神秘原因发生了如下意想不到的变化: ${changes.join(', ')}`;
        }
    }

    // Apply Name Propagation if name changed
    if (nameChanged && oldChar) {
        finalChar = propagateCharacterNameChange(finalChar, oldChar.name, finalChar.name);
    }

    updateState(prev => {
      
      if (locationChanged) {
          let maxId = 0;
          (Object.values(prev.characters) as Character[]).forEach(c => {
              c.conflicts?.forEach(x => {
                  const n = parseInt(x.id);
                  if (!isNaN(n) && n > maxId) maxId = n;
              });
          });
          const nextId = maxId + 1;
          
          finalChar = {
              ...finalChar,
              conflicts: [
                  ...(finalChar.conflicts || []),
                  {
                      id: String(nextId),
                      desc: "刚到此地，对当地情况不熟悉",
                      apReward: 2,
                      solved: false
                  }
              ]
          };
      }

      const newChars = { ...prev.characters };
      newChars[finalChar.id] = finalChar;

      let newDefaultOrder = prev.round.defaultOrder;
      // Only add to default order if not present
      if (!newDefaultOrder.includes(finalChar.id)) {
           newDefaultOrder = [...newDefaultOrder, finalChar.id].sort((a,b) => Number(a) - Number(b));
      }
      
      // For initial adds, if order is empty, populate it
      let newCurrentOrder = prev.round.currentOrder;
      if (newCurrentOrder.length === 0) {
           newCurrentOrder = [finalChar.id];
      }

      // Update Location if provided
      const newCharPositions = { ...prev.map.charPositions };
      if (locationId) {
          const targetLoc = prev.map.locations[locationId];
          if (targetLoc) {
              newCharPositions[finalChar.id] = {
                  x: targetLoc.coordinates.x,
                  y: targetLoc.coordinates.y,
                  locationId: locationId
              };
          }
      }

      return {
        ...prev,
        characters: newChars,
        map: { ...prev.map, charPositions: newCharPositions },
        round: { ...prev.round, defaultOrder: newDefaultOrder, currentOrder: newCurrentOrder }
      };
    });
    
    if (changesLog) {
        addLog(`系统: ${finalChar.name} ${changesLog}`, { 
            locationId: locationId || state.map.activeLocationId, 
            type: 'system' 
        });
    }
    
    // Close the editor window
    const win = windows.find(w => w.type === 'char' && (w.data ? w.data.id === char.id : true));
    if(win) closeWindow(win.id);
    else windows.filter(w => w.type === 'char').forEach(w => closeWindow(w.id));
  };

  const handleSaveCard = (card: Card) => {
    updateState(prev => {
        const exists = prev.cardPool.some(c => c.id === card.id);
        return {
            ...prev,
            cardPool: exists ? prev.cardPool.map(c => c.id === card.id ? card : c) : [...prev.cardPool, card]
        }
    });
    windows.filter(w => w.type === 'card').forEach(w => closeWindow(w.id));
  };

  const handleSaveWorld = (attrs: Record<string, GameAttribute>) => {
      updateState(prev => ({
          ...prev,
          world: { ...prev.world, attributes: attrs }
      }));
      addLog("系统: 世界属性已被修正。");
      windows.filter(w => w.type === 'world').forEach(w => closeWindow(w.id));
  };

  const handleSaveSettings = (settings: AppSettings, judge: AIConfig, charGen: AIConfig, charBehavior: AIConfig, ctx: GlobalContextConfig, defaults: DefaultSettings, devMode: boolean) => {
      updateState(prev => ({
          ...prev,
          appSettings: settings,
          judgeConfig: judge,
          charGenConfig: charGen, 
          charBehaviorConfig: charBehavior, 
          globalContext: ctx,
          defaultSettings: defaults,
          devMode: devMode,
          debugLogs: devMode ? prev.debugLogs : []
      }));
      addLog("系统: 引擎全局设置已更新。");
      windows.filter(w => w.type === 'settings').forEach(w => closeWindow(w.id));
  };
  
  const handleSyncAllChars = (config: AIConfig, settings?: AppSettings) => {
      updateState(prev => {
          const newChars = { ...prev.characters };
          Object.keys(newChars).forEach(key => {
              newChars[key] = { ...newChars[key], aiConfig: { ...config } };
          });

          const newState = { 
              ...prev, 
              characters: newChars, 
              charBehaviorConfig: config 
          };

          if (settings) {
              newState.appSettings = settings;
          }
          return newState;
      });
      
      let msg = "系统: 全局角色行为模型及所有角色的 AI 配置已强制覆盖。";
      if (settings) msg += " (API Key 已同步)";
      addLog(msg);
  };

  const handleSaveLocation = (loc: MapLocation) => {
      // Check for name change to update Environment Character
      const oldLoc = state.map.locations[loc.id];
      const envCharId = `env_${loc.id}`;
      const envChar = state.characters[envCharId];
      
      let updateEnvChar: Character | undefined = undefined;
      let logSuffix = "";

      if (oldLoc && oldLoc.name !== loc.name && envChar) {
          // Rename Environment Character
          const oldEnvName = envChar.name;
          // Simple replacement: assume env name contains old location name, replace it.
          // e.g. "OldLoc的环境" -> "NewLoc的环境"
          const newEnvName = oldEnvName.split(oldLoc.name).join(loc.name);
          
          if (newEnvName !== oldEnvName) {
              // Apply Propagation
              updateEnvChar = propagateCharacterNameChange({ ...envChar, name: newEnvName }, oldEnvName, newEnvName);
              logSuffix = ` (关联环境角色已重命名为: ${newEnvName})`;
          }
      }

      updateState(prev => {
          const newChars = { ...prev.characters };
          if (updateEnvChar) {
              newChars[updateEnvChar.id] = updateEnvChar;
          }
          
          return {
              ...prev,
              map: {
                  ...prev.map,
                  locations: {
                      ...prev.map.locations,
                      [loc.id]: loc
                  }
              },
              characters: newChars
          };
      });
      
      addLog(`系统: 地点 [${loc.name}] 信息已更新。${logSuffix}`);
      windows.filter(w => w.type === 'location_edit').forEach(w => closeWindow(w.id));
  };

  return (
      <>
        {windows.map((win, index) => {
          // Dynamic Z-Index Calculation: 
          // Base 100 + index * 10 ensures later windows are always on top.
          const zIndex = 100 + index * 10;
          
          return (
          <div key={win.id}>
              {win.type === 'char' && (
                  <CharacterEditor 
                    character={win.data} 
                    gameState={state}
                    onClose={() => closeWindow(win.id)} 
                    onSave={handleSaveCharacter} 
                    onUpdatePoolCard={handleSaveCard}
                    // Window component handles zIndex via prop internally if needed, but CharacterEditor sets it on Window
                  />
              )}
              {win.type === 'card' && (
                  <CardEditor
                    gameState={state} 
                    onClose={() => closeWindow(win.id)}
                    onSave={handleSaveCard}
                  />
              )}
              {win.type === 'world' && (
                  <WorldEditor
                    gameState={state}
                    onClose={() => closeWindow(win.id)}
                    onSave={handleSaveWorld}
                  />
              )}
              {win.type === 'settings' && (
                  <SettingsWindow
                    settings={state.appSettings}
                    judgeConfig={state.judgeConfig!}
                    charGenConfig={state.charGenConfig} 
                    charBehaviorConfig={state.charBehaviorConfig} 
                    globalContext={state.globalContext}
                    defaultSettings={state.defaultSettings}
                    devMode={state.devMode}
                    onClose={() => closeWindow(win.id)}
                    onSave={handleSaveSettings}
                    onSyncAllChars={handleSyncAllChars}
                    addDebugLog={addDebugLog} 
                    openWindow={openWindow} 
                  />
              )}
              {win.type === 'pool' && (
                  <CardPoolWindow 
                    winId={win.id}
                    state={state}
                    updateState={updateState}
                    closeWindow={closeWindow}
                    openWindow={openWindow}
                    addLog={addLog}
                    selectedCharId={selectedCharId}
                    onSaveCard={handleSaveCard}
                  />
              )}
              {/* Redirect old types to new WorldCompositionWindow */}
              {(win.type === 'char_pool' || win.type === 'location_pool' || win.type === 'world_composition' as any) && (
                  <WorldCompositionWindow 
                    winId={win.id} 
                    state={state}
                    updateState={updateState}
                    closeWindow={closeWindow}
                    openWindow={openWindow}
                    addLog={addLog}
                    addDebugLog={addDebugLog} 
                    data={win.data} // Correctly pass data (e.g. targetCardId)
                  />
              )}
              {win.type === 'char_gen' && (
                  <AiGenWindow
                    state={state}
                    updateState={updateState}
                    addLog={addLog}
                    onClose={() => closeWindow(win.id)}
                    isPlayerMode={true} 
                    addDebugLog={addDebugLog} 
                  />
              )}
              {win.type === 'location_edit' && (
                  <LocationEditor 
                    location={win.data}
                    onSave={handleSaveLocation}
                    onClose={() => closeWindow(win.id)}
                  />
              )}
              {win.type === 'prize_pool' && (
                  <PrizePoolWindow
                    winId={win.id}
                    state={state}
                    updateState={updateState}
                    closeWindow={closeWindow}
                    addLog={addLog}
                  />
              )}
              {win.type === 'trigger_pool' && (
                  <TriggerPoolWindow
                    winId={win.id}
                    state={state}
                    updateState={updateState}
                    closeWindow={closeWindow}
                    addLog={addLog}
                  />
              )}
              {win.type === 'shop' && (
                  <ShopWindow
                    winId={win.id}
                    state={state}
                    updateState={updateState}
                    closeWindow={closeWindow}
                    addLog={addLog}
                    activeCharId={selectedCharId || undefined}
                  />
              )}
              {win.type === 'letter' && (
                  <LetterWindow 
                    winId={win.id}
                    charId={win.data}
                    state={state}
                    updateState={updateState}
                    closeWindow={closeWindow}
                    addDebugLog={addDebugLog}
                    addLog={addLog}
                  />
              )}
              {win.type === 'dev' && (
                  <DevConsole logs={state.debugLogs} onClose={() => closeWindow(win.id)} />
              )}
              {win.type === 'theme' && (
                  <ThemeEditorWindow 
                    winId={win.id} 
                    state={state} 
                    updateState={updateState} 
                    closeWindow={closeWindow} 
                  />
              )}
              {win.type === 'story_edit' && (
                  <StoryEditWindow 
                    winId={win.id}
                    state={state}
                    updateState={updateState}
                    closeWindow={closeWindow}
                  />
              )}
          </div>
          );
        })}
      </>
  );
};

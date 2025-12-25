
import React, { useEffect, useRef } from 'react';
import { GameState, Character, LogEntry, Provider } from '../../types';
import { createInitialGameState } from '../../services/gameFactory';
import { fetchNetworkTime } from '../../services/networkUtils';
import { encryptData, decryptData } from '../../services/cryptoService';
import { getCharacterMemory } from '../../services/aiService';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

export const AUTOSAVE_KEY = 'aetheria_autosave_v1';

export const useGamePersistence = (
    state: GameState,
    stateRef: React.MutableRefObject<GameState>,
    updateState: (updater: (current: GameState) => GameState) => void,
    addLog: (text: string, overrides?: Partial<LogEntry>) => void,
    saveLoadModal: any,
    setSaveLoadModal: any,
    setPasswordChallenge: any,
    forceClearReactionRequest: () => void
) => {

  // OPTIMIZED AUTOSAVE: Run on interval rather than state dependency
  useEffect(() => {
      const saveInterval = setInterval(() => {
          try {
              // Read from ref to avoid dependency cycle and excessive re-renders
              const s = stateRef.current;
              if (s.round && s.round.roundNumber >= 1) {
                  localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(s));
                  // console.debug("Autosave triggered"); // Optional debug
              }
          } catch (e) {
              console.error("Autosave failed (likely quota exceeded):", e);
          }
      }, 30000); // 30 Seconds Interval

      return () => clearInterval(saveInterval);
  }, []); // Empty dependency ensures it runs once on mount

  const onSaveClick = () => {
      setSaveLoadModal({ type: 'save', isOpen: true });
  };

  const onLoadClick = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      setSaveLoadModal({ type: 'load', isOpen: true, fileToLoad: file, error: undefined });
      
      // CRITICAL FIX: Reset the input value so the same file can be selected again
      // Without this, selecting the same file twice won't trigger onChange
      e.target.value = ''; 
  };

  const executeSave = async (
      includeProgress: boolean, 
      includeSettings: boolean, 
      includeModelInterface: boolean, 
      includeGlobalContext: boolean, 
      customFilename?: string,
      expirationDateOverride?: string
  ) => {
      const s = stateRef.current;
      const exportData: any = {};
      exportData.timestamp = Date.now();
      
      if (includeProgress) {
          exportData.world = s.world;
          exportData.round = s.round;
          exportData.characters = s.characters;
          exportData.cardPool = s.cardPool;
          exportData.prizePools = s.prizePools;
          exportData.triggers = s.triggers;
          exportData.debugLogs = []; // Do not save debug logs to file
          exportData.map = s.map;
      }

      // Settings without model config and api keys (General Settings)
      if (includeSettings) {
          const settingsToSave = { ...s.appSettings };
          // Remove keys and password (handled separately or in model interface)
          settingsToSave.apiKeys = { [Provider.XAI]: '', [Provider.GEMINI]: '', [Provider.VOLCANO]: '', [Provider.OPENROUTER]: '', [Provider.OPENAI]: '', [Provider.CLAUDE]: '' };
          settingsToSave.devPassword = "";
          // Lock state is reset on load anyway, but we save current state for completeness if needed later
          settingsToSave.devOptionsUnlocked = false; 
          
          // Remove Theme Config (Theme is local/user preference, not save-bound)
          delete (settingsToSave as any).themeConfig;
          
          // Security Update: Remove Locked Features from General Settings
          // They should only be saved if includeDevPassword (Security) is checked.
          delete (settingsToSave as any).lockedFeatures;

          if (expirationDateOverride !== undefined) {
              settingsToSave.saveExpirationDate = expirationDateOverride;
          }

          exportData.appSettings = settingsToSave;
          exportData.defaultSettings = s.defaultSettings;
          exportData.devMode = s.devMode;
      }

      // Model Interface (API Keys + Model Configs)
      if (includeModelInterface) {
          // Initialize appSettings if not present (from includeSettings)
          if (!exportData.appSettings) exportData.appSettings = {};
          
          exportData.appSettings.apiKeys = s.appSettings.apiKeys;
          exportData.judgeConfig = s.judgeConfig;
          exportData.charGenConfig = s.charGenConfig; 
          exportData.charBehaviorConfig = s.charBehaviorConfig; 
      }

      // Developer Password & Security Settings (Coupled with Model Interface or Global Context)
      if (includeModelInterface || includeGlobalContext) {
          if (!exportData.appSettings) exportData.appSettings = {};
          exportData.appSettings.devPassword = s.appSettings.devPassword;
          // Also save security settings to ensure consistency when password is saved
          exportData.appSettings.encryptSaveFiles = s.appSettings.encryptSaveFiles;
          exportData.appSettings.saveExpirationDate = s.appSettings.saveExpirationDate;
          // Force save Locked Features with security settings
          exportData.appSettings.lockedFeatures = s.appSettings.lockedFeatures;
      }

      if (includeGlobalContext) {
          exportData.globalContext = s.globalContext;
      }

      let filename = customFilename;
      if (!filename) {
          const date = new Date();
          const timeStr = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const activeLoc = s.map.activeLocationId ? s.map.locations[s.map.activeLocationId] : null;
          const regionName = activeLoc?.regionId && s.map.regions[activeLoc.regionId] ? s.map.regions[activeLoc.regionId].name : "UnknownRegion";
          const locName = activeLoc ? activeLoc.name : "UnknownLoc";
          filename = `${timeStr}_${regionName}_${locName}`;
      }
      
      filename = filename.replace(/\.json$/, '');
      let dataStr = JSON.stringify(exportData, null, 2);
      
      if (s.appSettings.encryptSaveFiles) {
          try {
              dataStr = await encryptData(dataStr, filename);
          } catch (e: any) {
              console.error("Encryption Failed:", e);
              alert(`加密失败: ${e.message}`);
              return;
          }
      }

      if (Capacitor.isNativePlatform()) {
          try {
              const safeName = `${filename}.json`;
              const targetDir = Directory.Documents;
              const targetFolder = 'Huahai Aetheria';

              try {
                  await Filesystem.mkdir({
                      path: targetFolder,
                      directory: targetDir,
                      recursive: true
                  });
              } catch (e) {
                  // Ignore
              }

              await Filesystem.writeFile({
                  path: `${targetFolder}/${safeName}`,
                  data: dataStr,
                  directory: targetDir,
                  encoding: Encoding.UTF8
              });

              addLog(`系统: 游戏已保存至设备 (Documents/${targetFolder}/${safeName})`);
              alert(`保存成功！\n位置: 内部存储/Documents/${targetFolder}/${safeName}`);
              setSaveLoadModal({ ...saveLoadModal, isOpen: false });
              return; 
          } catch (e: any) {
              console.error("Native save failed, falling back to browser download:", e);
              addLog(`系统: 原生保存失败 (${e.message})，尝试浏览器下载...`);
          }
      }

      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addLog(`系统: 游戏保存成功 (${filename}.json)`);
      setSaveLoadModal({ ...saveLoadModal, isOpen: false });
  };

  const parseAndValidateSave = async (file: File): Promise<any> => {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = async (ev) => {
              try {
                  const rawContent = ev.target?.result as string;
                  let json: any;

                  try {
                      json = JSON.parse(rawContent);
                  } catch (e) {
                      try {
                          const filenameNoExt = file.name.replace(/\.json$/i, '');
                          const decryptedStr = await decryptData(rawContent, filenameNoExt);
                          json = JSON.parse(decryptedStr);
                          addLog("系统: 存档解密验证成功。");
                      } catch (decryptErr: any) {
                          throw new Error(`存档加载失败: 文件损坏或解密失败。\n注意：加密存档的文件名必须与保存时完全一致。\nDetails: ${decryptErr.message}`);
                      }
                  }

                  const promptUser = (msg: string, expectedPwd?: string) => {
                      return new Promise<string | null>((resolvePrompt) => {
                          setPasswordChallenge({
                              isOpen: true,
                              message: msg,
                              expectedPassword: expectedPwd, // Pass expected password for local check
                              resolve: (val: string | null) => resolvePrompt(val)
                          });
                      });
                  };

                  if (json.appSettings && json.appSettings.saveExpirationDate) {
                      const expDateStr = json.appSettings.saveExpirationDate;
                      const expTime = new Date(expDateStr).getTime();
                      const savedPwd = json.appSettings.devPassword || "";
                      
                      if (!isNaN(expTime)) {
                          addLog("系统: 正在验证存档时效性 (Verification)...");
                          try {
                              const networkTime = await fetchNetworkTime();
                              if (networkTime > expTime) {
                                  const msg = `此存档已于 [${new Date(expTime).toLocaleString()}] 过期。\nThis save file has expired.`;
                                  const pwd = await promptUser(`${msg}\n\n请输入开发者密码以继续加载 (Enter Developer Password to Override):`, savedPwd);
                                  
                                  if (pwd === null) {
                                      throw new Error("UserCancelled");
                                  }
                                  if (pwd !== savedPwd) {
                                      throw new Error("存档已过期且密码验证失败 (Expired & Invalid Password).");
                                  } else {
                                      addLog("系统: 开发者密码验证通过，强制加载过期存档。");
                                  }
                              } else {
                                  addLog("系统: 存档时效性验证通过。");
                              }
                          } catch (e: any) {
                              if (e.message === "UserCancelled") {
                                  throw e; // Propagate cancel
                              }
                              if (e.message.includes("Expired & Invalid Password")) {
                                  throw e;
                              }

                              const pwd = await promptUser(`${e.message}\n\n无法验证时间。如果您是开发者，请输入密码以跳过验证:`, savedPwd);
                              if (pwd === null) {
                                  throw new Error("UserCancelled");
                              }
                              if (pwd !== savedPwd) {
                                  throw new Error(`安全验证阻止了加载:\n${e.message}`);
                              } else {
                                  addLog("系统: 开发者密码验证通过，跳过网络时间检查。");
                              }
                          }
                      }
                  }
                  resolve(json);

              } catch (e: any) {
                  reject(e);
              }
          };
          reader.readAsText(file);
      });
  };

  const executeLoad = async (
      includeProgress: boolean, 
      includeSettings: boolean, 
      includeModelInterface: boolean,
      includeGlobalContext: boolean,
      preloadedData?: any // Accept preloaded data to avoid re-parsing
  ) => {
      forceClearReactionRequest(); // Clear blocked UI
      
      let json = preloadedData;
      
      // If no preloaded data, try to parse file again (legacy fallback)
      if (!json) {
          const file = saveLoadModal.fileToLoad;
          if (!file) return;
          try {
              json = await parseAndValidateSave(file);
          } catch (e: any) {
              // Handle User Cancel silently for executeLoad context, or show error
              if (e.message !== "UserCancelled") {
                  console.error("Load failed during execute:", e);
                  setSaveLoadModal((prev: any) => ({ ...prev, error: `加载失败: ${e.message}` }));
              }
              return;
          }
      }

      setSaveLoadModal((prev: any) => ({ ...prev, error: undefined }));

      try {
          // If we reach here, 'json' is valid
          updateState(prev => {
              const newState = { ...prev };

              // 1. Settings (General)
              if (includeSettings && json.appSettings) {
                  
                  // Keep existing keys/pwd if NOT loading model interface/forced pwd
                  // But since we are constructing a new object, we start with defaults + json
                  const baseSettings = {
                      ...createInitialGameState().appSettings,
                      ...json.appSettings,
                      
                      // Security Fix: Locked Features should NOT be loaded via General Settings.
                      // They are either preserved from current session (if not security loading)
                      // or overwritten by Step 5 (if security loading).
                      // This ensures that loading a "General Settings" file doesn't accidentally
                      // enable/disable restrictions unless authorized by password.
                      lockedFeatures: prev.appSettings.lockedFeatures,

                      globalVariables: json.appSettings.globalVariables || [],
                      // Retain existing sensitive data if not explicitly overwritten later
                      apiKeys: prev.appSettings.apiKeys, 
                      devPassword: prev.appSettings.devPassword,
                      // FORCE preserve current theme config (do not load from file)
                      themeConfig: prev.appSettings.themeConfig
                  };
                  
                  newState.appSettings = baseSettings;
                  if (json.defaultSettings) newState.defaultSettings = json.defaultSettings;
                  if (json.devMode !== undefined) newState.devMode = json.devMode;
              }

              // 2. Model Interface (API Keys + Model Configs)
              if (includeModelInterface) {
                  if (json.appSettings && json.appSettings.apiKeys) {
                      newState.appSettings = { 
                          ...newState.appSettings, 
                          apiKeys: json.appSettings.apiKeys 
                      };
                  }
                  if (json.judgeConfig) newState.judgeConfig = json.judgeConfig;
                  if (json.charGenConfig) newState.charGenConfig = json.charGenConfig; 
                  if (json.charBehaviorConfig) newState.charBehaviorConfig = json.charBehaviorConfig; 
              }

              // 3. Global Context
              if (includeGlobalContext && json.globalContext) {
                  newState.globalContext = json.globalContext;
              }

              // 4. Progress
              if (includeProgress) {
                  if (json.world) newState.world = json.world;
                  if (json.map) newState.map = json.map;
                  if (json.round) newState.round = json.round;
                  if (json.characters) newState.characters = json.characters;
                  if (json.cardPool) newState.cardPool = json.cardPool;
                  if (json.prizePools) newState.prizePools = json.prizePools;
                  if (json.triggers) newState.triggers = json.triggers;
                  if (json.debugLogs) newState.debugLogs = json.debugLogs;
              }

              // 5. Force Load Developer Password & Security Settings & LOCKED FEATURES Logic
              // If loading any config (Settings, Model, or Context) AND password exists in file -> Force Load
              if ((includeSettings || includeModelInterface || includeGlobalContext) && json.appSettings?.devPassword) {
                  newState.appSettings = {
                      ...newState.appSettings,
                      devPassword: json.appSettings.devPassword,
                      // Force load security settings to prevent security bypass
                      encryptSaveFiles: json.appSettings.encryptSaveFiles ?? newState.appSettings.encryptSaveFiles,
                      saveExpirationDate: json.appSettings.saveExpirationDate ?? newState.appSettings.saveExpirationDate,
                      // Force load Locked Features (Security-bound)
                      // If undefined in JSON (e.g. older save), keep current/default.
                      lockedFeatures: json.appSettings.lockedFeatures ?? newState.appSettings.lockedFeatures
                  };
              }

              // 6. Lock Developer Options on Load
              newState.appSettings = {
                  ...newState.appSettings,
                  devOptionsUnlocked: false
              };

              const logId = `log_load_${Date.now()}`;
              const loadLog: LogEntry = {
                  id: logId,
                  round: newState.round.roundNumber,
                  turnIndex: newState.round.turnIndex,
                  content: `系统: 游戏数据已加载`,
                  timestamp: Date.now(),
                  type: 'system',
                  snapshot: newState.round
              };
              if(!newState.world.history) newState.world.history = [];
              newState.world.history.push(loadLog);

              return newState;
          });

          setSaveLoadModal({ ...saveLoadModal, isOpen: false });
          addLog("系统: 加载成功。");

      } catch (e: any) {
          console.error("Load failed:", e);
          setSaveLoadModal((prev: any) => ({ ...prev, error: `加载失败: ${e.message}` }));
      }
  };

  const importCharacters = (charsToImport: Character[], sourceHistory: LogEntry[] = [], keepMemory: boolean = false, memoryRounds: number = 20) => {
      updateState(prev => {
          const newChars = { ...prev.characters };
          const newPositions = { ...prev.map.charPositions };
          const activeLocId = prev.map.activeLocationId || 'loc_start_0_0';
          const targetLoc = prev.map.locations[activeLocId];
          
          let importedCount = 0;

          charsToImport.forEach(char => {
              const newChar = JSON.parse(JSON.stringify(char));
              
              if (newChars[newChar.id]) {
                  newChar.id = `${newChar.id}_imp_${Date.now()}`;
              }
              
              if (newChar.conflicts) {
                  newChar.conflicts.forEach((c: any) => c.solved = false);
              }

              if (keepMemory && sourceHistory.length > 0) {
                  const originalId = char.id; 
                  const memory = getCharacterMemory(sourceHistory, originalId, undefined, memoryRounds);
                  if (memory) {
                      const memoryBlock = `\n\n[该角色的前世记忆：${memoryRounds}轮]\n${memory}`;
                      newChar.description = (newChar.description || "") + memoryBlock;
                  }
              }

              newChars[newChar.id] = newChar;
              
              newPositions[newChar.id] = {
                  x: targetLoc ? targetLoc.coordinates.x : 0,
                  y: targetLoc ? targetLoc.coordinates.y : 0,
                  locationId: activeLocId
              };
              
              importedCount++;
          });

          let newOrder = prev.round.currentOrder;
          Object.keys(newChars).forEach(id => {
              if (!prev.characters[id] && !newOrder.includes(id)) {
                  newOrder = [...newOrder, id];
              }
          });

          return {
              ...prev,
              characters: newChars,
              map: { ...prev.map, charPositions: newPositions },
              round: { ...prev.round, currentOrder: newOrder }
          };
      });
      
      if (keepMemory) {
          charsToImport.forEach(c => {
              addLog(`系统: 角色 [${c.name}] 被神秘力量传送到了这个世界。`);
          });
      } else {
          addLog(`系统: 已导入 ${charsToImport.length} 名角色到当前地点。`);
      }
      
      setSaveLoadModal({ ...saveLoadModal, isOpen: false });
  };

  const resetGame = () => {
      forceClearReactionRequest(); // Clear blocked UI
      localStorage.removeItem(AUTOSAVE_KEY);
      
      // Preserve current Theme Config
      const currentThemeConfig = stateRef.current.appSettings.themeConfig;
      
      const freshState = createInitialGameState();
      
      const newState: GameState = {
          ...freshState,
          appSettings: {
              ...freshState.appSettings,
              themeConfig: currentThemeConfig // Restore theme
          },
          world: {
             ...freshState.world,
             history: [{
                 id: `log_reset_${Date.now()}`,
                 round: 1, 
                 turnIndex: 0, 
                 content: "系统: 游戏已完全重置 (Factory Reset)。所有设定（包括 API Key）已恢复默认。", 
                 timestamp: Date.now(), 
                 type: 'system',
                 snapshot: freshState.round
             }]
          }
      };

      try {
          localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(newState));
      } catch (e) {
          console.error("Force autosave failed during reset:", e);
      }

      updateState(() => newState);
      addLog("系统: 初始化完成。");
  };

  return {
      onSaveClick,
      onLoadClick,
      executeSave,
      executeLoad,
      parseAndValidateSave,
      importCharacters,
      resetGame
  };
};

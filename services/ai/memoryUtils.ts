
import { LogEntry, Character, MapLocation } from "../../types";
import { ImageContextBuilder } from "./ImageContextBuilder";
import { estimateTokenCount } from "./promptUtils";

export const getGlobalMemory = (
    history: LogEntry[], 
    currentRound: number, 
    roundsToKeep: number = 20, 
    tokenLimit: number = 64000,
    imageBuilder?: ImageContextBuilder
): string => {
    // Heuristic: Reserve about 4000 tokens for system prompt + world state + misc context
    const budget = Math.max(1000, tokenLimit - 4000);
    
    const minRound = Math.max(1, currentRound - roundsToKeep);
    // Get candidate entries (up to 50 last)
    const candidates = history.filter(e => e.round >= minRound).slice(-50);
    
    // Reverse to process from newest to oldest
    const reversed = [...candidates].reverse();
    const finalSelection: string[] = [];
    let currentTokens = 0;

    for (const entry of reversed) {
        // Global memory still keeps round info for context
        let content = entry.content.replace(/<[^>]+>/g, '');
        
        // --- Image Injection for Global Memory ---
        if (imageBuilder && entry.images && entry.images.length > 0) {
            const imgTags = entry.images.map(img => {
                const descPart = img.description ? `(你看到：${img.description}) ` : "";
                return `\n${descPart}${imageBuilder.register(img)}`;
            }).join("");
            content += imgTags;
        }

        const line = `[R${entry.round}] ${content}`; 
        const tokens = estimateTokenCount(line);
        if (currentTokens + tokens > budget) {
            // Trimmed here
            break; 
        }
        finalSelection.push(line);
        currentTokens += tokens;
    }
    
    // Restore order
    return finalSelection.reverse().join('\n');
};

/**
 * Extracts character-specific memory with Logarithmic Decay Sampling.
 * 
 * Logic:
 * Let X be capacity (roundsToKeep).
 * Tier 0: Age < X. Step = 1 (Keep All).
 * Tier 1: X <= Age < 2X. Step = 2.
 * Tier n: 2^(n-1)X <= Age < 2^n*X. Step = 2^n.
 * 
 * Gaps between retained rounds are summarized with location/people presence.
 */
export const getCharacterMemory = (
    history: LogEntry[], 
    charId: string, 
    currentLocationId?: string, 
    capacity: number = 10, // Renamed from roundsToKeep, defaults to 10
    imageBuilder?: ImageContextBuilder,
    tokenLimit: number = 64000,
    characterMap?: Record<string, Character>,
    locationMap?: Record<string, MapLocation>
): string => {
    if (!history || history.length === 0) return "";

    // Heuristic: Reserve about 4000 tokens for other context
    const budget = Math.max(1000, tokenLimit - 4000);

    // 1. Group by Round and Filter Presence
    const roundMap = new Map<number, LogEntry[]>();
    
    history.forEach(entry => {
        // --- HIDDEN ROUND CHECK ---
        if (entry.snapshot && entry.snapshot.isHiddenRound) {
             const participants = entry.snapshot.currentOrder || [];
             const isSystem = charId === 'system'; 
             const isEnv = charId.startsWith('env_'); 
             const hasActed = entry.actingCharId === charId;
             const isParticipant = participants.includes(charId) || hasActed;
             
             if (!isParticipant && !isSystem && !isEnv) return;
        }
        // ---------------------------

        let isPresent = false;
        if (entry.presentCharIds && entry.presentCharIds.includes(charId)) isPresent = true;
        if (!isPresent && currentLocationId && entry.locationId === currentLocationId) isPresent = true;
        if (!isPresent && entry.actingCharId === charId) isPresent = true;
        
        // Environment character fallback
        if (!isPresent && charId.startsWith('env_')) {
             const suffix = charId.replace('env_', '');
             if (entry.locationId === suffix) isPresent = true;
        }

        if (isPresent) {
            if (!roundMap.has(entry.round)) roundMap.set(entry.round, []);
            roundMap.get(entry.round)?.push(entry);
        }
    });

    // 2. Identify Rounds to Process (Sorted Newest -> Oldest)
    const participatingRounds = Array.from(roundMap.keys()).sort((a, b) => b - a);
    if (participatingRounds.length === 0) return "";

    const currentRound = participatingRounds[0]; // Assuming newest history is current
    const finalBlocks: string[] = [];
    let currentTokens = 0;

    // Buffer for Gap Summary
    let gapBuffer = {
        startRound: -1,
        endRound: -1,
        locs: new Set<string>(),
        chars: new Set<string>()
    };

    const flushGap = () => {
        if (gapBuffer.startRound === -1) return;
        
        // Construct Summary
        const locNames = Array.from(gapBuffer.locs).map(lid => locationMap?.[lid]?.name || "未知地点").filter(n => n !== "未知地点");
        const charNames = Array.from(gapBuffer.chars).map(cid => characterMap?.[cid]?.name || "").filter(n => n);
        
        const locStr = locNames.length > 0 ? `地点: ${locNames.slice(0, 3).join(',')}${locNames.length > 3 ? '...' : ''}` : "";
        const charStr = charNames.length > 0 ? `见过: ${charNames.slice(0, 5).join(',')}${charNames.length > 5 ? '...' : ''}` : "";
        
        const summary = `[R${gapBuffer.startRound}-R${gapBuffer.endRound}概略] ${locStr} ${charStr}`.trim();
        
        // Check budget for summary line
        const tokens = estimateTokenCount(summary);
        if (currentTokens + tokens <= budget) {
            finalBlocks.push(summary);
            currentTokens += tokens;
        }

        // Reset
        gapBuffer = { startRound: -1, endRound: -1, locs: new Set(), chars: new Set() };
    };

    // 3. Iterate Rounds (Newest -> Oldest)
    for (const r of participatingRounds) {
        if (currentTokens >= budget) break;

        const age = currentRound - r;
        let step = 1;

        if (age >= capacity) {
            // Tier calculation: floor(log2(age/capacity)) + 1
            const tier = Math.floor(Math.log2(age / capacity)) + 1;
            step = Math.pow(2, tier);
        }

        const shouldKeep = (age % step) === 0;

        if (shouldKeep) {
            flushGap();

            // Process content for this round
            const entries = roundMap.get(r) || [];
            
            const roundLines = entries
                .map(entry => {
                    // --- Universal Cleaning Phase 1: HTML & Whitespace ---
                    // Clean HTML tags first to ensure regex matches text correctly
                    let text = entry.content.replace(/<[^>]+>/g, '').trim();

                    // --- Universal Cleaning Phase 2: System Logs ---
                    // Aggressively filter out system logs for character memory
                    // Matches "系统:", "系统：", "[系统]", or just "系统" at start
                    if (text.match(/^(系统|\[系统\])[:：\s]/)) return null;
                    if (text.startsWith('系统')) return null; // Catch-all for malformed
                    if (text.includes("--- 轮次结算")) return null;
                    
                    // --- Universal Cleaning Phase 3: Specific Blacklist ---
                    // These concepts are meta-game mechanics characters shouldn't explicitly recall as text
                    if (text.includes("(后台)") || text.includes("正在寻找")) return null; // Population logs
                    if (text.includes("欲望已满足")) return null; // Settlement details
                    if (text.includes("新欲望已产生")) return null; // Env generation
                    if (text.includes("引擎全局设置")) return null; // Settings
                    if (text.includes("快速移动至")) return null; // Fast travel mechanics
                    if (text.includes("发现当地角色")) return null; // Population logs

                    // === NEW FILTERS (ENHANCED) ===
                    // 1. Skill Activation with Target marker (Mechanical)
                    if (text.includes("(目标: ")) return null;

                    // 2. Mechanic Logs starting with > (Retain only acquisition/trade)
                    // Matches "> " or "＞ "
                    if (text.startsWith('>') || text.startsWith('＞')) {
                        const keepKeywords = ["获得", "交易", "抽取", "放入","查看","发现", "移动", "燃命"];
                        // If it doesn't contain any of the keep keywords, filter it out
                        if (!keepKeywords.some(k => text.includes(k))) return null;
                    }
                    // ==============================

                    // Simplify Time/World Status Logs
                    // Pattern: "当前故事时间：2077年1月1日08时00分，世界状态：日间阴天" -> "2077年1月1日08时00分，日间阴天"
                    const timeMatch = text.match(/当前故事时间：(.*?)，世界状态：(.*)/);
                    if (timeMatch) {
                        text = `${timeMatch[1]}，${timeMatch[2]}`;
                    }

                    // --- History Specific Filtering (Past Rounds) ---
                    if (entry.round < currentRound) {
                        // Filter Skill Activation prompts: "Name 发动了...技能..."
                        if (text.match(/发动了.*技能/)) return null;

                        // Note: Previous logic filtered all '>' lines here. 
                        // We removed that to allow the 'keepKeywords' logic above to persist trade logs from the past.

                        // Filter No-check success (Redundant if caught by > rule, but harmless to keep)
                        if (text.includes('(行为生效)')) return null;
                    }

                    // Remove empty lines after cleaning
                    if (!text.trim()) return null;

                    // --- Image Injection ---
                    if (imageBuilder && entry.images && entry.images.length > 0) {
                        const imgTags = entry.images.map(img => {
                            const descPart = img.description ? `(你看到：${img.description}) ` : "";
                            return `\n${descPart}${imageBuilder.register(img)}`;
                        }).join("");
                        text += imgTags;
                    }
                    
                    // Note: We deliberately removed the [R${round}] prefix to save tokens and keep it narrative-focused
                    return text;
                })
                .filter((line): line is string => line !== null); // Type guard to remove nulls
            
            const roundText = roundLines.join('\n');
            if (!roundText) continue; // Skip empty rounds

            const tokens = estimateTokenCount(roundText);
            if (currentTokens + tokens > budget) {
                break; // Stop if full
            }

            finalBlocks.push(roundText);
            currentTokens += tokens;

        } else {
            // Accumulate Gap Info
            const entries = roundMap.get(r) || [];
            entries.forEach(e => {
                if (e.locationId) gapBuffer.locs.add(e.locationId);
                if (e.presentCharIds) e.presentCharIds.forEach(id => {
                    if (id !== charId) gapBuffer.chars.add(id);
                });
            });

            if (gapBuffer.endRound === -1) gapBuffer.endRound = r;
            gapBuffer.startRound = r; // Updates as we go back in time
        }
    }

    // Flush any remaining gap at the end (oldest memories)
    flushGap();

    // 4. Return in Chronological Order (Oldest -> Newest)
    return finalBlocks.reverse().join('\n');
};

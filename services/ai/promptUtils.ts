
import { AppSettings, GlobalContextMessage, Character, GameImage } from "../../types";

// Helper: Replace Global Variables
export const replaceGlobalVariables = (text: string, settings?: AppSettings): string => {
    if (!text || !settings?.globalVariables || settings.globalVariables.length === 0) return text;
    let result = text;
    settings.globalVariables.forEach(v => {
         // Use split/join for simple replacement of all occurrences
         result = result.split(`{{${v.key}}}`).join(v.value);
    });
    return result;
};

// Helper: Fill Prompt
export const fillPrompt = (template: string, data: Record<string, string>, settings?: AppSettings) => {
    // 1. First pass: Replace Global Variables in the Template
    let prompt = replaceGlobalVariables(template, settings);
    
    // 2. Second pass: Replace Data Placeholders
    // Data values might contain {{GlobalVariable}} tags from user input
    Object.entries(data).forEach(([key, val]) => {
        prompt = prompt.split(`{{${key}}}`).join(val);
    });

    // 3. Third pass: Replace Global Variables again
    // This catches any variables that were introduced via the Data injection (User Input)
    prompt = replaceGlobalVariables(prompt, settings);

    return prompt;
};

// Helper: Estimate Token Count
// Western word = 1 token, Other (Chinese/Punctuation) = 1 char = 1 token
export const estimateTokenCount = (text: string): number => {
    if (!text) return 0;
    // 1. Match Western words (English/Latin alphanumerics)
    const westernMatches = text.match(/[a-zA-Z0-9\u00C0-\u00FF]+/g) || [];
    const westernCount = westernMatches.length;

    // 2. Remove Western words to count remaining characters (Chinese, punctuation, symbols)
    const nonWesternText = text.replace(/[a-zA-Z0-9\u00C0-\u00FF]+/g, '');
    const otherCount = nonWesternText.length;
    
    return westernCount + otherCount;
};

// Helper: Interleave Images into Text Parts
// Replaces [[IMG:id]] placeholders with actual inline image parts
export const interleaveImages = (textPrompt: string, imageMap: Record<string, GameImage>): any[] => {
    const parts: any[] = [];
    const regex = /\[\[IMG:([^\]]+)\]\]/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(textPrompt)) !== null) {
        // Text segment before the image
        if (match.index > lastIndex) {
            parts.push({ text: textPrompt.substring(lastIndex, match.index) });
        }
        
        // The Image segment
        const imgId = match[1];
        const img = imageMap[imgId];
        if (img) {
            // Optional: Add a small label text before image if needed, or let the textPrompt handle it.
            // parts.push({ text: `[Image: ${img.description}]` }); // Removed to be strictly inline
            parts.push({
                inlineData: {
                    mimeType: img.mimeType,
                    data: img.base64
                }
            });
        }

        lastIndex = regex.lastIndex;
    }

    // Remaining text segment
    if (lastIndex < textPrompt.length) {
        parts.push({ text: textPrompt.substring(lastIndex) });
    }
    
    // If no images found, return single text part
    if (parts.length === 0) {
        return [{ text: textPrompt }];
    }

    return parts;
};

// --- New: Auto Context Parser ---
/**
 * Parses a prompt string containing <user>, <assistant>, <system> tags into structured messages.
 * Also handles image interleaving via the provided callback.
 */
export const parsePromptStructure = (
    prompt: string,
    interleaver: (text: string) => any[]
): { role: string; parts: any[] }[] => {
    // Regex to match tags like <user>content</user>
    // Flag 's' (dotAll) equivalent via [\s\S]
    const tagRegex = /<(user|system|assistant|model)>([\s\S]*?)<\/\1>/gi;
    
    const messages: { role: string; parts: any[] }[] = [];
    let lastIndex = 0;
    let match;
    let foundTags = false;

    while ((match = tagRegex.exec(prompt)) !== null) {
        foundTags = true;
        
        // Handle content before the tag (treat as user text if significant)
        const preContent = prompt.substring(lastIndex, match.index).trim();
        if (preContent) {
            messages.push({ role: 'user', parts: interleaver(preContent) });
        }

        // Handle the tagged content
        let role = match[1].toLowerCase();
        if (role === 'model') role = 'assistant'; // Normalize model -> assistant
        
        const content = match[2].trim();
        if (content) {
            const parts = interleaver(content);
            
            // SECURITY CHECK: System messages in OpenAI/Volcano cannot contain images.
            // If images are detected in a 'system' role, downgrade it to 'user' to ensure delivery.
            if (role === 'system' && parts.some(p => p.inlineData)) {
                console.warn("Detected images in SYSTEM message. Downgrading role to USER for API compatibility.");
                role = 'user';
            }

            messages.push({ role, parts });
        }

        lastIndex = tagRegex.lastIndex;
    }

    // Handle remaining content after last tag
    if (foundTags) {
        const postContent = prompt.substring(lastIndex).trim();
        if (postContent) {
            messages.push({ role: 'user', parts: interleaver(postContent) });
        }
    }

    // If no tags were found, return the whole thing as a single user message
    if (!foundTags) {
        return [{ role: 'user', parts: interleaver(prompt) }];
    }

    return messages;
};

// Helper: Build Context Messages
// Updated to accept model-specific context and mixed content parts
export const buildContextMessages = (
    globalContext: GlobalContextMessage | any, 
    modelContext: GlobalContextMessage | any, // New: Model-specific context
    characterContext: any, // contextConfig from Char
    promptInput: string | any[] | Array<{role: string, parts: any[]}>, // Accepts String, Parts Array, or Structured Messages
    settings?: AppSettings
) => {
    const rawMessages = [];
    
    // 1. Global Context
    if (globalContext && globalContext.messages) {
        rawMessages.push(...globalContext.messages);
    }
    
    // 2. Model Specific Context (Inserted between Global and Character)
    if (modelContext && modelContext.messages) {
        rawMessages.push(...modelContext.messages);
    }

    // 3. Character Context (if any)
    if (characterContext && characterContext.messages) {
        rawMessages.push(...characterContext.messages);
    }
    
    // 4. The Prompt (Handling Polymorphism)
    if (Array.isArray(promptInput) && promptInput.length > 0 && 'role' in promptInput[0] && 'parts' in promptInput[0]) {
        // It's a pre-parsed multi-turn conversation
        rawMessages.push(...(promptInput as any[]));
    } else {
        // It's a single user turn (either string or parts array)
        rawMessages.push({ role: 'user', content: promptInput });
    }
    
    // Convert content to 'parts' for Gemini SDK compatibility AND apply Global Variable Replacement
    return rawMessages.map(m => {
        let finalParts: any[] = [];
        
        if (m.parts) {
            // Already in parts format (from parsePromptStructure)
            // Apply variable replacement to TEXT parts
            finalParts = m.parts.map((p: any) => {
                if (p.text) {
                    return { ...p, text: replaceGlobalVariables(p.text, settings) };
                }
                return p;
            });
        } else if (Array.isArray(m.content)) {
            // Content is array (legacy parts or OpenAI style)
            finalParts = m.content.map((p: any) => {
                if (typeof p === 'string') return { text: replaceGlobalVariables(p, settings) };
                if (p.type === 'text') return { type: 'text', text: replaceGlobalVariables(p.text, settings) };
                return p;
            });
        } else {
            // String content
            finalParts = [{ text: replaceGlobalVariables(String(m.content || ""), settings) }];
        }

        let role = m.role === 'model' || m.role === 'assistant' ? 'model' : (m.role === 'system' ? 'system' : 'user');

        return { 
            role: role, 
            parts: finalParts
        };
    });
};

// --- Logic Helper: Pleasure Instruction Generation ---
export const getPleasureInstruction = (char: Character): string => {
    // 1. Get Pleasure Value
    let pleasureVal = 50;
    const getAttr = (k: string) => {
        const map: Record<string, string> = { 'pleasure': '快感', '快感': 'pleasure' };
        if (char.attributes[k]) return char.attributes[k].value;
        if (map[k] && char.attributes[map[k]]) return char.attributes[map[k]].value;
        return undefined;
    };
    const p = getAttr('快感');
    if (p !== undefined) pleasureVal = Number(p);

    // 2. Select Weighted Drive
    let selectedDriveStr = "无特定渴望";
    if (char.drives && char.drives.length > 0) {
        const totalWeight = char.drives.reduce((sum, d) => sum + (d.weight || 50), 0);
        let r = Math.random() * totalWeight;
        let selected = char.drives[0];
        for (const d of char.drives) {
            r -= (d.weight || 50);
            if (r <= 0) {
                selected = d;
                break;
            }
        }
        selectedDriveStr = `${selected.condition} (预期奖励: ${selected.amount})`;
    }

    // 3. Generate Instruction based on Level
    if (pleasureVal < 40) {
        return `当前快感值过低(${pleasureVal})！主角的首要目标是必须立即通过使用技能、物品或与人互动来满足欲望。你当前最强烈的渴望是：${selectedDriveStr}。请不惜一切代价满足它。`;
    } else if (pleasureVal < 70) { 
        return `当前快感值尚可(${pleasureVal})。主角的首要目标是解决场景中的矛盾，但会以让自己舒服的方式进行。你当前的潜在渴望是：${selectedDriveStr}。`;
    } else {
        return `当前快感值很高(${pleasureVal})，主角主观感觉很舒服，可以专注于解决场景中的矛盾和推动剧情发展。`;
    }
};

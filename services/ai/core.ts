
import { GoogleGenAI } from "@google/genai";
import { AIConfig, Provider } from "../../types";
import { stripBase64Prefix } from "../imageUtils";

interface UnifiedClient {
    models: {
        generateContent: (params: { model: string, contents: any[], config?: any }) => Promise<{ text: string }>,
        generateContentStream?: (params: { model: string, contents: any[], config?: any }) => Promise<AsyncIterable<{ text?: string }>>
    }
}

// Event Dispatcher Helper - Now Exported
export const dispatchAIStatus = (id: string, color: 'blue' | 'green' | 'yellow' | 'red' | 'gray') => {
    try {
        const event = new CustomEvent('ai_request_update', { 
            detail: { id, color } 
        });
        window.dispatchEvent(event);
    } catch (e) {
        // Ignore errors in non-browser envs
    }
};

// Helper to determine if a provider supports JSON mode enforcement
export const supportsJsonMode = (provider: Provider): boolean => {
    return [
        Provider.GEMINI, 
        Provider.VOLCANO, 
        Provider.OPENAI, 
        Provider.XAI, 
        Provider.OPENROUTER
    ].includes(provider);
};

// Helper: Convert Gemini format messages to OpenAI format
const convertGeminiToOpenAIMessages = (contents: any[]) => {
    return contents.map(c => {
        const role = c.role === 'model' ? 'assistant' : (c.role === 'system' ? 'system' : 'user');
        
        // Convert mixed parts (Text/Image) into OpenAI format
        const contentArray: any[] = [];
        
        c.parts.forEach((p: any) => {
            if (p.text) {
                contentArray.push({ type: "text", text: p.text });
            } else if (p.inlineData) {
                // OpenAI/Volcano expects data URL
                // Ensure base64 is clean (no newlines)
                const rawData = (p.inlineData.data || "").replace(/[\r\n]+/g, '');
                const mimeType = p.inlineData.mimeType || 'image/jpeg';
                
                const dataUrl = rawData.startsWith('data:') 
                    ? rawData 
                    : `data:${mimeType};base64,${rawData}`;
                    
                contentArray.push({ 
                    type: "image_url", 
                    image_url: { 
                        url: dataUrl,
                        detail: "auto" // Explicitly set detail for better compatibility
                    } 
                });
            }
        });

        // Flatten if simple string, otherwise use array.
        // Filter out empty text parts if we have mixed content (e.g. image + empty string)
        // because some strict parsers choke on empty text blocks in multimodal arrays.
        let finalContent: any = contentArray;
        
        if (contentArray.length > 1) {
            const filtered = contentArray.filter(item => item.type !== 'text' || (item.text && item.text.trim().length > 0));
            // Only use filtered if we didn't filter everything out
            if (filtered.length > 0) {
                finalContent = filtered;
            }
        }

        // Downgrade to simple string if possible (required for some system prompts)
        if (finalContent.length === 1 && finalContent[0].type === "text") {
            finalContent = finalContent[0].text;
        }

        return {
            role: role,
            content: finalContent
        };
    });
};

export const createClient = (config: AIConfig, apiKeys: Record<string, string>): UnifiedClient => {
    const apiKey = config.apiKey || apiKeys[config.provider] || "";
    
    if (config.provider === Provider.GEMINI) {
        const ai = new GoogleGenAI({ apiKey });
        return {
            models: {
                generateContent: async (params) => {
                    // Pre-process contents to strip base64 headers for Gemini
                    const processedContents = params.contents.map(c => ({
                        ...c,
                        parts: c.parts.map((p: any) => {
                            if (p.inlineData && p.inlineData.data) {
                                return {
                                    inlineData: {
                                        mimeType: p.inlineData.mimeType,
                                        data: stripBase64Prefix(p.inlineData.data)
                                    }
                                };
                            }
                            return p;
                        })
                    }));

                    const res = await ai.models.generateContent({
                        model: params.model,
                        contents: processedContents,
                        config: params.config
                    });
                    return { text: res.text || "" };
                },
                generateContentStream: async (params) => {
                    // Similar preprocessing for stream
                    const processedContents = params.contents.map(c => ({
                        ...c,
                        parts: c.parts.map((p: any) => {
                            if (p.inlineData && p.inlineData.data) {
                                return {
                                    inlineData: {
                                        mimeType: p.inlineData.mimeType,
                                        data: stripBase64Prefix(p.inlineData.data)
                                    }
                                };
                            }
                            return p;
                        })
                    }));

                    const res = await ai.models.generateContentStream({
                        model: params.model,
                        contents: processedContents,
                        config: params.config
                    });
                    
                    // Convert to async iterable that yields { text }
                    return (async function* () {
                         for await (const chunk of res) {
                             yield { text: chunk.text };
                         }
                    })();
                }
            }
        }
    }
    
    // Fallback for OpenAI compatible providers
    return {
        models: {
            generateContent: async (params) => {
                const baseURLs: Record<string, string> = {
                    [Provider.XAI]: "https://api.x.ai/v1",
                    [Provider.OPENAI]: "https://api.openai.com/v1",
                    [Provider.OPENROUTER]: "https://openrouter.ai/api/v1",
                    [Provider.VOLCANO]: "https://ark.cn-beijing.volces.com/api/v3",
                    [Provider.CLAUDE]: "https://api.anthropic.com/v1"
                };
                
                const baseURL = baseURLs[config.provider] || "https://api.openai.com/v1";
                
                const messages = convertGeminiToOpenAIMessages(params.contents);

                const bodyPayload: any = {
                    model: params.model,
                    messages: messages,
                    temperature: config.temperature,
                };

                // Add Reasoning Effort only if explicitly set and NOT 'minimal'
                if (config.reasoningEffort && config.reasoningEffort !== 'minimal') {
                     bodyPayload.reasoning_effort = config.reasoningEffort;
                }

                // Translate internal config to OpenAI compatible response_format
                if (params.config?.responseMimeType === 'application/json') {
                    bodyPayload.response_format = { type: "json_object" };
                }

                const response = await fetch(`${baseURL}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify(bodyPayload)
                });
                
                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`API Error: ${response.status} ${response.statusText} - ${errText}`);
                }

                const data = await response.json();
                return { text: data.choices?.[0]?.message?.content || "" };
            },
            generateContentStream: async (params) => {
                const baseURLs: Record<string, string> = {
                    [Provider.XAI]: "https://api.x.ai/v1",
                    [Provider.OPENAI]: "https://api.openai.com/v1",
                    [Provider.OPENROUTER]: "https://openrouter.ai/api/v1",
                    [Provider.VOLCANO]: "https://ark.cn-beijing.volces.com/api/v3",
                    [Provider.CLAUDE]: "https://api.anthropic.com/v1"
                };
                
                const baseURL = baseURLs[config.provider] || "https://api.openai.com/v1";
                
                const messages = convertGeminiToOpenAIMessages(params.contents);

                const bodyPayload: any = {
                    model: params.model,
                    messages: messages,
                    temperature: config.temperature,
                    stream: true // Enable Streaming
                };

                // Add Reasoning Effort only if explicitly set and NOT 'minimal'
                if (config.reasoningEffort && config.reasoningEffort !== 'minimal') {
                     bodyPayload.reasoning_effort = config.reasoningEffort;
                }

                // OpenAI streaming handles json_object mode, but sometimes breaks partial JSONs. 
                // We typically use text stream for better robustness in this custom implementation.
                if (params.config?.responseMimeType === 'application/json') {
                    bodyPayload.response_format = { type: "json_object" };
                }

                const response = await fetch(`${baseURL}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify(bodyPayload)
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`API Error: ${response.status} - ${errText}`);
                }

                if (!response.body) throw new Error("No response body for stream.");

                const reader = response.body.getReader();
                const decoder = new TextDecoder();

                return (async function* () {
                    let buffer = "";
                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            const chunk = decoder.decode(value, { stream: true });
                            buffer += chunk;
                            
                            const lines = buffer.split('\n');
                            buffer = lines.pop() || ""; // Keep incomplete line
                            
                            for (const line of lines) {
                                const trimmed = line.trim();
                                if (!trimmed || trimmed === 'data: [DONE]') continue;
                                if (trimmed.startsWith('data: ')) {
                                    try {
                                        const json = JSON.parse(trimmed.slice(6));
                                        const delta = json.choices?.[0]?.delta?.content;
                                        if (delta) {
                                            yield { text: delta };
                                        }
                                    } catch (e) {
                                        // Ignore parsing errors for partial chunks
                                    }
                                }
                            }
                        }
                    } finally {
                        reader.releaseLock();
                    }
                })();
            }
        }
    }
}

// --- Connection Test Utility ---
export const testModelConnection = async (
    config: AIConfig,
    apiKey: string
): Promise<{ success: boolean; response: string; requestDetails: any; latency: number }> => {
    const start = Date.now();
    // Create a temporary client with the specific key
    const client = createClient(config, { [config.provider]: apiKey });
    
    const testMessage = "Hello! Please reply with 'Connection Successful' if you receive this.";
    const contents = [{ role: 'user', parts: [{ text: testMessage }] }];

    try {
        const result = await client.models.generateContent({
            model: config.model || "",
            contents: contents
        });
        
        const end = Date.now();
        return {
            success: true,
            response: result.text,
            latency: end - start,
            requestDetails: {
                provider: config.provider,
                model: config.model,
                endpoint: config.provider === 'gemini' ? 'GoogleGenAI SDK' : 'REST /chat/completions',
                messages: contents,
                reasoningEffort: config.reasoningEffort
            }
        };
    } catch (e: any) {
        const end = Date.now();
        return {
            success: false,
            response: `Error: ${e.message}`,
            latency: end - start,
            requestDetails: {
                provider: config.provider,
                model: config.model,
                messages: contents,
                error: e.toString()
            }
        };
    }
};

export const robustGenerate = async <T>(
    callApi: () => Promise<{ text: string }>,
    validator: (json: any) => any,
    maxRetries: number = 3,
    onFailure?: (error: any, rawResponse?: string) => void
): Promise<T | null> => {
    let attempts = 0;
    // Generate a unique ID for this specific request sequence
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    let lastRawText = "";

    while (attempts < maxRetries) {
        try {
            // Dispatch color based on attempt number (0=Blue/Processing, 1=Yellow, 2=Red)
            const color = attempts === 0 ? 'blue' : (attempts === 1 ? 'yellow' : 'red');
            dispatchAIStatus(requestId, color);

            const result = await callApi();
            lastRawText = result.text;
            let text = result.text;
            // Clean markdown code blocks if present
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const json = JSON.parse(text);
            const validated = validator(json);
            if (validated) {
                dispatchAIStatus(requestId, 'green'); // Success
                return json as T;
            } else {
                throw new Error("Validation Failed");
            }
        } catch (e) {
            console.warn(`Generate attempt ${attempts + 1} failed:`, e);
            if (attempts === maxRetries - 1 && onFailure) {
                onFailure(e, lastRawText);
            }
        }
        attempts++;
    }

    // Final failure
    dispatchAIStatus(requestId, 'gray');
    return null;
};

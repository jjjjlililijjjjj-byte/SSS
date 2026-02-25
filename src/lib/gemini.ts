import { GoogleGenAI, Type } from "@google/genai";
import { PaperAnalysis, ChatMessage } from "@/types";

// Initialize Gemini API lazily to prevent app crash on startup if key is missing
let ai: GoogleGenAI | null = null;
let customApiKey: string | null = null;

export function setCustomApiKey(key: string) {
  customApiKey = key;
  ai = new GoogleGenAI({ apiKey: key });
}

function getAI() {
  if (customApiKey) {
    if (!ai) ai = new GoogleGenAI({ apiKey: customApiKey });
    return ai;
  }
  
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      console.warn("Gemini API Key is missing. AI features will not work.");
      return null;
    }
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

const ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "The title of the paper" },
    summary: { type: Type.STRING, description: "A one-sentence summary of the paper" },
    goal: { type: Type.STRING, description: "The research goal or objective" },
    content: { type: Type.STRING, description: "The main content or research topic" },
    method: { type: Type.STRING, description: "The research methodology used" },
    outlook: { type: Type.STRING, description: "Future outlook or future work mentioned" },
    reference_value: { type: Type.STRING, description: "Key takeaways or reference value for other researchers" },
    references: { 
      type: Type.ARRAY, 
      items: { type: Type.STRING },
      description: "A list of titles of the key papers cited in this document. Extract the full titles of references found in the bibliography or text." 
    },
    authors: { 
      type: Type.ARRAY, 
      items: { type: Type.STRING },
      description: "List of authors of the paper." 
    },
    year: { type: Type.STRING, description: "Publication year." },
    journal: { type: Type.STRING, description: "Journal or conference name." },
    citation: { type: Type.STRING, description: "Citation in GB/T 7714-2015 format." },
  },
  required: ["title", "summary", "goal", "content", "method", "outlook", "reference_value", "references", "citation"],
};

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 5, initialDelay = 2000): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const errorMessage = error?.message || String(error);
      const isQuotaExceeded = errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED");
      const isTransient = 
        errorMessage.includes("503") || 
        errorMessage.includes("UNAVAILABLE") ||
        isQuotaExceeded;
      
      if (!isTransient || i === maxRetries - 1) {
        throw error;
      }
      
      let delay = initialDelay * Math.pow(2, i);
      
      // Try to extract retryDelay from error message if it's a quota issue
      // Example: "Please retry in 16.918814493s" or "retryDelay: 16s"
      const retryMatch = errorMessage.match(/retry in\s+([\d.]+)\s*s/i) || errorMessage.match(/retryDelay:\s*"?(\d+)s"?/i);
      if (retryMatch && retryMatch[1]) {
        const extractedDelay = parseFloat(retryMatch[1]) * 1000;
        delay = Math.max(delay, extractedDelay + 1000); // Add 1s buffer
      }
      
      console.warn(`Gemini API issue (attempt ${i + 1}/${maxRetries}). Retrying in ${Math.round(delay)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

export async function analyzePaper(text: string): Promise<PaperAnalysis> {
  const ai = getAI();
  if (!ai) throw new Error("Gemini API Key is missing");

  // Models to try in order of preference
  const models = ["gemini-3-flash-preview", "gemini-flash-lite-latest"];
  let lastError: any;

  for (const model of models) {
    try {
      const prompt = `
        You are an academic paper analysis expert. Please read the provided paper text and output a strict JSON format data.
        The content of the analysis (summary, goal, content, method, outlook, reference_value) MUST be in Chinese.
        The citation MUST be in GB/T 7714-2015 format.
        Important keywords and terms in the analysis content MUST be highlighted using markdown bold syntax (e.g., **keyword**).
        Do not output any explanatory text.
        
        Paper Text:
        ${text.slice(0, 100000)} // Truncate to avoid token limits if necessary
      `;

      return await withRetry(async () => {
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: ANALYSIS_SCHEMA,
          },
        });

        const responseText = response.text;
        if (!responseText) throw new Error("No response from AI");

        // Cleanup markdown code blocks if present (just in case)
        const cleanedText = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        return JSON.parse(cleanedText) as PaperAnalysis;
      });
    } catch (error: any) {
      lastError = error;
      const errorMessage = error?.message || String(error);
      const isQuotaExceeded = errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED");
      
      if (isQuotaExceeded && model !== models[models.length - 1]) {
        console.warn(`Model ${model} exhausted. Trying fallback model...`);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export async function chatWithPaper(
  paperText: string,
  history: ChatMessage[],
  newMessage: string,
  onStream: (chunk: string) => void
): Promise<string> {
  const ai = getAI();
  if (!ai) throw new Error("Gemini API Key is missing");

  const models = ["gemini-3-flash-preview", "gemini-flash-lite-latest"];
  let lastError: any;

  for (const model of models) {
    try {
      const systemInstruction = `
        You are an academic assistant. You are discussing a specific paper.
        Here is the content of the paper you are discussing:
        
        ${paperText.slice(0, 100000)}
        
        Answer the user's questions based on this paper. Be concise and accurate.
      `;

      return await withRetry(async () => {
        const chat = ai.chats.create({
          model,
          config: {
            systemInstruction,
          },
          history: history.map(msg => ({
            role: msg.role,
            parts: [{ text: msg.content }],
          })),
        });

        const result = await chat.sendMessageStream({
          message: newMessage,
        });

        let fullResponse = "";
        for await (const chunk of result) {
          const chunkText = chunk.text;
          if (chunkText) {
            fullResponse += chunkText;
            onStream(fullResponse);
          }
        }

        return fullResponse;
      });
    } catch (error: any) {
      lastError = error;
      const errorMessage = error?.message || String(error);
      const isQuotaExceeded = errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED");
      
      if (isQuotaExceeded && model !== models[models.length - 1]) {
        console.warn(`Model ${model} exhausted for chat. Trying fallback model...`);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

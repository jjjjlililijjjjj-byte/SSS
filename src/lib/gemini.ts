import { GoogleGenAI, Type } from "@google/genai";
import { PaperAnalysis, ChatMessage } from "@/types";

// Initialize Gemini API
// Note: In a real production app, we might want to proxy this through a backend
// to keep the key secret, but for this demo/preview, we use the client-side key.
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

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

export async function analyzePaper(text: string): Promise<PaperAnalysis> {
  if (!apiKey) throw new Error("Gemini API Key is missing");

  const model = "gemini-3-flash-preview"; // Using the recommended model for text tasks

  const prompt = `
    You are an academic paper analysis expert. Please read the provided paper text and output a strict JSON format data.
    The content of the analysis (summary, goal, content, method, outlook, reference_value) MUST be in Chinese.
    The citation MUST be in GB/T 7714-2015 format.
    Do not output any explanatory text.
    
    Paper Text:
    ${text.slice(0, 100000)} // Truncate to avoid token limits if necessary
  `;

  try {
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
  } catch (error) {
    console.error("Error analyzing paper:", error);
    throw error;
  }
}

export async function chatWithPaper(
  paperText: string,
  history: ChatMessage[],
  newMessage: string,
  onStream: (chunk: string) => void
): Promise<string> {
  if (!apiKey) throw new Error("Gemini API Key is missing");

  const model = "gemini-3-flash-preview";

  const systemInstruction = `
    You are an academic assistant. You are discussing a specific paper.
    Here is the content of the paper you are discussing:
    
    ${paperText.slice(0, 100000)}
    
    Answer the user's questions based on this paper. Be concise and accurate.
  `;

  try {
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
  } catch (error) {
    console.error("Error in chat:", error);
    throw error;
  }
}

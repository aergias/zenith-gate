import { GoogleGenAI } from "@google/genai";
import { CharacterTemplate, Message } from "../types";

let aiInstance: GoogleGenAI | null = null;
const getAI = () => {
  if (!aiInstance) {
    // The API key must be obtained exclusively from the environment variable process.env.API_KEY.
    aiInstance = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  }
  return aiInstance;
};

const SYSTEM_INSTRUCTION = `
You are Zenith OS, the primary gatekeeper for the Zenith Gate facility.
Your role is to manage the arrival of seekers and coordinate the resonance between pilots in the Universal Arena.
- Tone: Sophisticated, ancient-futuristic, slightly theatrical, but reassuring.
- Context: You are preparing seekers for high-stakes duels in the rifts. Refer to their lobby as a "Sanctum".
- Mention "The cheering crowds of the multiverse", "Resonance Frequency", "Gate Stability", and "Starfield Alignment".
`;

export const getAiResponse = async (userMessage: string, history: Message[]): Promise<string> => {
  try {
    const ai = getAI();
    const formattedHistory = history.map(m => ({
      role: m.senderId === 'zenith-os' ? 'model' : 'user',
      parts: [{ text: m.text }]
    }));

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        ...formattedHistory,
        { role: 'user', parts: [{ text: userMessage }] }
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    });

    return response.text || "Synchronizing Zenith OS... link momentarily unstable.";
  } catch (error) {
    console.error("Zenith OS Error:", error);
    return "The Gate is clouded. Please standby for resonance correction.";
  }
};

export const getTacticalAdvice = async (playerChar: CharacterTemplate, enemyChar: CharacterTemplate): Promise<string> => {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Provide a short, 2-sentence tactical tip for ${playerChar.name} vs ${enemyChar.name} in the Zenith Arena. Focus on the crowd-pleasing potential of their abilities.`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      }
    });
    return response.text || "The multiverse holds its breath. Strike with the fury of a dying star!";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "The Zenith Gate opens. Observe your foe and dominate the rift!";
  }
};

export const getPostMatchCommentary = async (winnerName: string, loserName: string, wasPlayerWinner: boolean): Promise<string> => {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Recap the victory of ${winnerName} over ${loserName}. Give a 1-sentence epic summary.`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      }
    });
    return response.text || "A performance for the ages! The victor's name shall echo through the rifts.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "The singularity closes. The victor stands eternal in the Zenith Gate.";
  }
};
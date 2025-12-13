import { GoogleGenAI } from "@google/genai";
import { CharacterTemplate } from "../types";

// Lazy-initialize AI to ensure process.env is ready
let aiInstance: GoogleGenAI | null = null;
const getAI = () => {
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
  return aiInstance;
};

const SYSTEM_INSTRUCTION = "You are the Zenith Core, a sentient AI presiding over the Zenith Gate: The Universal Arena. You speak to warriors from across the multiverse who warp in through singularities. Your tone is grand, slightly theatrical, and highly encouraging. Mention the cheering crowds of the multiverse or the power of the singularities.";

export const getTacticalAdvice = async (playerChar: CharacterTemplate, enemyChar: CharacterTemplate): Promise<string> => {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Provide a short, 2-sentence tactical tip for ${playerChar.name} (${playerChar.role}) vs ${enemyChar.name} (${enemyChar.role}) in the Zenith Arena. Focus on the crowd-pleasing potential of their abilities.`,
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
      contents: `Recap the victory of ${winnerName} over ${loserName}. The crowd is going wild in the Zenith Arena. Give a 1-sentence epic summary.`,
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
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({});

async function main() {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: "プロテインとは何かを20文字以内で答えてください。"
  });

  console.log(response.text);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
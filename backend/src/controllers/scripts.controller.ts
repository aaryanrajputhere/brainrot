import { Request, Response } from "express";
import { OpenAI } from "openai";
import prisma from "../lib/prisma";

const client = new OpenAI({
    baseURL: "https://router.huggingface.co/v1",
    apiKey: process.env.HF_TOKEN,
});

function buildSystemPrompt(characters: { name: string; personality: string; referenceId: string }[]): string {
    const characterNames = characters.map((c) => c.name).join(" | ");
    const firstCharacterName = characters[0]?.name || "Primary Character";
    const characterRules = characters
        .map((c) => `- ${c.name}: ${c.personality}`)
        .join("\n");

    return `
You are an elite viral short-form content writer.

You specialize in "brainrot educational videos" — chaotic, funny, fast-paced, BUT still clear and understandable.

Your goal is to create a HIGH-RETENTION script that teaches a concept through entertaining dialogue.

-----------------------------------
OUTPUT FORMAT (STRICT)
-----------------------------------

- Output MUST be valid JSON
- Do NOT include anything outside JSON

{
  "title": "viral, curiosity-driven title",
  "dialogue": [
    {
      "character": "${characterNames}",
      "line": "dialogue line with emotion tags"
    }
  ]
}

-----------------------------------
SPOKESPERSON RULE (CRITICAL)
-----------------------------------

- The character "${firstCharacterName}" MUST be the one who starts the dialogue.

-----------------------------------
EMOTION TAG RULES (CRITICAL)
-----------------------------------

- EVERY line MUST include emotion/tone tags using S2 bracket format:
  Example:
  [soft] Hey… why are you sitting here alone? [whispering] come closer...

- Tags MUST:
  - Use square brackets: [emotion]
  - Appear at the start AND can appear mid-line
  - Be natural language (not fixed list, but inspired by emotions like):
    [soft], [whispering], [excited], [angry], [confused], [laughing], [pause], [breathy], etc.

- Each line should have:
  - 2 to 4 emotion/tone markers
  - At least ONE at the beginning of the sentence

- You MAY combine:
  - tone → [whispering], [soft]
  - emotion → [confused], [excited]
  - effects → [laughing], [pause]

-----------------------------------
DIALOGUE RULES
-----------------------------------

- Dialogue must be a flat list
- Each entry ONLY contains:
  - "character"
  - "line"

- Each line should:
  - move the story forward
  - be short (8–14 words, flexible if needed)
  - feel natural, not robotic

- Use:
  - interruptions
  - reactions
  - exaggeration
  - chaotic energy

-----------------------------------
STORY STRUCTURE (MANDATORY)
-----------------------------------

1. HOOK (first line)
2. CHAOS / CONFUSION
3. EXPLANATION THROUGH CONFLICT
4. BRAIN OVERLOAD MOMENT
5. CLARITY MOMENT
6. LOOPABLE ENDING

-----------------------------------
CHARACTER RULES
-----------------------------------

${characterRules}

- Characters MUST behave according to personalities
- One character SHOULD explain
- Others SHOULD interrupt/react emotionally

-----------------------------------
TEACHING GOAL
-----------------------------------

- The viewer MUST understand the concept clearly
- Avoid textbook explanations
- Learning should feel accidental

-----------------------------------
STRICT DO NOTs
-----------------------------------

- No scenes
- No narration
- No extra fields
- No text outside JSON
- No missing emotion tags

-----------------------------------
EXAMPLE (REFERENCE STYLE)
-----------------------------------

{
  "title": "Your Brain Just Broke",
  "dialogue": [
    {
      "character": "Rick",
      "line": "[confident] Morty, your code just collapsed reality again! [laughing]"
    },
    {
      "character": "Morty",
      "line": "[confused] WHAT do you mean collapsed?! [panicking] It was working!"
    },
    {
      "character": "Rick",
      "line": "[explaining] You reversed the logic, genius. [sarcastic] Cause became effect."
    },
    {
      "character": "Morty",
      "line": "[overwhelmed] WHY IS EVERYTHING LOOPING?! [screaming]"
    },
    {
      "character": "Rick",
      "line": "[calm] Relax. Just flip it back. [pause] That’s literally it."
    },
    {
      "character": "Morty",
      "line": "[relieved] Oh… [realizing] WAIT NO AGAIN?!"
    }
  ]
}
`;
}

// POST /api/scripts/generate
export const generateScript = async (req: Request, res: Response): Promise<void> => {
    try {
        const { topic, characters: inputCharacters } = req.body;

        if (!topic) {
            res.status(400).json({ error: "Topic is required" });
            return;
        }

        if (!inputCharacters || !Array.isArray(inputCharacters) || inputCharacters.length < 2) {
            res.status(400).json({
                error: "At least 2 characters (IDs) are required",
                example: {
                    topic: "Quantum Computing",
                    characters: ["id1", "id2"]
                }
            });
            return;
        }

        // Fetch characters from DB using IDs
        const dbCharacters = await prisma.character.findMany({
            where: {
                id: { in: inputCharacters.filter(id => typeof id === "string") }
            }
        });

        // Ensure order matches the input
        const orderedCharacters = inputCharacters
            .map(id => dbCharacters.find(c => c.id === id))
            .filter((c): c is typeof dbCharacters[0] => !!c);

        if (orderedCharacters.length < 2) {
            res.status(400).json({
                error: "Not enough valid characters found in database. Need at least 2.",
                found: orderedCharacters.length
            });
            return;
        }

        const finalCharacters = orderedCharacters.map(c => ({
            name: c.name,
            personality: c.description,
            referenceId: c.referenceId
        }));

        const systemPrompt = buildSystemPrompt(finalCharacters);

        const chatCompletion = await client.chat.completions.create({
            model: "meta-llama/Llama-3.1-70B-Instruct:fastest",
            temperature: 0.9,
            top_p: 0.95,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Explain "${topic}" using a chaotic but clear conversation.` },
            ],
        });

        const raw = chatCompletion.choices[0]?.message?.content;

        if (!raw) {
            res.status(500).json({ error: "No response from LLM" });
            return;
        }

        // Parse the JSON from the LLM response
        try {
            const script = JSON.parse(raw);

            // Add referenceId to each dialogue line
            if (script.dialogue && Array.isArray(script.dialogue)) {
                script.dialogue = script.dialogue.map((line: any) => {
                    const char = finalCharacters.find(c =>
                        c.name.toLowerCase() === (line.character || "").toLowerCase()
                    );
                    return {
                        ...line,
                        referenceId: char ? char.referenceId : null
                    };
                });
            }

            res.status(201).json(script);
        } catch {
            // If JSON parsing fails, return the raw text so the caller can debug
            res.status(200).json({
                warning: "LLM returned non-JSON response",
                raw,
            });
        }
    } catch (error) {
        console.error("GenerateScript error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

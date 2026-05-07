import { Request, Response } from "express";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { getAudioDurationInSeconds } from "get-audio-duration";
import prisma from "../lib/prisma";

let fishAudio: any = null;

async function getFishAudio() {
    if (!fishAudio) {
        // Use eval to bypass ts-node transpiling import() to require() in CommonJS
        const { FishAudioClient } = await (eval('import("fish-audio")') as Promise<any>);
        fishAudio = new FishAudioClient({ apiKey: process.env.FISH_API_KEY || "" });
    }
    return fishAudio;
}

// Cache for voice models to avoid redundant API calls
let modelCache: any[] = [];



async function fetchModelId(characterName: string): Promise<string | null> {
    try {
        if (modelCache.length === 0) {
            console.log("Fetching voice models from Fish Audio...");
            const response = await fetch("https://api.fish.audio/v1/model?page_size=100", {
                headers: { "Authorization": `Bearer ${process.env.FISH_API_KEY}` }
            });

            if (!response.ok) {
                const text = await response.text();
                console.warn(`Fish Audio Model API returned ${response.status}: ${text}`);
                return null;
            }

            const data = await response.json() as any;
            if (data.items) {
                modelCache = data.items;
                console.log(`Successfully cached ${modelCache.length} voice models.`);
            }
        }

        const nameMatch = characterName.toLowerCase();
        const model = modelCache.find(m => 
            m.title.toLowerCase().includes(nameMatch) || 
            (m.tags && m.tags.some((t: string) => t.toLowerCase().includes(nameMatch)))
        );

        if (!model) {
            console.warn(`No voice model found matching: ${characterName}`);
        }

        return model ? model._id : null;
    } catch (error) {
        console.error("Error fetching models:", error);
        return null;
    }
}

export const generateScriptVoiceover = async (req: Request, res: Response): Promise<void> => {
    const sessionId = Date.now().toString();
    const publicDir = path.join(process.cwd(), "public", "voiceovers");
    const sessionDir = path.join(publicDir, sessionId);

    try {
        const { dialogue } = req.body;

        if (!dialogue || !Array.isArray(dialogue)) {
            res.status(400).json({ error: "Invalid dialogue format" });
            return;
        }

        await mkdir(sessionDir, { recursive: true });

        let currentTime = 0;
        const processedScenes = [];

        // 1. Process each dialogue line one by one to get precise timing
        for (let i = 0; i < dialogue.length; i++) {
            const item = dialogue[i];
            const identifier = item.characterId || item.character;
            
            // Resolve the character from DB to get the correct referenceId and metadata
            const charData = await prisma.character.findFirst({
                where: identifier ? {
                    OR: [
                        { id: identifier },
                        { name: { equals: identifier, mode: 'insensitive' } }
                    ]
                } : undefined
            });

            // Priority: referenceId from DB > referenceId from request > fallback from ENV
            let refId = charData?.referenceId || item.referenceId;

            if (!refId || refId === "your_id_here") {
                refId = process.env.REFERENCE_ID;
            }

            if (!refId || refId === "your_id_here") {
                console.error(`Skipping line ${i}: No voice found for "${identifier || 'unknown'}"`);
                continue;
            }

            console.log(`Generating audio for line ${i} (${charData?.name || identifier}) using ID ${refId}...`);

            const response = await fetch("https://api.fish.audio/v1/tts", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${process.env.FISH_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    text: item.line,
                    reference_id: [refId], 
                    format: "mp3",
                    normalize: true,
                    latency: "normal"
                })
            });

            if (!response.ok) {
                console.error(`Error on line ${i}: ${await response.text()}`);
                continue;
            }

            const buffer = Buffer.from(await response.arrayBuffer());
            const outputFilename = `line_${i}.mp3`;
            const outputPath = path.join(sessionDir, outputFilename);

            await writeFile(outputPath, buffer);

            // 2. Measure the exact duration of the generated audio
            const duration = await getAudioDurationInSeconds(outputPath);

            // 3. Add to our metadata array
            processedScenes.push({
                characterId: charData?.id || identifier,
                characterName: charData?.name || identifier,
                text: item.line,
                audioUrl: `/public/voiceovers/${sessionId}/${outputFilename}`,
                start: currentTime,
                duration: duration,
                imageUrl: `/public/characters/${(charData?.name || identifier || "unknown").toLowerCase()}.png` 
            });

            // 4. Update the timeline offset
            currentTime += duration;
        }

        // 5. Create the Final Script JSON for Remotion
        const finalMetadata = {
            sessionId,
            totalDuration: currentTime,
            scenes: processedScenes,
            bgVideoUrl: "/public/assets/subway_surfer.mp4" 
        };

        const metadataPath = path.join(sessionDir, "script.json");
        await writeFile(metadataPath, JSON.stringify(finalMetadata, null, 2));

        res.status(200).json({
            message: "Script voiceover and timing metadata generated",
            sessionId: sessionId,
            metadataUrl: `/public/voiceovers/${sessionId}/script.json`,
            data: finalMetadata
        });

    } catch (error) {
        console.error("Script voiceover error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const generateVoiceOver = async (req: Request, res: Response): Promise<void> => {
    try {
        const { text, reference_id } = req.body;

        if (!text) {
            res.status(400).json({ error: "Text is required" });
            return;
        }

        const refId = reference_id || process.env.REFERENCE_ID;

        const client = await getFishAudio();
        const audio = await client.textToSpeech.convert({
            text: text,
            reference_id: refId,
        });

        // fish-audio convert returns a Blob or standard node structure
        const buffer = Buffer.from(await new Response(audio as any).arrayBuffer());
        
        const publicDir = path.join(process.cwd(), "public", "voiceovers");
        await mkdir(publicDir, { recursive: true });

        const filename = `custom_voice_${Date.now()}.mp3`;
        const filepath = path.join(publicDir, filename);
        
        await writeFile(filepath, buffer);
        console.log(`✓ Audio saved to ${filename}`);

        res.status(200).json({ 
            message: "Audio saved successfully", 
            url: `/public/voiceovers/${filename}`,
            filename: filename 
        });
    } catch (error) {
        console.error("Voiceover error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
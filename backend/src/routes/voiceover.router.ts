import { Router } from "express";
import { generateVoiceOver, generateScriptVoiceover } from "../controllers/voiceover.controller";

const router = Router();

// POST /api/voice/generate
router.post('/generate', generateVoiceOver);

// POST /api/voice/generate-script
router.post('/generate-script', generateScriptVoiceover);

export default router;

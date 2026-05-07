import "dotenv/config";
import express from "express";
import scriptsRouter from "./routes/scripts.router";
import voiceRouter from "./routes/voiceover.router";
import characterRouter from "./routes/character.router";
const app = express();

app.use(express.json());

app.get("/", (req, res) => {
    res.send("Hello World!");
});

app.use("/api/scripts", scriptsRouter);
app.use("/api/voice", voiceRouter); 
app.use("/api/characters", characterRouter);
app.use("/public", express.static("public"));

app.listen(3000, () => {
    console.log("Server started on port 3000");
});

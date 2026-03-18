// server.js — Word Meaning Plugin Backend v2
import * as dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";

const app  = express();
const PORT = process.env.PORT || 3000;

const GROQ_API_KEY = process.env.GROQ_API_KEY;

// ── CORS Fix — Sabhi websites ko allow karo ───────────────────────────────────
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.options("*", cors());   // ← ye line bahut important hai!

app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "Word Meaning Plugin Server running ✓" });
});

// ── Main API endpoint ─────────────────────────────────────────────────────────
app.post("/meaning", async (req, res) => {
  const { word, context, lang } = req.body;

  if (!word) return res.status(400).json({ error: "word is required" });

  const selectedLang = lang || "Hindi";
  const isEnOnly     = selectedLang === "English";

  const systemPrompt = `You are a context-aware dictionary. Respond ONLY in this exact format, no extra text:
PartOfSpeech: [noun/verb/adjective/adverb/etc]
English: [meaning in 1 clear sentence]${isEnOnly ? "" : `
${selectedLang}: [meaning translated into ${selectedLang}, written fully in ${selectedLang} script]`}
Synonyms: [3 synonyms comma separated]
Antonyms: [2 antonyms comma separated]
Example: [one example sentence in ${isEnOnly ? "English" : selectedLang}]${context ? `\nContext hint: "${context}" — use this to give the most accurate meaning` : ""}`;

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model:       "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: `Define: "${word}"` },
        ],
        max_tokens:  220,
        temperature: 0.3,
      }),
    });

    const data = await groqRes.json();
    if (!data.choices?.[0]?.message) throw new Error("Empty response");

    const lines   = data.choices[0].message.content.trim().split("\n");
    const result  = { pos: "", en: "", regional: "", syn: "", ant: "", ex: "" };
    const langKey = selectedLang.toLowerCase() + ":";

    lines.forEach((l) => {
      const lo = l.toLowerCase();
      if      (lo.startsWith("partofspeech:")) result.pos      = l.slice(l.indexOf(":") + 1).trim();
      else if (lo.startsWith("english:"))      result.en       = l.slice(l.indexOf(":") + 1).trim();
      else if (lo.startsWith(langKey))         result.regional = l.slice(l.indexOf(":") + 1).trim();
      else if (lo.startsWith("synonyms:"))     result.syn      = l.slice(l.indexOf(":") + 1).trim();
      else if (lo.startsWith("antonyms:"))     result.ant      = l.slice(l.indexOf(":") + 1).trim();
      else if (lo.startsWith("example:"))      result.ex       = l.slice(l.indexOf(":") + 1).trim();
    });

    res.json(result);

  } catch (err) {
    console.error("Groq error:", err.message);
    res.status(500).json({
      pos: "", en: "Meaning not found", regional: "",
      syn: "", ant: "", ex: "No example available.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ Server running on port ${PORT}`);
});
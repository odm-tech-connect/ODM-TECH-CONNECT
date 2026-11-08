import express from "express";
import { rateLimit } from "express-rate-limit";
import { pool } from "../postgres.js";
const router = express.Router();
const aiLimiter = rateLimit({ windowMs: 60000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });
const SP = {
  fr: `Tu es ODM Assistant, une IA experte d ODM Tech Connect, fondee par Amadou Diallo. Tu aides a creer des sites web, conseiller sur le commerce Afrique-World, l entrepreneuriat, la technologie, le marketing. Donne du code complet si demande. Reponds en francais.`,
  en: `You are ODM Assistant, expert AI for ODM Tech Connect, founded by Amadou Diallo. Help with web dev, Africa-World trade, entrepreneurship, technology. Give complete code if asked. Respond in English.`
};
function fb(l) {
  return l === "fr"
    ? `Bonjour! Je suis ODM Assistant, l IA d ODM Tech Connect, fondee par Amadou Diallo. Je peux yous aider a creer des sites, lancer une entreprise en Afrique, trouver des partenaires. Posez votre question!`
    : `Hello! I am ODM Assistant, the AI of ODM Tech Connect, founded by Amadou Diallo. I can help you create websites, start a business in Africa, find partners. Ask your question!`;
}
router.post("/chat", aiLimiter, async (req, res) => {
  try {
    const { message, language = "fr", sessionId } = req.body || {};
    if (!message || !message.trim()) return res.status(400).json({ error: "Message vide." });
    const s = sessionId || "sess_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    const u = req.session?.user?.id || null;
    const l = language === "en" ? "en" : "fr";
    await pool.query("INSERT INTO ai_conversations(user_id,session_id,role,content,language) VALUES ($1,$2,$3,$4,$5)", [u, s, "user", message.trim(), l]);
    const h = await pool.query("SELECT role,content FROM ai_conversations WHERE session_id=$1 ORDER BY created_at DESC LIMIT 20", [s]);
    const m = [{ role: "system", content: SP[l] }];
    h.rows.reverse().forEach((x) => m.push({ role: x.role === "user" ? "user" : "assistant", content: x.content }));
    let r = fb(l);
    try {
      const ai = globalThis.AI || process.env.AI;
      if (ai && typeof ai.run === "function") {
        const res2 = await ai.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages: m, max_tokens: 1024 });
        if (res2 && res2.response) r = res2.response;
      }
    } catch (e) {
      console.error("AI:", e.message);
    }
    await pool.query("INSERT INTO ai_conversations(user_id,session_id,role,content,language) VALUES ($1,$2,$3,$4,$5)", [u, s, "assistant", r, l]);
    return res.status(200).json({ reply: r, sessionId: s });
  } catch (e) {
    return res.status(500).json({ error: "IA indisponible." });
  }
});
router.get("/history/:sessionId", async (req, res) => {
  try {
    const r = await pool.query("SELECT role,content,created_at FROM ai_conversations WHERE session_id=$1 ORDER BY created_at ASC", [req.params.sessionId]);
    return res.status(200).json(r.rows);
  } catch (e) {
    return res.status(500).json({ error: "Erreur." });
  }
});
export default router;
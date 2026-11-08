import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { pool } from '../postgres.js';

const router = express.Router();

const aiLimiter = rateLimit({ windowMs: 60000, limit: 15, standardHeaders: 'draft-8', legacyHeaders: false });

router.post('/chat', aiLimiter, async (req, res) => {
  try {
    const { message, language = 'fr', sessionId } = req.body || {};
    if (!message || typeof message !== 'string' || message.trim().length === 0) return res.status(400).json({ error: 'Message vide.' });
    if (message.length > 2000) return res.status(400).json({ error: 'Message trop long.' });
    const session = sessionId || 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const userId = req.session?.user?.id || null;
    const lang = language === 'en' ? 'en' : 'fr';
    await pool.query('INSERT INTO ai_conversations (user_id, session_id, role, content, language) VALUES ($1, $2, $3, $4, $5)', [userId, session, 'user', message.trim(), lang]);
    const systemPrompt = lang === 'fr'
      ? 'Tu es l assistant IA d ODM Tech Connect, une plateforme qui connecte les entreprises internationales avec l Afrique. Tu aides a trouver des entreprises, des produits, comprendre la plateforme, conseiller sur le commerce international. Sois professionnel, concis et utile. Reponds en francais.'
      : 'You are the AI assistant for ODM Tech Connect, a platform connecting international businesses with Africa. Help users find companies, products, understand the platform, advise on international trade. Be professional, concise and helpful. Respond in English.';
    const historyResult = await pool.query('SELECT role, content FROM ai_conversations WHERE session_id = $1 ORDER BY created_at DESC LIMIT 10', [session]);
    const messages = [{ role: 'system', content: systemPrompt }];
    historyResult.rows.reverse().forEach(m => messages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
    let aiReply;
    try {
      const aiResponse = await fetch('https://api.cloudflare.com/client/v4/accounts/' + (process.env.CF_ACCOUNT_ID || '') + '/ai/run/@cf/meta/llama-3.1-8b-instruct', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + (process.env.CF_AI_TOKEN || ''), 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
      });
      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        aiReply = aiData.result?.response || (lang === 'fr' ? 'Desole, je n ai pas pu repondre.' : 'Sorry, I could not respond.');
      } else {
        aiReply = lang === 'fr'
          ? 'Bonjour ! Je suis l assistant IA d ODM Tech Connect. Pour connecter votre entreprise avec l Afrique: 1) Creez un compte 2) Ajoutez vos produits 3) Recherchez des partenaires 4) Envoyez des messages. Comment puis-je vous aider ?'
          : 'Hello! I am the ODM Tech Connect AI assistant. To connect your business with Africa: 1) Create an account 2) Add products 3) Search for partners 4) Send messages. How can I help?';
      }
    } catch (e) {
      aiReply = lang === 'fr' ? 'Bonjour ! Je suis l assistant IA d ODM Tech Connect. Comment puis-je vous aider aujourd hui ?' : 'Hello! I am the ODM Tech Connect AI assistant. How can I help you today?';
    }
    await pool.query('INSERT INTO ai_conversations (user_id, session_id, role, content, language) VALUES ($1, $2, $3, $4, $5)', [userId, session, 'assistant', aiReply, lang]);
    return res.status(200).json({ reply: aiReply, sessionId: session });
  } catch (error) {
    return res.status(500).json({ error: 'L assistant IA est temporairement indisponible.' });
  }
});

router.get('/history/:sessionId', async (req, res) => {
  try {
    const result = await pool.query('SELECT role, content, created_at FROM ai_conversations WHERE session_id = $1 ORDER BY created_at ASC', [req.params.sessionId]);
    return res.status(200).json(result.rows);
  } catch (error) { return res.status(500).json({ error: 'Erreur.' }); }
});

export default router;

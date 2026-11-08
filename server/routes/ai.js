import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { pool } from '../postgres.js';

const router = express.Router();

const aiLimiter = rateLimit({ windowMs: 60000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });

const SYSTEM_PROMPTS = {
  fr: `Tu es ODM Assistant, une intelligence artificielle experte et experimentee integree a la plateforme ODM Tech Connect. Tu es specialisee dans:

1. CREATION DE SITES WEB: Tu peux guider pour creer des sites (HTML, CSS, JavaScript, React, Next.js), expliquer le code, donner des exemples.
2. COMMERCE INTERNATIONAL: Tu connais le commerce entre l Afrique et le monde, les importations, exportations, les douanes, la logistique.
3. ENTREPRENEURIAT: Tu aides a creer une entreprise, ecrire un business plan, trouver des partenaires, des financements.
4. TECHNOLOGIE: Tu maitrises le developpement web, le cloud, l IA, les bases de donnees, le deploiement.
5. MARKETING DIGITAL: SEO, reseaux sociaux, publicite en ligne, strategie de contenu.
6. FINANCES: Gestion budget, investissements, paiements internationaux, cryptomonnaies.
7. RESOLUTION DE PROBLEMES: Tu analyses les problemes methodiquement et proposes des solutions pratiques.

Quand on te demande du code, donne le code complet et explique chaque partie. Sois detaille, professionnel et pedagogue. Si tu ne sais pas, dis-le honnetement. Reponds toujours en francais sauf si on te parle en anglais.`,

  en: `You are ODM Assistant, an expert AI integrated into the ODM Tech Connect platform. You specialize in:

1. WEB DEVELOPMENT: Guide users to create websites (HTML, CSS, JavaScript, React, Next.js), explain code, give examples.
2. INTERNATIONAL TRADE: Africa-World trade, imports, exports, customs, logistics.
3. ENTREPRENEURSHIP: Help create businesses, write business plans, find partners and funding.
4. TECHNOLOGY: Web development, cloud, AI, databases, deployment.
5. DIGITAL MARKETING: SEO, social media, online advertising, content strategy.
6. FINANCE: Budget management, investments, international payments, crypto.
7. PROBLEM SOLVING: Analyze problems methodically and propose practical solutions.

When asked for code, provide complete code and explain each part. Be detailed, professional and educational. If you don't know, say so honestly. Always respond in English unless spoken to in French.`
};

router.post('/chat', aiLimiter, async (req, res) => {
  try {
    const { message, language = 'fr', sessionId, mode = 'general' } = req.body || {};
    if (!message || typeof message !== 'string' || message.trim().length === 0) return res.status(400).json({ error: 'Message vide.' });
    if (message.length > 4000) return res.status(400).json({ error: 'Message trop long (4000 caracteres max).' });
    const session = sessionId || 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const userId = req.session?.user?.id || null;
    const lang = language === 'en' ? 'en' : 'fr';

    await pool.query('INSERT INTO ai_conversations (user_id, session_id, role, content, language) VALUES ($1, $2, $3, $4, $5)', [userId, session, 'user', message.trim(), lang]);

    const historyResult = await pool.query('SELECT role, content FROM ai_conversations WHERE session_id = $1 ORDER BY created_at DESC LIMIT 20', [session]);
    const messages = [{ role: 'system', content: SYSTEM_PROMPTS[lang] }];
    historyResult.rows.reverse().forEach(m => messages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

    let aiReply;
    try {
      const aiResponse = await fetch('https://api.cloudflare.com/client/v4/accounts/' + (process.env.CF_ACCOUNT_ID || '') + '/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + (process.env.CF_AI_TOKEN || ''), 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, max_tokens: 1024, temperature: 0.7 })
      });

      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        aiReply = aiData.result?.response || (lang === 'fr' ? 'Desole, je n ai pas pu generer une reponse.' : 'Sorry, I could not generate a response.');
      } else {
        const fallbackRes = await fetch('https://api.cloudflare.com/client/v4/accounts/' + (process.env.CF_ACCOUNT_ID || '') + '/ai/run/@cf/meta/llama-3.1-8b-instruct', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + (process.env.CF_AI_TOKEN || ''), 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages, max_tokens: 1024 })
        });
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          aiReply = fallbackData.result?.response || getFallbackReply(lang);
        } else {
          aiReply = getFallbackReply(lang);
        }
      }
    } catch (e) {
      aiReply = getFallbackReply(lang);
    }

    await pool.query('INSERT INTO ai_conversations (user_id, session_id, role, content, language) VALUES ($1, $2, $3, $4, $5)', [userId, session, 'assistant', aiReply, lang]);
    return res.status(200).json({ reply: aiReply, sessionId: session });
  } catch (error) {
    return res.status(500).json({ error: 'L assistant IA est temporairement indisponible.' });
  }
});

function getFallbackReply(lang) {
  return lang === 'fr'
    ? 'Bonjour ! Je suis ODM Assistant, votre IA experte. Je peux vous aider a:\n\n1. Creer des sites web (HTML, CSS, JavaScript, React)\n2. Lancer une entreprise en Afrique\n3. Trouver des partenaires commerciaux\n4. Resoudre des problemes techniques\n5. Strategie marketing digital\n\nPosez-moi votre question et je vous reponds en detail !'
    : 'Hello! I am ODM Assistant, your expert AI. I can help you:\n\n1. Create websites (HTML, CSS, JavaScript, React)\n2. Start a business in Africa\n3. Find business partners\n4. Solve technical problems\n5. Digital marketing strategy\n\nAsk me your question and I will answer in detail!';
}

router.get('/history/:sessionId', async (req, res) => {
  try {
    const result = await pool.query('SELECT role, content, created_at FROM ai_conversations WHERE session_id = $1 ORDER BY created_at ASC', [req.params.sessionId]);
    return res.status(200).json(result.rows);
  } catch (error) { return res.status(500).json({ error: 'Erreur.' }); }
});

export default router;

import { pool } from './postgres.js';

export async function handleAutoReply() {
  try {
    const aiUser = await pool.query("SELECT id FROM users WHERE email = 'assistant@odm-tech-connect.com' LIMIT 1");
    if (aiUser.rows.length === 0) return;
    const aiUserId = aiUser.rows[0].id;

    const unanswered = await pool.query(
      `SELECT m.id, m.sender_id, m.receiver_id FROM messages m
       WHERE m.created_at < NOW() - INTERVAL '5 minutes'
         AND m.is_read = FALSE
         AND m.receiver_id != $1
         AND NOT EXISTS (
           SELECT 1 FROM messages m2
           WHERE m2.sender_id = m.receiver_id AND m2.receiver_id = m.sender_id AND m2.created_at > m.created_at
         ) LIMIT 10`,
      [aiUserId]
    );

    for (const msg of unanswered.rows) {
      const reply = "Bonjour ! Je suis ODM Assistant, l'IA d'ODM Tech Connect.\n\nLe fondateur Amadou Diallo n'est pas disponible actuellement, mais votre message a bien ete recu.\n\nJe peux vous aider en attendant. Posez-moi vos questions sur la creation de sites, le commerce international, les partenariats, et plus encore.\n\nAmadou Diallo vous repondra a son retour. Merci !\n\n- ODM Assistant IA";
      await pool.query('INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1, $2, $3)', [aiUserId, msg.sender_id, reply]);
      await pool.query("INSERT INTO notifications (user_id, type, title, content, link) VALUES ($1, 'message', 'IA a repondu', 'ODM Assistant a repondu en votre absence', '/messages.html')", [msg.receiver_id]);
    }
    console.log('Auto-reply: ' + unanswered.rows.length + ' messages');
  } catch (e) { console.error('Auto-reply error:', e.message); }
}

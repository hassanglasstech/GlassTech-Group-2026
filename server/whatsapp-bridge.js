/**
 * GlassTech WhatsApp Intelligence Bridge
 * 
 * Deploy on Railway (free tier) or Render:
 * 1. npm install
 * 2. node server.js
 * 3. Scan QR code with secondary phone
 * 4. Leave running — screen off is fine
 * 
 * ENV vars needed:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   WATCH_GROUPS        = comma-separated group names e.g. "GlassTech Market,Dealers Group"
 *   WATCH_DIRECT_FROM   = comma-separated numbers e.g. "923001234567,923211234567"
 *   INTELLIGENCE_FN_URL = your Supabase Edge Function URL
 *   INTELLIGENCE_FN_KEY = Supabase anon key
 */

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode  = require('qrcode-terminal');
const fetch   = require('node-fetch');
const fs      = require('fs');

const WATCH_GROUPS      = (process.env.WATCH_GROUPS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const WATCH_DIRECT_FROM = (process.env.WATCH_DIRECT_FROM || '').split(',').map(s => s.trim()).filter(Boolean);
const FN_URL            = process.env.INTELLIGENCE_FN_URL;
const FN_KEY            = process.env.INTELLIGENCE_FN_KEY;

console.log('[Bridge] Starting GlassTech WhatsApp Intelligence Bridge...');
console.log('[Bridge] Watching groups:', WATCH_GROUPS);
console.log('[Bridge] Watching direct from:', WATCH_DIRECT_FROM);

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'glasstech-bridge' }),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    headless: true,
  }
});

client.on('qr', (qr) => {
  console.log('\n[Bridge] Scan this QR with your secondary WhatsApp number:\n');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('[Bridge] ✅ WhatsApp connected — listening for messages');
});

client.on('disconnected', (reason) => {
  console.log('[Bridge] ❌ Disconnected:', reason);
  setTimeout(() => client.initialize(), 5000);
});

client.on('message', async (message) => {
  try {
    // Get chat info
    const chat    = await message.getChat();
    const contact = await message.getContact();

    const isGroup  = chat.isGroup;
    const groupName = isGroup ? chat.name.toLowerCase() : '';
    const senderNum = contact.number;
    const senderName = contact.pushname || contact.name || senderNum;

    // Filter: only process if in watch list
    const shouldProcess =
      (isGroup && WATCH_GROUPS.some(g => groupName.includes(g))) ||
      (!isGroup && WATCH_DIRECT_FROM.includes(senderNum));

    if (!shouldProcess) return;

    console.log(`[Bridge] Message from ${senderName} (${isGroup ? chat.name : 'direct'}): ${message.type}`);

    let rawMessage  = '';
    let mediaBase64 = null;
    let mediaType   = null;

    if (message.type === 'chat') {
      rawMessage = message.body;
    } else if (message.type === 'ptt' || message.type === 'audio') {
      // Voice note — download and send for transcription
      try {
        const media = await message.downloadMedia();
        mediaBase64 = media.data;
        mediaType   = media.mimetype;
        rawMessage  = '[Voice Note]';
      } catch (e) {
        console.warn('[Bridge] Could not download voice note:', e.message);
        rawMessage = '[Voice Note — download failed]';
      }
    } else if (message.type === 'image') {
      rawMessage = message.caption || '[Image]';
    } else {
      return; // Skip stickers, documents, etc.
    }

    // Send to intelligence function
    const payload = {
      sender:      senderNum,
      sender_name: senderName,
      group_id:    isGroup ? chat.id._serialized : null,
      group_name:  isGroup ? chat.name : null,
      message_type: message.type === 'ptt' ? 'voice' : message.type === 'image' ? 'image' : 'text',
      raw_message:  rawMessage,
      media_base64: mediaBase64,
      media_type:   mediaType,
      timestamp:    new Date().toISOString(),
    };

    if (FN_URL && FN_KEY) {
      const res = await fetch(FN_URL, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${FN_KEY}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      if (!res.ok) {
        console.error('[Bridge] Intelligence function error:', res.status);
      } else {
        const data = await res.json();
        console.log(`[Bridge] Processed: ${data.intent || 'unknown'} (${data.confidence || 0}%)`);
      }
    }

  } catch (err) {
    console.error('[Bridge] Error processing message:', err.message);
  }
});

client.initialize();

// Keep alive
process.on('SIGINT', async () => {
  console.log('[Bridge] Shutting down...');
  await client.destroy();
  process.exit(0);
});

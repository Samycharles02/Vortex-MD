import express from "express";
import { createServer as createViteServer } from "vite";
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage, downloadContentFromMessage } from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import os from 'os';
import yts from 'yt-search';
import axios from 'axios';
import ytdl from '@distube/ytdl-core';

const app = express();
app.use(express.json());

const PORT = 3000;

const startTime = Date.now();

// AI Tasks Queue
interface AITask {
    id: string;
    prompt: string;
    remoteJid: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
}
const aiTasks: AITask[] = [];

const commands = [
    // 1. General (10)
    { name: 'menu', emoji: '📜', module: 'General' },
    { name: 'info', emoji: 'ℹ️', module: 'General' },
    { name: 'ping', emoji: '🏓', module: 'General' },
    { name: 'owner', emoji: '👑', module: 'General' },
    { name: 'rules', emoji: '📋', module: 'General' },
    { name: 'help', emoji: '❓', module: 'General' },
    { name: 'creator', emoji: '👨‍💻', module: 'General' },
    { name: 'runtime', emoji: '⏳', module: 'General' },
    { name: 'speed', emoji: '⚡', module: 'General' },
    { name: 'donate', emoji: '☕', module: 'General' },

    // 2. Group Moderation (20)
    { name: 'kick', emoji: '👢', module: 'Moderation' },
    { name: 'add', emoji: '➕', module: 'Moderation' },
    { name: 'promote', emoji: '⭐', module: 'Moderation' },
    { name: 'demote', emoji: '⬇️', module: 'Moderation' },
    { name: 'mute', emoji: '🔇', module: 'Moderation' },
    { name: 'unmute', emoji: '🔊', module: 'Moderation' },
    { name: 'setname', emoji: '✏️', module: 'Moderation' },
    { name: 'setdesc', emoji: '📝', module: 'Moderation' },
    { name: 'link', emoji: '🔗', module: 'Moderation' },
    { name: 'revoke', emoji: '🔄', module: 'Moderation' },
    { name: 'tagall', emoji: '📢', module: 'Moderation' },
    { name: 'hidetag', emoji: '👻', module: 'Moderation' },
    { name: 'warn', emoji: '⚠️', module: 'Moderation' },
    { name: 'unwarn', emoji: '✅', module: 'Moderation' },
    { name: 'warnings', emoji: '📊', module: 'Moderation' },
    { name: 'del', emoji: '🗑️', module: 'Moderation' },
    { name: 'lock', emoji: '🔒', module: 'Moderation' },
    { name: 'unlock', emoji: '🔓', module: 'Moderation' },
    { name: 'setpp', emoji: '🖼️', module: 'Moderation' },
    { name: 'leave', emoji: '👋', module: 'Moderation' },

    // 3. Protection (20)
    { name: 'antilink', emoji: '🚫', module: 'Protection' },
    { name: 'antispam', emoji: '🛡️', module: 'Protection' },
    { name: 'antibot', emoji: '🤖', module: 'Protection' },
    { name: 'antifake', emoji: '🎭', module: 'Protection' },
    { name: 'antidelete', emoji: '👁️', module: 'Protection' },
    { name: 'antiviewonce', emoji: '📸', module: 'Protection' },
    { name: 'antitoxic', emoji: '🤬', module: 'Protection' },
    { name: 'autokick', emoji: '⚡', module: 'Protection' },
    { name: 'onlyadmin', emoji: '👑', module: 'Protection' },
    { name: 'antiforeign', emoji: '🌍', module: 'Protection' },
    { name: 'antipicture', emoji: '🖼️', module: 'Protection' },
    { name: 'antivideo', emoji: '🎥', module: 'Protection' },
    { name: 'antiaudio', emoji: '🎵', module: 'Protection' },
    { name: 'antidocument', emoji: '📄', module: 'Protection' },
    { name: 'anticall', emoji: '📞', module: 'Protection' },
    { name: 'antimention', emoji: '📢', module: 'Protection' },
    { name: 'antiforward', emoji: '➡️', module: 'Protection' },
    { name: 'anticontact', emoji: '👤', module: 'Protection' },
    { name: 'antilocation', emoji: '📍', module: 'Protection' },
    { name: 'antipoll', emoji: '📊', module: 'Protection' },

    // 4. Owner (15)
    { name: 'ban', emoji: '🔨', module: 'Owner' },
    { name: 'unban', emoji: '🕊️', module: 'Owner' },
    { name: 'broadcast', emoji: '📡', module: 'Owner' },
    { name: 'block', emoji: '🛑', module: 'Owner' },
    { name: 'unblock', emoji: '🟢', module: 'Owner' },
    { name: 'setprefix', emoji: '⌨️', module: 'Owner' },
    { name: 'setmode', emoji: '⚙️', module: 'Owner' },
    { name: 'restart', emoji: '🔄', module: 'Owner' },
    { name: 'join', emoji: '🚪', module: 'Owner' },
    { name: 'clear', emoji: '🧹', module: 'Owner' },
    { name: 'addprem', emoji: '💎', module: 'Owner' },
    { name: 'delprem', emoji: '🗑️', module: 'Owner' },
    { name: 'listprem', emoji: '📝', module: 'Owner' },
    { name: 'banchat', emoji: '🚫', module: 'Owner' },
    { name: 'unbanchat', emoji: '✅', module: 'Owner' },

    // 5. Tools (15)
    { name: 'sticker', emoji: '🖼️', module: 'Tools' },
    { name: 'toimg', emoji: '📷', module: 'Tools' },
    { name: 'tts', emoji: '🗣️', module: 'Tools' },
    { name: 'translate', emoji: '🌐', module: 'Tools' },
    { name: 'weather', emoji: '🌤️', module: 'Tools' },
    { name: 'calc', emoji: '🧮', module: 'Tools' },
    { name: 'qr', emoji: '🔳', module: 'Tools' },
    { name: 'shorturl', emoji: '🔗', module: 'Tools' },
    { name: 'base64', emoji: '🔐', module: 'Tools' },
    { name: 'password', emoji: '🔑', module: 'Tools' },
    { name: 'styletext', emoji: '🔤', module: 'Tools' },
    { name: 'readmore', emoji: '📖', module: 'Tools' },
    { name: 'math', emoji: '➗', module: 'Tools' },
    { name: 'timer', emoji: '⏱️', module: 'Tools' },
    { name: 'reminder', emoji: '⏰', module: 'Tools' },

    // 6. Fun (10)
    { name: 'joke', emoji: '😂', module: 'Fun' },
    { name: 'meme', emoji: '🤣', module: 'Fun' },
    { name: 'truth', emoji: '🤫', module: 'Fun' },
    { name: 'dare', emoji: '😈', module: 'Fun' },
    { name: 'flipcoin', emoji: '🪙', module: 'Fun' },
    { name: 'roll', emoji: '🎲', module: 'Fun' },
    { name: '8ball', emoji: '🎱', module: 'Fun' },
    { name: 'ship', emoji: '❤️', module: 'Fun' },
    { name: 'rate', emoji: '⭐', module: 'Fun' },
    { name: 'hack', emoji: '💻', module: 'Fun' },

    // 7. Downloads (10)
    { name: 'play', emoji: '🎵', module: 'Downloads' },
    { name: 'ytmp3', emoji: '🎧', module: 'Downloads' },
    { name: 'ytmp4', emoji: '🎬', module: 'Downloads' },
    { name: 'ig', emoji: '📸', module: 'Downloads' },
    { name: 'fb', emoji: '📘', module: 'Downloads' },
    { name: 'tiktok', emoji: '🎵', module: 'Downloads' },
    { name: 'twitter', emoji: '🐦', module: 'Downloads' },
    { name: 'spotify', emoji: '🎧', module: 'Downloads' },
    { name: 'pinterest', emoji: '📌', module: 'Downloads' },
    { name: 'gitclone', emoji: '🐙', module: 'Downloads' },

    // 8. Search (10)
    { name: 'google', emoji: '🔍', module: 'Search' },
    { name: 'wiki', emoji: '📚', module: 'Search' },
    { name: 'github', emoji: '🐙', module: 'Search' },
    { name: 'npm', emoji: '📦', module: 'Search' },
    { name: 'lyrics', emoji: '🎤', module: 'Search' },
    { name: 'imdb', emoji: '🎬', module: 'Search' },
    { name: 'weather', emoji: '🌤️', module: 'Search' },
    { name: 'define', emoji: '📖', module: 'Search' },
    { name: 'anime', emoji: '🌸', module: 'Search' },
    { name: 'manga', emoji: '📚', module: 'Search' },

    // 9. AI (5)
    { name: 'ai', emoji: '🧠', module: 'AI' },
    { name: 'imagine', emoji: '🎨', module: 'AI' },
    { name: 'gpt', emoji: '💬', module: 'AI' },
    { name: 'dalle', emoji: '🖼️', module: 'AI' },
    { name: 'gemini', emoji: '✨', module: 'AI' },

    // 10. Media & Status (10)
    { name: 'vv', emoji: '👁️', module: 'Media' },
    { name: 'status', emoji: '📥', module: 'Media' },
    { name: 'getstatus', emoji: '📲', module: 'Media' },
    { name: 'save', emoji: '💾', module: 'Media' },
    { name: 'forward', emoji: '➡️', module: 'Media' },
    { name: 'quote', emoji: '💬', module: 'Media' },
    { name: 'take', emoji: 'steal', module: 'Media' },
    { name: 'wm', emoji: '©️', module: 'Media' },
    { name: 'exif', emoji: '📸', module: 'Media' },
    { name: 'tourl', emoji: '🔗', module: 'Media' },

    // 11. Advanced Moderation (20)
    { name: 'warn1', emoji: '1️⃣', module: 'Advanced Mod' },
    { name: 'warn2', emoji: '2️⃣', module: 'Advanced Mod' },
    { name: 'warn3', emoji: '3️⃣', module: 'Advanced Mod' },
    { name: 'resetwarns', emoji: '🔄', module: 'Advanced Mod' },
    { name: 'kickall', emoji: '👢', module: 'Advanced Mod' },
    { name: 'banall', emoji: '🔨', module: 'Advanced Mod' },
    { name: 'muteall', emoji: '🔇', module: 'Advanced Mod' },
    { name: 'unmuteall', emoji: '🔊', module: 'Advanced Mod' },
    { name: 'lockall', emoji: '🔒', module: 'Advanced Mod' },
    { name: 'unlockall', emoji: '🔓', module: 'Advanced Mod' },
    { name: 'setrules', emoji: '📋', module: 'Advanced Mod' },
    { name: 'delrules', emoji: '🗑️', module: 'Advanced Mod' },
    { name: 'setwelcome', emoji: '👋', module: 'Advanced Mod' },
    { name: 'delwelcome', emoji: '🗑️', module: 'Advanced Mod' },
    { name: 'setgoodbye', emoji: '👋', module: 'Advanced Mod' },
    { name: 'delgoodbye', emoji: '🗑️', module: 'Advanced Mod' },
    { name: 'setpromote', emoji: '⭐', module: 'Advanced Mod' },
    { name: 'delpromote', emoji: '🗑️', module: 'Advanced Mod' },
    { name: 'setdemote', emoji: '⬇️', module: 'Advanced Mod' },
    { name: 'deldemote', emoji: '🗑️', module: 'Advanced Mod' },

    // 12. Economy & RPG (20)
    { name: 'balance', emoji: '💰', module: 'Economy' },
    { name: 'bank', emoji: '🏦', module: 'Economy' },
    { name: 'deposit', emoji: '📥', module: 'Economy' },
    { name: 'withdraw', emoji: '📤', module: 'Economy' },
    { name: 'transfer', emoji: '💸', module: 'Economy' },
    { name: 'daily', emoji: '📅', module: 'Economy' },
    { name: 'weekly', emoji: '📆', module: 'Economy' },
    { name: 'monthly', emoji: '🗓️', module: 'Economy' },
    { name: 'work', emoji: '💼', module: 'Economy' },
    { name: 'mine', emoji: '⛏️', module: 'Economy' },
    { name: 'fish', emoji: '🎣', module: 'Economy' },
    { name: 'hunt', emoji: '🏹', module: 'Economy' },
    { name: 'rob', emoji: '🦹', module: 'Economy' },
    { name: 'gamble', emoji: '🎲', module: 'Economy' },
    { name: 'slots', emoji: '🎰', module: 'Economy' },
    { name: 'roulette', emoji: '🎡', module: 'Economy' },
    { name: 'inventory', emoji: '🎒', module: 'Economy' },
    { name: 'shop', emoji: '🛒', module: 'Economy' },
    { name: 'buy', emoji: '🛍️', module: 'Economy' },
    { name: 'sell', emoji: '💰', module: 'Economy' },

    // 13. Games (15)
    { name: 'tictactoe', emoji: '❌', module: 'Games' },
    { name: 'delttt', emoji: '🗑️', module: 'Games' },
    { name: 'guessword', emoji: '🔠', module: 'Games' },
    { name: 'guessnumber', emoji: '🔢', module: 'Games' },
    { name: 'mathgame', emoji: '➗', module: 'Games' },
    { name: 'trivia', emoji: '🧠', module: 'Games' },
    { name: 'hangman', emoji: '🪢', module: 'Games' },
    { name: 'wordchain', emoji: '🔗', module: 'Games' },
    { name: 'rps', emoji: '✊', module: 'Games' },
    { name: 'connect4', emoji: '🔴', module: 'Games' },
    { name: 'chess', emoji: '♟️', module: 'Games' },
    { name: 'checkers', emoji: '🏁', module: 'Games' },
    { name: 'uno', emoji: '🃏', module: 'Games' },
    { name: 'poker', emoji: '🃏', module: 'Games' },
    { name: 'blackjack', emoji: '🃏', module: 'Games' },

    // 14. Utility (15)
    { name: 'afk', emoji: '💤', module: 'Utility' },
    { name: 'unafk', emoji: '🔔', module: 'Utility' },
    { name: 'report', emoji: '🚩', module: 'Utility' },
    { name: 'suggest', emoji: '💡', module: 'Utility' },
    { name: 'bug', emoji: '🐛', module: 'Utility' },
    { name: 'feedback', emoji: '📝', module: 'Utility' },
    { name: 'poll', emoji: '📊', module: 'Utility' },
    { name: 'vote', emoji: '🗳️', module: 'Utility' },
    { name: 'endpoll', emoji: '🛑', module: 'Utility' },
    { name: 'calculate', emoji: '🧮', module: 'Utility' },
    { name: 'convert', emoji: '🔄', module: 'Utility' },
    { name: 'timezone', emoji: '🌍', module: 'Utility' },
    { name: 'currency', emoji: '💱', module: 'Utility' },
    { name: 'crypto', emoji: '🪙', module: 'Utility' },
    { name: 'stocks', emoji: '📈', module: 'Utility' },

    // 15. System (10)
    { name: 'sysinfo', emoji: '💻', module: 'System' },
    { name: 'cpu', emoji: '🧠', module: 'System' },
    { name: 'ram', emoji: '💾', module: 'System' },
    { name: 'disk', emoji: '💿', module: 'System' },
    { name: 'network', emoji: '🌐', module: 'System' },
    { name: 'os', emoji: '🖥️', module: 'System' },
    { name: 'uptime', emoji: '⏳', module: 'System' },
    { name: 'logs', emoji: '📜', module: 'System' },
    { name: 'clearlogs', emoji: '🧹', module: 'System' },
    { name: 'update', emoji: '🔄', module: 'System' },

    // 16. Developer (10)
    { name: 'eval', emoji: '💻', module: 'Developer' },
    { name: 'exec', emoji: '⚙️', module: 'Developer' },
    { name: 'shell', emoji: '🐚', module: 'Developer' },
    { name: 'db', emoji: '🗄️', module: 'Developer' },
    { name: 'query', emoji: '🔍', module: 'Developer' },
    { name: 'backup', emoji: '💾', module: 'Developer' },
    { name: 'restore', emoji: '🔄', module: 'Developer' },
    { name: 'test', emoji: '🧪', module: 'Developer' },
    { name: 'debug', emoji: '🐛', module: 'Developer' },
    { name: 'reload', emoji: '🔄', module: 'Developer' },

    // 17. Anime & Manga (15)
    { name: 'waifu', emoji: '🌸', module: 'Anime' },
    { name: 'neko', emoji: '🐱', module: 'Anime' },
    { name: 'husbando', emoji: '🤵', module: 'Anime' },
    { name: 'kitsune', emoji: '🦊', module: 'Anime' },
    { name: 'hug', emoji: '🫂', module: 'Anime' },
    { name: 'kiss', emoji: '💋', module: 'Anime' },
    { name: 'pat', emoji: '✋', module: 'Anime' },
    { name: 'slap', emoji: '👋', module: 'Anime' },
    { name: 'cuddle', emoji: '🤗', module: 'Anime' },
    { name: 'cry', emoji: '😢', module: 'Anime' },
    { name: 'smug', emoji: '😏', module: 'Anime' },
    { name: 'bonk', emoji: '🔨', module: 'Anime' },
    { name: 'yeet', emoji: '🚀', module: 'Anime' },
    { name: 'blush', emoji: '😳', module: 'Anime' },
    { name: 'smile', emoji: '😊', module: 'Anime' },
];

declare global {
    var spamTracker: { [key: string]: number[] };
}

function formatUptime(uptimeMs: number) {
    const seconds = Math.floor((uptimeMs / 1000) % 60);
    const minutes = Math.floor((uptimeMs / (1000 * 60)) % 60);
    const hours = Math.floor((uptimeMs / (1000 * 60 * 60)) % 24);
    const days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);

    return parts.join(' ') || '0s';
}

function generateMenu(username: string, config: any) {
    const uptime = formatUptime(Date.now() - startTime);
    const status = config.mode === 'public' ? 'Public' : 'Private';
    
    let menuText = `╭── ❀ VORTEX-MD ❀──╮
│ 🤵 User: ${username}
│ 🤖 Bot: Vortex-MD
│ 🛠 Status: ${status}
│ 🕝 Uptime: ${uptime}
│ 👑 Owner: Samy Charles
╰────────────────╯\n\n`;

    const modules: { [key: string]: typeof commands } = {};
    for (const cmd of commands) {
        if (!modules[cmd.module]) modules[cmd.module] = [];
        modules[cmd.module].push(cmd);
    }

    for (const [moduleName, cmds] of Object.entries(modules)) {
        menuText += `╭─ ◈ ${moduleName} ◈ ─╮\n`;
        for (const cmd of cmds) {
            menuText += `│ ${cmd.emoji} ${config.prefix}${cmd.name}\n`;
        }
        menuText += `╰────────────────╯\n\n`;
    }

    return menuText.trim();
}

let sock: any = null;
let connectionState = 'disconnected'; // 'disconnected', 'connecting', 'connected'

const configPath = path.join(process.cwd(), 'bot-config.json');
function getConfig() {
  if (fs.existsSync(configPath)) {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const arrays = ['antilink', 'antispam', 'antibot', 'antifake', 'antidelete', 'antiviewonce', 'autokick', 'onlyadmin', 'antimention', 'antitoxic', 'antiforward', 'antipicture', 'antivideo', 'antiaudio', 'antidocument', 'anticontact', 'antilocation', 'antipoll'];
    arrays.forEach(arr => {
        if (!cfg[arr]) cfg[arr] = [];
    });
    return cfg;
  }
  return { prefix: '.', mode: 'public', antilink: [], antispam: [], antibot: [], antifake: [], antidelete: [], antiviewonce: [], autokick: [], onlyadmin: [], antimention: [], antitoxic: [], antiforward: [], antipicture: [], antivideo: [], antiaudio: [], antidocument: [], anticontact: [], antilocation: [], antipoll: [] };
}

function saveConfig(config: any) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

let isReconnecting = false;
let reconnectInterval: NodeJS.Timeout | null = null;

async function startBot(phoneNumber?: string): Promise<string | null> {
    if (connectionState === 'connecting') return null;
    connectionState = 'connecting';

    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }) as any,
        printQRInTerminal: false,
        auth: state,
        browser: ['Ubuntu', 'Chrome', '20.0.0'],
        generateHighQualityLinkPreview: true,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            connectionState = 'disconnected';
            const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                isReconnecting = true;
                setTimeout(() => startBot(), 3000); // Wait 3s before reconnecting
            } else {
                fs.rmSync('baileys_auth_info', { recursive: true, force: true });
            }
        } else if (connection === 'open') {
            connectionState = 'connected';
            console.log('Connected to WhatsApp!');
            try {
                const id = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                if (isReconnecting) {
                    await sock.sendMessage(id, { text: '⚠️ Vortex-MD detected a disconnection.\nAttempting to reconnect to stay active...' });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    await sock.sendMessage(id, { text: '✅ Vortex-MD successfully reconnected and is now active.' });
                    isReconnecting = false;
                } else {
                    await sock.sendMessage(id, { text: '✅ Vortex-MD is now successfully connected to your WhatsApp account.' });
                }
            } catch (err) {
                console.error('Failed to send welcome message:', err);
            }
        }
    });

    if (!reconnectInterval) {
        reconnectInterval = setInterval(() => {
            if (connectionState === 'disconnected') {
                console.log('5-minute check: Bot is disconnected. Attempting to reconnect...');
                isReconnecting = true;
                startBot();
            }
        }, 5 * 60 * 1000); // 5 minutes
    }

    sock.ev.on('messages.upsert', async (m: any) => {
        let msg = m.messages[0];
        if (!msg.message) return;

        // Unwrap message
        if (msg.message.ephemeralMessage) {
            msg.message = msg.message.ephemeralMessage.message;
        } else if (msg.message.viewOnceMessage) {
            msg.message = msg.message.viewOnceMessage.message;
        } else if (msg.message.viewOnceMessageV2) {
            msg.message = msg.message.viewOnceMessageV2.message;
        } else if (msg.message.viewOnceMessageV2Extension) {
            msg.message = msg.message.viewOnceMessageV2Extension.message;
        } else if (msg.message.documentWithCaptionMessage) {
            msg.message = msg.message.documentWithCaptionMessage.message;
        }

        const config = getConfig();
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || '';
        
        const isFromMe = msg.key.fromMe;
        
        // Auto-react to statuses
        if (msg.key.remoteJid === 'status@broadcast' && !isFromMe) {
            try {
                await sock.sendMessage(msg.key.remoteJid, { react: { text: '🗽', key: msg.key } });
            } catch (err) {
                console.error('Failed to auto-react to status:', err);
            }
            return; // Don't process commands on statuses
        }

        if (config.mode === 'private' && !isFromMe) {
            return;
        }

        const isGroup = msg.key.remoteJid?.endsWith('@g.us');
        const sender = msg.key.participant || msg.key.remoteJid;
        
        // --- SECURITY INTERCEPTORS ---
        if (isGroup && !isFromMe) {
            try {
                const groupMetadata = await sock.groupMetadata(msg.key.remoteJid);
                const isAdmin = groupMetadata.participants.find((p: any) => p.id === sender)?.admin;
                const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                const isBotAdmin = groupMetadata.participants.find((p: any) => p.id === botId)?.admin;

                if (isBotAdmin && !isAdmin) {
                    // 0. Anti Spam
                    if (config.antispam?.includes(msg.key.remoteJid)) {
                        const now = Date.now();
                        if (!global.spamTracker) global.spamTracker = {};
                        if (!global.spamTracker[sender]) global.spamTracker[sender] = [];
                        global.spamTracker[sender].push(now);
                        global.spamTracker[sender] = global.spamTracker[sender].filter((t: number) => now - t < 10000); // messages in last 10 seconds
                        
                        if (global.spamTracker[sender].length > 5) { // 5 messages in 10 seconds
                            await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
                            await sock.groupParticipantsUpdate(msg.key.remoteJid, [sender], 'remove');
                            await sock.sendMessage(msg.key.remoteJid, { text: `⚠️ @${sender.split('@')[0]} was kicked for spamming!`, mentions: [sender] });
                            return;
                        }
                    }

                    // 1. Only Admin
                    if (config.onlyadmin?.includes(msg.key.remoteJid)) {
                        await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
                        return;
                    }

                    // 2. Anti Link & Auto Kick
                    if (config.antilink?.includes(msg.key.remoteJid)) {
                        const urlRegex = /(https?:\/\/[^\s]+)/g;
                        const waMeRegex = /(wa\.me\/[^\s]+)/g;
                        if (text.match(urlRegex) || text.match(waMeRegex)) {
                            await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
                            if (config.autokick?.includes(msg.key.remoteJid)) {
                                await sock.groupParticipantsUpdate(msg.key.remoteJid, [sender], 'remove');
                                await sock.sendMessage(msg.key.remoteJid, { text: `⚠️ @${sender.split('@')[0]} was kicked for sending links!`, mentions: [sender] });
                            } else {
                                await sock.sendMessage(msg.key.remoteJid, { text: `⚠️ @${sender.split('@')[0]}, links are not allowed in this group!`, mentions: [sender] });
                            }
                            return;
                        }
                    }

                    // 3. Anti Mention (Delete if they tag anyone or @all)
                    const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
                    if (config.antimention?.includes(msg.key.remoteJid) && (mentionedJid.length > 0 || text.includes('@all') || text.includes('@everyone'))) {
                        await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
                        await sock.sendMessage(msg.key.remoteJid, { text: `⚠️ @${sender.split('@')[0]}, mentions are disabled in this group!`, mentions: [sender] });
                        return;
                    }

                    // 4. Anti Bot (Kick if ID looks like a bot)
                    if (config.antibot?.includes(msg.key.remoteJid) && (msg.key.id.startsWith('BAE5') || msg.key.id.length === 22 || msg.key.id.length > 30)) {
                        await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
                        await sock.groupParticipantsUpdate(msg.key.remoteJid, [sender], 'remove');
                        return;
                    }

                    // 5. Anti Fake (Kick virtual/foreign numbers)
                    if (config.antifake?.includes(msg.key.remoteJid)) {
                        const fakePrefixes = ['1', '44', '48', '7', '92', '212', '94'];
                        const senderPrefix = sender.split('@')[0].substring(0, 2);
                        const senderPrefix1 = sender.split('@')[0].substring(0, 1);
                        if (fakePrefixes.includes(senderPrefix) || fakePrefixes.includes(senderPrefix1)) {
                            await sock.groupParticipantsUpdate(msg.key.remoteJid, [sender], 'remove');
                            return;
                        }
                    }

                    // 6. Anti Forward
                    if (config.antiforward?.includes(msg.key.remoteJid) && msg.message?.extendedTextMessage?.contextInfo?.isForwarded) {
                        await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
                        return;
                    }

                    // 7. Anti Media/Types
                    const msgType = Object.keys(msg.message)[0];
                    if (config.antipicture?.includes(msg.key.remoteJid) && msgType === 'imageMessage') { await sock.sendMessage(msg.key.remoteJid, { delete: msg.key }); return; }
                    if (config.antivideo?.includes(msg.key.remoteJid) && msgType === 'videoMessage') { await sock.sendMessage(msg.key.remoteJid, { delete: msg.key }); return; }
                    if (config.antiaudio?.includes(msg.key.remoteJid) && msgType === 'audioMessage') { await sock.sendMessage(msg.key.remoteJid, { delete: msg.key }); return; }
                    if (config.antidocument?.includes(msg.key.remoteJid) && msgType === 'documentMessage') { await sock.sendMessage(msg.key.remoteJid, { delete: msg.key }); return; }
                    if (config.anticontact?.includes(msg.key.remoteJid) && msgType === 'contactMessage') { await sock.sendMessage(msg.key.remoteJid, { delete: msg.key }); return; }
                    if (config.antilocation?.includes(msg.key.remoteJid) && msgType === 'locationMessage') { await sock.sendMessage(msg.key.remoteJid, { delete: msg.key }); return; }
                    if (config.antipoll?.includes(msg.key.remoteJid) && msgType === 'pollCreationMessage') { await sock.sendMessage(msg.key.remoteJid, { delete: msg.key }); return; }
                }
            } catch (err) {
                console.error('Security interceptor error:', err);
            }
        }
        // --- END SECURITY INTERCEPTORS ---

        if (text.startsWith(config.prefix)) {
            const args = text.slice(config.prefix.length).trim().split(/ +/);
            const cmd = args.shift()?.toLowerCase();
            const username = msg.pushName || 'User';
            const isGroup = msg.key.remoteJid?.endsWith('@g.us');
            
            const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.participant;
            if (quotedMessage && !mentionedJid.includes(quotedMessage)) {
                mentionedJid.push(quotedMessage);
            }

            if (cmd === 'ping' || cmd === 'speed') {
                await sock.sendMessage(msg.key.remoteJid, { text: 'Pong! 🏓 Vortex-MD is active.' });
            } else if (cmd === 'menu' || cmd === 'help') {
                await sock.sendMessage(msg.key.remoteJid, { react: { text: '🧑‍🔬', key: msg.key } });
                const menuText = generateMenu(username, config);
                await sock.sendMessage(msg.key.remoteJid, { 
                    image: { url: 'https://lieixmgdboiceopzksvu.supabase.co/storage/v1/object/public/hosted-files/dplxl579-1773170410582.jpg' },
                    caption: menuText,
                    contextInfo: {
                        forwardingScore: 999,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: '120363293401402096@newsletter', // Ensure this is your actual channel JID
                            newsletterName: 'VORTEX-MD CHANNEL',
                            serverMessageId: 100
                        },
                        externalAdReply: {
                            title: "VORTEX-MD CHANNEL",
                            body: "Rejoins notre chaîne officielle",
                            thumbnailUrl: "https://lieixmgdboiceopzksvu.supabase.co/storage/v1/object/public/hosted-files/dplxl579-1773170410582.jpg",
                            sourceUrl: "https://whatsapp.com/channel/0029Vb7AruX8fewz8dSRD340/100",
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                });
            } else if (cmd === 'info') {
                await sock.sendMessage(msg.key.remoteJid, { text: 'Vortex-MD is a WhatsApp bot created by Samy Charles.' });
            } else if (['antilink', 'antispam', 'antibot', 'antifake', 'antidelete', 'antiviewonce', 'autokick', 'onlyadmin', 'antimention', 'antitoxic', 'antiforward', 'antipicture', 'antivideo', 'antiaudio', 'antidocument', 'anticontact', 'antilocation', 'antipoll'].includes(cmd || '')) {
                if (!isGroup) return await sock.sendMessage(msg.key.remoteJid, { text: 'This command can only be used in groups.' });
                
                try {
                    const groupMetadata = await sock.groupMetadata(msg.key.remoteJid);
                    const isAdmin = groupMetadata.participants.find((p: any) => p.id === msg.key.participant)?.admin;
                    
                    if (!isAdmin && !isFromMe) {
                        return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Only group admins can use this command.' });
                    }

                    if (!config[cmd]) config[cmd] = [];
                    const index = config[cmd].indexOf(msg.key.remoteJid);
                    
                    if (index === -1) {
                        config[cmd].push(msg.key.remoteJid);
                        saveConfig(config);
                        await sock.sendMessage(msg.key.remoteJid, { text: `✅ *${cmd.toUpperCase()}* has been enabled for this group.` });
                    } else {
                        config[cmd].splice(index, 1);
                        saveConfig(config);
                        await sock.sendMessage(msg.key.remoteJid, { text: `❌ *${cmd.toUpperCase()}* has been disabled for this group.` });
                    }
                } catch (err) {
                    await sock.sendMessage(msg.key.remoteJid, { text: `❌ Failed to toggle ${cmd}. Make sure the bot is an admin.` });
                }
            } else if (cmd === 'kick') {
                if (!isGroup) return await sock.sendMessage(msg.key.remoteJid, { text: 'This command can only be used in groups.' });
                if (mentionedJid.length === 0) return await sock.sendMessage(msg.key.remoteJid, { text: 'Please mention or reply to a user to kick.' });
                try {
                    await sock.groupParticipantsUpdate(msg.key.remoteJid, mentionedJid, 'remove');
                    await sock.sendMessage(msg.key.remoteJid, { text: '✅ User(s) kicked successfully.' });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to kick user. Make sure the bot is an admin.' });
                }
            } else if (cmd === 'promote') {
                if (!isGroup) return await sock.sendMessage(msg.key.remoteJid, { text: 'This command can only be used in groups.' });
                if (mentionedJid.length === 0) return await sock.sendMessage(msg.key.remoteJid, { text: 'Please mention or reply to a user to promote.' });
                try {
                    await sock.groupParticipantsUpdate(msg.key.remoteJid, mentionedJid, 'promote');
                    await sock.sendMessage(msg.key.remoteJid, { text: '✅ User(s) promoted to admin.' });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to promote user. Make sure the bot is an admin.' });
                }
            } else if (cmd === 'demote') {
                if (!isGroup) return await sock.sendMessage(msg.key.remoteJid, { text: 'This command can only be used in groups.' });
                if (mentionedJid.length === 0) return await sock.sendMessage(msg.key.remoteJid, { text: 'Please mention or reply to a user to demote.' });
                try {
                    await sock.groupParticipantsUpdate(msg.key.remoteJid, mentionedJid, 'demote');
                    await sock.sendMessage(msg.key.remoteJid, { text: '✅ User(s) demoted to regular member.' });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to demote user. Make sure the bot is an admin.' });
                }
            } else if (cmd === 'mute') {
                if (!isGroup) return await sock.sendMessage(msg.key.remoteJid, { text: 'This command can only be used in groups.' });
                try {
                    await sock.groupSettingUpdate(msg.key.remoteJid, 'announcement');
                    await sock.sendMessage(msg.key.remoteJid, { text: '🔇 Group has been muted. Only admins can send messages.' });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to mute group. Make sure the bot is an admin.' });
                }
            } else if (cmd === 'unmute') {
                if (!isGroup) return await sock.sendMessage(msg.key.remoteJid, { text: 'This command can only be used in groups.' });
                try {
                    await sock.groupSettingUpdate(msg.key.remoteJid, 'not_announcement');
                    await sock.sendMessage(msg.key.remoteJid, { text: '🔊 Group has been unmuted. All participants can send messages.' });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to unmute group. Make sure the bot is an admin.' });
                }
            } else if (cmd === 'link') {
                if (!isGroup) return await sock.sendMessage(msg.key.remoteJid, { text: 'This command can only be used in groups.' });
                try {
                    const code = await sock.groupInviteCode(msg.key.remoteJid);
                    await sock.sendMessage(msg.key.remoteJid, { text: `🔗 Group Link:\nhttps://chat.whatsapp.com/${code}` });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to get link. Make sure the bot is an admin.' });
                }
            } else if (cmd === 'revoke') {
                if (!isGroup) return await sock.sendMessage(msg.key.remoteJid, { text: 'This command can only be used in groups.' });
                try {
                    await sock.groupRevokeInvite(msg.key.remoteJid);
                    await sock.sendMessage(msg.key.remoteJid, { text: '🔄 Group link has been successfully revoked and reset.' });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to revoke link. Make sure the bot is an admin.' });
                }
            } else if (cmd === 'tagall') {
                if (!isGroup) return await sock.sendMessage(msg.key.remoteJid, { text: 'This command can only be used in groups.' });
                try {
                    const groupMetadata = await sock.groupMetadata(msg.key.remoteJid);
                    const participants = groupMetadata.participants;
                    let responseText = `📢 *TAG ALL*\n\n`;
                    if (args.length > 0) responseText += `Message: ${args.join(' ')}\n\n`;
                    for (let mem of participants) {
                        responseText += `▫️ @${mem.id.split('@')[0]}\n`;
                    }
                    await sock.sendMessage(msg.key.remoteJid, { text: responseText, mentions: participants.map((a: any) => a.id) });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to tag all.' });
                }
            } else if (cmd === 'hidetag') {
                if (!isGroup) return await sock.sendMessage(msg.key.remoteJid, { text: 'This command can only be used in groups.' });
                try {
                    const groupMetadata = await sock.groupMetadata(msg.key.remoteJid);
                    const participants = groupMetadata.participants.map((a: any) => a.id);
                    const responseText = args.join(' ') || 'Attention!';
                    await sock.sendMessage(msg.key.remoteJid, { text: responseText, mentions: participants });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to hidetag.' });
                }
            } else if (cmd === 'vv') {
                try {
                    const contextInfo = msg.message?.extendedTextMessage?.contextInfo || msg.message?.imageMessage?.contextInfo || msg.message?.videoMessage?.contextInfo;
                    const quotedMsg = contextInfo?.quotedMessage;
                    if (!quotedMsg) {
                        await sock.sendMessage(msg.key.remoteJid, { text: '❌ Please reply to a View Once message with !vv' });
                        return;
                    }

                    let mediaMsg = quotedMsg.viewOnceMessage?.message || quotedMsg.viewOnceMessageV2?.message || quotedMsg.viewOnceMessageV2Extension?.message;
                    if (!mediaMsg) {
                        if (quotedMsg.imageMessage?.viewOnce || quotedMsg.videoMessage?.viewOnce || quotedMsg.audioMessage?.viewOnce) {
                            mediaMsg = quotedMsg;
                        }
                    }

                    if (!mediaMsg) {
                        await sock.sendMessage(msg.key.remoteJid, { text: '❌ The replied message is not a View Once message.' });
                        return;
                    }

                    const mediaType = Object.keys(mediaMsg).find(k => ['imageMessage', 'videoMessage', 'audioMessage'].includes(k));
                    if (!mediaType) {
                        await sock.sendMessage(msg.key.remoteJid, { text: '❌ No supported media found in the View Once message.' });
                        return;
                    }

                    const media = mediaMsg[mediaType];
                    const stream = await downloadContentFromMessage(media, mediaType.replace('Message', '') as any);
                    let buffer = Buffer.from([]);
                    for await(const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }

                    const caption = media.caption ? `\n\n📝 Caption: ${media.caption}` : '';
                    const text = `👁️ *VIEW ONCE REVEALED* 👁️${caption}`;

                    if (mediaType === 'imageMessage') {
                        await sock.sendMessage(msg.key.remoteJid, { image: buffer, caption: text });
                    } else if (mediaType === 'videoMessage') {
                        await sock.sendMessage(msg.key.remoteJid, { video: buffer, caption: text });
                    } else if (mediaType === 'audioMessage') {
                        await sock.sendMessage(msg.key.remoteJid, { audio: buffer, mimetype: 'audio/mp4', ptt: true });
                    }
                } catch (e) {
                    console.error('Error in vv:', e);
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to download the View Once media. It might have expired or the bot lacks access.' });
                }
            } else if (cmd === 'status' || cmd === 'getstatus' || cmd === 'save') {
                try {
                    const contextInfo = msg.message?.extendedTextMessage?.contextInfo || msg.message?.imageMessage?.contextInfo || msg.message?.videoMessage?.contextInfo;
                    const quotedMsg = contextInfo?.quotedMessage;
                    if (!quotedMsg) {
                        await sock.sendMessage(msg.key.remoteJid, { text: '❌ Please reply to a status/story to download it.' });
                        return;
                    }

                    const mediaType = Object.keys(quotedMsg).find(k => ['imageMessage', 'videoMessage', 'audioMessage', 'extendedTextMessage', 'conversation'].includes(k));
                    
                    if (mediaType === 'extendedTextMessage' || mediaType === 'conversation') {
                        const text = quotedMsg.extendedTextMessage?.text || quotedMsg.conversation;
                        await sock.sendMessage(msg.key.remoteJid, { text: `📝 *Status Text:*\n\n${text}` });
                        return;
                    }

                    if (!mediaType || !['imageMessage', 'videoMessage', 'audioMessage'].includes(mediaType)) {
                        await sock.sendMessage(msg.key.remoteJid, { text: '❌ The replied status does not contain supported media.' });
                        return;
                    }

                    const media = quotedMsg[mediaType];
                    const stream = await downloadContentFromMessage(media, mediaType.replace('Message', '') as any);
                    let buffer = Buffer.from([]);
                    for await(const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }

                    const caption = media.caption || '';
                    
                    if (mediaType === 'imageMessage') {
                        await sock.sendMessage(msg.key.remoteJid, { image: buffer, caption: caption });
                    } else if (mediaType === 'videoMessage') {
                        await sock.sendMessage(msg.key.remoteJid, { video: buffer, caption: caption });
                    } else if (mediaType === 'audioMessage') {
                        await sock.sendMessage(msg.key.remoteJid, { audio: buffer, mimetype: 'audio/mp4' });
                    }
                } catch (e) {
                    console.error('Error in status:', e);
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to download the status media. It might have expired.' });
                }
            } else if (cmd === 'getchannelid') {
                const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
                if (contextInfo?.forwardedNewsletterMessageInfo) {
                    const jid = contextInfo.forwardedNewsletterMessageInfo.newsletterJid;
                    const name = contextInfo.forwardedNewsletterMessageInfo.newsletterName;
                    await sock.sendMessage(msg.key.remoteJid, { text: `📢 *Channel Info*\n\n*Name:* ${name}\n*JID:* ${jid}\n\nReplace the 'newsletterJid' in the !menu command with this JID.` });
                } else {
                    await sock.sendMessage(msg.key.remoteJid, { text: `❌ Please reply to a message forwarded from a channel with !getchannelid` });
                }
            } else if (cmd === 'owner' || cmd === 'creator') {
                await sock.sendMessage(msg.key.remoteJid, { text: `👑 *Owner Info*\n\nName: Samy Charles\nRole: Creator of Vortex-MD\nStatus: Active` });
            } else if (cmd === 'rules') {
                await sock.sendMessage(msg.key.remoteJid, { text: `📋 *Vortex-MD Rules*\n\n1. Do not spam commands.\n2. Do not use the bot for illegal activities.\n3. Respect other users.\n4. Have fun!` });
            } else if (cmd === 'runtime' || cmd === 'uptime') {
                await sock.sendMessage(msg.key.remoteJid, { text: `⏳ *Uptime:* ${formatUptime(Date.now() - startTime)}` });
            } else if (cmd === 'donate') {
                await sock.sendMessage(msg.key.remoteJid, { text: `☕ *Donate*\n\nSupport the development of Vortex-MD!\nContact the owner for donation links.` });
            } else if (cmd === 'qr') {
                if (args.length === 0) return await sock.sendMessage(msg.key.remoteJid, { text: `❌ Provide text to generate QR. Example: ${config.prefix}qr Hello` });
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(args.join(' '))}`;
                await sock.sendMessage(msg.key.remoteJid, { image: { url: qrUrl }, caption: '🔳 Here is your QR Code!' });
            } else if (cmd === 'shorturl') {
                if (args.length === 0) return await sock.sendMessage(msg.key.remoteJid, { text: `❌ Provide a URL. Example: ${config.prefix}shorturl https://google.com` });
                try {
                    const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(args[0])}`);
                    await sock.sendMessage(msg.key.remoteJid, { text: `🔗 *Short URL:*\n${res.data}` });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to shorten URL.' });
                }
            } else if (cmd === 'base64') {
                if (args.length === 0) return await sock.sendMessage(msg.key.remoteJid, { text: `❌ Provide text to encode.` });
                const encoded = Buffer.from(args.join(' ')).toString('base64');
                await sock.sendMessage(msg.key.remoteJid, { text: `🔐 *Base64 Encoded:*\n${encoded}` });
            } else if (cmd === 'password') {
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
                let pass = '';
                for (let i = 0; i < 12; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
                await sock.sendMessage(msg.key.remoteJid, { text: `🔑 *Generated Password:*\n${pass}` });
            } else if (cmd === 'truth') {
                const truths = ["What's your biggest fear?", "What's a secret you've never told anyone?", "Who is your crush?", "What's the most embarrassing thing you've done?"];
                await sock.sendMessage(msg.key.remoteJid, { text: `🤫 *Truth:*\n${truths[Math.floor(Math.random() * truths.length)]}` });
            } else if (cmd === 'dare') {
                const dares = ["Send a voice note singing a song.", "Change your profile picture to a monkey for 1 hour.", "Send a message to your crush.", "Do 10 pushups and send a video."];
                await sock.sendMessage(msg.key.remoteJid, { text: `😈 *Dare:*\n${dares[Math.floor(Math.random() * dares.length)]}` });
            } else if (cmd === 'flipcoin') {
                const coin = Math.random() < 0.5 ? 'Heads' : 'Tails';
                await sock.sendMessage(msg.key.remoteJid, { text: `🪙 The coin landed on: *${coin}*` });
            } else if (cmd === 'roll') {
                const dice = Math.floor(Math.random() * 6) + 1;
                await sock.sendMessage(msg.key.remoteJid, { text: `🎲 You rolled a *${dice}*!` });
            } else if (cmd === '8ball') {
                if (args.length === 0) return await sock.sendMessage(msg.key.remoteJid, { text: `❌ Ask a question!` });
                const answers = ["Yes, definitely.", "It is certain.", "Without a doubt.", "Reply hazy, try again.", "Ask again later.", "Don't count on it.", "My reply is no.", "Very doubtful."];
                await sock.sendMessage(msg.key.remoteJid, { text: `🎱 *8Ball says:*\n${answers[Math.floor(Math.random() * answers.length)]}` });
            } else if (cmd === 'rate') {
                if (args.length === 0) return await sock.sendMessage(msg.key.remoteJid, { text: `❌ Provide something to rate!` });
                const rating = Math.floor(Math.random() * 101);
                await sock.sendMessage(msg.key.remoteJid, { text: `⭐ I rate *${args.join(' ')}* a solid *${rating}/100*!` });
            } else if (cmd === 'sysinfo' || cmd === 'os' || cmd === 'cpu' || cmd === 'ram') {
                const totalMem = Math.round(os.totalmem() / 1024 / 1024);
                const freeMem = Math.round(os.freemem() / 1024 / 1024);
                const usedMem = totalMem - freeMem;
                const cpu = os.cpus()[0].model;
                const info = `💻 *SYSTEM INFO* 💻\n\n` +
                             `🖥️ *OS:* ${os.type()} ${os.release()}\n` +
                             `🧠 *CPU:* ${cpu}\n` +
                             `💾 *RAM:* ${usedMem}MB / ${totalMem}MB\n` +
                             `⚙️ *Platform:* ${os.platform()}`;
                await sock.sendMessage(msg.key.remoteJid, { text: info });
            } else if (cmd === 'hack') {
                const target = args.length > 0 ? args.join(' ') : 'Target';
                const hackMsg = await sock.sendMessage(msg.key.remoteJid, { text: `💻 Hacking ${target}... 0%` });
                if (hackMsg) {
                    setTimeout(async () => await sock.sendMessage(msg.key.remoteJid, { text: `💻 Hacking ${target}... 40%\nFetching IP address...`, edit: hackMsg.key }), 1500);
                    setTimeout(async () => await sock.sendMessage(msg.key.remoteJid, { text: `💻 Hacking ${target}... 80%\nBypassing firewall...`, edit: hackMsg.key }), 3000);
                    setTimeout(async () => await sock.sendMessage(msg.key.remoteJid, { text: `💻 Hacking ${target}... 100%\nSuccessfully hacked! (Just kidding 🤣)`, edit: hackMsg.key }), 4500);
                }
            } else if (cmd === 'joke') {
                const jokes = ["Why don't scientists trust atoms? Because they make up everything!", "What do you call a fake noodle? An impasta!", "Why did the scarecrow win an award? Because he was outstanding in his field!"];
                await sock.sendMessage(msg.key.remoteJid, { text: jokes[Math.floor(Math.random() * jokes.length)] });
            } else if (cmd === 'meme') {
                try {
                    const res = await axios.get('https://meme-api.com/gimme');
                    await sock.sendMessage(msg.key.remoteJid, { image: { url: res.data.url }, caption: res.data.title });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to fetch a meme.' });
                }
            } else if (cmd === 'play' || cmd === 'ytmp3' || cmd === 'ytmp4') {
                if (args.length === 0) return await sock.sendMessage(msg.key.remoteJid, { text: `❌ Please provide a song name. Example: ${config.prefix}play Faded Alan Walker` });
                const query = args.join(' ');
                await sock.sendMessage(msg.key.remoteJid, { text: `🔍 Searching YouTube for: *${query}*...` });
                
                try {
                    const searchResults = await yts(query);
                    const video = searchResults.videos[0];
                    if (!video) return await sock.sendMessage(msg.key.remoteJid, { text: '❌ No results found on YouTube.' });
                    
                    const caption = `🎵 *VORTEX-MD MUSIC* 🎵\n\n` +
                                    `📌 *Title:* ${video.title}\n` +
                                    `⏱️ *Duration:* ${video.timestamp}\n` +
                                    `👁️ *Views:* ${video.views}\n` +
                                    `👤 *Channel:* ${video.author.name}\n\n` +
                                    `_Downloading audio, please wait..._`;
                    
                    await sock.sendMessage(msg.key.remoteJid, { image: { url: video.thumbnail }, caption: caption });

                    try {
                        const stream = ytdl(video.url, { filter: 'audioonly', quality: 'highestaudio' });
                        await sock.sendMessage(msg.key.remoteJid, { 
                            audio: { stream }, 
                            mimetype: 'audio/mp4',
                            ptt: false 
                        }, { quoted: msg });
                    } catch (dlError) {
                        console.error('Download error:', dlError);
                        await sock.sendMessage(msg.key.remoteJid, { text: `❌ Failed to download audio. The video might be restricted.` });
                    }
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ An error occurred while searching YouTube.' });
                }
            } else if (cmd === 'ai' || cmd === 'gpt' || cmd === 'gemini') {
                if (args.length === 0) return await sock.sendMessage(msg.key.remoteJid, { text: `❌ Please provide a prompt. Example: ${config.prefix}ai What is the capital of France?` });
                const prompt = args.join(' ');
                await sock.sendMessage(msg.key.remoteJid, { text: `🧠 Thinking...` });
                
                const taskId = Math.random().toString(36).substring(7);
                aiTasks.push({
                    id: taskId,
                    prompt: prompt,
                    remoteJid: msg.key.remoteJid,
                    status: 'pending'
                });
            } else if (cmd === 'weather') {
                if (args.length === 0) return await sock.sendMessage(msg.key.remoteJid, { text: `❌ Please provide a city name. Example: ${config.prefix}weather Paris` });
                const city = args.join(' ');
                try {
                    const res = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=%l:+%C+%t,+%w,+%h+humidity`);
                    await sock.sendMessage(msg.key.remoteJid, { text: `🌤️ *Weather Info:*\n\n${res.data}` });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to fetch weather data. Make sure the city name is correct.' });
                }
            } else if (cmd === 'calc' || cmd === 'calculate' || cmd === 'math') {
                if (args.length === 0) return await sock.sendMessage(msg.key.remoteJid, { text: `❌ Please provide a math expression. Example: ${config.prefix}calc 5 * 10` });
                const expression = args.join(' ');
                try {
                    // Very basic and safe evaluation using Function instead of eval, though still has risks.
                    // A better approach is using a math library, but for simplicity:
                    const result = new Function(`return ${expression}`)();
                    await sock.sendMessage(msg.key.remoteJid, { text: `🧮 *Result:*\n${expression} = *${result}*` });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ Invalid math expression.' });
                }
            } else if (cmd === 'github') {
                if (args.length === 0) return await sock.sendMessage(msg.key.remoteJid, { text: `❌ Please provide a GitHub username. Example: ${config.prefix}github octocat` });
                const username = args[0];
                try {
                    const res = await axios.get(`https://api.github.com/users/${username}`);
                    const data = res.data;
                    const caption = `🐙 *GITHUB USER INFO* 🐙\n\n` +
                                    `👤 *Name:* ${data.name || data.login}\n` +
                                    `📝 *Bio:* ${data.bio || 'No bio'}\n` +
                                    `🏢 *Company:* ${data.company || 'None'}\n` +
                                    `📍 *Location:* ${data.location || 'Unknown'}\n` +
                                    `📦 *Public Repos:* ${data.public_repos}\n` +
                                    `👥 *Followers:* ${data.followers}\n` +
                                    `🔗 *Profile:* ${data.html_url}`;
                    await sock.sendMessage(msg.key.remoteJid, { image: { url: data.avatar_url }, caption: caption });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ GitHub user not found.' });
                }
            } else if (cmd === 'npm') {
                if (args.length === 0) return await sock.sendMessage(msg.key.remoteJid, { text: `❌ Please provide an NPM package name. Example: ${config.prefix}npm express` });
                const pkg = args[0];
                try {
                    const res = await axios.get(`https://registry.npmjs.org/${pkg}`);
                    const data = res.data;
                    const latestVersion = data['dist-tags'].latest;
                    const latestData = data.versions[latestVersion];
                    const caption = `📦 *NPM PACKAGE INFO* 📦\n\n` +
                                    `🏷️ *Name:* ${data.name}\n` +
                                    `📌 *Version:* ${latestVersion}\n` +
                                    `📝 *Description:* ${data.description || 'No description'}\n` +
                                    `👨‍💻 *Author:* ${latestData.author?.name || 'Unknown'}\n` +
                                    `⚖️ *License:* ${latestData.license || 'Unknown'}\n` +
                                    `🔗 *Link:* https://www.npmjs.com/package/${data.name}`;
                    await sock.sendMessage(msg.key.remoteJid, { text: caption });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ NPM package not found.' });
                }
            } else if (cmd === 'translate') {
                if (args.length < 2) return await sock.sendMessage(msg.key.remoteJid, { text: `❌ Please provide a target language code and text. Example: ${config.prefix}translate fr Hello world` });
                const targetLang = args[0];
                const textToTranslate = args.slice(1).join(' ');
                try {
                    const res = await axios.get(`https://api.popcat.xyz/translate?to=${targetLang}&text=${encodeURIComponent(textToTranslate)}`);
                    await sock.sendMessage(msg.key.remoteJid, { text: `🌐 *TRANSLATION*\n\n*Original:* ${textToTranslate}\n*Translated (${targetLang}):* ${res.data.translated}` });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to translate text. Make sure the language code is valid (e.g., fr, es, de).' });
                }
            } else if (cmd === 'waifu') {
                try {
                    const res = await axios.get('https://api.waifu.pics/sfw/waifu');
                    await sock.sendMessage(msg.key.remoteJid, { image: { url: res.data.url }, caption: '🌸 Here is your waifu!' });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to fetch waifu image.' });
                }
            } else if (['neko', 'husbando', 'kitsune', 'hug', 'kiss', 'pat', 'slap', 'cuddle', 'cry', 'smug', 'bonk', 'yeet', 'blush', 'smile'].includes(cmd || '')) {
                try {
                    // Map some commands to valid waifu.pics endpoints if they differ
                    let endpoint = cmd;
                    if (cmd === 'husbando') endpoint = 'waifu'; // fallback as husbando isn't standard sfw
                    if (cmd === 'kitsune') endpoint = 'neko'; // fallback
                    
                    const res = await axios.get(`https://api.waifu.pics/sfw/${endpoint}`);
                    await sock.sendMessage(msg.key.remoteJid, { image: { url: res.data.url }, caption: `✨ ${cmd} ✨` });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: `❌ Failed to fetch ${cmd} image.` });
                }
            }
        }
    });

    if (phoneNumber && !sock.authState.creds.registered) {
        connectionState = 'connecting';
        try {
            // Wait a bit before requesting pairing code
            await new Promise(resolve => setTimeout(resolve, 2000));
            const code = await sock.requestPairingCode(phoneNumber);
            return code;
        } catch (err) {
            console.error('Error requesting pairing code:', err);
            connectionState = 'disconnected';
            throw err;
        }
    } else if (sock.authState.creds.registered) {
        connectionState = 'connecting';
    }

    return null;
}

// Auto-start if already registered
if (fs.existsSync('baileys_auth_info')) {
    startBot().catch(console.error);
}

app.post('/api/pair', async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) {
      res.status(400).json({ error: 'Phone number required' });
      return;
  }
  
  try {
    const code = await startBot(phoneNumber);
    res.json({ code });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/status', (req, res) => {
    res.json({ status: connectionState });
});

app.post('/api/logout', (req, res) => {
    if (sock) {
        sock.logout();
        connectionState = 'disconnected';
    }
    res.json({ success: true });
});

app.get('/api/config', (req, res) => {
    res.json(getConfig());
});

app.get('/api/ai-tasks', (req, res) => {
    const pendingTasks = aiTasks.filter(t => t.status === 'pending');
    // Mark as processing so they aren't picked up twice
    pendingTasks.forEach(t => t.status = 'processing');
    res.json(pendingTasks);
});

app.post('/api/ai-tasks/:id', async (req, res) => {
    const { id } = req.params;
    const { result, error } = req.body;
    
    const task = aiTasks.find(t => t.id === id);
    if (task) {
        task.status = error ? 'failed' : 'completed';
        if (sock && task.remoteJid) {
            if (error) {
                await sock.sendMessage(task.remoteJid, { text: '❌ An error occurred while generating AI response.' });
            } else {
                await sock.sendMessage(task.remoteJid, { text: result || 'No response generated.' });
            }
        }
        // Remove task after completion
        const index = aiTasks.indexOf(task);
        if (index > -1) aiTasks.splice(index, 1);
    }
    res.json({ success: true });
});

app.post('/api/config', (req, res) => {
    const { prefix, mode } = req.body;
    const config = getConfig();
    if (prefix) config.prefix = prefix;
    if (mode) config.mode = mode;
    saveConfig(config);
    res.json({ success: true, config });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
        res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

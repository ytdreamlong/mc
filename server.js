const express = require('express');
const mineflayer = require('mineflayer');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.json());
app.use(express.static('public'));

let bot = null;
let behaviorLoop = null;

// --- UTILITIES ---
function log(user, msg, color = '§7') {
    io.emit('mc-chat', { user, message: color + msg });
    console.log(`[${user}] ${msg}`);
}

// --- BEHAVIOR ENGINE ---
function startHumanoidBehavior(bot) {
    if (behaviorLoop) clearInterval(behaviorLoop);
    
    behaviorLoop = setInterval(() => {
        if (!bot?.entity) return;

        // Micro-movements (Network Entropy)
        const yaw = bot.entity.yaw + (Math.random() * 0.1 - 0.05);
        const pitch = bot.entity.pitch + (Math.random() * 0.06 - 0.03);
        bot.look(yaw, pitch, true);

        // Rare Swing
        if (Math.random() < 0.03) bot.swingArm('right');
    }, 2500);
}

// --- BOT CORE ---
app.post('/join', (req, res) => {
    const { ip, port, username } = req.body;
    
    // Kill old behavior
    if (behaviorLoop) clearInterval(behaviorLoop);
    if (bot) try { bot.quit(); } catch (e) {}

    console.log(`[INJECTING] ${username} -> ${ip}:${port}`);

    bot = mineflayer.createBot({
        host: ip,
        port: parseInt(port) || 25565,
        username: username,
        auth: 'offline',
        version: '1.21.1',
        brand: 'lunarclient:v3.2.0',
        physicsEnabled: false, 
        settings: {
            locale: 'en_US',
            viewDistance: 'normal',
            chat: 'enabled',
            colors: true,
            skinParts: {
                showCape: true, showJackets: true, showSleeves: true,
                showHats: true, showTrousers: true
            },
            mainHand: 'right' // FIXED STRING
        }
    });

    // --- PACKET SNIFFER ---
    // Useful to watch the 1.21 configuration phase progress
    bot._client.on('packet', (data, metadata) => {
        if (metadata.state === 'configuration') {
            console.log(`[CONFIG] Received: ${metadata.name}`);
        }
    });

    bot.once('spawn', () => {
        log('NET', 'Registry Synchronized.', '§a');
        
        setTimeout(() => {
            bot.physicsEnabled = true;
            startHumanoidBehavior(bot);
            log('STEALTH', 'Neural Links Active.', '§a');
            
            // Initial Player List
            if (bot.players) {
                io.emit('player-list', Object.keys(bot.players));
            }
        }, 3000);
    });

    bot.on('kicked', (reason) => {
        const msg = typeof reason === 'string' ? reason : (reason.value || JSON.stringify(reason));
        log('KICKED', msg, '§c');
        process.exit(1); // Force exit for .bat loop
    });

    bot.on('error', (err) => {
        console.error('CRITICAL ERROR:', err);
        process.exit(1); // Force exit for .bat loop
    });
    
    bot.on('message', (json) => {
        io.emit('mc-chat', { user: 'SERVER', message: json.toMotd() });
    });

    res.json({ status: "Connecting..." });
});

io.on('connection', (socket) => {
    socket.on('send-chat', (msg) => {
        if (bot) bot.chat(msg);
    });
});

// No uncaughtException handler here - let it crash.
http.listen(3000, () => console.log('GHOST ENGINE: http://localhost:3000'));
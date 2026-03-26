const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let users = new Map();
let messages = [];

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).send('No file');
    res.json({ 
        filename: req.file.filename,
        url: `/uploads/${req.file.filename}`,
        originalName: req.file.originalname
    });
});

wss.on('connection', (ws) => {
    let userId = null;
    
    ws.on('message', (data) => {
        const message = JSON.parse(data);
        
        switch(message.type) {
            case 'login':
                userId = message.username;
                users.set(ws, { username: userId, isOnline: true });
                
                ws.send(JSON.stringify({
                    type: 'history',
                    messages: messages.slice(-50)
                }));
                
                broadcast({
                    type: 'user_joined',
                    username: userId,
                    users: Array.from(users.values()).map(u => u.username)
                });
                break;
                
            case 'message':
                const msg = {
                    id: Date.now(),
                    type: 'text',
                    username: userId,
                    text: message.text,
                    timestamp: new Date().toISOString()
                };
                messages.push(msg);
                broadcast(msg);
                break;
                
            case 'file':
                const fileMsg = {
                    id: Date.now(),
                    type: 'file',
                    username: userId,
                    url: message.url,
                    filename: message.filename,
                    timestamp: new Date().toISOString()
                };
                messages.push(fileMsg);
                broadcast(fileMsg);
                break;
                
            case 'voice':
                const voiceMsg = {
                    id: Date.now(),
                    type: 'voice',
                    username: userId,
                    url: message.url,
                    duration: message.duration,
                    timestamp: new Date().toISOString()
                };
                messages.push(voiceMsg);
                broadcast(voiceMsg);
                break;
                
            case 'call_offer':
            case 'call_answer':
            case 'ice_candidate':
                const targetWs = findUserByName(message.target);
                if (targetWs) {
                    targetWs.send(JSON.stringify({
                        ...message,
                        from: userId
                    }));
                }
                break;
        }
    });
    
    ws.on('close', () => {
        if (userId) {
            broadcast({
                type: 'user_left',
                username: userId,
                users: Array.from(users.values()).map(u => u.username)
            });
            users.delete(ws);
        }
    });
});

function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

function findUserByName(username) {
    for (let [ws, user] of users.entries()) {
        if (user.username === username) {
            return ws;
        }
    }
    return null;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Мессенджер запущен на порту ${PORT}`);
});
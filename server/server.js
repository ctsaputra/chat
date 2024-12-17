const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;

const INACTIVE_TIMEOUT = 5 * 60 * 1000;
const userLastActivity = new Map();
const activeChats = new Set();
const closedChats = new Set();

const configPath = path.join(__dirname, 'config.json');
const chatDataPath = path.join(__dirname, 'chatData.json');

const app = express();
const server = http.createServer(app);

const corsOptions = {
    origin: ["http://127.0.0.1:3001", "http://localhost:3001", 
            "http://127.0.0.1:3000", "http://localhost:3000"],
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "Access-Control-Allow-Origin"]
};

app.use(cors(corsOptions));

const io = socketIo(server, {
    cors: corsOptions,
    transports: ['websocket', 'polling']
});

app.options('*', cors(corsOptions));

const storage = multer.diskStorage({
    destination: path.join(__dirname, 'uploads'),
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
        if (!allowedTypes.includes(file.mimetype)) {
            cb(new Error('Format file tidak didukung'));
        }
        cb(null, true);
    },
    limits: {
        fileSize: 5 * 1024 * 1024
    }
});

app.post('/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        res.json({ 
            success: true,
            filePath: `/uploads/${req.file.filename}` 
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

app.post('/admin/save-chat-data', cors(corsOptions), express.json(), async (req, res) => {
    try {
        const newChatData = req.body;
        await saveChatData(newChatData);
        chatData = newChatData; // Update data di memory
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving chat data:', err);
        res.status(500).json({ error: 'Failed to save chat data' });
    }
});


app.get('/admin/username', cors(corsOptions), (req, res) => {
    res.json({ username: adminUsername });
});

app.get('/admin/chat-data', cors(corsOptions), async (req, res) => {
    try {
        const data = await loadChatData();
        res.json(data);
    } catch (err) {
        console.error('Error loading chat data:', err);
        res.status(500).json({ error: 'Failed to load chat data' });
    }
});

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Credentials', true);
    next();
});


app.use('/server/uploads', cors(corsOptions), express.static(path.join(__dirname, 'uploads')));

app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
});

// Inisialisasi dengan async/await
let adminUsername = 'admin';
let chatData = {
    userMessages: {},
    chatList: [],
    historyMessages: {},
    historyUsers: []
};

async function loadChatData() {
    try {
        if (fs.existsSync(chatDataPath)) {
            const data = await fsPromises.readFile(chatDataPath, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Error loading chat data:', err);
    }
    return {
        userMessages: {},
        chatList: [],
        historyMessages: {},
        historyUsers: []
    };
}

async function saveChatData(data) {
    try {
        await fsPromises.writeFile(
            chatDataPath,
            JSON.stringify(data, null, 2)
        );
        return true;
    } catch (err) {
        console.error('Error saving chat data:', err);
        return false;
    }
}

function loadAdminUsername() {
    try {
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            return config.adminUsername || 'admin';
        }
    } catch (err) {
        console.error('Error loading admin username:', err);
    }
    return 'admin';
}

async function saveAdminUsername(username) {
    try {
        await fsPromises.writeFile(configPath, JSON.stringify({ adminUsername: username }));
    } catch (err) {
        console.error('Error saving admin username:', err);
    }
}

async function initializeServer() {
    try {
        // Load admin username
        adminUsername = loadAdminUsername();
        console.log('Admin username loaded:', adminUsername);
        
        // Load chat data
        chatData = await loadChatData();
        console.log('Chat data loaded successfully');
        
        // Set interval untuk auto-save dengan async/await
        setInterval(async () => {
            try {
                await saveChatData(chatData); // Pastikan data yang benar dikirim
            } catch (err) {
                console.error('Error saving chat data:', err);
            }
        }, 30000);

        // Perbaiki endpoint save-chat-data
        app.post('/admin/save-chat-data', express.json(), async (req, res) => {
            try {
                const newChatData = req.body;
                await fsPromises.writeFile(
                    chatDataPath,
                    JSON.stringify(newChatData, null, 2)
                );
                chatData = newChatData; // Update data di memory
                res.json({ success: true });
            } catch (err) {
                console.error('Error saving chat data:', err);
                res.status(500).json({ error: 'Failed to save chat data' });
            }
        });

        // Start server setelah semua inisialisasi selesai
        server.listen(3000, () => {
            console.log('Server listening on *:3000');
        });
    } catch (err) {
        console.error('Error initializing server:', err);
        process.exit(1);
    }
}

initializeServer().catch(err => {
    console.error('Fatal error during initialization:', err);
    process.exit(1);
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    socket.on('get admin username', () => {
        socket.emit('admin username', adminUsername);
    });

    socket.on('admin username change', ({oldUsername, newUsername}) => {
        adminUsername = newUsername;
        socket.leave(oldUsername);
        socket.join(newUsername);
        // Simpan username baru ke file
        saveAdminUsername(newUsername);
        io.emit('admin username changed', newUsername);
    });

    socket.on('join', (username, welcomeSent) => {
        console.log('User joining:', username);
        
        // Bersihkan room lama
        socket.rooms.forEach(room => {
            if (room !== socket.id) {
                socket.leave(room);
            }
        });
        
        // Join ke room baru
        socket.join(username);
        console.log(`Socket ${socket.id} joined room: ${username}`);
        console.log('Current rooms after join:', io.sockets.adapter.rooms);

        socket.emit('joined', { username, status: 'success' });
    
        if (username !== adminUsername) {
            userLastActivity.set(username, Date.now());
            activeChats.add(username);
            closedChats.delete(username);
            
            // Emit ke admin bahwa user baru bergabung
            io.to(adminUsername).emit('user joined', username);
            
            if (!welcomeSent) {
                const welcomeMessage = {
                    username: adminUsername,
                    message: 'Selamat datang di situs GOKU55 1 User ID untuk semua permainan Slot Online, Live Casino, Sportsbook, Poker, Sabung Ayam dsb. Link <a href="https://Jasus.net/search" target="_blank">https://Jasus.net/search</a>',
                    to: username,
                    time: new Date().toLocaleTimeString(),
                    isWelcomeMessage: true
                };
                socket.emit('chat message', welcomeMessage);
                io.to(adminUsername).emit('chat message', welcomeMessage);
            }

            checkInactiveUsers = setInterval(() => {
                const now = Date.now();
                const lastActivity = userLastActivity.get(username);
                if (lastActivity && (now - lastActivity > INACTIVE_TIMEOUT) && 
                    activeChats.has(username) && !closedChats.has(username)) {
                    userLastActivity.delete(username);
                    activeChats.delete(username);
                    closedChats.add(username);
                    io.emit('inactive user', {
                        username,
                        timestamp: new Date().toISOString(),
                        reason: 'timeout',
                        message: 'Obrolan telah ditutup karena pengguna tidak aktif selama 5 menit.'
                    });
                    clearInterval(checkInactiveUsers);
                }
            }, 10000);
        }
    });

    socket.on('chat message', async (data) => {
        console.log('Received message:', data);
        
        if (!data || !data.username || !data.message) {
            console.error('Invalid message data:', data);
            return;
        }
    
        if (data.username !== adminUsername) {
            userLastActivity.set(data.username, Date.now());
        }
    
        const targetUser = data.username === adminUsername ? data.to : data.username;
        
        // Pastikan chatData.userMessages ada
        if (!chatData.userMessages) {
            chatData.userMessages = {};
        }
        
        if (!chatData.userMessages[targetUser]) {
            chatData.userMessages[targetUser] = [];
        }
        
        // Tambahkan pesan ke array
        chatData.userMessages[targetUser].push(data);
        
        // Update chat list
        if (!chatData.chatList) {
            chatData.chatList = [];
        }
        
        if (!chatData.chatList.includes(targetUser) && targetUser !== adminUsername) {
            chatData.chatList.push(targetUser);
        }
        
        // Simpan data
        try {
            await saveChatData(chatData);
        } catch (err) {
            console.error('Error saving chat data:', err);
        }
        
        // Kirim pesan ke tujuan yang tepat
        if (data.username === adminUsername) {
            io.to(data.to).emit('chat message', data);
        } else {
            io.to(adminUsername).emit('chat message', data);
        }
    });

    socket.on('user inactive', (username) => {
        if (username !== adminUsername) {
            userLastActivity.delete(username);
            activeChats.delete(username);
            io.emit('inactive user', {
                username,
                timestamp: new Date().toISOString(),
                reason: 'timeout'
            });
            if (checkInactiveUsers) {
                clearInterval(checkInactiveUsers);
            }
        }
    });

    socket.on('close chat', (username) => {
        if (username !== adminUsername) {
            userLastActivity.delete(username);
            activeChats.delete(username);
            closedChats.add(username);
            
            // Pindahkan chat ke history
            if (chatData.userMessages[username]) {
                chatData.historyMessages[username] = {
                    messages: chatData.userMessages[username],
                    timestamp: new Date().toISOString()
                };
                delete chatData.userMessages[username];
                
                const index = chatData.chatList.indexOf(username);
                if (index > -1) {
                    chatData.chatList.splice(index, 1);
                }
                
                saveChatData(chatData);
            }
            
            io.emit('inactive user', {
                username,
                timestamp: new Date().toISOString(),
                reason: 'closed'
            });
        }
    });

    socket.on('disconnect', () => {
        const username = Array.from(socket.rooms)[1];
        if (username && username !== adminUsername) {
            userLastActivity.delete(username);
            activeChats.delete(username);
            io.emit('inactive user', {
                username,
                timestamp: new Date().toISOString(),
                reason: 'disconnected'
            });
            if (checkInactiveUsers) {
                clearInterval(checkInactiveUsers);
            }
        }
    });
});

import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import formidable from 'formidable';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server);

// Middleware
app.use(express.json());
app.use('/Uploads', express.static(path.join(__dirname, 'Uploads')));

// Initialize WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox'] },
});

// Generate QR code
client.on('qr', async (qr) => {
    try {
        const qrUrl = await QRCode.toDataURL(qr);
        io.emit('qr', qrUrl);
        console.log('QR code generated');
    } catch (err) {
        console.error('Error generating QR code:', err);
    }
});

// Handle connection
client.on('ready', () => {
    io.emit('ready');
    console.log('WhatsApp client ready');
    // Fetch chats on connection
    client.getChats().then(chats => {
        const chatData = chats.map(chat => ({
            id: chat.id._serialized,
            name: chat.name || chat.id.user,
        }));
        io.emit('chats', chatData);
        console.log(`Sent ${chatData.length} chats to client`);
    }).catch(err => {
        console.error('Error fetching initial chats:', err);
    });
});

// Handle incoming messages
client.on('message', async (msg) => {
    let mediaUrl = null;
    if (msg.hasMedia) {
        try {
            const media = await msg.downloadMedia();
            const fileName = `${msg.from}-${Date.now()}.${media.mimetype.split('/')[1]}`;
            fs.writeFileSync(path.join(__dirname, 'Uploads', fileName), Buffer.from(media.data, 'base64'));
            mediaUrl = `/Uploads/${fileName}`;
            console.log(`Saved media: ${fileName}`);
        } catch (err) {
            console.error('Error downloading media:', err);
        }
    }
    io.emit('message', { from: msg.from, body: msg.body, media: mediaUrl });
    console.log(`Message from ${msg.from}: ${msg.body}`);
});

// Serve static files (React UI)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Fetch recent chats
app.get('/chats', async (req, res) => {
    try {
        const chats = await client.getChats();
        const chatData = chats.map(chat => ({
            id: chat.id._serialized,
            name: chat.name || chat.id.user,
        }));
        res.json(chatData);
        io.emit('chats', chatData);
        console.log(`Fetched ${chatData.length} chats for /chats`);
    } catch (err) {
        console.error('Error fetching chats:', err);
        res.status(500).json({ error: 'Failed to fetch chats' });
    }
});

// Validate WhatsApp ID
const validateWID = (wid) => {
    const widRegex = /^[0-9]{10,15}@c\.us$/;
    return widRegex.test(wid.trim());
};

// Handle sending messages
app.post('/send', async (req, res) => {
    const form = formidable({
        uploadDir: path.join(__dirname, 'Uploads'),
        keepExtensions: true,
        maxFileSize: 10 * 1024 * 1024, // 10MB limit
    });

    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error('Error parsing form:', err);
            return res.status(500).json({ error: 'Failed to process request' });
        }

        console.log('Form fields:', fields);
        console.log('Form files:', files);

        const recipient = fields.recipient?.[0]?.trim();
        const message = fields.message?.[0]?.trim();
        const file = files.file;

        if (!recipient) {
            console.error('Missing recipient');
            return res.status(400).json({ error: 'Recipient is required' });
        }

        if (!validateWID(recipient)) {
            console.error(`Invalid WID format: ${recipient}`);
            return res.status(400).json({ error: 'Invalid recipient format. Use number@c.us (e.g., 6281234567890@c.us)' });
        }

        try {
            // Verify recipient is a registered WhatsApp user
            const isRegistered = await client.isRegisteredUser(recipient);
            if (!isRegistered) {
                console.error(`Recipient not registered on WhatsApp: ${recipient}`);
                return res.status(400).json({ error: `Number ${recipient.split('@')[0]} is not registered on WhatsApp` });
            }

            console.log(`Verified recipient: ${recipient}`);

            if (file) {
                if (!fs.existsSync(file.filepath)) {
                    console.error('File not found:', file.filepath);
                    return res.status(400).json({ error: 'File not found' });
                }
                const media = MessageMedia.fromFilePath(file.filepath);
                await client.sendMessage(recipient, media, { caption: message || 'Attachment' });
                console.log(`Sent media to ${recipient}: ${file.filepath}`);
            } else if (message) {
                await client.sendMessage(recipient, message);
                console.log(`Sent message to ${recipient}: ${message}`);
            } else {
                console.error('No message or file provided');
                return res.status(400).json({ error: 'Message or file is required' });
            }
            res.json({ status: 'Message sent' });
        } catch (err) {
            console.error(`Error sending message to ${recipient}:`, err);
            res.status(500).json({ error: `Failed to send message: ${err.message}` });
        }
    });
});

// Handle errors
client.on('error', (err) => {
    console.error('WhatsApp client error:', err);
});

// Handle disconnection
client.on('disconnected', (reason) => {
    console.log('WhatsApp client disconnected:', reason);
    io.emit('disconnected', reason);
});

// Start server
server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
    client.initialize();
});
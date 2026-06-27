const express = require('express');
const { createCanvas, loadImage } = require('canvas');
const app = express();
app.use(express.json());

function getTier(amount) {
    if (amount >= 10000) {
        return {
            accent: '#CC0000',
            bgGradientStart: '#FF6666',
            bgGradientEnd: '#FFB3B3',
        };
    } else if (amount >= 1000) {
        return {
            accent: '#FF1493',
            bgGradientStart: '#FFB3D9',
            bgGradientEnd: '#FFFFFF',
        };
    } else {
        return {
            accent: '#FF00CC',
            bgGradientStart: '#FFFFFF',
            bgGradientEnd: '#FFFFFF',
        };
    }
}

async function generateDonationImage({ donatorUsername, donatorImage, raiserUsername, raiserImage, amount }) {
    const width = 1100;
    const height = 220;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const tier = getTier(Number(amount));

    // Background gradient
    const grad = ctx.createLinearGradient(0, height, width, 0);
    grad.addColorStop(0, tier.bgGradientStart);
    grad.addColorStop(1, tier.bgGradientEnd);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    const avatarSize = 130;
    const borderWidth = 5;
    const centerY = height / 2 - 10;

    async function drawAvatar(imageUrl, cx, cy) {
        const radius = avatarSize / 2;

        // Accent border
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius + borderWidth, 0, Math.PI * 2);
        ctx.fillStyle = tier.accent;
        ctx.fill();
        ctx.restore();

        // Clip and draw avatar
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        try {
            const img = await loadImage(imageUrl);
            ctx.drawImage(img, cx - radius, cy - radius, avatarSize, avatarSize);
        } catch {
            ctx.fillStyle = '#aaaaaa';
            ctx.fill();
        }
        ctx.restore();
    }

    const leftCX = 130;
    const rightCX = width - 130;

    await drawAvatar(donatorImage, leftCX, centerY);
    await drawAvatar(raiserImage, rightCX, centerY);

    // Usernames
    ctx.textAlign = 'center';
    ctx.font = 'bold 21px "Arial Black", Arial';
    ctx.fillStyle = '#000000';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    const nameY = centerY + avatarSize / 2 + 28;
    ctx.strokeText(`@${donatorUsername}`, leftCX, nameY);
    ctx.fillText(`@${donatorUsername}`, leftCX, nameY);
    ctx.strokeText(`@${raiserUsername}`, rightCX, nameY);
    ctx.fillText(`@${raiserUsername}`, rightCX, nameY);

    // Center content
    const centerX = width / 2;
    const formatted = Number(amount).toLocaleString();

    // Robux icon (drawn as concentric circles with square hole)
    function drawRobuxIcon(x, y, size) {
        const r = size / 2;
        // Outer circle stroke
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = tier.accent;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = size * 0.08;
        ctx.fill();
        ctx.stroke();
        // Inner square hole
        const sq = size * 0.28;
        ctx.fillStyle = '#000000';
        ctx.fillRect(x - sq / 2, y - sq / 2, sq, sq);
        // Inner circle ring cutout effect
        ctx.beginPath();
        ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = size * 0.07;
        ctx.stroke();
        ctx.restore();
    }

    const iconSize = 58;
    const amountFontSize = 68;
    ctx.font = `bold ${amountFontSize}px "Arial Black", Arial`;
    const textWidth = ctx.measureText(formatted).width;
    const totalWidth = iconSize + 8 + textWidth;
    const startX = centerX - totalWidth / 2;

    drawRobuxIcon(startX + iconSize / 2, centerY - 18, iconSize);

    // Amount text
    ctx.font = `bold ${amountFontSize}px "Arial Black", Arial`;
    ctx.textAlign = 'left';
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(formatted, startX + iconSize + 8, centerY + 10);
    ctx.fillStyle = tier.accent;
    ctx.fillText(formatted, startX + iconSize + 8, centerY + 10);

    // "donated to"
    ctx.font = 'bold 36px "Arial Black", Arial';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText('donated to', centerX, centerY + 58);
    ctx.fillStyle = '#000000';
    ctx.fillText('donated to', centerX, centerY + 58);

    return canvas.toBuffer('image/png');
}

app.post('/generate', async (req, res) => {
    try {
        const { donatorUsername, donatorImage, raiserUsername, raiserImage, amount } = req.body;
        if (!donatorUsername || !raiserUsername || !amount) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const imageBuffer = await generateDonationImage({
            donatorUsername,
            donatorImage: donatorImage || '',
            raiserUsername,
            raiserImage: raiserImage || '',
            amount
        });
        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Dono logger running on port ${PORT}`));

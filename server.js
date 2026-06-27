const express = require('express');
const { createCanvas, loadImage } = require('canvas');
const FormData = require('form-data');
const fetch = require('node-fetch');
const app = express();
app.use(express.json());

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK;

function getTier(amount) {
    if (amount >= 10000) {
        return { accent: '#CC0000', bg1: '#FF6666', bg2: '#FFB3B3' };
    } else if (amount >= 1000) {
        return { accent: '#FF1493', bg1: '#FFB3D9', bg2: '#FFFFFF' };
    } else {
        return { accent: '#FF00CC', bg1: '#FFFFFF', bg2: '#FFFFFF' };
    }
}

async function getAvatar(userId) {
    try {
        const res = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`);
        const data = await res.json();
        return data.data[0].imageUrl;
    } catch (e) {
        console.log('Avatar fetch failed:', e.message);
        return null;
    }
}

async function generateDonationImage({ donatorUsername, donatorImage, raiserUsername, raiserImage, amount }) {
    const width = 1100;
    const height = 220;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const tier = getTier(Number(amount));

    // Solid white base first
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // Then gradient on top
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, tier.bg1);
    grad.addColorStop(1, tier.bg2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    const avatarSize = 130;
    const borderWidth = 5;
    const centerY = height / 2 - 10;

    async function drawAvatar(imageUrl, cx, cy) {
        const radius = avatarSize / 2;

        // Pink/red border ring
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius + borderWidth, 0, Math.PI * 2);
        ctx.fillStyle = tier.accent;
        ctx.fill();
        ctx.restore();

        // White inner circle base
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#CCCCCC';
        ctx.fill();
        ctx.restore();

        // Draw avatar clipped to circle
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        try {
            if (imageUrl) {
                const img = await loadImage(imageUrl);
                ctx.drawImage(img, cx - radius, cy - radius, avatarSize, avatarSize);
            }
        } catch (e) {
            console.log('loadImage failed:', e.message);
        }
        ctx.restore();
    }

    const leftCX = 130;
    const rightCX = width - 130;
    await drawAvatar(donatorImage, leftCX, centerY);
    await drawAvatar(raiserImage, rightCX, centerY);

    // Usernames
    const nameY = centerY + avatarSize / 2 + 28;
    ctx.textAlign = 'center';
    ctx.font = 'bold 21px Arial';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(`@${donatorUsername}`, leftCX, nameY);
    ctx.fillStyle = '#000000';
    ctx.fillText(`@${donatorUsername}`, leftCX, nameY);
    ctx.strokeText(`@${raiserUsername}`, rightCX, nameY);
    ctx.fillText(`@${raiserUsername}`, rightCX, nameY);

    // Center content
    const centerX = width / 2;
    const formatted = Number(amount).toLocaleString();

    function drawRobuxIcon(x, y, size) {
        const r = size / 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = tier.accent;
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = size * 0.08;
        ctx.stroke();
        const sq = size * 0.28;
        ctx.fillStyle = '#000000';
        ctx.fillRect(x - sq / 2, y - sq / 2, sq, sq);
        ctx.beginPath();
        ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = size * 0.07;
        ctx.stroke();
        ctx.restore();
    }

    const iconSize = 58;
    const amountFontSize = 68;
    ctx.font = `bold ${amountFontSize}px Arial`;
    const textWidth = ctx.measureText(formatted).width;
    const totalWidth = iconSize + 8 + textWidth;
    const startX = centerX - totalWidth / 2;

    drawRobuxIcon(startX + iconSize / 2, centerY - 18, iconSize);

    // Amount
    ctx.font = `bold ${amountFontSize}px Arial`;
    ctx.textAlign = 'left';
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(formatted, startX + iconSize + 8, centerY + 10);
    ctx.fillStyle = tier.accent;
    ctx.fillText(formatted, startX + iconSize + 8, centerY + 10);

    // "donated to"
    ctx.font = 'bold 36px Arial';
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
        const { donatorUsername, donatorId, raiserUsername, raiserId, amount, donatorImage, raiserImage } = req.body;
        console.log('Received:', { donatorUsername, donatorId, raiserUsername, raiserId, amount });

        if (!donatorUsername || !raiserUsername || !amount) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const avatar1 = donatorImage || (donatorId ? await getAvatar(donatorId) : null);
        const avatar2 = raiserImage || (raiserId ? await getAvatar(raiserId) : null);
        console.log('Avatars:', avatar1, avatar2);

        const imageBuffer = await generateDonationImage({
            donatorUsername,
            donatorImage: avatar1,
            raiserUsername,
            raiserImage: avatar2,
            amount
        });

        if (DISCORD_WEBHOOK) {
            const form = new FormData();
            form.append('file', imageBuffer, { filename: 'donation.png', contentType: 'image/png' });
            form.append('payload_json', JSON.stringify({ username: 'Donation Logger' }));
            const discordRes = await fetch(DISCORD_WEBHOOK, {
                method: 'POST',
                body: form,
                headers: form.getHeaders(),
            });
            const discordText = await discordRes.text();
            console.log('Discord status:', discordRes.status, discordText);
        } else {
            console.log('No DISCORD_WEBHOOK set!');
        }

        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (err) {
        console.error('Error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Dono logger running on port ${PORT}`));

const express = require('express');
const { createCanvas, loadImage } = require('canvas');
const FormData = require('form-data');
const fetch = require('node-fetch');
const app = express();
app.use(express.json());

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK;

function getTier(amount) {
    if (amount >= 10000) {
        return { accent: '#CC0000', bgGradientStart: '#FF6666', bgGradientEnd: '#FFB3B3' };
    } else if (amount >= 1000) {
        return { accent: '#FF1493', bgGradientStart: '#FFB3D9', bgGradientEnd: '#FFFFFF' };
    } else {
        return { accent: '#FF00CC', bgGradientStart: '#FFFFFF', bgGradientEnd: '#FFFFFF' };
    }
}

async function getAvatar(userId) {
    try {
        const res = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`);
        const data = await res.json();
        return data.data[0].imageUrl;
    } catch (e) {
        console.log('Avatar fetch failed for', userId, e.message);
        return null;
    }
}

async function generateDonationImage({ donatorUsername, donatorImage, raiserUsername, raiserImage, amount }) {
    const width = 1100;
    const height = 220;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const tier = getTier(Number(amount));

    const grad = ctx.createLinearGradient(0, height, width, 0);
    grad.addColorStop(0, tier.bgGradientStart);
    grad.addColorStop(1, tier.bgGradientEnd);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    const avatarSize = 130;
    const borderWidth = 5;
    const centerY = height / 2 - 10;

    async function drawAvatar(imageUrl, cx, cy) {
        const radius = avatarSize / 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius + borderWidth, 0, Math.PI * 2);
        ctx.fillStyle = tier.accent;
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        try {
            if (imageUrl) {
                const img = await loadImage(imageUrl);
                ctx.drawImage(img, cx - radius, cy - radius, avatarSize, avatarSize);
            } else {
                ctx.fillStyle = '#aaaaaa';
                ctx.fill();
            }
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

    const centerX = width / 2;
    const formatted = Number(amount).toLocaleString();

    function drawRobuxIcon(x, y, size) {
        const r = size / 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = tier.accent;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = size * 0.08;
        ctx.fill();
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
    ctx.font = `bold ${amountFontSize}px "Arial Black", Arial`;
    const textWidth = ctx.measureText(formatted).width;
    const totalWidth = iconSize + 8 + textWidth;
    const startX = centerX - totalWidth / 2;

    drawRobuxIcon(startX + iconSize / 2, centerY - 18, iconSize);

    ctx.font = `bold ${amountFontSize}px "Arial Black", Arial`;
    ctx.textAlign = 'left';
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(formatted, startX + iconSize + 8, centerY + 10);
    ctx.fillStyle = tier.accent;
    ctx.fillText(formatted, startX + iconSize + 8, centerY + 10);

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
        const { donatorUsername, donatorId, raiserUsername, raiserId, amount, donatorImage, raiserImage } = req.body;
        console.log('Received:', { donatorUsername, donatorId, raiserUsername, raiserId, amount });

        if (!donatorUsername || !raiserUsername || !amount) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Fetch avatars server-side if IDs provided
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

const express = require('express');
const { createCanvas, loadImage } = require('canvas');
const FormData = require('form-data');
const fetch = require('node-fetch');
const sharp = require('sharp');
const fs = require('fs');
const app = express();
app.use(express.json());

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK;

function getTier(amount) {
    if (amount >= 10000) return { accent: '#CC0000', bg: '#FFCCCC' };
    if (amount >= 1000) return { accent: '#FF1493', bg: '#FFE0F0' };
    return { accent: '#FF00CC', bg: '#FFFFFF' };
}

async function getAvatar(userId) {
    try {
        const res = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`);
        const data = await res.json();
        return data.data[0].imageUrl;
    } catch (e) {
        return null;
    }
}

async function fetchImageBuffer(url) {
    try {
        const res = await fetch(url);
        const buf = await res.buffer();
        // Flatten transparency to white using sharp
        return await sharp(buf).flatten({ background: { r: 255, g: 255, b: 255 } }).png().toBuffer();
    } catch (e) {
        console.log('fetchImageBuffer error:', e.message);
        return null;
    }
}

async function generateDonationImage({ donatorUsername, donatorImage, raiserUsername, raiserImage, amount }) {
    const width = 1100;
    const height = 220;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const tier = getTier(Number(amount));

    // Background
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = tier.bg || "#FFFFFF";
    ctx.fillRect(0, 0, width, height);

    console.log("Canvas size:", width, height);
    console.log("Tier:", tier);
    console.log("Background color:", tier.bg);
    console.log("Composite:", ctx.globalCompositeOperation);

    const avatarSize = 130;
    const borderWidth = 5;
    const centerY = height / 2 - 10;

    async function drawAvatar(imageUrl, cx, cy) {
        const radius = avatarSize / 2;

        ctx.beginPath();
        ctx.arc(cx, cy, radius + borderWidth, 0, Math.PI * 2);
        ctx.fillStyle = tier.accent;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();

        if (!imageUrl) return;

        try {
            const buf = await fetchImageBuffer(imageUrl);
            if (!buf) return;

            const img = await loadImage(buf);

            const tmpCanvas = createCanvas(avatarSize, avatarSize);
            const tmpCtx = tmpCanvas.getContext("2d");
            tmpCtx.fillStyle = "#FFFFFF";
            tmpCtx.fillRect(0,0,avatarSize,avatarSize);
            tmpCtx.drawImage(img,0,0,avatarSize,avatarSize);

            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(tmpCanvas, cx-radius, cy-radius);
            ctx.restore();
        } catch(e){
            console.error("Avatar draw error:",e);
        }
    }
            } catch (e) {
                console.log('Avatar draw error:', e.message);
            }
        }
    }

    await drawAvatar(donatorImage, 130, centerY);
    await drawAvatar(raiserImage, width - 130, centerY);

    const nameY = centerY + avatarSize / 2 + 28;
    ctx.textAlign = 'center';
    ctx.font = 'bold 21px sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(`@${donatorUsername}`, 130, nameY);
    ctx.fillStyle = '#000000';
    ctx.fillText(`@${donatorUsername}`, 130, nameY);
    ctx.strokeText(`@${raiserUsername}`, width - 130, nameY);
    ctx.fillText(`@${raiserUsername}`, width - 130, nameY);

    const centerX = width / 2;
    const formatted = Number(amount).toLocaleString();
    const iconSize = 58;
    const amountFontSize = 68;

    ctx.font = `bold ${amountFontSize}px sans-serif`;
    const textWidth = ctx.measureText(formatted).width;
    const totalWidth = iconSize + 8 + textWidth;
    const startX = centerX - totalWidth / 2;
    const iconX = startX + iconSize / 2;
    const iconY = centerY - 18;
    const r = iconSize / 2;

    ctx.beginPath();
    ctx.arc(iconX, iconY, r, 0, Math.PI * 2);
    ctx.fillStyle = tier.accent;
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = iconSize * 0.08;
    ctx.stroke();
    ctx.fillStyle = '#000000';
    ctx.fillRect(iconX - iconSize * 0.14, iconY - iconSize * 0.14, iconSize * 0.28, iconSize * 0.28);
    ctx.beginPath();
    ctx.arc(iconX, iconY, r * 0.55, 0, Math.PI * 2);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = iconSize * 0.07;
    ctx.stroke();

    ctx.font = `bold ${amountFontSize}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(formatted, startX + iconSize + 8, centerY + 10);
    ctx.fillStyle = tier.accent;
    ctx.fillText(formatted, startX + iconSize + 8, centerY + 10);

    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText('donated to', centerX, centerY + 58);
    ctx.fillStyle = '#000000';
    ctx.fillText('donated to', centerX, centerY + 58);

    // Use sharp to flatten final image to remove any remaining transparency
    const pngBuf = canvas.toBuffer('image/png');
    const imageBuffer = await sharp(pngBuf)
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality: 95 })
        .toBuffer();

    fs.writeFileSync("debug.jpg", imageBuffer);
    return imageBuffer;
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
            donatorUsername, donatorImage: avatar1,
            raiserUsername, raiserImage: avatar2, amount
        });

        if (DISCORD_WEBHOOK) {
            const form = new FormData();
            form.append('file', imageBuffer, { filename: 'donation.jpg', contentType: 'image/jpeg' });
            form.append('payload_json', JSON.stringify({ username: 'Donation Logger' }));
            const discordRes = await fetch(DISCORD_WEBHOOK, { method: 'POST', body: form, headers: form.getHeaders() });
            const discordText = await discordRes.text();
            console.log('Discord status:', discordRes.status, discordText);
        } else {
            console.log('No DISCORD_WEBHOOK set!');
        }

        res.set('Content-Type', 'image/jpeg');
        res.send(imageBuffer);
    } catch (err) {
        console.error('Error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/health', (_, res) => res.json({ ok: true }));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Dono logger running on port ${PORT}`));

// /api/resize-avatar.js
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

export const config = {
  api: { bodyParser: false },   // we handle the multipart form ourselves
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse the multipart form data
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // We used a simple FormData, so we need to extract the file from the raw buffer.
    // A lightweight approach: use the content‑type boundary to parse.
    const contentType = req.headers['content-type'] || '';
    const boundary = contentType.split('boundary=')[1];
    if (!boundary) throw new Error('No boundary found');

    // Find the file part (the second part after "Content-Type: image/webp")
    // This is a minimal parser for a two‑field form (file + userId)
    const parts = buffer.toString('binary').split('--' + boundary);
    const filePart = parts.find(p => p.includes('Content-Type: image/webp'));
    if (!filePart) throw new Error('File part not found');

    // Extract the binary data after the double CRLF
    const binaryStart = filePart.indexOf('\r\n\r\n') + 4;
    const fileBuffer = Buffer.from(filePart.slice(binaryStart, filePart.lastIndexOf('\r\n')), 'binary');

    // Extract the userId from the other part
    const userIdPart = parts.find(p => p.includes('name="userId"'));
    const userIdMatch = userIdPart?.match(/^\d+\r\n([a-zA-Z0-9-]+)/m);
    const userId = userIdMatch ? userIdMatch[1] : 'unknown';

    // Resize to exactly 256x256
    const resized = await sharp(fileBuffer)
      .resize(256, 256, { fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer();

    // Upload to Supabase Storage
    const path = `${userId}-${Date.now()}.webp`;
    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, resized, { contentType: 'image/webp', upsert: true });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);

    return res.status(200).json({ url: publicUrl });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
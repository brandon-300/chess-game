import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

export const config = {
  api: { bodyParser: false },
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
    // Read the raw body
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Get boundary
    const contentType = req.headers['content-type'] || '';
    const boundary = contentType.split('boundary=')[1];
    if (!boundary) {
      return res.status(400).json({ error: 'No boundary found in content-type' });
    }

    // Split parts
    const parts = buffer.toString('binary').split('--' + boundary);
    let fileBuffer = null;
    let userId = null;

    for (const part of parts) {
      if (part.includes('Content-Disposition')) {
        if (part.includes('name="file"')) {
          // Extract binary data after double CRLF
          const dataStart = part.indexOf('\r\n\r\n');
          if (dataStart === -1) continue;
          const raw = part.slice(dataStart + 4);
          // Remove trailing \r\n before the next boundary or end
          fileBuffer = Buffer.from(raw.replace(/\r\n$/, ''), 'binary');
        }
        if (part.includes('name="userId"')) {
          const dataStart = part.indexOf('\r\n\r\n');
          if (dataStart !== -1) {
            userId = part.slice(dataStart + 4).trim();
          }
        }
      }
    }

    if (!fileBuffer) {
      return res.status(400).json({ error: 'No file found in request' });
    }
    if (!userId) {
      return res.status(400).json({ error: 'No userId found in request' });
    }

    // Resize with Sharp
    const resized = await sharp(fileBuffer)
      .resize(256, 256, { fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer();

    // Upload to Supabase
    const path = `${userId}-${Date.now()}.webp`;
    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, resized, { contentType: 'image/webp', upsert: true });

    if (error) {
      console.error('Supabase upload error:', error);
      return res.status(500).json({ error: error.message });
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return res.status(200).json({ url: data.publicUrl });
  } catch (err) {
    console.error('Function error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
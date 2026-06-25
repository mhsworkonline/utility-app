// Vercel Serverless Function — /api/analyze
// The Groq API key lives here as an env variable, never exposed to the browser.

const https = require('https');

// Tell Vercel to allow larger bodies (base64 images can be big)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image_base64 } = req.body || {};
  if (!image_base64) {
    return res.status(400).json({ error: 'Missing image_base64 in request body.' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'GROQ_API_KEY is not set. Add it as an environment variable in your Vercel dashboard.',
    });
  }

  const model = process.env.GROQ_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';

  const payload = {
    model,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `You are an expert radiologist. Analyze this X-ray image thoroughly.

Return ONLY a valid JSON object (no markdown code fences, no extra text) with this exact structure:
{
  "xray_type": "chest / spine / dental / abdominal / limb / pelvis / skull / other",
  "overall_assessment": "2-3 sentence clinical summary",
  "overall_severity": "normal / moderate / high",
  "findings": [
    {
      "id": 1,
      "region": "anatomical region name",
      "finding": "detailed clinical description of what you observe in this region",
      "severity": "normal / moderate / high",
      "zone": "one of: top-left, top-right, top-center, center-left, center, center-right, bottom-left, bottom-center, bottom-right, full"
    }
  ],
  "recommendations": "clinical recommendations or next steps"
}

Include all visible structures — normal findings, any abnormalities, bone density, soft tissues, foreign objects if present. Be specific and thorough. The zone field should reflect WHERE in the image the finding is located.`,
          },
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${image_base64}` },
          },
        ],
      },
    ],
    max_tokens: 2500,
    temperature: 0.1,
  };

  try {
    const analysis = await callGroq(apiKey, payload);
    return res.status(200).json(analysis);
  } catch (err) {
    console.error('Groq error:', err.message);
    return res.status(502).json({ error: err.message });
  }
}

// ── Groq HTTPS call using Node built-ins (no extra deps) ─────────────────────
function callGroq(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (groqRes) => {
      let data = '';
      groqRes.on('data', (chunk) => (data += chunk));
      groqRes.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (groqRes.statusCode !== 200) {
            return reject(
              new Error(parsed.error?.message || `Groq HTTP ${groqRes.statusCode}`)
            );
          }

          let content = parsed.choices?.[0]?.message?.content?.trim() || '';
          // Strip markdown fences if model wrapped the JSON
          content = content
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/, '')
            .trim();

          let analysis;
          try {
            analysis = JSON.parse(content);
          } catch {
            const match = content.match(/\{[\s\S]*\}/);
            if (match) analysis = JSON.parse(match[0]);
            else throw new Error('Could not parse Groq response as JSON.');
          }

          resolve(analysis);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

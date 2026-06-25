const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname)));

// ── Load config ──────────────────────────────────────────────────────────────
function loadConfig() {
  const cfgPath = path.join(__dirname, 'config.json');
  if (!fs.existsSync(cfgPath)) {
    console.error('ERROR: config.json not found. Create it with your groq_api_key.');
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch (e) {
    console.error('ERROR: config.json is not valid JSON.', e.message);
    process.exit(1);
  }
}

const config = loadConfig();

if (!config.groq_api_key || config.groq_api_key === 'YOUR_GROQ_API_KEY_HERE') {
  console.error('ERROR: Please set your groq_api_key in config.json before starting.');
  process.exit(1);
}

const PORT  = config.port  || 3000;
const MODEL = config.model || 'meta-llama/llama-4-scout-17b-16e-instruct';

// ── Serve HTML ────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'xray-analyzer.html'));
});

// ── Proxy: /api/analyze ───────────────────────────────────────────────────────
app.post('/api/analyze', async (req, res) => {
  const { image_base64 } = req.body;

  if (!image_base64) {
    return res.status(400).json({ error: 'Missing image_base64 in request body.' });
  }

  const payload = {
    model: MODEL,
    messages: [{
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

Include all visible structures — normal findings, any abnormalities, bone density, soft tissues, foreign objects if present. Be specific and thorough. The zone field should reflect WHERE in the image the finding is located.`
        },
        {
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${image_base64}` }
        }
      ]
    }],
    max_tokens: 2500,
    temperature: 0.1
  };

  try {
    // Dynamic import for node-fetch compatibility across Node versions
    const fetch = (await import('node:https')).default || globalThis.fetch;

    // Use built-in https for Node 18+ (no extra deps needed)
    const result = await callGroq(config.groq_api_key, payload);
    res.json(result);
  } catch (err) {
    console.error('Groq API error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── Groq HTTP call using built-in https ──────────────────────────────────────
function callGroq(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const https = require('https');
    const req = https.request(options, (groqRes) => {
      let data = '';
      groqRes.on('data', chunk => data += chunk);
      groqRes.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (groqRes.statusCode !== 200) {
            return reject(new Error(parsed.error?.message || `Groq HTTP ${groqRes.statusCode}`));
          }

          let content = parsed.choices?.[0]?.message?.content?.trim() || '';
          // Strip markdown fences if present
          content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

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

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✓ XRay Identifier running at http://localhost:${PORT}`);
  console.log(`  Model : ${MODEL}`);
  console.log(`  Config: config.json\n`);
});

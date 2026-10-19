/**
 * Receives rendered frames from the game page for trailer making: `node tools/frames-server.mjs [port] [outDir]`
 * The page POSTs JPEG data URLs to /frame/<n>; they land as <outDir>/f_<n>.jpg. Assemble with ffmpeg afterwards.
 */
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
const port = +(process.argv[2] || 8899), out = process.argv[3] || 'trailer-frames';
mkdirSync(out, { recursive: true });
let count = 0;
createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', '*'); res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.end(); return; }
  const m = req.url.match(/^\/frame\/(\d+)$/);
  if (req.method !== 'POST' || !m) { res.statusCode = 404; res.end(); return; }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const b64 = body.replace(/^data:image\/\w+;base64,/, '');
    writeFileSync(`${out}/f_${String(m[1]).padStart(5, '0')}.jpg`, Buffer.from(b64, 'base64'));
    count++; if (count % 50 === 0) console.log('frames', count);
    res.end('ok');
  });
}).listen(port, () => console.log(`frames server on http://localhost:${port} -> ${out}/`));

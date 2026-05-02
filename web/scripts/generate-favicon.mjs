import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'public', 'assets', 'logo-smart-black-on-light.png');
const outIco = path.join(root, 'public', 'favicon.ico');
const out32 = path.join(root, 'public', 'favicon-32x32.png');

const bg = { r: 245, g: 247, b: 251, alpha: 1 };

async function main() {
  if (!fs.existsSync(src)) {
    console.error('Missing source logo:', src);
    process.exit(1);
  }

  const sizes = [16, 32, 48];
  const buffers = await Promise.all(
    sizes.map((s) =>
      sharp(src)
        .resize(s, s, {
          fit: 'contain',
          background: bg,
          position: 'centre',
        })
        .png()
        .toBuffer(),
    ),
  );

  fs.writeFileSync(outIco, await pngToIco(buffers));

  await sharp(src)
    .resize(32, 32, {
      fit: 'contain',
      background: bg,
      position: 'centre',
    })
    .png()
    .toFile(out32);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

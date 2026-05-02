import { NextRequest, NextResponse } from 'next/server';
import https from 'https';
import sharp from 'sharp';

const WMS_BASE = 'https://bhunaksha.bihar.gov.in/WMS';

function buildWMSUrl(gisCode: string, state: string, bbox: { minX: number; minY: number; maxX: number; maxY: number }, width: number, height: number, dpi: number) {
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    FORMAT: 'image/png',
    TRANSPARENT: 'true',
    LAYERS: 'VILLAGE_MAP',
    state,
    gis_code: gisCode,
    overlay_codes: '',
    CRS: 'EPSG:3857',
    STYLES: 'VILLAGE_MAP',
    FORMAT_OPTIONS: `dpi:${dpi}`,
    WIDTH: String(width),
    HEIGHT: String(height),
    BBOX: `${bbox.minX},${bbox.minY},${bbox.maxX},${bbox.maxY}`
  });
  return `${WMS_BASE}?${params.toString()}`;
}

function downloadImage(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function findContentBounds(buffer: Buffer) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  let minX = width, minY = height, maxX = 0, maxY = 0;
  let contentPixels = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
      const isTransparent = a < 10;
      const isWhite = r > 240 && g > 240 && b > 240;
      if (!isTransparent && !isWhite) {
        contentPixels++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  const marginX = Math.floor((maxX - minX) * 0.02);
  const marginY = Math.floor((maxY - minY) * 0.02);

  return {
    minX: Math.max(0, minX - marginX),
    minY: Math.max(0, minY - marginY),
    maxX: Math.min(width - 1, maxX + marginX),
    maxY: Math.min(height - 1, maxY + marginY),
    contentPixels,
    width,
    height
  };
}

function pixelToBBOX(bounds: { minX: number; minY: number; maxX: number; maxY: number }, origBBOX: { minX: number; minY: number; maxX: number; maxY: number }, imgW: number, imgH: number) {
  const bboxW = origBBOX.maxX - origBBOX.minX;
  const bboxH = origBBOX.maxY - origBBOX.minY;
  return {
    minX: origBBOX.minX + (bounds.minX / imgW) * bboxW,
    maxX: origBBOX.minX + (bounds.maxX / imgW) * bboxW,
    minY: origBBOX.minY + (bounds.minY / imgH) * bboxH,
    maxY: origBBOX.minY + (bounds.maxY / imgH) * bboxH
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { gisCode, state, origBBOX, lowResWidth, lowResHeight, highResWidth, dpi } = body;

    if (!gisCode || !state) {
      return NextResponse.json({ error: 'gisCode and state required' }, { status: 400 });
    }

    const bbox = origBBOX || { minX: -425.24, minY: -1046.91, maxX: 1230.10, maxY: 1615.25 };
    const lowW = lowResWidth || 800;
    const lowH = lowResHeight || 1280;
    const highW = highResWidth || 4000;
    const dpiVal = dpi || 420;

    // Step 1: Download low-res
    const lowUrl = buildWMSUrl(gisCode, state, bbox, lowW, lowH, dpiVal);
    const lowBuffer = await downloadImage(lowUrl);

    // Step 2: Find content bounds
    const bounds = await findContentBounds(lowBuffer);

    // Step 3: Calculate tight BBOX
    const tightBBOX = pixelToBBOX(bounds, bbox, bounds.width, bounds.height);
    const aspectRatio = (tightBBOX.maxX - tightBBOX.minX) / (tightBBOX.maxY - tightBBOX.minY);
    const highH = Math.round(highW / aspectRatio);

    // Step 4: Download high-res
    const highUrl = buildWMSUrl(gisCode, state, tightBBOX, highW, highH, dpiVal);
    const highBuffer = await downloadImage(highUrl);

    return new NextResponse(highBuffer.buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="bhunaksha_${gisCode}.png"`,
        'X-Tight-BBOX': JSON.stringify(tightBBOX),
        'X-Image-Dimensions': `${highW}x${highH}`,
        'X-Content-Pixels': String(bounds.contentPixels)
      }
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

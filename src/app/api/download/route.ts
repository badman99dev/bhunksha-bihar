import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

const BHUNAKSHA = 'https://bhunaksha.bihar.gov.in';

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
  return `${BHUNAKSHA}/${state}/WMS?${params.toString()}`;
}

async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { 'Referer': `${BHUNAKSHA}/10/indexmain.jsp` }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
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
    const { levels, state } = body;

    if (!levels || !Array.isArray(levels) || levels.length < 7) {
      return NextResponse.json({ error: 'All 7 levels must be selected' }, { status: 400 });
    }

    const stateCode = state || '10';
    const gisLevels = levels.join(',') + ',';

    // Step 1: Get GIS code and BBOX from BhuNaksha
    const extentBody = new URLSearchParams({
      state: stateCode,
      gisLevels,
      srs: '0'
    });

    const extentRes = await fetch(`${BHUNAKSHA}/rest/MapInfo/getVVVVExtentGeoref`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': `${BHUNAKSHA}/${stateCode}/indexmain.jsp`,
      },
      body: extentBody.toString()
    });

    const extentData = await extentRes.json();

    if (!extentData.gisCode || !extentData.xmax) {
      return NextResponse.json({ error: 'Map not found for selected levels' }, { status: 404 });
    }

    const gisCode = extentData.gisCode;
    const origBBOX = {
      minX: extentData.xmin,
      minY: extentData.ymin,
      maxX: extentData.xmax,
      maxY: extentData.ymax
    };

    // Step 2: Download low-res
    const lowW = 800, lowH = 1280, dpi = 420;
    const lowUrl = buildWMSUrl(gisCode, stateCode, origBBOX, lowW, lowH, dpi);
    const lowBuffer = await downloadImage(lowUrl);

    // Step 3: Find content bounds
    const bounds = await findContentBounds(lowBuffer);

    // Step 4: Calculate tight BBOX
    const tightBBOX = pixelToBBOX(bounds, origBBOX, bounds.width, bounds.height);
    const aspectRatio = (tightBBOX.maxX - tightBBOX.minX) / (tightBBOX.maxY - tightBBOX.minY);
    const highW = 4000;
    const highH = Math.round(highW / aspectRatio);

    // Step 5: Download high-res
    const highUrl = buildWMSUrl(gisCode, stateCode, tightBBOX, highW, highH, dpi);
    const highBuffer = await downloadImage(highUrl);

    return new NextResponse(highBuffer.buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="bhunaksha_${gisCode}.png"`,
        'X-GIS-Code': gisCode,
        'X-Image-Dimensions': `${highW}x${highH}`,
      }
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

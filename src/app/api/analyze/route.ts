import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

const BHUNAKSHA = 'https://bhunaksha.bihar.gov.in';

function mercatorToLatLng(x: number, y: number): { lat: number; lng: number } {
  const R = 6378137;
  const lng = (x / R) * (180 / Math.PI);
  const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI);
  return { lat, lng };
}

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
  return `${BHUNAKSHA}/WMS?${params.toString()}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { levels, state, dpi } = body;
    if (!levels || !Array.isArray(levels) || levels.length < 7) {
      return NextResponse.json({ error: 'All 7 levels must be selected' }, { status: 400 });
    }

    const stateCode = state || '10';
    const targetDpi = dpi || 420;
    const gisLevels = levels.join(',') + ',';

    const extentBody = new URLSearchParams({ state: stateCode, gisLevels, srs: '0' });
    const extentRes = await fetch(`${BHUNAKSHA}/rest/MapInfo/getVVVVExtentGeoref`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': `${BHUNAKSHA}/${stateCode}/indexmain.jsp`,
      },
      body: extentBody.toString()
    });

    const extentText = await extentRes.text();
    let extentData;
    try { extentData = JSON.parse(extentText); }
    catch {
      return NextResponse.json({ error: 'BhuNaksha API error', detail: extentText.substring(0, 300) }, { status: 502 });
    }

    if (!extentData.gisCode || !extentData.xmax) {
      return NextResponse.json({ error: 'Map not found' }, { status: 404 });
    }

    const gisCode = extentData.gisCode;
    const origBBOX = { minX: extentData.xmin, minY: extentData.ymin, maxX: extentData.xmax, maxY: extentData.ymax };

    const lowW = 800, lowH = 1280;
    const lowUrl = buildWMSUrl(gisCode, stateCode, origBBOX, lowW, lowH, targetDpi);
    const lowRes = await fetch(lowUrl, { headers: { 'Referer': `${BHUNAKSHA}/10/indexmain.jsp` } });
    if (!lowRes.ok) throw new Error(`Low-res HTTP ${lowRes.status}`);
    const lowArrayBuf = await lowRes.arrayBuffer();
    const lowBuffer = Buffer.from(lowArrayBuf);

    const { data, info } = await sharp(lowBuffer).raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;

    let minX = width, minY = height, maxX = 0, maxY = 0, contentPixels = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * channels;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
        if (!(a < 10) && !(r > 240 && g > 240 && b > 240)) {
          contentPixels++;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    const totalPixels = width * height;
    const blankPct = ((1 - contentPixels / totalPixels) * 100).toFixed(1);
    const marginX = Math.floor((maxX - minX) * 0.02);
    const marginY = Math.floor((maxY - minY) * 0.02);
    const bounds = {
      minX: Math.max(0, minX - marginX),
      minY: Math.max(0, minY - marginY),
      maxX: Math.min(width - 1, maxX + marginX),
      maxY: Math.min(height - 1, maxY + marginY),
    };

    const bboxW = origBBOX.maxX - origBBOX.minX;
    const bboxH = origBBOX.maxY - origBBOX.minY;
    const tightBBOX = {
      minX: origBBOX.minX + (bounds.minX / width) * bboxW,
      maxX: origBBOX.minX + (bounds.maxX / width) * bboxW,
      minY: origBBOX.minY + (bounds.minY / height) * bboxH,
      maxY: origBBOX.minY + (bounds.maxY / height) * bboxH,
    };

    const lowResBase64 = `data:image/png;base64,${lowBuffer.toString('base64')}`;

    const cropPct = {
      left: ((bounds.minX / width) * 100).toFixed(1),
      top: ((bounds.minY / height) * 100).toFixed(1),
      right: (((width - bounds.maxX) / width) * 100).toFixed(1),
      bottom: (((height - bounds.maxY) / height) * 100).toFixed(1),
    };

    const centerLatLng = mercatorToLatLng(
      (tightBBOX.minX + tightBBOX.maxX) / 2,
      (tightBBOX.minY + tightBBOX.maxY) / 2
    );
    const googleMapsUrl = `https://www.google.com/maps?q=${centerLatLng.lat.toFixed(6)},${centerLatLng.lng.toFixed(6)}&z=16`;

    return NextResponse.json({
      gisCode,
      lowResImage: lowResBase64,
      blankPct,
      contentPct: ((contentPixels / totalPixels) * 100).toFixed(1),
      cropPct,
      tightBBOX,
      origBBOX,
      aspectRatio: ((tightBBOX.maxX - tightBBOX.minX) / (tightBBOX.maxY - tightBBOX.minY)).toFixed(4),
      googleMapsUrl,
      centerLatLng,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

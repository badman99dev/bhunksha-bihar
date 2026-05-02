import { NextRequest, NextResponse } from 'next/server';

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
  return `${BHUNAKSHA}/WMS?${params.toString()}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { gisCode, state, tightBBOX, resolution, dpi, aspectRatio } = body;

    if (!gisCode || !tightBBOX || !aspectRatio) {
      return NextResponse.json({ error: 'Missing analyze data' }, { status: 400 });
    }

    const stateCode = state || '10';
    const highW = resolution || 4000;
    const highH = Math.round(highW / parseFloat(aspectRatio));
    const targetDpi = dpi || 420;

    const highUrl = buildWMSUrl(gisCode, stateCode, tightBBOX, highW, highH, targetDpi);
    const highRes = await fetch(highUrl, { headers: { 'Referer': `${BHUNAKSHA}/10/indexmain.jsp` } });
    if (!highRes.ok) throw new Error(`High-res HTTP ${highRes.status}`);
    const arrayBuf = await highRes.arrayBuffer();

    return new NextResponse(arrayBuf, {
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

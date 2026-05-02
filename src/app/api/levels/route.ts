import { NextRequest, NextResponse } from 'next/server';

const BHUNAKSHA = 'https://bhunaksha.bihar.gov.in';

const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const state = searchParams.get('state') || '10';
    const level = searchParams.get('level') || '0';
    const rawCodes = searchParams.get('codes') || '';

    const cacheKey = `${state}:${level}:${rawCodes}`;

    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json(cached.data, {
        headers: {
          'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
          'X-Cache': 'HIT',
        }
      });
    }

    const codes = rawCodes ? rawCodes.split(',').filter(c => c).map(c => c + ',').join('') : '';

    const body = new URLSearchParams({
      state,
      level,
      codes,
      hasmap: 'true'
    });

    const res = await fetch(`${BHUNAKSHA}/rest/Levels/ListsAfterLevel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': `${BHUNAKSHA}/${state}/indexmain.jsp`,
      },
      body: body.toString()
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: 'Invalid response from BhuNaksha', raw: text.substring(0, 500) }, { status: 502 });
    }

    cache.set(cacheKey, { data, ts: Date.now() });

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
        'X-Cache': 'MISS',
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

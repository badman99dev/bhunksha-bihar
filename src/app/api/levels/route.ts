import { NextRequest, NextResponse } from 'next/server';

const BHUNAKSHA = 'https://bhunaksha.bihar.gov.in';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const state = searchParams.get('state') || '10';
    const level = searchParams.get('level') || '0';
    const codes = searchParams.get('codes') || '';

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
      return NextResponse.json({ error: 'Invalid response from BhuNaksha', raw: text.substring(0, 200) }, { status: 502 });
    }
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

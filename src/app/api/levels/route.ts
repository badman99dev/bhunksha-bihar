import { NextRequest, NextResponse } from 'next/server';

const BHUNAKSHA = 'https://bhunaksha.bihar.gov.in/10';

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
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

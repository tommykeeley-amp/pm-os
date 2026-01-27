import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const projectKey = request.nextUrl.searchParams.get('projectKey') || 'AMP';

    // Call the Electron app to get field options
    const response = await fetch('http://localhost:54321/jira-field-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectKey }),
    });

    if (!response.ok) {
      console.error('[Jira Field Options] Failed to fetch from Electron');
      return NextResponse.json({ success: false, pillars: [], pods: [] });
    }

    const data = await response.json();
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    console.error('[Jira Field Options] Error:', error);
    return NextResponse.json({ success: false, pillars: [], pods: [] });
  }
}

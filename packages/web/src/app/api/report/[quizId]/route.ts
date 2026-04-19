import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  try {
    const resolvedParams = await params;
    const quizId = resolvedParams.quizId.endsWith('.json') ? resolvedParams.quizId : resolvedParams.quizId + '.json';
    
    // O Next.js roda dentro do container na pasta /app/packages/web
    // Então voltamos duas pastas para achar o config/quizz
    const filePath = path.join(process.cwd(), '../../config/quizz', quizId);
    
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: `Quiz file not found inside container at: ${filePath}` }, { status: 404 });
    }
    
    const rawData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    // Apply player name corrections
    const namesPath = path.join(process.cwd(), '../../config/player-names.json');
    let nameCorrections: Record<string, string> = {};
    try {
      if (fs.existsSync(namesPath)) {
        nameCorrections = JSON.parse(fs.readFileSync(namesPath, 'utf-8'));
      }
    } catch {}

    if (rawData.lastSessionStats && Object.keys(nameCorrections).length > 0) {
      rawData.lastSessionStats = rawData.lastSessionStats.map((player: any) => {
        const key = player.clientId || player.realName || player.username || '';
        if (key && nameCorrections[key]) {
          return { ...player, realName: nameCorrections[key] };
        }
        return player;
      });
    }

    return NextResponse.json(rawData);
  } catch (error: any) {
    return NextResponse.json({ error: 'Server error: ' + error.message }, { status: 500 });
  }
}

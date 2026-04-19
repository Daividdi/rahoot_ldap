import { createAvatar } from '@dicebear/core'
import { bigSmile, avataaars } from '@dicebear/collection'
import { NextRequest, NextResponse } from 'next/server'

// Local avatar generation — no external API calls.
// Short cacheable URLs avoid data-URI bloat in socket messages.
export function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const style = p.get('style') || 'bigSmile'
  const seed  = p.get('seed')  || 'default'

  let svg: string
  try {
    if (style === 'avataaars') {
      const avatar = createAvatar(avataaars, {
        seed,
        skinColor:             [p.get('skin')       || 'f8d9c0'] as any,
        top:                   ['hijab']                          as any,
        hatColor:              [p.get('hijabColor') || '1a3c5e'] as any,
        clothesColor:          ['3c4f5c']                        as any,
        mouth:                 [p.get('mouth')      || 'smile']  as any,
        eyes:                  [p.get('eyes')       || 'happy']  as any,
        facialHairProbability: 0,
        eyebrows:              ['default']                       as any,
      })
      svg = avatar.toString()
    } else {
      const acc = p.get('acc') || 'none'
      const opts: any = {
        seed,
        skinColor:              [p.get('skin')      || 'f8d9c0'],
        hair:                   [p.get('hair')      || 'shortHair'],
        hairColor:              [p.get('hairColor') || '000000'],
        eyes:                   [p.get('eyes')      || 'cheery'],
        accessoriesProbability: acc !== 'none' ? 100 : 0,
      }
      if (acc !== 'none') opts.accessories = [acc]
      svg = createAvatar(bigSmile, opts).toString()
    }
  } catch (_e) {
    // Fallback: simple colored circle with initial
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#009edf"/><text x="50" y="65" text-anchor="middle" font-size="48" font-family="sans-serif" fill="white">${seed.charAt(0).toUpperCase()}</text></svg>`
  }

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Vary': '',
    },
  })
}

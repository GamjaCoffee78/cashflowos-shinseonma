import { handleStock } from '@/lib/stock-api'

// Stock tab → Google Sheet. Gated by the login cookie like every route
// (proxy.ts). The actions live in lib/stock-api.ts.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  return handleStock(req, { allowAddProduct: true, paths: ['/stock'] })
}

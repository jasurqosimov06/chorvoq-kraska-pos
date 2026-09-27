// Vercel serverless funksiya: rasm(lar)dan tovarlarni Claude orqali ajratib oladi.
// Kalit (ANTHROPIC_API_KEY) faqat serverda — brauzerga chiqmaydi.
// Faqat tizimga kirgan Admin chaqira oladi (Supabase token tekshiriladi).
import Anthropic from '@anthropic-ai/sdk'

const MAX_IMAGES = 5
const MAX_IMAGE_BYTES = 1_500_000 // bitta rasm (base64 dan keyin) ~1.5MB

const SCHEMA = {
  type: 'object',
  properties: {
    products: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: "To'liq nomi: tur + rang/xususiyat + hajm, masalan 'Akril emulsiya oq 20kg'" },
          family: { type: 'string', description: "Guruh: hajmsiz umumiy nom, masalan 'Akril emulsiya'" },
          category: { type: 'string' },
          brand: { type: 'string' },
          size: { type: 'string', description: "Hajm/o'lchov, masalan '20 kg', '2.7 kg', '10 L'" },
          unit: { type: 'string', enum: ['dona', 'kg', 'litr', 'komplekt', 'metr'] },
          barcode: { type: 'string', description: "Shtrix-kod raqamlari (ko'rinsa), aks holda bo'sh" },
          qty: { type: 'number', description: "Miqdor (nakladnoyda bo'lsa), aks holda 0" },
          cost: { type: 'number', description: "Kirim (xarid) narxi bir dona uchun, bo'lmasa 0" },
          costCurrency: { type: 'string', enum: ['USD', 'UZS'] },
          price: { type: 'number', description: "Sotuv narxi so'mda (ko'rinsa), aks holda 0" },
          confidence: { type: 'string', enum: ['yuqori', "o'rta", 'past'] },
          note: { type: 'string', description: "Noaniq joylar haqida qisqa izoh, bo'lmasa bo'sh" },
        },
        required: ['name', 'family', 'category', 'brand', 'size', 'unit', 'barcode', 'qty', 'cost', 'costCurrency', 'price', 'confidence', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['products'],
  additionalProperties: false,
}

const client = new Anthropic() // ANTHROPIC_API_KEY env'dan

function json(status: number, body: unknown) {
  return Response.json(body, { status })
}

// Supabase access token → foydalanuvchi va uning roli
async function requireAdmin(req: Request): Promise<string | null> {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!url || !key || !token) return 'Tizimga kiring'
  const u = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } })
  if (!u.ok) return 'Sessiya tugagan, qayta kiring'
  const user = (await u.json()) as { id: string }
  const p = await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  })
  const rows = p.ok ? ((await p.json()) as { role: string }[]) : []
  if (rows[0]?.role !== 'admin') return 'Bu amal faqat Admin uchun'
  return null
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return json(500, { error: 'Serverda ANTHROPIC_API_KEY sozlanmagan' })
  const authErr = await requireAdmin(req)
  if (authErr) return json(401, { error: authErr })

  let body: { images?: string[]; categories?: string[] }
  try { body = await req.json() } catch { return json(400, { error: "So'rov noto'g'ri" }) }
  const images = (body.images ?? []).filter((s) => typeof s === 'string' && s.startsWith('data:image/jpeg;base64,'))
  if (images.length === 0) return json(400, { error: 'Rasm yuborilmadi' })
  if (images.length > MAX_IMAGES) return json(400, { error: `Bir martada ko'pi bilan ${MAX_IMAGES} ta rasm` })
  if (images.some((s) => s.length > MAX_IMAGE_BYTES)) return json(400, { error: 'Rasm juda katta' })
  const categories = (body.categories ?? []).filter((c) => typeof c === 'string').slice(0, 60)

  const content: Anthropic.Beta.BetaContentBlockParam[] = images.map((d) => ({
    type: 'image',
    source: { type: 'base64', media_type: 'image/jpeg', data: d.slice('data:image/jpeg;base64,'.length) },
  }))
  content.push({
    type: 'text',
    text:
      `Bu rasmlar O'zbekistondagi kraska va qurilish-bezak mollari do'konidan: tovar yorliqlari (banka, qop), ` +
      `nakladnoy/hisob-faktura yoki narxlar ro'yxati bo'lishi mumkin. Rasmlardagi har bir alohida tovarni ajratib ber.\n\n` +
      `Qoidalar:\n` +
      `- Bir xil tovar bir necha rasmda ko'rinsa, bitta qator qil.\n` +
      `- Nomni o'zbek (lotin) tilida, do'konda ishlatiladigan qisqa ko'rinishda yoz; brend nomini nomga qo'shma, "brand" maydoniga yoz.\n` +
      `- Kategoriya quyidagi ro'yxatdan eng mosini tanla, mos kelmasa "Boshqa": ${categories.join(' | ')}\n` +
      `- Narxlar: nakladnoyda so'mda bo'lsa costCurrency="UZS", dollarda bo'lsa "USD". Rasmda yo'q narxni o'ylab topma — 0 qo'y.\n` +
      `- Shtrix-kodni faqat raqamlari aniq o'qilsa yoz.\n` +
      `- O'qib bo'lmaydigan yoki taxminiy joylarni confidence va note orqali belgilab qo'y.\n` +
      `- Rasmda tovar bo'lmasa, bo'sh ro'yxat qaytar.`,
  })

  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content }],
    })
    if (response.stop_reason === 'refusal') return json(422, { error: 'AI bu rasmni qayta ishlay olmadi' })
    if (response.stop_reason === 'max_tokens') return json(422, { error: "Rasmda tovar juda ko'p — kamroq rasm yuboring" })
    const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text
    if (!text) return json(502, { error: "AI javobi bo'sh" })
    const parsed = JSON.parse(text) as { products: unknown[] }
    return json(200, { products: parsed.products })
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json(429, { error: "AI band, bir daqiqadan so'ng qayta urinib ko'ring" })
    if (err instanceof Anthropic.AuthenticationError) return json(500, { error: "Serverdagi AI kaliti noto'g'ri" })
    if (err instanceof Anthropic.APIError) return json(502, { error: `AI xatosi (${err.status})` })
    return json(500, { error: 'Kutilmagan xato' })
  }
}

export async function sendTelegram(token: string, chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!token || !chatId) return { ok: false, error: 'Token yoki Chat ID kiritilmagan' }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })
    const data = await res.json()
    if (!data.ok) return { ok: false, error: data.description || 'Telegram xatosi' }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Tarmoq xatosi' }
  }
}

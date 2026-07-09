// ============================================================
// /api/busca — BUSCA GRATUITA NO YOUTUBE (sem API key!)
// ============================================================
// Função serverless do Vercel. O site chama /api/busca?q=nome
// e recebe a lista de vídeos. Usa a biblioteca yt-search — a
// mesma do app do karaokê — que não consome cota nenhuma.
// ============================================================
const yts = require('yt-search');

module.exports = async (req, res) => {
  // Permite que só o próprio site use (e cacheia por 60s
  // buscas repetidas, ex: as categorias populares)
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  const q = String((req.query && req.query.q) || '').trim().slice(0, 100);
  if (!q) {
    res.status(400).json({ erro: 'Busca vazia.' });
    return;
  }

  try {
    const resultado = await yts(q);
    const videos = (resultado.videos || []).slice(0, 12).map((v) => ({
      id: v.videoId,
      title: v.title,
      channel: v.author ? v.author.name : '',
      thumb: v.thumbnail || '',
      duration: v.timestamp || '',
    }));
    res.status(200).json({ videos });
  } catch (e) {
    res.status(500).json({ erro: 'Falha na busca. Tente novamente.' });
  }
};

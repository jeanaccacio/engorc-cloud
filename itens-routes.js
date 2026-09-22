const express = require('express');
const multer = require('multer');
const { pool } = require('../../db');
const { autenticar, exigirAdmin } = require('../auth');
const { parseSinapiBuffer } = require('../utils/parseSinapi');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

// Busca no catálogo — usado pela tela de Orçamento (busca por código ou descrição).
router.get('/buscar', autenticar, async (req, res) => {
  const q = (req.query.q || '').trim();
  const fontes = (req.query.fontes || '').split(',').map(s => s.trim()).filter(Boolean);
  if(q.length < 3) return res.json({ itens: [] });

  const params = [`%${q}%`];
  let sql = `SELECT id, fonte, codigo, descricao, unidade, custo_desonerado AS "custoDesonerado", custo_nao_desonerado AS "custoNaoDesonerado"
             FROM itens WHERE (codigo ILIKE $1 OR descricao ILIKE $1)`;
  if(fontes.length){
    sql += ` AND fonte = ANY($2)`;
    params.push(fontes);
  }
  sql += ` LIMIT 80`;
  const { rows } = await pool.query(sql, params);
  res.json({ itens: rows });
});

// Estatísticas do catálogo (para a tela "Base de dados").
router.get('/meta', autenticar, async (req, res) => {
  const total = await pool.query('SELECT COUNT(*)::int AS total FROM itens');
  const porFonte = await pool.query('SELECT fonte, COUNT(*)::int AS total FROM itens GROUP BY fonte');
  const meta = await pool.query('SELECT * FROM meta_importacao WHERE id = $1', ['baseInfo']);
  res.json({
    total: total.rows[0].total,
    porFonte: Object.fromEntries(porFonte.rows.map(r => [r.fonte, r.total])),
    importacao: meta.rows[0] || null
  });
});

// Importa a planilha de referência (apenas administradores) — substitui todo o catálogo.
router.post('/importar', autenticar, exigirAdmin, upload.single('arquivo'), async (req, res) => {
  if(!req.file) return res.status(400).json({ erro: 'Envie o arquivo da planilha.' });
  let itens;
  try{
    const brutos = parseSinapiBuffer(req.file.buffer);
    // A planilha de referência pode ter códigos repetidos (mesma fonte+código em mais de uma linha).
    // Mantém a última ocorrência de cada id, evitando erro de "ON CONFLICT" com duplicata no mesmo lote.
    const porId = new Map();
    brutos.forEach(it => porId.set(it.id, it));
    itens = Array.from(porId.values());
  }catch(e){
    return res.status(400).json({ erro: e.message });
  }

  const client = await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('TRUNCATE itens');
    const BATCH = 1000;
    for(let i = 0; i < itens.length; i += BATCH){
      const lote = itens.slice(i, i + BATCH);
      // Monta o INSERT com todos os campos (7 por item) de forma segura (parametrizado).
      const params = [];
      const placeholders = lote.map((it, idx) => {
        const base = idx * 7;
        params.push(it.id, it.fonte, it.codigo, it.descricao, it.unidade, it.custoDesonerado, it.custoNaoDesonerado);
        return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7})`;
      }).join(',');
      await client.query(
        `INSERT INTO itens (id, fonte, codigo, descricao, unidade, custo_desonerado, custo_nao_desonerado) VALUES ${placeholders}
         ON CONFLICT (id) DO UPDATE SET fonte=EXCLUDED.fonte, codigo=EXCLUDED.codigo, descricao=EXCLUDED.descricao,
           unidade=EXCLUDED.unidade, custo_desonerado=EXCLUDED.custo_desonerado, custo_nao_desonerado=EXCLUDED.custo_nao_desonerado`,
        params
      );
    }
    const nomeArquivoCorrigido = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    await client.query(
      `INSERT INTO meta_importacao (id, arquivo, total, importado_por) VALUES ('baseInfo', $1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET arquivo=EXCLUDED.arquivo, total=EXCLUDED.total, importado_em=now(), importado_por=EXCLUDED.importado_por`,
      [nomeArquivoCorrigido, itens.length, req.usuario.nome]
    );
    await client.query('COMMIT');
    res.json({ ok: true, total: itens.length });
  }catch(e){
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ erro: 'Falha ao salvar o catálogo no banco.' });
  }finally{
    client.release();
  }
});

module.exports = router;

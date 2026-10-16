const express = require('express');
const multer = require('multer');
const { pool } = require('../../db');
const { autenticar, exigirAdmin, exigirEditor } = require('../auth');
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

const COLS = `id, fonte, codigo, descricao, unidade, custo_desonerado AS "custoDesonerado", custo_nao_desonerado AS "custoNaoDesonerado"`;

// Busca vários itens pelo código (usado pelo motor de pavimentação e pela importação de obras/composições).
// Body: { codigos:[...], fontes:[...opcional, em ordem de preferência] }. Retorna também os não encontrados.
router.post('/por-codigos', autenticar, async (req, res) => {
  const codigos = Array.from(new Set(((req.body && req.body.codigos) || []).map(c => String(c).trim()).filter(Boolean))).slice(0, 2000);
  const fontes = ((req.body && req.body.fontes) || []).map(String);
  if(!codigos.length) return res.json({ itens: [], naoEncontrados: [] });
  const params = [codigos];
  let sql = `SELECT ${COLS} FROM itens WHERE codigo = ANY($1)`;
  if(fontes.length){ sql += ' AND fonte = ANY($2)'; params.push(fontes); }
  const { rows } = await pool.query(sql, params);
  // Um mesmo código pode existir em mais de uma fonte: escolhe pela ordem de preferência informada.
  const ordem = f => { const i = fontes.indexOf(f); return i === -1 ? 99 : i; };
  const porCodigo = {};
  rows.forEach(r => { const atual = porCodigo[r.codigo]; if(!atual || ordem(r.fonte) < ordem(atual.fonte)) porCodigo[r.codigo] = r; });
  res.json({ itens: Object.values(porCodigo), naoEncontrados: codigos.filter(c => !porCodigo[c]) });
});

// Busca itens pelo id interno ("SINAPI 95995", "Própria C001"...).
router.post('/por-ids', autenticar, async (req, res) => {
  const ids = Array.from(new Set(((req.body && req.body.ids) || []).map(String))).slice(0, 2000);
  if(!ids.length) return res.json({ itens: [] });
  const { rows } = await pool.query(`SELECT ${COLS} FROM itens WHERE id = ANY($1)`, [ids]);
  res.json({ itens: rows });
});

// Cria/atualiza um item próprio da equipe (composição própria fora do SINAPI, ex.: C001).
// Fica no catálogo compartilhado com fonte "Própria" e NÃO é apagado quando a base SINAPI é reimportada.
router.post('/propria', autenticar, exigirEditor, async (req, res) => {
  const b = req.body || {};
  const codigo = String(b.codigo || '').trim();
  const descricao = String(b.descricao || '').trim();
  const unidade = String(b.unidade || '').trim();
  if(!codigo || !descricao || !unidade) return res.status(400).json({ erro: 'Informe código, descrição e unidade.' });
  const custo = Math.max(0, parseFloat(b.custo) || 0);
  const custoD = b.custoDesonerado != null ? Math.max(0, parseFloat(b.custoDesonerado) || 0) : custo;
  const custoN = b.custoNaoDesonerado != null ? Math.max(0, parseFloat(b.custoNaoDesonerado) || 0) : custo;
  const id = 'Própria ' + codigo;
  await pool.query(
    `INSERT INTO itens (id, fonte, codigo, descricao, unidade, custo_desonerado, custo_nao_desonerado) VALUES ($1,'Própria',$2,$3,$4,$5,$6)
     ON CONFLICT (id) DO UPDATE SET descricao=EXCLUDED.descricao, unidade=EXCLUDED.unidade,
       custo_desonerado=EXCLUDED.custo_desonerado, custo_nao_desonerado=EXCLUDED.custo_nao_desonerado`,
    [id, codigo, descricao, unidade, custoD, custoN]
  );
  const { rows } = await pool.query(`SELECT ${COLS} FROM itens WHERE id = $1`, [id]);
  res.json({ item: rows[0] });
});

router.delete('/propria/:codigo', autenticar, exigirEditor, async (req, res) => {
  const id = 'Própria ' + String(req.params.codigo).trim();
  await pool.query(`DELETE FROM itens WHERE id = $1 AND fonte = 'Própria'`, [id]);
  await pool.query('DELETE FROM composicoes WHERE item_id = $1', [id]);
  res.json({ ok: true });
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
    // Itens próprios da equipe (fonte "Própria") são preservados — só a base de referência é substituída.
    await client.query("DELETE FROM itens WHERE fonte <> 'Própria'");
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

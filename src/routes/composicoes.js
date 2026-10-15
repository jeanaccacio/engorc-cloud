const express = require('express');
const { pool } = require('../../db');
const { autenticar } = require('../auth');

const router = express.Router();

// Normaliza uma linha de composição vinda do front-end.
function limparLinha(l){
  const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  return {
    tipo: String(l.tipo || 'Material').slice(0, 40),
    refId: l.refId ? String(l.refId) : null,           // item do catálogo (o preço acompanha a base)
    fonte: l.fonte ? String(l.fonte) : '',
    codigo: String(l.codigo || '').slice(0, 40),
    descricao: String(l.descricao || '').slice(0, 500),
    unidade: String(l.unidade || '').slice(0, 20),
    coef: num(l.coef),
    precoD: num(l.precoD),                              // preço desonerado (fixo ou último lido do catálogo)
    precoND: num(l.precoND)                             // preço não desonerado
  };
}

// Lista todas as composições (com dados do item dono, quando existir no catálogo).
router.get('/', autenticar, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.item_id, c.linhas, c.observacao, c.atualizado_por, c.atualizado_em,
            i.fonte, i.codigo, i.descricao, i.unidade, i.custo_desonerado AS "custoDesonerado", i.custo_nao_desonerado AS "custoNaoDesonerado"
       FROM composicoes c LEFT JOIN itens i ON i.id = c.item_id
      ORDER BY i.fonte, i.codigo`);
  res.json({ composicoes: rows.map(r => ({
    itemId: r.item_id, linhas: r.linhas, observacao: r.observacao, atualizadoPor: r.atualizado_por, atualizadoEm: r.atualizado_em,
    item: r.codigo ? { id: r.item_id, fonte: r.fonte, codigo: r.codigo, descricao: r.descricao, unidade: r.unidade,
      custoDesonerado: r.custoDesonerado, custoNaoDesonerado: r.custoNaoDesonerado } : null
  })) });
});

router.put('/:itemId', autenticar, async (req, res) => {
  const b = req.body || {};
  const linhas = Array.isArray(b.linhas) ? b.linhas.slice(0, 500).map(limparLinha) : [];
  await pool.query(
    `INSERT INTO composicoes (item_id, linhas, observacao, atualizado_por, atualizado_em) VALUES ($1,$2,$3,$4,now())
     ON CONFLICT (item_id) DO UPDATE SET linhas=EXCLUDED.linhas, observacao=EXCLUDED.observacao,
       atualizado_por=EXCLUDED.atualizado_por, atualizado_em=now()`,
    [req.params.itemId, JSON.stringify(linhas), b.observacao || null, req.usuario.nome]
  );
  res.json({ ok: true });
});

// Grava várias composições de uma vez (importação por planilha ou de uma obra antiga do EngPav).
// modo "manter" não sobrescreve composições que já existem; "substituir" sobrescreve.
router.post('/lote', autenticar, async (req, res) => {
  const lista = Array.isArray(req.body && req.body.composicoes) ? req.body.composicoes.slice(0, 3000) : [];
  const substituir = (req.body && req.body.modo) === 'substituir';
  const client = await pool.connect();
  let gravadas = 0, mantidas = 0;
  try{
    await client.query('BEGIN');
    for(const c of lista){
      if(!c || !c.itemId) continue;
      const linhas = Array.isArray(c.linhas) ? c.linhas.slice(0, 500).map(limparLinha) : [];
      const r = await client.query(
        `INSERT INTO composicoes (item_id, linhas, atualizado_por) VALUES ($1,$2,$3)
         ON CONFLICT (item_id) DO ${substituir ? 'UPDATE SET linhas=EXCLUDED.linhas, atualizado_por=EXCLUDED.atualizado_por, atualizado_em=now()' : 'NOTHING'}`,
        [String(c.itemId), JSON.stringify(linhas), req.usuario.nome]);
      if(r.rowCount) gravadas++; else mantidas++;
    }
    await client.query('COMMIT');
    res.json({ ok: true, gravadas, mantidas });
  }catch(e){
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ erro: 'Falha ao gravar composições.' });
  }finally{ client.release(); }
});

router.delete('/:itemId', autenticar, async (req, res) => {
  await pool.query('DELETE FROM composicoes WHERE item_id = $1', [req.params.itemId]);
  res.json({ ok: true });
});

module.exports = router;

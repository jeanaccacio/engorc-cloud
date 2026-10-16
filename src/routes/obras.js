const express = require('express');
const { pool } = require('../../db');
const { autenticar, exigirAdmin } = require('../auth');

const router = express.Router();
function uid(prefixo){ return prefixo + Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

function linhaParaObra(r){
  return {
    id: r.id, nome: r.nome, tipoObra: r.tipo_obra, municipio: r.municipio, orgao: r.orgao,
    processo: r.processo, responsavel: r.responsavel, crea: r.crea, regime: r.regime, dataBase: r.data_base,
    bdi: r.bdi, grupos: r.grupos, grupoAtivo: r.grupo_ativo, itens: r.itens, cronograma: r.cronograma,
    extras: r.extras || {},
    criadoPorNome: r.criado_por_nome, criadoEm: r.criado_em, atualizadoEm: r.atualizado_em
  };
}

// Lista todas as obras da equipe (time pequeno — todo mundo vê tudo, sem filtro por dono).
// Inclui o resumo para o Painel geral: acompanhamento (fase/checklists/prazos) e total orçado.
router.get('/', autenticar, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, nome, tipo_obra, municipio, responsavel, criado_por_nome, atualizado_em,
            extras->'fluxo' AS fluxo, extras->>'convenio' AS convenio, extras->>'valorInformado' AS valor_informado,
            (SELECT COALESCE(SUM(CASE WHEN jsonb_typeof(i->'custoTotal') = 'number' THEN (i->>'custoTotal')::float8 ELSE 0 END), 0)
               FROM jsonb_array_elements(CASE WHEN jsonb_typeof(itens) = 'array' THEN itens ELSE '[]'::jsonb END) i) AS total
       FROM obras ORDER BY atualizado_em DESC`);
  res.json({ obras: rows.map(r => ({
    id: r.id, nome: r.nome, tipoObra: r.tipo_obra, municipio: r.municipio, responsavel: r.responsavel,
    criadoPorNome: r.criado_por_nome, atualizadoEm: r.atualizado_em,
    fluxo: r.fluxo || null, convenio: r.convenio || '', total: r.total || 0,
    valorInformado: parseFloat(r.valor_informado) || 0
  })) });
});

router.get('/:id', autenticar, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM obras WHERE id = $1', [req.params.id]);
  if(!rows[0]) return res.status(404).json({ erro: 'Obra não encontrada.' });
  res.json({ obra: linhaParaObra(rows[0]) });
});

router.post('/', autenticar, async (req, res) => {
  const b = req.body || {};
  const id = b.id || uid('obra');
  const bdiPadrao = { ac:null, sg:null, r:null, df:null, l:null, iss:2, pis:0.65, cofins:3, final:0 };
  await pool.query(
    `INSERT INTO obras (id, nome, tipo_obra, municipio, orgao, processo, responsavel, crea, regime, data_base, bdi, grupos, grupo_ativo, itens, cronograma, extras, criado_por_id, criado_por_nome)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [id, b.nome || 'Nova obra', b.tipoObra || 'edificios', b.municipio || null, b.orgao || null,
     b.processo || null, b.responsavel || null, b.crea || null, b.regime || 'nao_desonerado', b.dataBase || null,
     JSON.stringify(b.bdi || bdiPadrao), JSON.stringify(b.grupos || []), b.grupoAtivo || null,
     JSON.stringify(b.itens || []), JSON.stringify(b.cronograma || { meses: 6, porGrupo: {} }),
     JSON.stringify(b.extras || {}),
     req.usuario.id, req.usuario.nome]
  );
  const { rows } = await pool.query('SELECT * FROM obras WHERE id = $1', [id]);
  res.status(201).json({ obra: linhaParaObra(rows[0]) });
});

// Atualiza a obra inteira (mesmo padrão do "salvar" já usado no front-end).
// "extras" é opcional: um front-end antigo que não envia o campo não apaga os dados de pavimentação.
router.put('/:id', autenticar, async (req, res) => {
  const b = req.body || {};
  const { rowCount } = await pool.query(
    `UPDATE obras SET nome=$1, tipo_obra=$2, municipio=$3, orgao=$4, processo=$5, responsavel=$6, crea=$7,
       regime=$8, data_base=$9, bdi=$10, grupos=$11, grupo_ativo=$12, itens=$13, cronograma=$14,
       extras=COALESCE($16::jsonb, extras), atualizado_em=now()
     WHERE id = $15`,
    [b.nome, b.tipoObra, b.municipio || null, b.orgao || null, b.processo || null, b.responsavel || null, b.crea || null,
     b.regime, b.dataBase || null, JSON.stringify(b.bdi), JSON.stringify(b.grupos), b.grupoAtivo || null,
     JSON.stringify(b.itens), JSON.stringify(b.cronograma), req.params.id,
     b.extras === undefined ? null : JSON.stringify(b.extras)]
  );
  if(!rowCount) return res.status(404).json({ erro: 'Obra não encontrada.' });
  const { rows } = await pool.query('SELECT * FROM obras WHERE id = $1', [req.params.id]);
  res.json({ obra: linhaParaObra(rows[0]) });
});

// Excluir obra: só administradores (evita perda acidental de dados da equipe).
router.delete('/:id', autenticar, exigirAdmin, async (req, res) => {
  await pool.query('DELETE FROM obras WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;

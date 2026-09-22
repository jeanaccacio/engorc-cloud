const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../../db');
const { autenticar, exigirAdmin } = require('../auth');

const router = express.Router();

function uid(prefixo){ return prefixo + Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

router.post('/login', async (req, res) => {
  const { email, senha } = req.body || {};
  if(!email || !senha) return res.status(400).json({ erro: 'Informe e-mail e senha.' });
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [String(email).toLowerCase().trim()]);
  const user = rows[0];
  if(!user || !user.ativo) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
  const ok = await bcrypt.compare(senha, user.senha_hash);
  if(!ok) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
  const payload = { id: user.id, nome: user.nome, email: user.email, admin: user.admin };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, usuario: payload });
});

router.get('/me', autenticar, (req, res) => {
  res.json({ usuario: req.usuario });
});

// Lista usuários (admin) — para gestão da equipe.
router.get('/usuarios', autenticar, exigirAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT id, nome, email, admin, ativo, criado_em FROM users ORDER BY criado_em ASC');
  res.json({ usuarios: rows });
});

// Cria um novo usuário da equipe (admin) — não existe autocadastro público.
router.post('/usuarios', autenticar, exigirAdmin, async (req, res) => {
  const { nome, email, senha, admin } = req.body || {};
  if(!nome || !email || !senha) return res.status(400).json({ erro: 'Nome, e-mail e senha são obrigatórios.' });
  const emailNorm = String(email).toLowerCase().trim();
  const existe = await pool.query('SELECT id FROM users WHERE email = $1', [emailNorm]);
  if(existe.rows.length) return res.status(409).json({ erro: 'Já existe um usuário com esse e-mail.' });
  const senhaHash = await bcrypt.hash(senha, 10);
  const id = uid('u');
  await pool.query(
    'INSERT INTO users (id, nome, email, senha_hash, admin) VALUES ($1,$2,$3,$4,$5)',
    [id, nome.trim(), emailNorm, senhaHash, !!admin]
  );
  res.status(201).json({ id, nome, email: emailNorm, admin: !!admin });
});

router.patch('/usuarios/:id', autenticar, exigirAdmin, async (req, res) => {
  const { ativo, admin } = req.body || {};
  const campos = [], valores = []; let i = 1;
  if(typeof ativo === 'boolean'){ campos.push(`ativo = $${i++}`); valores.push(ativo); }
  if(typeof admin === 'boolean'){ campos.push(`admin = $${i++}`); valores.push(admin); }
  if(campos.length === 0) return res.status(400).json({ erro: 'Nada para atualizar.' });
  valores.push(req.params.id);
  await pool.query(`UPDATE users SET ${campos.join(', ')} WHERE id = $${i}`, valores);
  res.json({ ok: true });
});

module.exports = router;

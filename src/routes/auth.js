const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../../db');
const { autenticar, exigirAdmin } = require('../auth');
const { cifrar, decifrar } = require('../utils/cofre');

const router = express.Router();

const PERFIS = ['editor', 'acompanhamento', 'visualizador'];
function uid(prefixo){ return prefixo + Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
const TAM_MIN_SENHA = 6;

// Token de login: carrega a "versão da sessão" (sv). Trocar/redefinir a senha muda a versão e derruba os logins antigos.
function emitirToken(user){
  const payload = { id: user.id, nome: user.nome, email: user.email, admin: user.admin, sv: user.sessao_versao || 0 };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '30d' });
}

router.post('/login', async (req, res) => {
  const { email, senha } = req.body || {};
  if(!email || !senha) return res.status(400).json({ erro: 'Informe e-mail e senha.' });
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [String(email).toLowerCase().trim()]);
  const user = rows[0];
  if(!user || !user.ativo) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
  const ok = await bcrypt.compare(senha, user.senha_hash);
  if(!ok) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
  const payload = { id: user.id, nome: user.nome, email: user.email, admin: user.admin };
  const perfil = user.admin ? 'editor' : (user.perfil || 'editor');
  const token = emitirToken(user);
  res.json({ token, usuario: { ...payload, perfil, senhaProvisoria: !!user.senha_provisoria, logo: user.logo_base64 || null, coresImpressao: user.cores_impressao || null } });
});

router.get('/me', autenticar, async (req, res) => {
  const { rows } = await pool.query('SELECT logo_base64, cores_impressao FROM users WHERE id = $1', [req.usuario.id]);
  res.json({ usuario: { ...req.usuario, logo: rows[0] ? rows[0].logo_base64 : null, coresImpressao: rows[0] ? rows[0].cores_impressao : null } });
});

// Troca a própria senha. Exige a senha atual (a provisória, no primeiro acesso).
// Depois disso a pessoa pode trocar quantas vezes quiser; a senha inicial deixa de ser guardada.
router.put('/senha', autenticar, async (req, res) => {
  const { senhaAtual, novaSenha } = req.body || {};
  if(!senhaAtual || !novaSenha) return res.status(400).json({ erro: 'Informe a senha atual e a nova senha.' });
  if(String(novaSenha).length < TAM_MIN_SENHA) return res.status(400).json({ erro: `A nova senha precisa ter pelo menos ${TAM_MIN_SENHA} caracteres.` });
  if(novaSenha === senhaAtual) return res.status(400).json({ erro: 'A nova senha precisa ser diferente da atual.' });
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.usuario.id]);
  const user = rows[0];
  if(!user) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  const ok = await bcrypt.compare(senhaAtual, user.senha_hash);
  if(!ok) return res.status(400).json({ erro: 'A senha atual está incorreta.' });
  const novaHash = await bcrypt.hash(String(novaSenha), 10);
  const { rows: atualizado } = await pool.query(
    `UPDATE users SET senha_hash = $1, senha_provisoria = FALSE, senha_inicial_cifrada = NULL, sessao_versao = sessao_versao + 1
     WHERE id = $2 RETURNING *`, [novaHash, req.usuario.id]);
  const token = emitirToken(atualizado[0]);
  res.json({ ok: true, token });
});

// Define/atualiza a logo de impressão do próprio usuário (qualquer usuário logado, não só admin).
router.put('/me/logo', autenticar, async (req, res) => {
  const { logo } = req.body || {};
  if(logo !== null && (typeof logo !== 'string' || !logo.startsWith('data:image/'))){
    return res.status(400).json({ erro: 'Envie uma imagem válida.' });
  }
  if(logo && logo.length > 700000){
    return res.status(400).json({ erro: 'Imagem muito grande — use um arquivo menor (até ~500 KB).' });
  }
  await pool.query('UPDATE users SET logo_base64 = $1 WHERE id = $2', [logo, req.usuario.id]);
  res.json({ ok: true });
});

// Cores da impressão do próprio usuário: null = automáticas (tiradas da logo); ou { principal, destaque } em #RRGGBB.
router.put('/me/cores', autenticar, async (req, res) => {
  const { cores } = req.body || {};
  const hex = v => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
  if(cores !== null && !(cores && hex(cores.principal) && hex(cores.destaque))){
    return res.status(400).json({ erro: 'Cores inválidas.' });
  }
  await pool.query('UPDATE users SET cores_impressao = $1 WHERE id = $2', [cores ? JSON.stringify({ principal: cores.principal, destaque: cores.destaque }) : null, req.usuario.id]);
  res.json({ ok: true });
});

// Lista usuários (admin) — para gestão da equipe.
router.get('/usuarios', autenticar, exigirAdmin, async (req, res) => {
  const { rows } = await pool.query(`SELECT id, nome, email, admin, ativo, perfil, senha_provisoria,
      (senha_inicial_cifrada IS NOT NULL) AS senha_inicial_disponivel, criado_em FROM users ORDER BY criado_em ASC`);
  res.json({ usuarios: rows });
});

// Mostra ao administrador a senha inicial criada para a pessoa (só enquanto ela não trocou).
router.get('/usuarios/:id/senha-inicial', autenticar, exigirAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT nome, senha_inicial_cifrada FROM users WHERE id = $1', [req.params.id]);
  if(!rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  if(!rows[0].senha_inicial_cifrada) return res.status(404).json({ erro: 'A senha inicial não está mais guardada — a pessoa já trocou a senha. Use "Redefinir senha" se precisar de uma nova.' });
  let senha;
  try{ senha = decifrar(rows[0].senha_inicial_cifrada); }
  catch(e){ return res.status(500).json({ erro: 'Não foi possível ler a senha guardada (a chave SENHA_CHAVE do servidor mudou?).' }); }
  res.set('Cache-Control', 'no-store');
  res.json({ nome: rows[0].nome, senha });
});

// Cria um novo usuário da equipe (admin) — não existe autocadastro público.
router.post('/usuarios', autenticar, exigirAdmin, async (req, res) => {
  const { nome, email, senha, admin } = req.body || {};
  const perfil = PERFIS.includes(req.body && req.body.perfil) ? req.body.perfil : 'editor';
  if(!nome || !email || !senha) return res.status(400).json({ erro: 'Nome, e-mail e senha são obrigatórios.' });
  if(String(senha).length < TAM_MIN_SENHA) return res.status(400).json({ erro: `A senha provisória precisa ter pelo menos ${TAM_MIN_SENHA} caracteres.` });
  const emailNorm = String(email).toLowerCase().trim();
  const existe = await pool.query('SELECT id FROM users WHERE email = $1', [emailNorm]);
  if(existe.rows.length) return res.status(409).json({ erro: 'Já existe um usuário com esse e-mail.' });
  const senhaHash = await bcrypt.hash(senha, 10);
  const id = uid('u');
  await pool.query(
    `INSERT INTO users (id, nome, email, senha_hash, admin, perfil, senha_provisoria, senha_inicial_cifrada)
     VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7)`,
    [id, nome.trim(), emailNorm, senhaHash, !!admin, admin ? 'editor' : perfil, cifrar(senha)]
  );
  res.status(201).json({ id, nome, email: emailNorm, admin: !!admin, perfil: admin ? 'editor' : perfil });
});

// Redefine a senha de alguém (admin): a pessoa volta a ter uma senha provisória, que precisa trocar no próximo acesso.
// Os logins antigos dela são encerrados na hora.
router.post('/usuarios/:id/redefinir-senha', autenticar, exigirAdmin, async (req, res) => {
  if(req.params.id === req.usuario.id) return res.status(400).json({ erro: 'Para trocar a sua, use Minha Conta.' });
  const { novaSenha } = req.body || {};
  if(!novaSenha || String(novaSenha).length < TAM_MIN_SENHA) return res.status(400).json({ erro: `A senha provisória precisa ter pelo menos ${TAM_MIN_SENHA} caracteres.` });
  const hash = await bcrypt.hash(String(novaSenha), 10);
  const { rowCount } = await pool.query(
    `UPDATE users SET senha_hash = $1, senha_provisoria = TRUE, senha_inicial_cifrada = $2, sessao_versao = sessao_versao + 1 WHERE id = $3`,
    [hash, cifrar(String(novaSenha)), req.params.id]);
  if(!rowCount) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  res.json({ ok: true });
});

router.patch('/usuarios/:id', autenticar, exigirAdmin, async (req, res) => {
  const { ativo, admin, perfil } = req.body || {};
  const campos = [], valores = []; let i = 1;
  if(typeof ativo === 'boolean'){ campos.push(`ativo = $${i++}`); valores.push(ativo); }
  if(typeof admin === 'boolean'){ campos.push(`admin = $${i++}`); valores.push(admin); if(admin){ campos.push(`perfil = 'editor'`); } }
  if(PERFIS.includes(perfil)){ campos.push(`perfil = $${i++}`); valores.push(perfil); }
  if(campos.length === 0) return res.status(400).json({ erro: 'Nada para atualizar.' });
  valores.push(req.params.id);
  await pool.query(`UPDATE users SET ${campos.join(', ')} WHERE id = $${i}`, valores);
  res.json({ ok: true });
});

// Exclui um usuário de vez (admin). As obras que ele criou continuam na equipe (só o nome do autor fica registrado).
router.delete('/usuarios/:id', autenticar, exigirAdmin, async (req, res) => {
  if(req.params.id === req.usuario.id) return res.status(400).json({ erro: 'Você não pode excluir a si mesmo.' });
  const { rows } = await pool.query('SELECT admin FROM users WHERE id = $1', [req.params.id]);
  if(!rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  if(rows[0].admin){
    const r = await pool.query('SELECT COUNT(*)::int AS n FROM users WHERE admin AND ativo AND id <> $1', [req.params.id]);
    if(r.rows[0].n === 0) return res.status(400).json({ erro: 'Não é possível excluir o último administrador ativo.' });
  }
  await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;

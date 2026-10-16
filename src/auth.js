const jwt = require('jsonwebtoken');
const { pool } = require('../db');

// Valida o login (JWT) E confere no banco se a pessoa continua ativa.
// Assim, desativar ou excluir alguém na aba Equipe corta o acesso na hora,
// mesmo de quem já estava logado (o login salvo no navegador vale 30 dias).
async function autenticar(req, res, next){
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if(!token) return res.status(401).json({ erro: 'Não autenticado.' });
  let payload;
  try{
    payload = jwt.verify(token, process.env.JWT_SECRET);
  }catch(e){
    return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
  }
  try{
    const { rows } = await pool.query('SELECT id, nome, email, admin, ativo FROM users WHERE id = $1', [payload.id]);
    const u = rows[0];
    if(!u || !u.ativo) return res.status(401).json({ erro: 'Acesso desativado. Fale com o administrador.' });
    req.usuario = { id: u.id, nome: u.nome, email: u.email, admin: u.admin }; // permissões sempre atualizadas
    next();
  }catch(e){
    console.error(e);
    return res.status(500).json({ erro: 'Falha ao verificar o acesso.' });
  }
}

function exigirAdmin(req, res, next){
  if(!req.usuario || !req.usuario.admin) return res.status(403).json({ erro: 'Só administradores podem fazer isso.' });
  next();
}

module.exports = { autenticar, exigirAdmin };

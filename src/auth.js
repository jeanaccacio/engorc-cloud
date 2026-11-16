const jwt = require('jsonwebtoken');
const { pool } = require('../db');

// Enquanto a senha for provisória, a pessoa só pode ver quem ela é e trocar a senha.
const ROTAS_COM_SENHA_PROVISORIA = ['/api/auth/me', '/api/auth/senha'];

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
    const { rows } = await pool.query('SELECT id, nome, email, admin, ativo, perfil, senha_provisoria, sessao_versao FROM users WHERE id = $1', [payload.id]);
    const u = rows[0];
    if(!u || !u.ativo) return res.status(401).json({ erro: 'Acesso desativado. Fale com o administrador.' });
    // login antigo (senha já trocada ou redefinida depois): obriga a entrar de novo
    if((payload.sv || 0) !== (u.sessao_versao || 0)) return res.status(401).json({ erro: 'Sessão encerrada. Entre novamente com a senha atual.' });
    req.usuario = { id: u.id, nome: u.nome, email: u.email, admin: u.admin, perfil: u.admin ? 'editor' : (u.perfil || 'editor'), senhaProvisoria: !!u.senha_provisoria }; // permissões sempre atualizadas
    const rota = req.originalUrl.split('?')[0];
    if(u.senha_provisoria && !ROTAS_COM_SENHA_PROVISORIA.includes(rota)){
      return res.status(403).json({ codigo: 'trocar_senha', erro: 'Troque sua senha provisória antes de continuar.' });
    }
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

// Só a equipe técnica (perfil 'editor' ou administrador) altera obras, orçamentos, valores e bases.
function exigirEditor(req, res, next){
  if(!req.usuario || (!req.usuario.admin && req.usuario.perfil !== 'editor')) return res.status(403).json({ erro: 'Seu acesso é somente de consulta ao painel e acompanhamento.' });
  next();
}
// Pode marcar o checklist do acompanhamento: equipe técnica ou perfil 'acompanhamento'.
function exigirChecklist(req, res, next){
  if(!req.usuario || (!req.usuario.admin && !['editor','acompanhamento'].includes(req.usuario.perfil))) return res.status(403).json({ erro: 'Seu acesso é somente de visualização.' });
  next();
}

module.exports = { autenticar, exigirAdmin, exigirEditor, exigirChecklist };

const jwt = require('jsonwebtoken');

function autenticar(req, res, next){
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if(!token) return res.status(401).json({ erro: 'Não autenticado.' });
  try{
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = payload; // { id, nome, email, admin }
    next();
  }catch(e){
    return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
  }
}

function exigirAdmin(req, res, next){
  if(!req.usuario || !req.usuario.admin) return res.status(403).json({ erro: 'Só administradores podem fazer isso.' });
  next();
}

module.exports = { autenticar, exigirAdmin };

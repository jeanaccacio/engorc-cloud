// Guarda a SENHA INICIAL de cada usuário de forma cifrada (AES-256-GCM), para o administrador consultar
// e responder à pessoa. A senha de login continua sendo guardada só como hash (bcrypt).
// A chave vem da variável de ambiente SENHA_CHAVE (recomendado) ou, se não existir, do JWT_SECRET.
const crypto = require('crypto');

function chave(){
  const base = process.env.SENHA_CHAVE || process.env.JWT_SECRET;
  if(!base) throw new Error('Defina SENHA_CHAVE (ou JWT_SECRET) no servidor.');
  return crypto.createHash('sha256').update(String(base)).digest();
}

function cifrar(texto){
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chave(), iv);
  const dados = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), dados]).toString('base64');
}

function decifrar(valor){
  const buf = Buffer.from(valor, 'base64');
  const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), dados = buf.subarray(28);
  const d = crypto.createDecipheriv('aes-256-gcm', chave(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(dados), d.final()]).toString('utf8');
}

// Senha provisória legível e sem caracteres confusos (0/O, 1/l/I).
function gerarSenha(tamanho = 10){
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  const bytes = crypto.randomBytes(tamanho);
  for(let i = 0; i < tamanho; i++) s += alfabeto[bytes[i] % alfabeto.length];
  return s;
}

module.exports = { cifrar, decifrar, gerarSenha };

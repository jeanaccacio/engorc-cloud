// Cria o primeiro usuário (administrador) — rode uma vez após subir o banco.
// Uso: node src/seedAdmin.js "Jean Ricardo Accácio" jean@exemplo.com "senha-temporaria"
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, aplicarSchema } = require('../db');

function uid(prefixo){ return prefixo + Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

async function main(){
  const [,, nome, email, senha] = process.argv;
  if(!nome || !email || !senha){
    console.log('Uso: node src/seedAdmin.js "Nome Completo" email@exemplo.com senha');
    process.exit(1);
  }
  await aplicarSchema();
  const emailNorm = email.toLowerCase().trim();
  const existe = await pool.query('SELECT id FROM users WHERE email = $1', [emailNorm]);
  if(existe.rows.length){
    console.log('Já existe um usuário com esse e-mail. Nada foi criado.');
    process.exit(0);
  }
  const senhaHash = await bcrypt.hash(senha, 10);
  const id = uid('u');
  await pool.query(
    'INSERT INTO users (id, nome, email, senha_hash, admin) VALUES ($1,$2,$3,$4,true)',
    [id, nome, emailNorm, senhaHash]
  );
  console.log(`Administrador criado: ${nome} <${emailNorm}>`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

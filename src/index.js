require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { aplicarSchema } = require('../db');

const authRoutes = require('./routes/auth');
const itensRoutes = require('./routes/itens');
const obrasRoutes = require('./routes/obras');
const composicoesRoutes = require('./routes/composicoes');

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/itens', itensRoutes);
app.use('/api/obras', obrasRoutes);
app.use('/api/composicoes', composicoesRoutes);

app.get('/api/saude', (req, res) => res.json({ ok: true }));

// Serve o front-end estático (o mesmo servidor entrega a API e a página).
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;

aplicarSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`[engorc] servidor rodando na porta ${PORT}`));
  })
  .catch(err => {
    console.error('[engorc] falha ao aplicar schema do banco:', err);
    process.exit(1);
  });

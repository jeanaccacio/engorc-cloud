-- EngOrc Cloud — schema PostgreSQL
-- Executado automaticamente na subida do servidor (idempotente).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  nome        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  senha_hash  TEXT NOT NULL,
  admin       BOOLEAN NOT NULL DEFAULT FALSE,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS logo_base64 TEXT;
-- Catálogo SINAPI/SINAPI-I/SICRO/Composição/Cotação — compartilhado por toda a equipe.
CREATE TABLE IF NOT EXISTS itens (
  id                   TEXT PRIMARY KEY,
  fonte                TEXT NOT NULL,
  codigo               TEXT NOT NULL,
  descricao            TEXT NOT NULL,
  unidade              TEXT NOT NULL,
  custo_desonerado     DOUBLE PRECISION NOT NULL DEFAULT 0,
  custo_nao_desonerado DOUBLE PRECISION NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_itens_fonte ON itens (fonte);
CREATE INDEX IF NOT EXISTS idx_itens_codigo ON itens (codigo);
CREATE INDEX IF NOT EXISTS idx_itens_descricao_trgm ON itens USING gin (descricao gin_trgm_ops);

CREATE TABLE IF NOT EXISTS meta_importacao (
  id             TEXT PRIMARY KEY DEFAULT 'baseInfo',
  arquivo        TEXT NOT NULL,
  total          INTEGER NOT NULL,
  importado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  importado_por  TEXT
);

CREATE TABLE IF NOT EXISTS obras (
  id             TEXT PRIMARY KEY,
  nome           TEXT NOT NULL,
  tipo_obra      TEXT NOT NULL,
  municipio      TEXT,
  orgao          TEXT,
  processo       TEXT,
  responsavel    TEXT,
  crea           TEXT,
  regime         TEXT NOT NULL DEFAULT 'nao_desonerado',
  data_base      TEXT,
  bdi            JSONB NOT NULL,
  grupos         JSONB NOT NULL,
  grupo_ativo    TEXT,
  itens          JSONB NOT NULL,
  cronograma     JSONB NOT NULL,
  criado_por_id  TEXT,
  criado_por_nome TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

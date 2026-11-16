const XLSX = require('xlsx');

// Lê a aba "Banco" (ou a primeira aba, se não achar) e devolve a lista de itens.
// Mesma lógica de detecção de colunas já validada no EngOrc (front-end), agora rodando no servidor.
function parseSinapiBuffer(buffer){
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames.find(n => n.toLowerCase() === 'banco') || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  let headerRowIdx = -1, colFonte = -1, colCodigo = -1, colDesc = -1, colUnid = -1, colDes = -1, colNao = -1, colId = -1;
  for(let r = 0; r < Math.min(rows.length, 25); r++){
    const row = rows[r] || [];
    const norm = row.map(c => (c == null ? '' : String(c).toUpperCase().replace(/\n/g, ' ').trim()));
    const iFonte = norm.findIndex(c => c === 'FONTE');
    const iCodigo = norm.findIndex(c => c === 'CÓDIGO' || c === 'CODIGO');
    if(iFonte >= 0 && iCodigo >= 0){
      headerRowIdx = r; colFonte = iFonte; colCodigo = iCodigo;
      colDesc = norm.findIndex(c => c.startsWith('DESCRI'));
      colUnid = norm.findIndex(c => c.startsWith('UNIDADE'));
      colDes = norm.findIndex(c => c.includes('DESONERADO') && !c.includes('NÃO') && !c.includes('NAO'));
      colNao = norm.findIndex(c => c.includes('NÃO') || c.includes('NAO'));
      colId = iFonte - 1 >= 0 ? iFonte - 1 : -1;
      break;
    }
  }
  if(headerRowIdx === -1){
    throw new Error('Não encontrei as colunas FONTE / CÓDIGO na planilha. Verifique se a aba "Banco" está no formato esperado.');
  }

  const itens = [];
  for(let r = headerRowIdx + 2; r < rows.length; r++){
    const row = rows[r];
    if(!row) continue;
    const fonte = row[colFonte];
    const codigo = row[colCodigo];
    if(!fonte || codigo == null || codigo === '') continue;
    const descricao = colDesc >= 0 ? (row[colDesc] || '').toString().trim() : '';
    const unidade = colUnid >= 0 ? (row[colUnid] || '').toString().trim() : '';
    const custoDes = colDes >= 0 ? Number(row[colDes]) || 0 : 0;
    const custoNao = colNao >= 0 ? Number(row[colNao]) || 0 : custoDes;
    const idVal = (colId >= 0 && row[colId]) ? String(row[colId]) : `${fonte} ${codigo}`;
    itens.push({
      id: idVal,
      fonte: String(fonte).trim(),
      codigo: String(codigo).trim(),
      descricao, unidade,
      custoDesonerado: custoDes,
      custoNaoDesonerado: custoNao
    });
  }
  if(itens.length === 0) throw new Error('Nenhum item foi lido. Confira o arquivo.');
  // Texto das linhas acima do cabeçalho (título, data-base, UF…) — usado para detectar a referência de preços.
  itens.cabecalho = rows.slice(0, headerRowIdx).map(row => (row || []).filter(c => c != null && String(c).trim() !== '').join(' ')).filter(Boolean).join(' | ');
  return itens;
}

// Tenta descobrir a referência de preços (mês/ano da SINAPI e UF) no cabeçalho da planilha ou no nome do arquivo.
// Devolve, por exemplo, "SINAPI 09/2026 – SC", ou null se não achar nada confiável.
const MESES = { jan:1, fev:2, mar:3, abr:4, mai:5, jun:6, jul:7, ago:8, set:9, out:10, nov:11, dez:12 };
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
function detectarReferencia(textoCabecalho, nomeArquivo){
  const fontes = [String(textoCabecalho || ''), String(nomeArquivo || '').replace(/\.[a-z0-9]+$/i, '')];
  let mes = null, ano = null, uf = null;
  for(const t of fontes){
    if(mes) break;
    let m = t.match(/(?<!\d)(0?[1-9]|1[0-2])\s*[\/\-_.]\s*(20\d{2})(?!\d)/);
    if(m){ mes = +m[1]; ano = +m[2]; break; }
    m = t.match(/(?<!\d)(20\d{2})\s*[\/\-_.]\s*(0[1-9]|1[0-2])(?!\d)/);
    if(m){ mes = +m[2]; ano = +m[1]; break; }
    m = t.toLowerCase().match(/(?<![a-z])(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?\s*(?:de\s*)?[\/\-_ ]?\s*(20\d{2})(?!\d)/);
    if(m){ mes = MESES[m[1]]; ano = +m[2]; break; }
  }
  for(const t of fontes){
    const m = t.match(/\b(?:UF|ESTADO|LOCALIDADE)\s*[:\-]?\s*([A-Z]{2})\b/) || t.match(/SINAPI[^|]{0,40}?[\s_\-]([A-Z]{2})(?:[\s_\-.|]|$)/);
    if(m && UFS.includes(m[1])){ uf = m[1]; break; }
  }
  if(!mes) return null;
  return `SINAPI ${String(mes).padStart(2,'0')}/${ano}` + (uf ? ` – ${uf}` : '');
}

module.exports = { parseSinapiBuffer, detectarReferencia };

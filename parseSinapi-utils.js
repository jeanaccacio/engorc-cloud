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
  return itens;
}

module.exports = { parseSinapiBuffer };

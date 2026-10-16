/* =====================================================================
   ENGFLUXO — BDI no modelo CAIXA (Planilha Múltipla v3.16, aba BDI)
   - até 3 BDIs por obra (BDI 1, BDI 2, BDI 3), cada um com seu tipo de obra
   - cada GRUPO de serviço do orçamento usa um dos BDIs
   - ISS = base de cálculo (% conforme legislação municipal) × alíquota (2% a 5%) — vale para todos
   - CP = COFINS 3% + PIS 0,65% = 3,65%
   - CPRB (desoneração) automática pelo ano da data-base: <2025 4,5% · 2025 3,6% · 2026 2,7% · 2027 1,8% · 2028+ 0%
   - situação de cada parcela comparada ao 1º quartil / 3º quartil (Acórdão TCU 2622/2013)
   - BDI = [(1+AC+SG+R)·(1+DF)·(1+L) / (1−CP−ISS−CPRB)] − 1, arredondado a 4 casas (como a planilha)
     Estudos e Projetos: [(1+K1+K2)·(1+K3) / (1−CP−ISS−CPRB)] − 1 · Fornecimento direto: BDI = 0
   ===================================================================== */
const BDI_CP_PADRAO = 0.0365;
const BDI_NOMES = ['BDI 1', 'BDI 2', 'BDI 3'];

function bdiTipoInfo(tipo){ return BDI_TIPOS[tipo] || BDI_TIPOS.edificios; }
function bdiComponentes(tipo){
  const t = bdiTipoInfo(tipo);
  if(t.modo === 'direta') return [];
  if(t.modo === 'estudos') return [
    { k:'k1', sigla:'K1', label:'Encargos Sociais incidentes sobre a mão de obra' },
    { k:'k2', sigla:'K2', label:'Administração Central da empresa ou consultoria - overhead' },
    { k:'k3', sigla:'K3', label:'Margem bruta da empresa de consultoria' } ];
  return [
    { k:'ac', sigla:'AC', label:'Administração Central' },
    { k:'sg', sigla:'SG', label:'Seguro e Garantia' },
    { k:'r',  sigla:'R',  label:'Risco' },
    { k:'df', sigla:'DF', label:'Despesas Financeiras' },
    { k:'l',  sigla:'L',  label:'Lucro' } ];
}
function bdiNovo(tipo){
  const b = { tipo: tipo || 'edificios', cp: BDI_CP_PADRAO, obs:'' };
  bdiAplicarMedios(b);
  return b;
}
function bdiAplicarMedios(b){
  const t = bdiTipoInfo(b.tipo);
  bdiComponentes(b.tipo).forEach(c=>{ const f = t[c.k]; b[c.k] = f && typeof f.med === 'number' ? f.med : 0; });
}
// Converte o BDI antigo (um só por obra) para o formato novo. Idempotente.
function bdiGarantir(o){
  o.bdi = o.bdi || {};
  const B = o.bdi;
  if(!Array.isArray(B.lista) || !B.lista.length){
    const t = bdiTipoInfo(o.tipoObra);
    const b1 = { tipo: BDI_TIPOS[o.tipoObra] ? o.tipoObra : 'edificios', obs:'' };
    ['ac','sg','r','df','l'].forEach(k=>{ b1[k] = (B[k] != null) ? B[k] : (t[k] && typeof t[k].med === 'number' ? t[k].med : 0); });
    const cpAnt = (num(B.pis, 0.65) + num(B.cofins, 3)) / 100;
    b1.cp = cpAnt > 0 ? cpAnt : BDI_CP_PADRAO;
    B.lista = [b1];
    if(B.issBase == null) B.issBase = 100;
    if(B.issAliquota == null) B.issAliquota = B.iss != null ? num(B.iss) : 2;
    // preserva a CPRB que a obra antiga usava (evita mudar valores já orçados); apagar o campo volta para a automática
    if(B.cprbManual === undefined) B.cprbManual = (B.cprb != null && (o.regime === 'desonerado' || num(B.cprb) > 0)) ? num(B.cprb) : null;
  }
  if(B.issBase == null) B.issBase = 100;
  if(B.issAliquota == null) B.issAliquota = 2;
  if(B.cprbManual === undefined) B.cprbManual = null;
  B.porGrupo = B.porGrupo || {};
  if(B.descontoPercent == null) B.descontoPercent = 0;
  B.lista = B.lista.slice(0, 3);
  B.lista.forEach(b=>{
    if(!BDI_TIPOS[b.tipo]) b.tipo = 'edificios';
    if(b.cp == null) b.cp = BDI_CP_PADRAO;
    bdiComponentes(b.tipo).forEach(c=>{ if(b[c.k] == null){ const f = bdiTipoInfo(b.tipo)[c.k]; b[c.k] = f && typeof f.med === 'number' ? f.med : 0; } });
  });
  o.tipoObra = B.lista[0].tipo;   // o "tipo de obra" da aba Obra é o tipo do BDI 1
  bdiCalcularTudo(o);
  return B;
}
function bdiIssEfetivo(o){ const B = o.bdi; return num(B.issBase, 100)/100 * num(B.issAliquota, 0)/100; }
function bdiCprbAuto(o){
  if(o.regime !== 'desonerado') return 0;
  const ano = o.dataBase ? parseInt(String(o.dataBase).slice(0,4)) : new Date().getFullYear();
  if(ano < 2025) return 0.045;
  if(ano === 2025) return 0.036;
  if(ano === 2026) return 0.027;
  if(ano === 2027) return 0.018;
  return 0;
}
function bdiCprb(o){ const m = o.bdi.cprbManual; return (m != null && m !== '') ? num(m)/100 : bdiCprbAuto(o); }
const r4 = v=>Math.round(v*10000)/10000;
// Calcula um BDI e a situação de cada parcela (OK / FORA DO INTERVALO), como a planilha da CAIXA.
function bdiCalcular(o, b){
  const t = bdiTipoInfo(b.tipo);
  const comps = bdiComponentes(b.tipo);
  const direta = t.modo === 'direta';
  const cp = direta ? 0 : num(b.cp, BDI_CP_PADRAO);
  const iss = direta ? 0 : bdiIssEfetivo(o);
  const cprb = direta ? 0 : bdiCprb(o);
  const v = k=>num(b[k]);
  let num1;
  if(direta) num1 = 1;
  else if(t.modo === 'estudos') num1 = (1+v('k1')+v('k2'))*(1+v('k3'));
  else num1 = (1+v('ac')+v('sg')+v('r'))*(1+v('df'))*(1+v('l'));
  const sem = direta ? 0 : r4(num1/(1-(cp+iss)) - 1);
  const com = direta ? 0 : r4(num1/(1-(cp+iss+cprb)) - 1);
  const sit = (x, f)=>{ if(!f) return '-'; const okMin = f.min === '-' || f.min == null || x >= f.min - 1e-9; const okMax = f.max === '-' || f.max == null || x <= f.max + 1e-9; return okMin && okMax ? 'OK' : 'FORA DO INTERVALO'; };
  const linhas = comps.map(c=>({ ...c, valor: v(c.k), faixa: t[c.k] || null, situacao: sit(v(c.k), t[c.k]) }));
  if(!direta){
    linhas.push({ k:'cp', sigla:'CP', label:'Tributos (impostos COFINS 3%, e PIS 0,65%)', valor: cp, faixa:{ min:0.0365, med:0.0365, max:0.0365 }, situacao: Math.abs(cp-0.0365) < 1e-9 ? 'OK' : 'FORA DO INTERVALO' });
    linhas.push({ k:'iss', sigla:'ISS', label:'Tributos (ISS, variável de acordo com o município)', valor: iss, faixa:{ min:0, med:0.025, max:0.05 }, situacao: sit(iss, { min:0, max:0.05 }), calculado:true });
    linhas.push({ k:'cprb', sigla:'CPRB', label:'Tributos (Contribuição Previdenciária sobre a Receita Bruta - Lei 12.546/2011 - Desoneração)', valor: cprb, faixa:{ min:cprb, med:cprb, max:cprb }, situacao:'OK', calculado:true });
  }
  const sitBdi = direta ? 'OK' : sit(sem, t.pad);
  const fora = linhas.some(l=>l.situacao === 'FORA DO INTERVALO') || sitBdi === 'FORA DO INTERVALO';
  return { linhas, cp, iss, cprb, sem, com, sitBdi, fora, direta };
}
function bdiCalcularTudo(o){
  const B = o.bdi;
  B.lista.forEach(b=>{ const c = bdiCalcular(o, b); b.final = c.com; b.semDes = c.sem; });
  B.final = B.lista[0].final;   // compatibilidade (ART, telas antigas)
  B.iss = r4(bdiIssEfetivo(o)*100*100)/100;
  return B.final;
}
function bdiIdxDoGrupo(o, grupo){ if(!o.bdi || !Array.isArray(o.bdi.lista) || !o.bdi.lista.length) bdiGarantir(o); const i = o.bdi && o.bdi.porGrupo ? o.bdi.porGrupo[grupo] : 0; return (i != null && o.bdi.lista[i]) ? i : 0; }
function bdiDoGrupo(o, grupo){ if(!o.bdi || !Array.isArray(o.bdi.lista) || !o.bdi.lista.length) bdiGarantir(o); return (o.bdi.lista[bdiIdxDoGrupo(o, grupo)] || {}).final || 0; }
function bdiDoItem(it){ return bdiDoGrupo(CURRENT_OBRA, it.grupo); }
function bdiRotuloGrupo(o, grupo){ const i = bdiIdxDoGrupo(o, grupo); return `${BDI_NOMES[i]} (${fmtPct(o.bdi.lista[i].final||0)})`; }
function bdiResumoTexto(o){
  bdiGarantir(o);
  if(o.bdi.lista.length === 1) return fmtPct(o.bdi.lista[0].final||0);
  return o.bdi.lista.map((b,i)=>`${BDI_NOMES[i]}: ${fmtPct(b.final||0)}`).join(' · ');
}

/* ---------------------- Compatibilidade com o código existente ---------------------- */
function calcularBDI(){ if(!CURRENT_OBRA) return 0; bdiGarantir(CURRENT_OBRA); return bdiCalcularTudo(CURRENT_OBRA); }
async function salvarBDI(){ recalcularOrcamentoLocal(); await salvarObraAtual(true); toast('BDI aplicado ao orçamento.'); }

/* ---------------------- Tela (aba BDI) ---------------------- */
let _bdiTimer = null;
function bdiMudou(){
  bdiCalcularTudo(CURRENT_OBRA);
  CURRENT_OBRA.itens.forEach(recalcItem);
  renderBdiPanel(); renderOrcamento(); renderCronograma();
  clearTimeout(_bdiTimer); _bdiTimer = setTimeout(()=>salvarObraAtual(true), 700);
}
function bdiSetCampo(i, k, valorPct){ CURRENT_OBRA.bdi.lista[i][k] = Math.max(0, num(valorPct))/100; bdiMudou(); }
function bdiSetGlobal(k, v){
  const B = CURRENT_OBRA.bdi;
  if(k === 'cprbManual') B.cprbManual = (v === '' || v == null) ? null : Math.max(0, num(v));
  else B[k] = Math.max(0, num(v));
  bdiMudou();
}
function bdiSetTipo(i, tipo){
  const b = CURRENT_OBRA.bdi.lista[i]; if(!b || b.tipo === tipo) return;
  b.tipo = tipo;
  if(confirm('Aplicar os valores MÉDIOS de referência do novo tipo de obra em AC, SG, R, DF e L?\n\n(Cancelar mantém os percentuais atuais.)')) bdiAplicarMedios(b);
  else bdiComponentes(tipo).forEach(c=>{ if(b[c.k] == null) b[c.k] = 0; });
  if(i === 0){ CURRENT_OBRA.tipoObra = tipo; const s = document.getElementById('f_tipoObra'); if(s) s.value = tipo; }
  bdiMudou();
}
function bdiUsarMedios(i){ bdiAplicarMedios(CURRENT_OBRA.bdi.lista[i]); bdiMudou(); }
function bdiAdicionar(){
  const B = CURRENT_OBRA.bdi; if(B.lista.length >= 3) return;
  B.lista.push(bdiNovo(B.lista.length === 1 && B.lista[0].tipo !== 'pavimentacao' ? 'pavimentacao' : 'edificios'));
  bdiMudou();
}
function bdiRemover(i){
  const B = CURRENT_OBRA.bdi; if(i === 0 || !B.lista[i]) return;
  if(!confirm(`Remover o ${BDI_NOMES[i]}? Os grupos que usam este BDI passam a usar o BDI 1.`)) return;
  B.lista.splice(i, 1);
  Object.keys(B.porGrupo).forEach(g=>{ if(B.porGrupo[g] === i) B.porGrupo[g] = 0; else if(B.porGrupo[g] > i) B.porGrupo[g]--; });
  bdiMudou();
}
function bdiSetGrupo(grupo, i){ CURRENT_OBRA.bdi.porGrupo[grupo] = parseInt(i) || 0; bdiMudou(); }
function bdiSetObs(i, v){ CURRENT_OBRA.bdi.lista[i].obs = v; clearTimeout(_bdiTimer); _bdiTimer = setTimeout(()=>salvarObraAtual(true), 700); }
const pct = (v, casas)=> (num(v)*100).toLocaleString('pt-BR', { minimumFractionDigits: casas==null?2:casas, maximumFractionDigits: casas==null?2:casas }) + '%';
const pctRef = v=> (v === '-' || v == null) ? '-' : pct(v);
function bdiSitHtml(s){ return s === 'OK' ? '<span class="sit-ok">OK</span>' : (s === 'FORA DO INTERVALO' ? '<span class="sit-fora">FORA DO INTERVALO</span>' : '<span style="color:var(--muted)">-</span>'); }

function renderBdiPanel(){
  const cont = document.getElementById('bdiConteudo'); if(!cont || !CURRENT_OBRA) return;
  const o = CURRENT_OBRA; const B = bdiGarantir(o);
  const cprbAuto = bdiCprbAuto(o);
  const ano = o.dataBase ? String(o.dataBase).slice(0,4) : String(new Date().getFullYear());
  const opcoesTipo = sel=>Object.entries(BDI_TIPOS).map(([k,v])=>`<option value="${k}" ${k===sel?'selected':''}>${escH(v.label)}</option>`).join('');
  const gruposUsados = o.grupos.filter(g=>o.itens.some(i=>i.grupo===g));
  let html = `
  <div class="cartao">
    <div class="cartao-cabecalho"><h2>ISS e desoneração <span class="tag">valem para todos os BDIs</span></h2>
      <button class="btn ghost fino" onclick="imprimirBDI()">🖨️ Imprimir quadro(s) de BDI</button></div>
    <div class="cartao-corpo">
      <div class="linha-tripla">
        <div class="campo"><label>Base de cálculo do ISS (% — conforme legislação municipal)</label><input type="number" step="0.01" min="0" max="100" value="${num(B.issBase)}" onchange="bdiSetGlobal('issBase', this.value)"></div>
        <div class="campo"><label>Alíquota do ISS sobre a base (entre 2% e 5%)</label><input type="number" step="0.01" min="0" max="5" value="${num(B.issAliquota)}" onchange="bdiSetGlobal('issAliquota', this.value)"></div>
        <div class="campo"><label>ISS efetivo no BDI</label><div class="campo-lido">${pct(bdiIssEfetivo(o))} <span class="obs">(${num(B.issBase).toLocaleString('pt-BR')}% × ${num(B.issAliquota).toLocaleString('pt-BR')}%)</span></div></div>
      </div>
      <div class="linha-tripla">
        <div class="campo"><label>Regime (aba Obra)</label><div class="campo-lido">${o.regime==='desonerado'?'Desonerado':'Não desonerado'}</div></div>
        <div class="campo"><label>CPRB automática (data-base ${ano})</label><div class="campo-lido">${pct(cprbAuto)} <span class="obs">${o.regime==='desonerado'?'até 2024: 4,5% · 2025: 3,6% · 2026: 2,7% · 2027: 1,8% · 2028+: 0%':'não desonerado = 0%'}</span></div></div>
        <div class="campo"><label>CPRB manual (%) — vazio = automática</label><input type="number" step="0.01" min="0" max="10" value="${B.cprbManual==null?'':B.cprbManual}" placeholder="automática" onchange="bdiSetGlobal('cprbManual', this.value)"></div>
      </div>
    </div>
  </div>`;
  B.lista.forEach((b, i)=>{
    const c = bdiCalcular(o, b); const t = bdiTipoInfo(b.tipo);
    const gruposDeste = gruposUsados.filter(g=>bdiIdxDoGrupo(o, g) === i);
    html += `
  <div class="cartao">
    <div class="cartao-cabecalho"><h2>${BDI_NOMES[i]} <span class="tag">${gruposDeste.length ? escH(gruposDeste.join(', ')) : 'nenhum grupo usando'}</span></h2>
      <span style="display:flex;gap:6px;">${c.direta ? '' : `<button class="btn ghost fino" onclick="bdiUsarMedios(${i})">Usar valores médios</button>`}
      ${i>0 ? `<button class="btn danger fino" onclick="bdiRemover(${i})">Remover</button>` : ''}</span></div>
    <div class="cartao-corpo">
      <div class="campo"><label>Tipo de obra</label><select onchange="bdiSetTipo(${i}, this.value)">${opcoesTipo(b.tipo)}</select></div>
      ${c.direta ? `<div class="pav-ok">Fornecimento de materiais e equipamentos por <b>aquisição direta</b>: BDI = 0% (sem parcelas), conforme o quadro da CAIXA.</div>` : `
      <div style="overflow-x:auto;"><table class="bdi-tab">
        <thead><tr><th>Itens</th><th>Sigla</th><th class="num">% adotado</th><th>Situação</th><th class="num">1º quartil</th><th class="num">Médio</th><th class="num">3º quartil</th></tr></thead>
        <tbody>
        ${c.linhas.map(l=>`<tr>
          <td>${escH(l.label)}</td><td class="mono">${l.sigla}</td>
          <td class="num">${l.calculado ? `<span class="mono">${pct(l.valor)}</span>` : `<input type="number" class="custo-input" style="width:84px" step="0.01" min="0" value="${(num(l.valor)*100).toFixed(2)}" onchange="bdiSetCampo(${i}, '${l.k}', this.value)">`}</td>
          <td>${bdiSitHtml(l.situacao)}</td>
          <td class="num mono">${l.faixa ? pctRef(l.faixa.min) : '-'}</td><td class="num mono">${l.faixa ? pctRef(l.faixa.med) : '-'}</td><td class="num mono">${l.faixa ? pctRef(l.faixa.max) : '-'}</td></tr>`).join('')}
        <tr class="linha-subtotal"><td>BDI SEM desoneração (fórmula Acórdão TCU)</td><td class="mono">BDI PAD</td><td class="num">${pct(c.sem)}</td><td>${bdiSitHtml(c.sitBdi)}</td>
          <td class="num">${t.pad ? pctRef(t.pad.min) : '-'}</td><td class="num">${t.pad ? pctRef(t.pad.med) : '-'}</td><td class="num">${t.pad ? pctRef(t.pad.max) : '-'}</td></tr>
        <tr class="linha-subtotal"><td>BDI COM desoneração</td><td class="mono">BDI DES</td><td class="num">${pct(c.com)}</td><td colspan="4"></td></tr>
        </tbody></table></div>
      <div class="bdi-result" style="margin-top:12px;"><div><div class="lbl">${BDI_NOMES[i]} aplicado no orçamento</div><div class="value">${pct(c.com)}</div></div>
        <div style="font-size:11px;color:rgba(246,243,236,.7);max-width:420px;">BDI = ${t.modo==='estudos'?'(1+K1+K2)·(1+K3)':'(1+AC+SG+R)·(1+DF)·(1+L)'} / (1 − CP − ISS − CPRB) − 1</div></div>
      ${c.fora ? `<div class="pav-alerta" style="margin-top:10px;">Há parcela(s) fora do intervalo de referência. A CAIXA exige anexar <b>Relatório Técnico Circunstanciado</b> justificando a adoção do percentual de cada parcela do BDI.</div>` : ''}`}
      <div class="campo" style="margin-top:10px;"><label>Observações deste BDI (saem na impressão)</label><textarea rows="2" onchange="bdiSetObs(${i}, this.value)">${escH(b.obs||'')}</textarea></div>
    </div>
  </div>`;
  });
  if(B.lista.length < 3) html += `<div style="margin-bottom:16px;"><button class="btn ghost" onclick="bdiAdicionar()">+ Adicionar ${BDI_NOMES[B.lista.length]} (ex.: pavimentação, fornecimento de equipamentos)</button></div>`;
  html += `
  <div class="cartao">
    <div class="cartao-cabecalho"><h2>BDI de cada grupo de serviço</h2></div>
    <div class="cartao-corpo">
      ${o.grupos.length ? `<table><thead><tr><th>Grupo</th><th class="num">Custo direto</th><th>BDI</th><th class="num">Total c/ BDI</th></tr></thead><tbody>
        ${o.grupos.map(g=>{ const its = o.itens.filter(x=>x.grupo===g); const dir = its.reduce((s,x)=>s+x.custoUnitario*x.quantidade,0); const tot = its.reduce((s,x)=>s+x.custoTotal,0);
          return `<tr><td>${escH(g)}</td><td class="num mono">${fmtMoney(dir)}</td>
            <td><select class="grupo-select-inline" onchange="bdiSetGrupo(${jsA(g)}, this.value)" ${B.lista.length<2?'disabled':''}>${B.lista.map((b,i)=>`<option value="${i}" ${bdiIdxDoGrupo(o,g)===i?'selected':''}>${BDI_NOMES[i]} — ${pct(b.final)}</option>`).join('')}</select></td>
            <td class="num mono">${fmtMoney(tot)}</td></tr>`; }).join('')}
        </tbody></table>` : '<p class="obs" style="margin:0;">Crie os grupos de serviço na aba Orçamento.</p>'}
      ${B.lista.length < 2 ? '<p class="obs">Com um só BDI, todos os grupos usam o BDI 1. Adicione o BDI 2 para escolher por grupo.</p>' : ''}
    </div>
  </div>`;
  cont.innerHTML = html;
}

/* ---------------------- Impressão no formato do Quadro de Composição do BDI (CAIXA) ---------------------- */
function imprimirBDI(){
  const o = CURRENT_OBRA; const B = bdiGarantir(o);
  const gruposUsados = o.grupos.filter(g=>o.itens.some(i=>i.grupo===g));
  const usados = B.lista.map((b,i)=>i).filter(i=>i===0 || gruposUsados.some(g=>bdiIdxDoGrupo(o,g)===i));
  const hoje = new Date().toLocaleDateString('pt-BR');
  const art = (o.extras && o.extras.art) || {};
  const paginas = usados.map((i, n)=>{
    const b = B.lista[i]; const c = bdiCalcular(o, b); const t = bdiTipoInfo(b.tipo);
    const gr = gruposUsados.filter(g=>bdiIdxDoGrupo(o,g)===i);
    return `<div class="doc-impressao" style="${n < usados.length-1 ? 'page-break-after:always;' : ''}">
      ${cabecalhoImpressao()}
      <div class="faixa-titulo">Quadro de Composição do BDI — ${BDI_NOMES[i]}</div>
      ${infoObraImpressao()}
      <table style="margin-bottom:8px;"><tbody>
        <tr><td style="width:75%;">Conforme legislação tributária municipal, percentual da base de cálculo para o ISS:</td><td class="num">${num(B.issBase).toLocaleString('pt-BR',{minimumFractionDigits:2})}%</td></tr>
        <tr><td>Sobre a base de cálculo, respectiva alíquota do ISS (entre 2% e 5%):</td><td class="num">${num(B.issAliquota).toLocaleString('pt-BR',{minimumFractionDigits:2})}%</td></tr>
      </tbody></table>
      <table style="margin-bottom:8px;"><tbody><tr class="linha-grupo"><td>TIPO DE OBRA: ${escH(t.label)}</td></tr>
        ${gr.length ? `<tr><td>Grupos de serviço com este BDI: ${escH(gr.join('; '))}</td></tr>` : ''}</tbody></table>
      ${c.direta ? `<p style="font-size:11px;">Fornecimento de materiais e equipamentos por aquisição direta — BDI = 0,00%.</p>` : `
      <table>
        <thead><tr><th>Itens</th><th>Siglas</th><th>% Adotado</th><th>Situação</th><th>1º Quartil</th><th>Médio</th><th>3º Quartil</th></tr></thead>
        <tbody>
          ${c.linhas.map(l=>`<tr><td>${escH(l.label)}</td><td style="text-align:center">${l.sigla}</td><td class="num">${pct(l.valor)}</td><td style="text-align:center">${l.situacao}</td>
            <td class="num">${l.faixa?pctRef(l.faixa.min):'-'}</td><td class="num">${l.faixa?pctRef(l.faixa.med):'-'}</td><td class="num">${l.faixa?pctRef(l.faixa.max):'-'}</td></tr>`).join('')}
          <tr class="linha-grupo"><td>BDI SEM desoneração (Fórmula Acórdão TCU)</td><td style="text-align:center">BDI PAD</td><td class="num">${pct(c.sem)}</td><td style="text-align:center">${c.sitBdi}</td>
            <td class="num">${t.pad?pctRef(t.pad.min):'-'}</td><td class="num">${t.pad?pctRef(t.pad.med):'-'}</td><td class="num">${t.pad?pctRef(t.pad.max):'-'}</td></tr>
          <tr class="linha-total-geral"><td>BDI COM desoneração</td><td style="text-align:center">BDI DES</td><td class="num">${pct(c.com)}</td><td colspan="4"></td></tr>
        </tbody>
      </table>
      ${c.fora ? `<p style="font-size:10.5px;margin:8px 0;"><b>X</b> Anexo: Relatório Técnico Circunstanciado justificando a adoção do percentual de cada parcela do BDI.</p>` : ''}
      <div class="observacoes" style="text-align:center;font-size:11px;">Os valores de BDI foram calculados com o emprego da fórmula:<br>
        <b>BDI = ${t.modo==='estudos'?'(1+K1+K2)·(1+K3)':'(1+AC+S+R+G)·(1+DF)·(1+L)'} / (1−CP−ISS−CPRB) − 1</b></div>`}
      <div class="observacoes" style="border:1px solid #bbb;padding:8px;">
        Declaro para os devidos fins que, conforme legislação tributária municipal, a base de cálculo deste tipo de obra corresponde à ${num(B.issBase).toLocaleString('pt-BR')}%, com a respectiva alíquota de ${num(B.issAliquota).toLocaleString('pt-BR')}%.</div>
      <div class="observacoes" style="border:1px solid #bbb;padding:8px;">
        Declaro para os devidos fins que o regime de Contribuição Previdenciária sobre a Receita Bruta adotado para elaboração do orçamento foi ${o.regime==='desonerado'?'COM':'SEM'} Desoneração, e que esta é a alternativa mais adequada para a Administração Pública.</div>
      ${b.obs ? `<div class="observacoes"><b>Observações:</b> ${escH(b.obs)}</div>` : ''}
      <table style="margin-top:14px;width:60%;"><tbody>
        <tr><td style="width:30%;">Local</td><td>${escH(o.municipio||'')}</td></tr><tr><td>Data</td><td>${hoje}</td></tr></tbody></table>
      <div class="assinatura"><div class="linha"></div>${escH(o.responsavel||'')}<br>${escH(o.crea||'')}${art.numeroArt?'<br>ART/RRT: '+escH(art.numeroArt):''}</div>
    </div>`;
  });
  dispararImpressao(paginas.join(''));
}

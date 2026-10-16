/* =====================================================================
   ENGORC — MÓDULOS v2 (integração EngPav)
   1) Pavimentação: segmentos da via + motor de quantitativos (melhorado)
      + cálculo reverso pelo valor do convênio
   2) Composições analíticas (compartilhadas pela equipe) + itens próprios
   3) Edição de item só nesta obra (código/descrição/unidade)
   4) ART — assistente de preenchimento
   5) Importador de obras salvas (EngPav e EngOrc) com migração de formato
   Depende das funções globais do index.html (CURRENT_OBRA, apiFetch, recalcItem,
   renderOrcamento, renderCronograma, salvarObraAtual, fmtMoney, toast...).
   ===================================================================== */

const VERSAO_FORMATO_OBRA = 2;
function escH(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function jsA(x){ return escH(JSON.stringify(x)); }   // argumento seguro dentro de onclick="..."
function num(v, padrao){ const n = parseFloat(String(v==null?'':v).replace(',','.')); return isFinite(n) ? n : (padrao||0); }
function arred(v, casas){ const f = Math.pow(10, casas==null?4:casas); return Math.round(v*f)/f; }
function fmtQ(v){ return (v||0).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2}); }

/* =====================================================================
   1. PAVIMENTAÇÃO — catálogo de soluções (códigos SINAPI conferidos na base)
   ===================================================================== */
const PAV_GRUPOS = { terra:'Terraplenagem', pav:'Pavimentação', dren:'Drenagem', sinal:'Sinalização' };
const PAV_ORDEM_GRUPOS = ['Serviços Iniciais', PAV_GRUPOS.terra, PAV_GRUPOS.pav, PAV_GRUPOS.dren, PAV_GRUPOS.sinal];

const PAV = {
  pavimento: {
    'nenhum':        { label:'Sem revestimento (só base)', codigo:null },
    'cbuq':          { label:'CBUQ — camada de rolamento', codigo:'95995', tipo:'asfalto', espPadrao:5 },
    'cbuq_binder_so':{ label:'CBUQ — só camada de binder', codigo:'95996', tipo:'asfalto', espPadrao:4 },
    'paver_ret_6':   { label:'Paver retangular cor natural 6 cm', codigo:'92397', tipo:'bloco', espFixa:6 },
    'paver_ret_8':   { label:'Paver retangular cor natural 8 cm', codigo:'92398', tipo:'bloco', espFixa:8 },
    'sext_6':        { label:'Bloco sextavado 6 cm', codigo:'92393', tipo:'bloco', espFixa:6 },
    'sext_8':        { label:'Bloco sextavado 8 cm', codigo:'92394', tipo:'bloco', espFixa:8 },
    'sext_10':       { label:'Bloco sextavado 10 cm', codigo:'92395', tipo:'bloco', espFixa:10 },
    'pcs35_15':      { label:'Pav. concreto simples (PCS) fck 35 — 15 cm', codigo:'103904', tipo:'rigido', espFixa:15 },
    'pcs35_175':     { label:'Pav. concreto simples (PCS) fck 35 — 17,5 cm', codigo:'103907', tipo:'rigido', espFixa:17.5 },
    'pcs35_20':      { label:'Pav. concreto simples (PCS) fck 35 — 20 cm', codigo:'103908', tipo:'rigido', espFixa:20 },
    'pcs40_15':      { label:'Pav. concreto simples (PCS) fck 40 — 15 cm', codigo:'97104', tipo:'rigido', espFixa:15 },
    'pcs40_20':      { label:'Pav. concreto simples (PCS) fck 40 — 20 cm', codigo:'97106', tipo:'rigido', espFixa:20 },
  },
  binder: { codigo:'95996' },
  base: {
    'nenhuma':   { label:'Sem base', codigo:null },
    'bgs_10':    { label:'Brita graduada simples 10 cm', codigo:'105727', esp:10 },
    'bgs_15':    { label:'Brita graduada simples 15 cm', codigo:'96396',  esp:15 },
    'bgs_20':    { label:'Brita graduada simples 20 cm', codigo:'105730', esp:20 },
    'rachao_30': { label:'Rachão 30 cm', codigo:'105742', esp:30 },
    'rachao_40': { label:'Rachão 40 cm', codigo:'96399',  esp:40 },
    'rachao_50': { label:'Rachão 50 cm', codigo:'105745', esp:50 },
    'rachao_60': { label:'Rachão 60 cm', codigo:'105747', esp:60 },
  },
  meioFio: {
    'nenhum':            { label:'Sem meio-fio', codigo:null },
    'moldado_extrusora': { label:'Moldado in loco com extrusora (13×22 cm)', codigo:'94263' },
    'premoldado':        { label:'Pré-moldado (100×15×13×20 cm)', codigo:'94275' },
  },
  drenagem: { '300':'95565', '400':'92210', '500':'92211', '600':'92212', '700':'92213', '800':'92214', '900':'92215', '1000':'92216' },
  boca: {
    'nenhuma': { label:'Sem boca de lobo', codigo:null },
    'simples': { label:'Boca de lobo simples (pré-moldada)', codigo:'97935' },
    'dupla':   { label:'Boca de lobo dupla (pré-moldada)', codigo:'97936' },
  },
  calcada: {
    'nenhuma':           { label:'Sem calçada', codigo:null },
    'concreto_6_armado': { label:'Concreto armado 6 cm', codigo:'94992' },
    'concreto_8_armado': { label:'Concreto armado 8 cm', codigo:'94994' },
  },
  sinalizacaoHorizontal: '102512',
  imprimacao: '102470',          // CM-30, construção de pavimentos (m²)
  pinturaLigacao: '104375',      // RR-2C, construção de pavimentos (m²)
  subleito: { argiloso:'100576', arenoso:'100577' },
  escavCaixa: '101126',          // escavação horizontal 1ª cat. incl. carga e descarga (m³)
  transp: { m3km:'95875', m3kmExc:'93590', tkm:'95878', tkmExc:'93596' }, // basculante 10 m³, via urbana pavimentada
  cargaGranular: '100974',       // carga/manobra/descarga materiais granulares, basculante 10 m³ (m³)
  cargaAsfalto: '101002',        // carga de mistura asfáltica, basculante 10 m³ (t)
};
// Escavação e reaterro de vala para a rede de drenagem (solo 1ª categoria).
function pavCodigoEscavVala(larg, prof, interf){
  if(prof <= 1.5){
    if(larg < 1.5) return interf === 'alta' ? '102276' : '102279';
    return interf === 'alta' ? '90082' : '90091';
  }
  if(larg < 1.5) return interf === 'alta' ? '90084' : '90092';
  return interf === 'alta' ? '102278' : '102281';
}
function pavCodigoReaterro(larg, prof){
  if(prof <= 1.5){ if(larg < 0.8) return '104733'; if(larg <= 1.5) return '104734'; return '104728'; }
  return larg <= 1.5 ? '104729' : '104730';
}
function pavTodosCodigos(){
  const s = new Set();
  ['pavimento','base','meioFio','boca','calcada'].forEach(k=>Object.values(PAV[k]).forEach(o=>{ if(o.codigo) s.add(o.codigo); }));
  Object.values(PAV.drenagem).forEach(c=>s.add(c));
  [PAV.binder.codigo, PAV.sinalizacaoHorizontal, PAV.imprimacao, PAV.pinturaLigacao, PAV.escavCaixa, PAV.cargaGranular, PAV.cargaAsfalto]
    .forEach(c=>s.add(c));
  Object.values(PAV.subleito).forEach(c=>s.add(c));
  Object.values(PAV.transp).forEach(c=>s.add(c));
  ['102276','102279','90082','90091','90084','90092','102278','102281','104733','104734','104728','104729','104730'].forEach(c=>s.add(c));
  return Array.from(s);
}

function pavConfigPadrao(){
  return { dmtUsina:10, dmtAgregado:20, dmtBotaFora:5, densidadeCBUQ:2.4, fatorAgregado:1.30, empolamentoSolo:1.30,
    soloSubleito:'argiloso', interferenciaVala:'baixa', transporteAsfalto:true, transporteAgregado:true, botaFora:true };
}
function pavNovoSegmento(pav){
  const id = pav.proximoId || 1; pav.proximoId = id + 1;
  return {
    id, nome:`Trecho ${pav.segmentos.length+1}`, comprimento:100, largura:7,
    pavimentoOpcao:'cbuq', pavimentoEspessura:5, temBinder:false, binderEspessura:4,
    baseOpcao:'bgs_15', subBaseOpcao:'nenhuma',
    imprimacao:true, regularizacao:true, escavacaoCaixa:true, profCaixa:'',
    meioFioOpcao:'moldado_extrusora', meioFioLados:2,
    temDrenagem:false, drenagemDN:'400', drenagemExtensao:'', incluirVala:true, valaRecobrimento:0.8,
    bocaOpcao:'simples', bocaEspacamento:60, bocaLados:2,
    calcadaOpcao:'nenhuma', calcadaLargura:1.5, calcadaLados:2,
    sinalizacaoHorizontal:false, ajustavel:false
  };
}
function pavGarantir(o){
  o.extras = o.extras || {};
  if(!o.extras.pav) o.extras.pav = { segmentos:[], proximoId:1, config:pavConfigPadrao(), modoReverso:false, valorConvenio:0 };
  const p = o.extras.pav;
  p.config = Object.assign(pavConfigPadrao(), p.config||{});
  p.segmentos = p.segmentos || [];
  if(!p.proximoId) p.proximoId = (p.segmentos.reduce((m,s)=>Math.max(m, s.id||0),0)) + 1;
  return p;
}
function pavComprimento(seg){
  const p = CURRENT_OBRA.extras && CURRENT_OBRA.extras.pav;
  if(p && p.modoReverso && seg.ajustavel && seg._compCalc != null) return seg._compCalc;
  return num(seg.comprimento);
}

/* ---------- Motor: gera as linhas (grupo, código, quantidade, memória) de UM trecho ---------- */
function pavGerarTrecho(seg, cfg, compForcado){
  const linhas = [];
  const comp = compForcado != null ? compForcado : pavComprimento(seg);
  const larg = num(seg.largura);
  const area = comp * larg;
  const nome = seg.nome || ('Trecho ' + seg.id);
  const add = (grupo, codigo, qtd, memoria)=>{ if(codigo && qtd > 0) linhas.push({ grupo, codigo, qtd, origem:nome, memoria }); };

  const pav = PAV.pavimento[seg.pavimentoOpcao] || PAV.pavimento.nenhum;
  const base = PAV.base[seg.baseOpcao] || PAV.base.nenhuma;
  const sub = PAV.base[seg.subBaseOpcao] || PAV.base.nenhuma;
  const espPav = pav.tipo === 'asfalto' ? num(seg.pavimentoEspessura, pav.espPadrao) : (pav.tipo === 'bloco' ? pav.espFixa + 5 : (pav.espFixa||0)); // bloco: + 5 cm de colchão de areia
  const espBinder = (pav.tipo === 'asfalto' && seg.temBinder && seg.pavimentoOpcao !== 'cbuq_binder_so') ? num(seg.binderEspessura, 4) : 0;
  const espBase = base.esp || 0, espSub = sub.esp || 0;

  // --- Terraplenagem: abertura de caixa + regularização do subleito + bota-fora
  if(seg.escavacaoCaixa){
    const prof = seg.profCaixa !== '' && seg.profCaixa != null ? num(seg.profCaixa) : (espPav + espBinder + espBase + espSub)/100;
    const vol = area * prof;
    add(PAV_GRUPOS.terra, PAV.escavCaixa, vol, `${fmtQ(area)} m² × ${fmtQ(prof)} m (caixa)`);
    if(cfg.botaFora && cfg.dmtBotaFora > 0){
      const v = vol * cfg.empolamentoSolo;
      add(PAV_GRUPOS.terra, PAV.transp.m3km, v * Math.min(cfg.dmtBotaFora, 30), `bota-fora ${fmtQ(vol)} m³ × ${cfg.empolamentoSolo} × ${fmtQ(Math.min(cfg.dmtBotaFora,30))} km`);
      if(cfg.dmtBotaFora > 30) add(PAV_GRUPOS.terra, PAV.transp.m3kmExc, v * (cfg.dmtBotaFora-30), `bota-fora excedente ${fmtQ(cfg.dmtBotaFora-30)} km`);
    }
  }
  if(seg.regularizacao){
    add(PAV_GRUPOS.terra, PAV.subleito[cfg.soloSubleito] || PAV.subleito.argiloso, area, `${fmtQ(comp)} m × ${fmtQ(larg)} m`);
  }

  // --- Pavimentação: sub-base, base, imprimação, binder, pintura de ligação, revestimento
  const volGranular = area*espSub/100 + area*espBase/100;
  if(sub.codigo) add(PAV_GRUPOS.pav, sub.codigo, area*espSub/100, `${fmtQ(area)} m² × ${espSub} cm (sub-base)`);
  if(base.codigo) add(PAV_GRUPOS.pav, base.codigo, area*espBase/100, `${fmtQ(area)} m² × ${espBase} cm (base)`);
  if(volGranular > 0){
    const vSolto = volGranular * cfg.fatorAgregado;
    add(PAV_GRUPOS.pav, PAV.cargaGranular, vSolto, `${fmtQ(volGranular)} m³ × ${cfg.fatorAgregado} (empolamento)`);
    if(cfg.transporteAgregado && cfg.dmtAgregado > 0){
      add(PAV_GRUPOS.pav, PAV.transp.m3km, vSolto * Math.min(cfg.dmtAgregado,30), `agregados ${fmtQ(vSolto)} m³ × ${fmtQ(Math.min(cfg.dmtAgregado,30))} km`);
      if(cfg.dmtAgregado > 30) add(PAV_GRUPOS.pav, PAV.transp.m3kmExc, vSolto * (cfg.dmtAgregado-30), `agregados — excedente ${fmtQ(cfg.dmtAgregado-30)} km`);
    }
  }
  if(pav.tipo === 'asfalto'){
    if(seg.imprimacao && (base.codigo || sub.codigo)) add(PAV_GRUPOS.pav, PAV.imprimacao, area, `${fmtQ(area)} m² (sobre a base)`);
    let volAsf = 0;
    if(espBinder > 0){
      const v = area*espBinder/100; volAsf += v;
      add(PAV_GRUPOS.pav, PAV.binder.codigo, v, `${fmtQ(area)} m² × ${espBinder} cm (binder)`);
      add(PAV_GRUPOS.pav, PAV.pinturaLigacao, area, `${fmtQ(area)} m² (entre binder e rolamento)`);
    }
    const v = area*espPav/100; volAsf += v;
    add(PAV_GRUPOS.pav, pav.codigo, v, `${fmtQ(area)} m² × ${espPav} cm`);
    if(volAsf > 0){
      const t = volAsf * cfg.densidadeCBUQ;
      add(PAV_GRUPOS.pav, PAV.cargaAsfalto, t, `${fmtQ(volAsf)} m³ × ${cfg.densidadeCBUQ} t/m³`);
      if(cfg.transporteAsfalto && cfg.dmtUsina > 0){
        add(PAV_GRUPOS.pav, PAV.transp.tkm, t * Math.min(cfg.dmtUsina,30), `massa asfáltica ${fmtQ(t)} t × ${fmtQ(Math.min(cfg.dmtUsina,30))} km`);
        if(cfg.dmtUsina > 30) add(PAV_GRUPOS.pav, PAV.transp.tkmExc, t * (cfg.dmtUsina-30), `massa asfáltica — excedente ${fmtQ(cfg.dmtUsina-30)} km`);
      }
    }
  } else if(pav.codigo){
    add(PAV_GRUPOS.pav, pav.codigo, area, `${fmtQ(comp)} m × ${fmtQ(larg)} m`);
  }

  // --- Meio-fio
  const mf = PAV.meioFio[seg.meioFioOpcao];
  if(mf && mf.codigo) add(PAV_GRUPOS.pav, mf.codigo, comp * num(seg.meioFioLados), `${fmtQ(comp)} m × ${num(seg.meioFioLados)} lado(s)`);

  // --- Drenagem: vala (escavação + reaterro + bota-fora do volume do tubo), tubo, bocas de lobo
  if(seg.temDrenagem){
    const ext = seg.drenagemExtensao !== '' && seg.drenagemExtensao != null && num(seg.drenagemExtensao) > 0 ? num(seg.drenagemExtensao) : comp;
    const dn = num(seg.drenagemDN, 400)/1000;
    const tubo = PAV.drenagem[String(seg.drenagemDN)];
    if(seg.incluirVala !== false){
      const de = dn * 1.2;                                   // diâmetro externo aproximado do tubo de concreto
      const largV = dn + 0.6;                                 // largura de vala: DN + 0,60 m
      const profV = de + num(seg.valaRecobrimento, 0.8);       // profundidade: diâmetro externo + recobrimento
      const volEsc = ext * largV * profV;
      const volTubo = ext * Math.PI * de * de / 4;
      const volReat = Math.max(0, volEsc - volTubo);
      add(PAV_GRUPOS.dren, pavCodigoEscavVala(largV, profV, cfg.interferenciaVala), volEsc,
        `${fmtQ(ext)} m × ${fmtQ(largV)} m × ${fmtQ(profV)} m (vala)${profV > 3 ? ' — ATENÇÃO: profundidade acima de 3 m, confira o código de escavação e o escoramento' : ''}`);
      add(PAV_GRUPOS.dren, pavCodigoReaterro(largV, profV), volReat, `escavação − volume do tubo (${fmtQ(volTubo)} m³)`);
      if(cfg.botaFora && cfg.dmtBotaFora > 0){
        add(PAV_GRUPOS.dren, PAV.transp.m3km, volTubo * cfg.empolamentoSolo * Math.min(cfg.dmtBotaFora,30), `sobra de vala ${fmtQ(volTubo)} m³ × ${cfg.empolamentoSolo} × ${fmtQ(Math.min(cfg.dmtBotaFora,30))} km`);
      }
    }
    if(tubo) add(PAV_GRUPOS.dren, tubo, ext, `${fmtQ(ext)} m de rede DN ${seg.drenagemDN}`);
    const boca = PAV.boca[seg.bocaOpcao];
    if(boca && boca.codigo){
      const espac = num(seg.bocaEspacamento, 60) || 60;
      const n = Math.ceil(comp/espac) * (num(seg.bocaLados, 1) || 1);
      add(PAV_GRUPOS.dren, boca.codigo, n, `⌈${fmtQ(comp)} / ${espac}⌉ × ${num(seg.bocaLados,1)} lado(s)`);
    }
  }

  // --- Calçada (largura própria — não usa mais a largura da pista)
  const calc = PAV.calcada[seg.calcadaOpcao];
  if(calc && calc.codigo){
    add(PAV_GRUPOS.pav, calc.codigo, comp * num(seg.calcadaLargura, 1.5) * num(seg.calcadaLados, 2), `${fmtQ(comp)} m × ${fmtQ(num(seg.calcadaLargura,1.5))} m × ${num(seg.calcadaLados,2)} lado(s)`);
  }
  // --- Sinalização horizontal (eixo)
  if(seg.sinalizacaoHorizontal) add(PAV_GRUPOS.sinal, PAV.sinalizacaoHorizontal, comp, `${fmtQ(comp)} m de eixo`);
  return linhas;
}
// Soma as linhas de todos os trechos por grupo|código.
function pavAgregar(segmentos, cfg, compAjustavel){
  const ag = {};
  segmentos.forEach(seg=>{
    const forcado = (compAjustavel != null && seg.ajustavel) ? compAjustavel : null;
    pavGerarTrecho(seg, cfg, forcado).forEach(l=>{
      const k = l.grupo + '|' + l.codigo;
      if(!ag[k]) ag[k] = { chave:k, grupo:l.grupo, codigo:l.codigo, qtd:0, origens:new Set(), memorias:[] };
      ag[k].qtd += l.qtd; ag[k].origens.add(l.origem); ag[k].memorias.push(`${l.origem}: ${l.memoria}`);
    });
  });
  return ag;
}

/* ---------- Catálogo dos códigos do motor (cache por sessão) ---------- */
let PAV_CAT = null;
async function pavCarregarCatalogo(forcar){
  if(PAV_CAT && !forcar) return PAV_CAT;
  const r = await apiFetch('/api/itens/por-codigos', { method:'POST', body: JSON.stringify({ codigos: pavTodosCodigos(), fontes:['SINAPI'] }) });
  PAV_CAT = {};
  r.itens.forEach(it=>{ PAV_CAT[it.codigo] = it; });
  PAV_CAT._faltando = r.naoEncontrados || [];
  return PAV_CAT;
}
function pavItemNovo(codigo, grupo){
  const cat = PAV_CAT && PAV_CAT[codigo];
  const base = cat ? custoPorRegime(cat, CURRENT_OBRA.regime) : 0;
  return {
    itemId: cat ? cat.id : ('SINAPI ' + codigo), fonte: cat ? cat.fonte : 'SINAPI', codigo,
    descricao: cat ? cat.descricao : `(código ${codigo} não encontrado na base atual — informe o custo)`,
    unidade: cat ? cat.unidade : '',
    custoDesoneradoBase: cat ? cat.custoDesonerado : 0, custoNaoDesoneradoBase: cat ? cat.custoNaoDesonerado : 0,
    custoOriginal: base, manual:false, custoUnitario: base, custoComBDI: base, quantidade: 0, custoTotal: 0,
    grupo, auto:true
  };
}

/* ---------- Sincroniza o motor com a planilha do orçamento ---------- */
function pavGarantirGrupos(o, nomes){
  nomes.forEach(n=>{ if(!o.grupos.includes(n)) o.grupos.push(n); });
  // mantém a ordem lógica dos grupos de pavimentação, sem mexer nos grupos criados pelo usuário
  const conhecidos = o.grupos.filter(g=>PAV_ORDEM_GRUPOS.includes(g)).sort((a,b)=>PAV_ORDEM_GRUPOS.indexOf(a)-PAV_ORDEM_GRUPOS.indexOf(b));
  const outros = o.grupos.filter(g=>!PAV_ORDEM_GRUPOS.includes(g));
  o.grupos = conhecidos.concat(outros);
  if(!o.grupoAtivo || !o.grupos.includes(o.grupoAtivo)) o.grupoAtivo = o.grupos[0];
}
function pavSincronizar(){
  const o = CURRENT_OBRA; if(!o) return;
  const p = o.extras && o.extras.pav;
  if(!p) return;
  pavAplicarModoReverso();
  const ag = pavAgregar(p.segmentos, p.config);
  (p.excluidos||[]).forEach(k=>{ delete ag[k]; });
  const chaves = new Set(Object.keys(ag));
  // remove itens automáticos que o motor não gera mais
  o.itens = o.itens.filter(it=>!it.auto || chaves.has(it.motorChave));
  const gruposUsados = new Set();
  Object.values(ag).forEach(a=>{
    gruposUsados.add(a.grupo);
    let it = o.itens.find(i=>i.auto && i.motorChave===a.chave);
    if(!it){ it = pavItemNovo(a.codigo, a.grupo); it.motorChave = a.chave; o.itens.push(it); }
    it.grupo = a.grupo;
    it.quantidadeAuto = arred(a.qtd, 4);
    it.origens = Array.from(a.origens).join(', ');
    it.memoria = a.memorias.join('\n');
    if(!it.qtdManual) it.quantidade = it.quantidadeAuto;
    recalcItem(it);
  });
  pavGarantirGrupos(o, Array.from(gruposUsados));
}

// Item automático removido da planilha pelo usuário: o motor deixa de gerá-lo até ser restaurado.
function pavExcluirAuto(chave){
  const p = CURRENT_OBRA.extras && CURRENT_OBRA.extras.pav; if(!p || !chave) return;
  p.excluidos = p.excluidos || [];
  if(!p.excluidos.includes(chave)) p.excluidos.push(chave);
}
async function pavRestaurarExcluidos(){
  const p = CURRENT_OBRA.extras.pav; p.excluidos = [];
  await pavAtualizarTudo(); toast('Itens automáticos restaurados.');
}

/* ---------- Cálculo reverso: extensão do trecho "ajustável" que cabe no valor do convênio ---------- */
function pavCustoCenario(L){
  const o = CURRENT_OBRA, p = o.extras.pav;
  const f = fatorDesconto();
  const ag = pavAgregar(p.segmentos, p.config, L);
  (p.excluidos||[]).forEach(k=>{ delete ag[k]; });
  let total = 0;
  // itens não automáticos (linhas manuais) e itens automáticos com quantidade travada manualmente
  o.itens.forEach(it=>{ if(!it.auto || it.qtdManual) total += it.custoTotal; });
  Object.values(ag).forEach(a=>{
    const it = o.itens.find(i=>i.auto && i.motorChave===a.chave);
    if(it && it.qtdManual) return;
    let unitBDI;
    if(it) unitBDI = it.custoComBDI;
    else { const cat = PAV_CAT && PAV_CAT[a.codigo]; unitBDI = (cat ? custoPorRegime(cat, o.regime) : 0) * f * (1+bdiDoGrupo(o, String(a.chave).split('|')[0])); }
    total += a.qtd * unitBDI;
  });
  return total;
}
function pavAplicarModoReverso(){
  const o = CURRENT_OBRA, p = o.extras.pav;
  p.segmentos.forEach(s=>{ delete s._compCalc; });
  p._reverso = null;
  if(!p.modoReverso) return;
  const alvo = num(p.valorConvenio);
  const seg = p.segmentos.find(s=>s.ajustavel);
  if(!seg || alvo <= 0){ p._reverso = { erro: !seg ? 'Marque um trecho como "ajustável".' : 'Informe o valor disponível do convênio.' }; return; }
  // primeiro sincroniza sem o reverso para ter os itens/preços atualizados
  const c0 = pavCustoCenario(0);
  if(c0 > alvo){ seg._compCalc = 0; p._reverso = { erro:`Mesmo com o trecho ajustável zerado, o orçamento (${fmtMoney(c0)}) passa do valor do convênio.` , L:0 }; return; }
  let lo = 0, hi = 20000;
  for(let i=0;i<50;i++){ const mid = (lo+hi)/2; if(pavCustoCenario(mid) > alvo) hi = mid; else lo = mid; }
  seg._compCalc = Math.floor(lo*100)/100;
  p._reverso = { L: seg._compCalc, total: pavCustoCenario(seg._compCalc), alvo, trecho: seg.nome };
}

/* ---------- Tela: aba Segmentos ---------- */
let _pavTimerSalvar = null;
function pavAgendarSalvar(){ clearTimeout(_pavTimerSalvar); _pavTimerSalvar = setTimeout(()=>salvarObraAtual(true), 700); }
async function pavAtualizarTudo(){
  pavSincronizar();
  renderSegmentos(); renderOrcamento(); renderCronograma();
  pavAgendarSalvar();
}
async function pavAdicionarTrecho(){
  const o = CURRENT_OBRA; const p = pavGarantir(o);
  try{ await pavCarregarCatalogo(); }catch(e){ toast('Não foi possível ler a base de preços: ' + e.message, true); return; }
  bdiGarantir(o);
  if(p.segmentos.length === 0 && o.bdi.lista.length === 1 && o.bdi.lista[0].tipo !== 'pavimentacao' && o.itens.length === 0){
    o.bdi.lista[0].tipo = 'pavimentacao'; bdiAplicarMedios(o.bdi.lista[0]); bdiCalcularTudo(o);
    preencherFormObra(); renderBdiPanel();
  }
  p.segmentos.push(pavNovoSegmento(p));
  await pavAtualizarTudo();
}
async function pavDuplicarTrecho(id){
  const p = CURRENT_OBRA.extras.pav; const s = p.segmentos.find(x=>x.id===id); if(!s) return;
  const novo = JSON.parse(JSON.stringify(s)); novo.id = p.proximoId++; novo.nome = s.nome + ' (cópia)'; novo.ajustavel = false;
  p.segmentos.splice(p.segmentos.indexOf(s)+1, 0, novo);
  await pavAtualizarTudo();
}
async function pavRemoverTrecho(id){
  const p = CURRENT_OBRA.extras.pav;
  const s = p.segmentos.find(x=>x.id===id);
  if(!s || !confirm(`Remover "${s.nome}"? Os itens gerados por ele saem do orçamento.`)) return;
  p.segmentos = p.segmentos.filter(x=>x.id!==id);
  await pavAtualizarTudo();
}
const PAV_CAMPOS_NUM = ['comprimento','largura','pavimentoEspessura','binderEspessura','meioFioLados','bocaEspacamento','bocaLados','calcadaLargura','calcadaLados','valaRecobrimento'];
async function pavAtualizarCampo(id, campo, valor, ehCheck){
  const p = CURRENT_OBRA.extras.pav; const s = p.segmentos.find(x=>x.id===id); if(!s) return;
  if(ehCheck) s[campo] = !!valor;
  else if(PAV_CAMPOS_NUM.includes(campo)) s[campo] = Math.max(0, num(valor));
  else s[campo] = valor;
  if(campo === 'ajustavel' && valor) p.segmentos.forEach(x=>{ if(x.id!==id) x.ajustavel = false; });
  if(campo === 'pavimentoOpcao'){ const op = PAV.pavimento[valor]; if(op && op.espPadrao) s.pavimentoEspessura = op.espPadrao; }
  await pavAtualizarTudo();
}
async function pavAtualizarConfig(campo, valor, ehCheck){
  const p = CURRENT_OBRA.extras.pav;
  if(ehCheck) p.config[campo] = !!valor;
  else if(['soloSubleito','interferenciaVala'].includes(campo)) p.config[campo] = valor;
  else p.config[campo] = Math.max(0, num(valor));
  await pavAtualizarTudo();
}
async function pavAtualizarReverso(campo, valor){
  const p = CURRENT_OBRA.extras.pav;
  if(campo === 'modoReverso') p.modoReverso = !!valor; else p.valorConvenio = Math.max(0, num(valor));
  await pavAtualizarTudo();
}
function pavSel(dic, atual, id, campo){
  return `<select onchange="pavAtualizarCampo(${id}, '${campo}', this.value)">` +
    Object.keys(dic).map(k=>`<option value="${k}" ${k===atual?'selected':''}>${escH(dic[k].label||k)}</option>`).join('') + '</select>';
}
function pavInp(seg, campo, passo, extra){
  return `<input type="number" min="0" step="${passo||0.01}" value="${seg[campo]==null?'':seg[campo]}" ${extra||''} onchange="pavAtualizarCampo(${seg.id}, '${campo}', this.value)">`;
}
function pavChk(seg, campo, rotulo){
  return `<label class="pav-chk"><input type="checkbox" ${seg[campo]?'checked':''} onchange="pavAtualizarCampo(${seg.id}, '${campo}', this.checked, true)"> ${rotulo}</label>`;
}
function renderSegmentos(){
  const cont = document.getElementById('segLista'); if(!cont || !CURRENT_OBRA) return;
  const o = CURRENT_OBRA;
  const p = o.extras && o.extras.pav;
  const cfgBox = document.getElementById('segConfig');
  const revBox = document.getElementById('segReverso');
  const resumo = document.getElementById('segResumo');
  if(!p || !p.segmentos.length){
    cont.innerHTML = `<div class="empty-state"><div class="big">Nenhum trecho cadastrado</div>Use "+ Novo trecho" para gerar automaticamente os quantitativos de pavimentação, drenagem, calçada e sinalização. Obras de outros tipos não precisam desta aba.</div>`;
    cfgBox.style.display = 'none'; revBox.style.display = 'none'; resumo.innerHTML = '';
    return;
  }
  cfgBox.style.display = ''; revBox.style.display = '';
  const c = p.config;
  document.getElementById('segConfigCorpo').innerHTML = `
    <div class="linha-tripla">
      <div class="campo"><label>DMT usina de asfalto (km)</label><input type="number" min="0" step="0.1" value="${c.dmtUsina}" onchange="pavAtualizarConfig('dmtUsina', this.value)"></div>
      <div class="campo"><label>DMT pedreira / agregados (km)</label><input type="number" min="0" step="0.1" value="${c.dmtAgregado}" onchange="pavAtualizarConfig('dmtAgregado', this.value)"></div>
      <div class="campo"><label>DMT bota-fora (km)</label><input type="number" min="0" step="0.1" value="${c.dmtBotaFora}" onchange="pavAtualizarConfig('dmtBotaFora', this.value)"></div>
    </div>
    <div class="linha-tripla">
      <div class="campo"><label>Densidade do CBUQ (t/m³)</label><input type="number" min="0" step="0.01" value="${c.densidadeCBUQ}" onchange="pavAtualizarConfig('densidadeCBUQ', this.value)"></div>
      <div class="campo"><label>Empolamento agregados (compactado → solto)</label><input type="number" min="1" step="0.01" value="${c.fatorAgregado}" onchange="pavAtualizarConfig('fatorAgregado', this.value)"></div>
      <div class="campo"><label>Empolamento do solo escavado</label><input type="number" min="1" step="0.01" value="${c.empolamentoSolo}" onchange="pavAtualizarConfig('empolamentoSolo', this.value)"></div>
    </div>
    <div class="linha-tripla">
      <div class="campo"><label>Solo do subleito (regularização)</label><select onchange="pavAtualizarConfig('soloSubleito', this.value)">
        <option value="argiloso" ${c.soloSubleito==='argiloso'?'selected':''}>Predominantemente argiloso</option>
        <option value="arenoso" ${c.soloSubleito==='arenoso'?'selected':''}>Predominantemente arenoso</option></select></div>
      <div class="campo"><label>Interferências na vala (drenagem)</label><select onchange="pavAtualizarConfig('interferenciaVala', this.value)">
        <option value="baixa" ${c.interferenciaVala==='baixa'?'selected':''}>Baixo nível de interferência</option>
        <option value="alta" ${c.interferenciaVala==='alta'?'selected':''}>Alto nível de interferência</option></select></div>
      <div class="campo"><label>Incluir no orçamento</label>
        <label class="pav-chk"><input type="checkbox" ${c.transporteAsfalto?'checked':''} onchange="pavAtualizarConfig('transporteAsfalto', this.checked, true)"> Transporte da massa asfáltica</label>
        <label class="pav-chk"><input type="checkbox" ${c.transporteAgregado?'checked':''} onchange="pavAtualizarConfig('transporteAgregado', this.checked, true)"> Transporte de agregados</label>
        <label class="pav-chk"><input type="checkbox" ${c.botaFora?'checked':''} onchange="pavAtualizarConfig('botaFora', this.checked, true)"> Transporte de bota-fora</label></div>
    </div>
    <p class="obs" style="margin-top:0;">Transportes em caminhão basculante 10 m³ por via urbana pavimentada (SINAPI 95875 m³×km e 95878 t×km; acima de 30 km entra o adicional de DMT excedente). As composições de CBUQ, brita graduada e rachão são "exclusive carga e transporte", por isso esses itens são somados aqui.</p>`;
  const r = p._reverso;
  document.getElementById('segReversoCorpo').innerHTML = `
    <label class="pav-chk" style="margin-bottom:10px;"><input type="checkbox" ${p.modoReverso?'checked':''} onchange="pavAtualizarReverso('modoReverso', this.checked)"> Calcular a extensão do trecho marcado como <b>ajustável</b> para caber no valor do convênio</label>
    <div class="campo" style="max-width:280px;"><label>Valor disponível do convênio (R$, com BDI)</label><input type="number" min="0" step="0.01" value="${p.valorConvenio||''}" onchange="pavAtualizarReverso('valorConvenio', this.value)"></div>
    ${p.modoReverso ? (r && r.erro ? `<div class="pav-alerta">${escH(r.erro)}</div>` : (r ? `<div class="pav-ok">Extensão calculada para <b>${escH(r.trecho)}</b>: <b>${fmtQ(r.L)} m</b> — orçamento ${fmtMoney(r.total)} de ${fmtMoney(r.alvo)}.</div>` : '')) : ''}
    <p class="obs">Os demais trechos e as linhas manuais do orçamento ficam fixos; a busca considera BDI, desconto e preços editados.</p>`;

  cont.innerHTML = p.segmentos.map(seg=>{
    const pav = PAV.pavimento[seg.pavimentoOpcao] || PAV.pavimento.nenhum;
    const comp = pavComprimento(seg);
    const linhas = pavGerarTrecho(seg, p.config);
    const calcRev = p.modoReverso && seg.ajustavel && seg._compCalc != null;
    return `<div class="seg-card">
      <div class="seg-topo">
        <input class="seg-nome" value="${escH(seg.nome)}" onchange="pavAtualizarCampo(${seg.id}, 'nome', this.value)">
        <span class="tag">${fmtQ(comp)} m × ${fmtQ(num(seg.largura))} m = ${fmtQ(comp*num(seg.largura))} m²</span>
        <span style="margin-left:auto;display:flex;gap:6px;">
          <button class="btn ghost fino" onclick="pavDuplicarTrecho(${seg.id})">Duplicar</button>
          <button class="btn danger fino" onclick="pavRemoverTrecho(${seg.id})">Remover</button></span>
      </div>
      <div class="seg-grade">
        <div class="seg-bloco"><h4>Geometria</h4>
          <div class="campo"><label>Extensão (m)${calcRev?' — <b style="color:var(--amber-2)">calculada pelo modo reverso</b>':''}</label>${pavInp(seg,'comprimento',0.01, calcRev?'disabled':'')}</div>
          <div class="campo"><label>Largura da pista (m)</label>${pavInp(seg,'largura')}</div>
          ${pavChk(seg,'ajustavel','Trecho ajustável (modo reverso)')}
        </div>
        <div class="seg-bloco"><h4>Pavimento</h4>
          <div class="campo"><label>Revestimento</label>${pavSel(PAV.pavimento, seg.pavimentoOpcao, seg.id, 'pavimentoOpcao')}</div>
          ${pav.tipo==='asfalto' ? `<div class="campo"><label>Espessura do revestimento (cm)</label>${pavInp(seg,'pavimentoEspessura',0.5)}</div>
            ${seg.pavimentoOpcao==='cbuq' ? pavChk(seg,'temBinder','Camada de binder (+ pintura de ligação)') + (seg.temBinder?`<div class="campo"><label>Espessura do binder (cm)</label>${pavInp(seg,'binderEspessura',0.5)}</div>`:'') : ''}
            ${pavChk(seg,'imprimacao','Imprimação sobre a base (CM-30)')}` : ''}
          ${pav.tipo==='rigido' ? '<p class="obs">PCS: barras de transferência/ligação e juntas não são geradas — inclua como linha manual se o projeto exigir.</p>' : ''}
        </div>
        <div class="seg-bloco"><h4>Base e terraplenagem</h4>
          <div class="campo"><label>Base</label>${pavSel(PAV.base, seg.baseOpcao, seg.id, 'baseOpcao')}</div>
          <div class="campo"><label>Sub-base</label>${pavSel(PAV.base, seg.subBaseOpcao, seg.id, 'subBaseOpcao')}</div>
          ${pavChk(seg,'regularizacao','Regularização e compactação do subleito')}
          ${pavChk(seg,'escavacaoCaixa','Abertura de caixa (escavação)')}
          ${seg.escavacaoCaixa ? `<div class="campo"><label>Profundidade da caixa (m) — vazio = soma das camadas</label><input type="number" min="0" step="0.01" value="${seg.profCaixa===''||seg.profCaixa==null?'':seg.profCaixa}" placeholder="automático" onchange="pavAtualizarCampo(${seg.id}, 'profCaixa', this.value===''?'':this.value)"></div>` : ''}
        </div>
        <div class="seg-bloco"><h4>Meio-fio e calçada</h4>
          <div class="campo"><label>Meio-fio</label>${pavSel(PAV.meioFio, seg.meioFioOpcao, seg.id, 'meioFioOpcao')}</div>
          ${PAV.meioFio[seg.meioFioOpcao]&&PAV.meioFio[seg.meioFioOpcao].codigo ? `<div class="campo"><label>Lados com meio-fio</label>${pavInp(seg,'meioFioLados',1)}</div>`:''}
          <div class="campo"><label>Calçada</label>${pavSel(PAV.calcada, seg.calcadaOpcao, seg.id, 'calcadaOpcao')}</div>
          ${PAV.calcada[seg.calcadaOpcao]&&PAV.calcada[seg.calcadaOpcao].codigo ? `<div class="linha-dupla"><div class="campo"><label>Largura (m)</label>${pavInp(seg,'calcadaLargura')}</div><div class="campo"><label>Lados</label>${pavInp(seg,'calcadaLados',1)}</div></div>`:''}
        </div>
        <div class="seg-bloco"><h4>Drenagem</h4>
          ${pavChk(seg,'temDrenagem','Rede de drenagem pluvial')}
          ${seg.temDrenagem ? `
            <div class="linha-dupla"><div class="campo"><label>Diâmetro (DN)</label><select onchange="pavAtualizarCampo(${seg.id}, 'drenagemDN', this.value)">${Object.keys(PAV.drenagem).map(d=>`<option value="${d}" ${String(seg.drenagemDN)===d?'selected':''}>DN ${d}</option>`).join('')}</select></div>
            <div class="campo"><label>Extensão da rede (m)</label><input type="number" min="0" step="0.01" value="${seg.drenagemExtensao||''}" placeholder="= extensão do trecho" onchange="pavAtualizarCampo(${seg.id}, 'drenagemExtensao', this.value)"></div></div>
            ${pavChk(seg,'incluirVala','Escavação, reaterro e bota-fora da vala')}
            ${seg.incluirVala!==false ? `<div class="campo"><label>Recobrimento sobre o tubo (m)</label>${pavInp(seg,'valaRecobrimento')}</div>`:''}
            <div class="campo"><label>Boca de lobo</label>${pavSel(PAV.boca, seg.bocaOpcao, seg.id, 'bocaOpcao')}</div>
            ${PAV.boca[seg.bocaOpcao]&&PAV.boca[seg.bocaOpcao].codigo ? `<div class="linha-dupla"><div class="campo"><label>Espaçamento (m)</label>${pavInp(seg,'bocaEspacamento',1)}</div><div class="campo"><label>Lados</label>${pavInp(seg,'bocaLados',1)}</div></div>`:''}` : ''}
        </div>
        <div class="seg-bloco"><h4>Sinalização</h4>
          ${pavChk(seg,'sinalizacaoHorizontal','Pintura de eixo (retrorrefletiva)')}
        </div>
      </div>
      <details class="seg-itens"><summary>${linhas.length} item(ns) gerado(s) por este trecho</summary>
        <table><thead><tr><th>Grupo</th><th>Código</th><th>Descrição</th><th class="num">Qtd.</th><th>Un.</th><th>Cálculo</th></tr></thead><tbody>
        ${linhas.map(l=>{ const cat = PAV_CAT && PAV_CAT[l.codigo]; return `<tr><td>${escH(l.grupo)}</td><td class="mono">${l.codigo}</td><td style="font-size:11px;">${escH(cat?cat.descricao.slice(0,90):'(não encontrado na base)')}</td><td class="num mono">${fmtQ(l.qtd)}</td><td class="mono">${escH(cat?cat.unidade:'')}</td><td style="font-size:10.5px;color:var(--muted);">${escH(l.memoria)}</td></tr>`; }).join('')}
        </tbody></table></details>
    </div>`;
  }).join('');

  const autos = o.itens.filter(i=>i.auto);
  const zerados = autos.filter(i=>!(i.custoOriginal>0));
  const totalAuto = autos.reduce((s,i)=>s+i.custoTotal,0);
  const extTot = p.segmentos.reduce((s,x)=>s+pavComprimento(x),0);
  const areaTot = p.segmentos.reduce((s,x)=>s+pavComprimento(x)*num(x.largura),0);
  resumo.innerHTML = `<div class="totais-barra" style="margin-top:0;">
      <div class="t"><div class="lbl">Extensão total</div><div class="v">${fmtQ(extTot)} m</div></div>
      <div class="t"><div class="lbl">Área de pista</div><div class="v">${fmtQ(areaTot)} m²</div></div>
      <div class="t"><div class="lbl">Itens automáticos</div><div class="v">${autos.length}</div></div>
      <div class="t hi"><div class="lbl">Total dos itens automáticos (c/ BDI)</div><div class="v">${fmtMoney(totalAuto)}</div></div>
    </div>
    ${zerados.length ? `<div class="pav-alerta" style="margin-top:10px;"><b>${zerados.length} item(ns) sem preço na base SINAPI</b> (ex.: imprimação e pintura de ligação, cujo ligante asfáltico não tem preço de referência em SC): ${zerados.map(i=>i.codigo).join(', ')}. Informe o custo unitário na aba Orçamento (cotação) ou monte a composição analítica na aba Composições.</div>`:''}
    ${(p.excluidos||[]).length ? `<div class="pav-alerta" style="margin-top:10px;">${p.excluidos.length} item(ns) automático(s) removido(s) manualmente da planilha: ${escH(p.excluidos.map(k=>k.split('|')[1]).join(', '))}. <button class="btn ghost fino" onclick="pavRestaurarExcluidos()">Restaurar</button></div>` : ''}
    ${PAV_CAT && PAV_CAT._faltando && PAV_CAT._faltando.length ? `<div class="pav-alerta" style="margin-top:10px;">Códigos do motor não encontrados na base atual: ${PAV_CAT._faltando.join(', ')}.</div>`:''}`;
}
function imprimirMemoriaPav(){
  const o = CURRENT_OBRA, p = o.extras && o.extras.pav;
  if(!p || !p.segmentos.length){ toast('Nenhum trecho cadastrado.', true); return; }
  const c = p.config;
  const blocos = p.segmentos.map((seg,i)=>{
    const linhas = pavGerarTrecho(seg, c);
    return `<table style="margin-bottom:12px;"><thead><tr><th style="width:70px;">Código</th><th>Descrição</th><th style="width:70px;">Qtd.</th><th style="width:40px;">Un.</th><th style="width:220px;">Memória de cálculo</th></tr></thead><tbody>
      <tr class="linha-grupo"><td>${i+1}</td><td colspan="4">${escH(seg.nome)} — ${fmtQ(pavComprimento(seg))} m × ${fmtQ(num(seg.largura))} m</td></tr>
      ${linhas.map(l=>{ const cat = PAV_CAT && PAV_CAT[l.codigo]; return `<tr><td>${l.codigo}</td><td>${escH(cat?cat.descricao:'')}</td><td class="num">${fmtQ(l.qtd)}</td><td>${escH(cat?cat.unidade:'')}</td><td style="font-size:9px;">${escH(l.memoria)}</td></tr>`; }).join('')}
      </tbody></table>`;
  }).join('');
  dispararImpressao(`<div class="doc-impressao">${cabecalhoImpressao()}<div class="faixa-titulo">Memória de Cálculo dos Quantitativos</div>${infoObraImpressao()}
    ${blocos}
    <div class="observacoes">PARÂMETROS: DMT usina ${fmtQ(c.dmtUsina)} km · DMT agregados ${fmtQ(c.dmtAgregado)} km · DMT bota-fora ${fmtQ(c.dmtBotaFora)} km · densidade do CBUQ ${fmtQ(c.densidadeCBUQ)} t/m³ · empolamento agregados ${fmtQ(c.fatorAgregado)} · empolamento solo ${fmtQ(c.empolamentoSolo)} · subleito ${c.soloSubleito} · vala com ${c.interferenciaVala} nível de interferência.<br>
      Vala de drenagem: largura = DN + 0,60 m; profundidade = diâmetro externo (1,2 × DN) + recobrimento; reaterro = escavação − volume do tubo.
      ${(p.excluidos||[]).length?'<br>Itens automáticos excluídos manualmente do orçamento: '+escH(p.excluidos.join(', '))+'.':''}
      ${o.itens.some(i=>i.auto&&i.qtdManual)?'<br>Quantidades ajustadas manualmente no orçamento (prevalecem sobre esta memória): '+escH(o.itens.filter(i=>i.auto&&i.qtdManual).map(i=>i.codigo+' = '+fmtQ(i.quantidade)).join('; '))+'.':''}</div>
    <div class="assinatura"><div class="linha"></div>${escH(o.responsavel||'')}<br>${escH(o.crea||'')}</div></div>`);
}
async function abrirAbaSegmentos(){
  if(CURRENT_OBRA && CURRENT_OBRA.extras && CURRENT_OBRA.extras.pav && CURRENT_OBRA.extras.pav.segmentos.length){
    try{ await pavCarregarCatalogo(); }catch(e){}
  }
  renderSegmentos();
}

/* =====================================================================
   2. COMPOSIÇÕES ANALÍTICAS (compartilhadas) + ITENS PRÓPRIOS
   ===================================================================== */
const TIPOS_COMP = ['Material','Mão de obra','Equipamento','Serviço','Composição auxiliar','Outro'];
let COMP_LISTA = [];
let COMP_ATUAL = null;      // { itemId, item, linhas, observacao, alterado }
let COMP_FILTRO = '';
let COMP_BUSCA_ITEM = [], COMP_BUSCA_INSUMO = [];
function compRegime(){ return (CURRENT_OBRA && CURRENT_OBRA.regime) || 'nao_desonerado'; }
function compPrecoLinha(l, regime){ regime = regime || compRegime(); return regime === 'desonerado' ? (l.precoD > 0 ? l.precoD : l.precoND) : (l.precoND > 0 ? l.precoND : l.precoD); }
function compTotal(linhas, regime){ return (linhas||[]).reduce((s,l)=>s + num(l.coef)*compPrecoLinha(l, regime), 0); }

async function carregarComposicoes(){
  try{ const r = await apiFetch('/api/composicoes'); COMP_LISTA = r.composicoes || []; }
  catch(e){ toast('Erro ao carregar composições: ' + e.message, true); COMP_LISTA = []; }
}
async function abrirAbaComposicoes(){ await carregarComposicoes(); renderComposicoes(); }
function compMapaPorItem(){ const m = {}; COMP_LISTA.forEach(c=>{ m[c.itemId] = c; }); return m; }

async function compBuscarItem(campo, alvo){
  const q = document.getElementById(campo).value.trim();
  const box = document.getElementById(alvo);
  if(q.length < 3){ box.innerHTML = ''; box.style.display = 'none'; return; }
  try{
    const r = await apiFetch(`/api/itens/buscar?q=${encodeURIComponent(q)}&fontes=${encodeURIComponent(['SINAPI','SINAPI-I','SICRO','Composição','Cotação','Própria'].join(','))}`);
    if(alvo === 'compSugItem') COMP_BUSCA_ITEM = r.itens; else COMP_BUSCA_INSUMO = r.itens;
    const fn = alvo === 'compSugItem' ? 'compSelecionarItem' : 'compAdicionarInsumo';
    box.innerHTML = r.itens.length ? r.itens.slice(0,40).map((it,i)=>`<div class="sug-item" onmousedown="${fn}(${i})">
        <span class="fonte-chip fonte-${it.fonte.replace(/[^A-Za-zÀ-ú]/g,'')}">${escH(it.fonte)}</span> <b>${escH(it.codigo)}</b> — ${escH(it.descricao.slice(0,110))}
        <i>(${escH(it.unidade)}, ${fmtMoney(custoPorRegime(it, compRegime()))})</i></div>`).join('')
      : '<div class="sug-item" style="color:var(--muted)">Nada encontrado</div>';
    box.style.display = 'block';
  }catch(e){ box.style.display = 'none'; }
}
function compEsconder(id){ setTimeout(()=>{ const b = document.getElementById(id); if(b) b.style.display = 'none'; }, 180); }

async function compAbrir(itemId, itemDados){
  if(COMP_ATUAL && COMP_ATUAL.alterado && !confirm('Há alterações não salvas na composição aberta. Descartar?')) return;
  const existente = COMP_LISTA.find(c=>c.itemId===itemId);
  let item = itemDados || (existente && existente.item);
  if(!item){ try{ const r = await apiFetch('/api/itens/por-ids', { method:'POST', body: JSON.stringify({ ids:[itemId] }) }); item = r.itens[0] || null; }catch(e){} }
  COMP_ATUAL = { itemId, item, linhas: existente ? JSON.parse(JSON.stringify(existente.linhas||[])) : [], observacao: existente ? existente.observacao : '', alterado:false, nova: !existente };
  await compAtualizarPrecosCatalogo(true);
  renderComposicoes();
  const ed = document.getElementById('compEditorCard'); if(ed) ed.scrollIntoView({behavior:'smooth', block:'start'});
}
function compSelecionarItem(i){
  const it = COMP_BUSCA_ITEM[i]; if(!it) return;
  document.getElementById('compBuscaItem').value = '';
  compAbrir(it.id, it);
}
// Abre a composição de um item do orçamento (botão 🧩 na planilha).
async function abrirComposicaoDoItem(idx){
  const it = CURRENT_OBRA.itens[idx]; if(!it) return;
  mudarAba('pagina-composicoes');
  await carregarComposicoes();
  await compAbrir(it.itemId, { id:it.itemId, fonte:it.fonte, codigo:it.codigo, descricao:it.descricao, unidade:it.unidade,
    custoDesonerado:it.custoDesoneradoBase, custoNaoDesonerado:it.custoNaoDesoneradoBase });
}
function compAdicionarInsumo(i){
  const it = COMP_BUSCA_INSUMO[i]; if(!it || !COMP_ATUAL) return;
  const coef = num(document.getElementById('compCoefNovo').value, 1);
  const tipo = it.fonte === 'SINAPI-I' ? 'Material' : 'Composição auxiliar';
  COMP_ATUAL.linhas.push({ tipo, refId: it.id, fonte: it.fonte, codigo: it.codigo, descricao: it.descricao, unidade: it.unidade,
    coef, precoD: it.custoDesonerado||0, precoND: it.custoNaoDesonerado||0 });
  COMP_ATUAL.alterado = true;
  document.getElementById('compBuscaInsumo').value = '';
  renderComposicoes();
}
function compLinhaManual(){
  if(!COMP_ATUAL) return;
  COMP_ATUAL.linhas.push({ tipo:'Material', refId:null, fonte:'', codigo:'', descricao:'', unidade:'', coef:1, precoD:0, precoND:0 });
  COMP_ATUAL.alterado = true; renderComposicoes();
}
function compEditar(i, campo, valor){
  const l = COMP_ATUAL && COMP_ATUAL.linhas[i]; if(!l) return;
  if(campo === 'coef') l.coef = num(valor);
  else if(campo === 'preco'){ const v = Math.max(0, num(valor)); l.precoD = v; l.precoND = v; l.refId = null; } // preço digitado = fixo (deixa de acompanhar o catálogo)
  else l[campo] = String(valor).trim();
  COMP_ATUAL.alterado = true; renderComposicoes();
}
function compRemoverLinha(i){ if(!COMP_ATUAL) return; COMP_ATUAL.linhas.splice(i,1); COMP_ATUAL.alterado = true; renderComposicoes(); }
async function compAtualizarPrecosCatalogo(silencioso){
  if(!COMP_ATUAL) return;
  const ids = COMP_ATUAL.linhas.filter(l=>l.refId).map(l=>l.refId);
  if(!ids.length){ if(!silencioso) toast('Nenhuma linha vinculada ao catálogo.'); return; }
  try{
    const r = await apiFetch('/api/itens/por-ids', { method:'POST', body: JSON.stringify({ ids }) });
    const m = {}; r.itens.forEach(it=>{ m[it.id] = it; });
    let mud = 0;
    COMP_ATUAL.linhas.forEach(l=>{ const it = l.refId && m[l.refId]; if(it && (it.custoDesonerado !== l.precoD || it.custoNaoDesonerado !== l.precoND)){ l.precoD = it.custoDesonerado; l.precoND = it.custoNaoDesonerado; mud++; } });
    if(mud && !COMP_ATUAL.nova) COMP_ATUAL.alterado = true;
    if(!silencioso){ renderComposicoes(); toast(mud ? `${mud} preço(s) atualizado(s) pela base atual.` : 'Preços já estavam iguais à base.'); }
  }catch(e){ if(!silencioso) toast('Erro: ' + e.message, true); }
}
async function compSalvar(){
  if(!COMP_ATUAL) return;
  try{
    await apiFetch('/api/composicoes/' + encodeURIComponent(COMP_ATUAL.itemId), { method:'PUT', body: JSON.stringify({ linhas: COMP_ATUAL.linhas, observacao: COMP_ATUAL.observacao }) });
    COMP_ATUAL.alterado = false; COMP_ATUAL.nova = false;
    await carregarComposicoes(); renderComposicoes();
    toast('Composição salva — vale para toda a equipe.');
  }catch(e){ toast('Erro ao salvar: ' + e.message, true); }
}
async function compExcluir(){
  if(!COMP_ATUAL || COMP_ATUAL.nova) { COMP_ATUAL = null; renderComposicoes(); return; }
  if(!confirm('Excluir a composição analítica deste item? O item continua no catálogo com o preço da base.')) return;
  try{ await apiFetch('/api/composicoes/' + encodeURIComponent(COMP_ATUAL.itemId), { method:'DELETE' }); COMP_ATUAL = null; await carregarComposicoes(); renderComposicoes(); toast('Composição excluída.'); }
  catch(e){ toast('Erro: ' + e.message, true); }
}
// Usa o total da composição como custo unitário do item NESTA obra (custo manual, sem mexer no catálogo).
async function compAplicarNaObra(){
  if(!COMP_ATUAL || !CURRENT_OBRA) return;
  const alvo = CURRENT_OBRA.itens.filter(i=>i.itemId === COMP_ATUAL.itemId);
  if(!alvo.length){ toast('Este item não está no orçamento da obra atual.', true); return; }
  const total = arred(compTotal(COMP_ATUAL.linhas), 2);
  if(!confirm(`Usar R$ ${fmtQ(total)} (total da composição) como custo unitário de ${alvo.length} linha(s) do orçamento da obra "${CURRENT_OBRA.nome}"?`)) return;
  alvo.forEach(it=>{ it.manual = true; it.custoOriginal = total; recalcItem(it); });
  renderOrcamento(); renderCronograma(); await salvarObraAtual(true);
  toast('Custo aplicado no orçamento (campo amarelo = valor manual).');
}
// Para itens próprios: grava o total da composição como preço do item no catálogo da equipe.
async function compAplicarNoCatalogo(){
  const it = COMP_ATUAL && COMP_ATUAL.item; if(!it || it.fonte !== 'Própria') return;
  const tD = arred(compTotal(COMP_ATUAL.linhas, 'desonerado'), 2), tN = arred(compTotal(COMP_ATUAL.linhas, 'nao_desonerado'), 2);
  if(!confirm(`Definir o preço do item próprio ${it.codigo} no catálogo como R$ ${fmtQ(tN)} (não desonerado) / R$ ${fmtQ(tD)} (desonerado)?`)) return;
  try{
    const r = await apiFetch('/api/itens/propria', { method:'POST', body: JSON.stringify({ codigo:it.codigo, descricao:it.descricao, unidade:it.unidade, custoDesonerado:tD, custoNaoDesonerado:tN }) });
    COMP_ATUAL.item = r.item; await carregarComposicoes(); renderComposicoes(); toast('Preço do item próprio atualizado no catálogo.');
  }catch(e){ toast('Erro: ' + e.message, true); }
}
async function criarItemProprio(){
  const codigo = document.getElementById('ip_codigo').value.trim();
  const descricao = document.getElementById('ip_descricao').value.trim();
  const unidade = document.getElementById('ip_unidade').value.trim();
  const custo = num(document.getElementById('ip_custo').value);
  if(!codigo || !descricao || !unidade){ toast('Preencha código, descrição e unidade.', true); return; }
  try{
    const r = await apiFetch('/api/itens/propria', { method:'POST', body: JSON.stringify({ codigo, descricao, unidade, custo }) });
    ['ip_codigo','ip_descricao','ip_unidade','ip_custo'].forEach(id=>document.getElementById(id).value='');
    toast(`Item próprio ${codigo} salvo no catálogo (fonte "Própria").`);
    await compAbrir(r.item.id, r.item);
  }catch(e){ toast('Erro: ' + e.message, true); }
}
function renderComposicoes(){
  const lista = document.getElementById('compLista'); if(!lista) return;
  const f = normalizarTxt(COMP_FILTRO);
  const itensObra = new Set(CURRENT_OBRA ? CURRENT_OBRA.itens.map(i=>i.itemId) : []);
  const filtradas = COMP_LISTA.filter(c=>!f || normalizarTxt(((c.item&&c.item.codigo)||'') + ' ' + ((c.item&&c.item.descricao)||'') + ' ' + c.itemId).includes(f));
  const sel = compSelecao();
  lista.innerHTML = filtradas.length ? `<table><thead><tr><th style="width:28px;"><input type="checkbox" title="Marcar/desmarcar todas da lista" ${filtradas.length && filtradas.every(c=>sel.has(c.itemId))?'checked':''} onclick="event.stopPropagation(); compSelecionar(this.checked?'filtradas':'tirarFiltradas')"></th><th>Fonte</th><th>Código</th><th>Descrição</th><th class="num">Total (${compRegime()==='desonerado'?'des.':'não des.'})</th><th class="num">Base</th><th>Atualizada</th></tr></thead><tbody>` +
    filtradas.map(c=>{ const it = c.item || {}; const tot = compTotal(c.linhas); const base = it.codigo ? custoPorRegime(it, compRegime()) : 0;
      return `<tr style="cursor:pointer;${COMP_ATUAL&&COMP_ATUAL.itemId===c.itemId?'background:var(--paper-2);':''}" onclick="compAbrir(${jsA(c.itemId)})">
        <td onclick="event.stopPropagation()"><input type="checkbox" ${sel.has(c.itemId)?'checked':''} title="Incluir na impressão" onchange="compMarcar(${jsA(c.itemId)}, this.checked)"></td>
        <td><span class="fonte-chip fonte-${(it.fonte||'').replace(/[^A-Za-zÀ-ú]/g,'')}">${escH(it.fonte||'?')}</span>${itensObra.has(c.itemId)?' <span class="tag-obra" title="Está no orçamento da obra atual">obra</span>':''}</td>
        <td class="mono">${escH(it.codigo||c.itemId)}</td><td style="font-size:11.5px;">${escH((it.descricao||'(item não está mais no catálogo)').slice(0,90))}</td>
        <td class="num mono">${fmtMoney(tot)}</td><td class="num mono" style="color:var(--muted)">${fmtMoney(base)}</td>
        <td style="font-size:10.5px;color:var(--muted)">${escH(c.atualizadoPor||'')}<br>${c.atualizadoEm?new Date(c.atualizadoEm).toLocaleDateString('pt-BR'):''}</td></tr>`; }).join('') + '</tbody></table>'
    : `<div class="empty-state" style="padding:20px;">${COMP_LISTA.length ? 'Nenhuma composição com esse filtro.' : 'Nenhuma composição cadastrada ainda.'}</div>`;
  document.getElementById('compCount').textContent = `${COMP_LISTA.length}`;
  const nSel = COMP_LISTA.filter(c=>sel.has(c.itemId)).length;
  const info = document.getElementById('compSelInfo'); if(info) info.textContent = `${nSel} selecionada(s) de ${COMP_LISTA.length}`;
  const bt = document.getElementById('compBtnImprimirSel'); if(bt) bt.textContent = `🖨️ Imprimir selecionadas (${nSel})`;

  const card = document.getElementById('compEditorCard');
  if(!COMP_ATUAL){ card.style.display = 'none'; return; }
  card.style.display = '';
  const it = COMP_ATUAL.item || { codigo: COMP_ATUAL.itemId, descricao:'(item não encontrado no catálogo)', unidade:'', fonte:'' };
  const reg = compRegime();
  const total = compTotal(COMP_ATUAL.linhas, reg);
  const base = it.custoNaoDesonerado != null ? custoPorRegime(it, reg) : 0;
  const naObra = CURRENT_OBRA && CURRENT_OBRA.itens.some(i=>i.itemId===COMP_ATUAL.itemId);
  document.getElementById('compEditorTitulo').innerHTML = `${escH(it.fonte)} ${escH(it.codigo)} ${COMP_ATUAL.alterado?'<span class="tag" style="background:#FFF6DC;border-color:#C98A12;color:#8F6428">não salvo</span>':''}`;
  document.getElementById('compEditorCorpo').innerHTML = `
    <div style="font-size:13px;margin-bottom:6px;"><b>${escH(it.descricao)}</b> <span class="mono" style="color:var(--muted)">(${escH(it.unidade)})</span></div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:12px;">Preço na base (${reg==='desonerado'?'desonerado':'não desonerado'}): <b class="mono">${fmtMoney(base)}</b> · Total da composição: <b class="mono" style="color:var(--ink)">${fmtMoney(total)}</b>
      ${base>0 ? ` · diferença ${((total/base-1)*100).toLocaleString('pt-BR',{maximumFractionDigits:2})}%` : ''}</div>
    <div style="overflow-x:auto;"><table><thead><tr><th style="width:120px;">Tipo</th><th style="width:80px;">Código</th><th>Descrição</th><th style="width:50px;">Un.</th><th class="num" style="width:90px;">Coef.</th><th class="num" style="width:100px;">Preço unit.</th><th class="num" style="width:95px;">Total</th><th style="width:26px;"></th></tr></thead><tbody>
    ${COMP_ATUAL.linhas.map((l,i)=>`<tr>
      <td><select class="grupo-select-inline" onchange="compEditar(${i}, 'tipo', this.value)">${TIPOS_COMP.map(t=>`<option ${t===l.tipo?'selected':''}>${t}</option>`).join('')}</select></td>
      <td>${l.refId ? `<span class="mono" title="${escH(l.fonte)}">${escH(l.codigo)}</span>` : `<input class="qtd-input" style="width:72px;text-align:left" value="${escH(l.codigo)}" onchange="compEditar(${i}, 'codigo', this.value)">`}</td>
      <td>${l.refId ? `<span style="font-size:11.5px;">${escH(l.descricao)}</span>` : `<input style="width:100%;padding:4px;border:1px solid var(--line);border-radius:4px;font-size:12px;" value="${escH(l.descricao)}" onchange="compEditar(${i}, 'descricao', this.value)">`}</td>
      <td>${l.refId ? `<span class="mono">${escH(l.unidade)}</span>` : `<input class="qtd-input" style="width:46px;text-align:left" value="${escH(l.unidade)}" onchange="compEditar(${i}, 'unidade', this.value)">`}</td>
      <td class="num"><input type="number" step="0.0000001" class="qtd-input" style="width:84px" value="${l.coef}" onchange="compEditar(${i}, 'coef', this.value)"></td>
      <td class="num"><input type="number" step="0.01" min="0" class="custo-input ${l.refId?'':'manual'}" value="${arred(compPrecoLinha(l, reg),4)}" title="${l.refId?'Acompanha o catálogo — digitar um valor torna o preço fixo':'Preço fixo'}" onchange="compEditar(${i}, 'preco', this.value)"></td>
      <td class="num mono">${fmtMoney(num(l.coef)*compPrecoLinha(l, reg))}</td>
      <td><button class="rm-btn" onclick="compRemoverLinha(${i})">×</button></td></tr>`).join('')}
    <tr class="linha-subtotal"><td colspan="6">Custo unitário da composição</td><td class="num">${fmtMoney(total)}</td><td></td></tr>
    </tbody></table></div>
    <div class="linha-dupla" style="margin-top:12px;align-items:end;">
      <div class="campo" style="position:relative;"><label>Adicionar insumo / composição do catálogo</label>
        <input type="text" id="compBuscaInsumo" placeholder="Código ou descrição (mín. 3 letras)…" oninput="clearTimeout(window._tci);window._tci=setTimeout(()=>compBuscarItem('compBuscaInsumo','compSugInsumo'),200)" onblur="compEsconder('compSugInsumo')">
        <div class="sug-box" id="compSugInsumo"></div></div>
      <div class="campo"><label>Coeficiente da nova linha</label><input type="number" id="compCoefNovo" step="0.0001" value="1"></div>
    </div>
    <div class="campo"><label>Observação</label><input type="text" value="${escH(COMP_ATUAL.observacao||'')}" onchange="COMP_ATUAL.observacao=this.value;COMP_ATUAL.alterado=true;"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn ghost fino" onclick="compLinhaManual()">+ Linha com preço fixo</button>
      <button class="btn ghost fino" onclick="compAtualizarPrecosCatalogo()">↻ Atualizar preços pela base</button>
      <button class="btn amber fino" onclick="compSalvar()">💾 Salvar composição</button>
      ${naObra ? `<button class="btn fino" onclick="compAplicarNaObra()">Usar total no orçamento desta obra</button>` : ''}
      ${it.fonte==='Própria' ? `<button class="btn fino" onclick="compAplicarNoCatalogo()">Gravar total como preço do item próprio</button>` : ''}
      <button class="btn ghost fino" onclick="imprimirComposicaoUnica()">🖨️ Imprimir</button>
      <button class="btn danger fino" onclick="compExcluir()">Excluir</button>
    </div>`;
}
function normalizarTxt(s){ return String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase(); }

/* ---------- Impressão de composições ---------- */
function compBlocoImpressao(numero, item, linhas, regime){
  const total = compTotal(linhas, regime);
  return `<table style="margin-bottom:14px;">
    <thead><tr><th style="width:52px;">Item</th><th style="width:70px;">Código</th><th>Descrição</th><th style="width:90px;">Tipo</th><th style="width:36px;">Un.</th><th style="width:70px;">Coef.</th><th style="width:80px;">Preço unit.</th><th style="width:80px;">Total</th></tr></thead>
    <tbody><tr class="linha-grupo"><td>${escH(numero)}</td><td>${escH(item.codigo)}</td><td colspan="3">${escH(item.descricao)}</td><td>${escH(item.unidade)}</td><td></td><td class="num">${fmtMoney(total)}</td></tr>
    ${linhas.map(l=>`<tr><td></td><td>${escH(l.codigo)}</td><td>${escH(l.descricao)}</td><td>${escH(l.tipo)}</td><td>${escH(l.unidade)}</td><td class="num">${(num(l.coef)).toLocaleString('pt-BR',{maximumFractionDigits:7})}</td><td class="num">${fmtMoney(compPrecoLinha(l, regime))}</td><td class="num">${fmtMoney(num(l.coef)*compPrecoLinha(l, regime))}</td></tr>`).join('')}
    </tbody></table>`;
}
function imprimirComposicaoUnica(){
  if(!COMP_ATUAL) return;
  const it = COMP_ATUAL.item || { codigo:COMP_ATUAL.itemId, descricao:'', unidade:'' };
  dispararImpressao(`<div class="doc-impressao">${cabecalhoImpressao()}<div class="faixa-titulo">Composição de Custo Unitário</div>${infoObraImpressao()}
    ${compBlocoImpressao('—', it, COMP_ATUAL.linhas, compRegime())}
    <div class="observacoes">Preços ${compRegime()==='desonerado'?'com':'sem'} desoneração. Linhas com código de catálogo acompanham a base de referência carregada no sistema.${COMP_ATUAL.observacao?'<br>'+escH(COMP_ATUAL.observacao):''}</div>
    <div class="assinatura"><div class="linha"></div>${escH(CURRENT_OBRA.responsavel||'')}<br>${escH(CURRENT_OBRA.crea||'')}</div></div>`);
}
/* ---------- Seleção de composições para imprimir num único documento ----------
   A seleção fica guardada na obra (extras.compImprimir). Se a obra nunca teve seleção,
   vêm marcadas as composições dos itens que estão no orçamento. */
function compSelecao(){
  const o = CURRENT_OBRA; if(!o) return new Set();
  o.extras = o.extras || {};
  if(!Array.isArray(o.extras.compImprimir)){
    const naObra = new Set(o.itens.map(i=>i.itemId));
    return new Set(COMP_LISTA.filter(c=>naObra.has(c.itemId)).map(c=>c.itemId));
  }
  return new Set(o.extras.compImprimir);
}
let _compSelTimer = null;
function compGuardarSelecao(set){
  CURRENT_OBRA.extras.compImprimir = Array.from(set);
  renderComposicoes();
  clearTimeout(_compSelTimer); _compSelTimer = setTimeout(()=>salvarObraAtual(true), 800);
}
function compMarcar(itemId, marcado){ const s = compSelecao(); if(marcado) s.add(itemId); else s.delete(itemId); compGuardarSelecao(s); }
function compSelecionar(modo){
  const s = compSelecao();
  const f = normalizarTxt(COMP_FILTRO);
  const filtradas = COMP_LISTA.filter(c=>!f || normalizarTxt(((c.item&&c.item.codigo)||'') + ' ' + ((c.item&&c.item.descricao)||'') + ' ' + c.itemId).includes(f));
  if(modo === 'nenhuma') s.clear();
  else if(modo === 'filtradas') filtradas.forEach(c=>s.add(c.itemId));
  else if(modo === 'tirarFiltradas') filtradas.forEach(c=>s.delete(c.itemId));
  else if(modo === 'orcamento'){ s.clear(); const naObra = new Set(CURRENT_OBRA.itens.map(i=>i.itemId)); COMP_LISTA.forEach(c=>{ if(naObra.has(c.itemId)) s.add(c.itemId); }); }
  compGuardarSelecao(s);
}
// Imprime todas as composições selecionadas num único documento: índice + uma composição após a outra.
// Itens do orçamento saem na ordem e numeração do orçamento; as demais vêm depois, por código.
async function imprimirComposicoesSelecionadas(){
  const o = CURRENT_OBRA; if(!o) return;
  if(COMP_ATUAL && COMP_ATUAL.alterado && !confirm('A composição aberta tem alterações não salvas — a impressão usa a versão salva. Continuar?')) return;
  await carregarComposicoes();
  const sel = compSelecao(); const mapa = compMapaPorItem();
  const lista = []; const usados = new Set();
  gruposComItens().filter(g=>g.itens.length).forEach((g,gi)=>g.itens.forEach((it,li)=>{
    const c = mapa[it.itemId];
    if(c && sel.has(it.itemId) && c.linhas && c.linhas.length && !usados.has(it.itemId)){
      usados.add(it.itemId);
      lista.push({ numero:`${gi+1}.${li+1}`, item:{ codigo:it.codigo, descricao:it.descricao, unidade:it.unidade, fonte:it.fonte }, c });
    }
  }));
  COMP_LISTA.filter(c=>sel.has(c.itemId) && !usados.has(c.itemId) && c.linhas && c.linhas.length)
    .sort((a,b)=>String((a.item&&a.item.codigo)||a.itemId).localeCompare(String((b.item&&b.item.codigo)||b.itemId), 'pt-BR', {numeric:true}))
    .forEach(c=>{ const it = c.item || { codigo:c.itemId, descricao:'', unidade:'' }; lista.push({ numero:'—', item:it, c }); });
  if(!lista.length){ toast('Nenhuma composição selecionada (marque na lista da aba Composições).', true); return; }
  const reg = o.regime;
  const indice = `<table style="margin-bottom:16px;"><thead><tr><th style="width:52px;">Item</th><th style="width:80px;">Código</th><th>Descrição</th><th style="width:40px;">Un.</th><th style="width:100px;">Custo unit. (s/ BDI)</th></tr></thead><tbody>
    ${lista.map(x=>`<tr><td>${escH(x.numero)}</td><td>${escH(x.item.codigo)}</td><td>${escH(x.item.descricao)}</td><td>${escH(x.item.unidade)}</td><td class="num">${fmtMoney(compTotal(x.c.linhas, reg))}</td></tr>`).join('')}
    </tbody></table>`;
  const blocos = lista.map(x=>`<div style="page-break-inside:avoid;break-inside:avoid;">${compBlocoImpressao(x.numero, x.item, x.c.linhas, reg)}${x.c.observacao?`<div style="font-size:10px;margin:-10px 0 14px;color:#555;">Obs.: ${escH(x.c.observacao)}</div>`:''}</div>`);
  dispararImpressao(`<div class="doc-impressao">${cabecalhoImpressao()}<div class="faixa-titulo">Composições de Custo Unitário</div>${infoObraImpressao()}
    <div style="font-weight:700;font-size:11px;text-transform:uppercase;margin:6px 0 4px;">Índice das composições (${lista.length})</div>
    ${indice}
    ${blocos.join('')}
    <div class="observacoes">${lista.length} composição(ões) analítica(s). Custos unitários sem BDI, preços ${reg==='desonerado'?'com':'sem'} desoneração. Linhas com código de catálogo acompanham a base de referência carregada no sistema.${lista.some(x=>x.numero==='—')?' Composições marcadas com "—" não estão no orçamento desta obra.':''}</div>
    <div class="assinatura"><div class="linha"></div>${escH(o.responsavel||'')}<br>${escH(o.crea||'')}</div></div>`);
}
async function imprimirComposicoesOrcamento(){
  const o = CURRENT_OBRA; if(!o || !o.itens.length){ toast('Orçamento vazio.', true); return; }
  await carregarComposicoes();
  const mapa = compMapaPorItem();
  const blocos = [];
  gruposComItens().filter(g=>g.itens.length).forEach((g,gi)=>g.itens.forEach((it,li)=>{
    const c = mapa[it.itemId];
    if(c && c.linhas && c.linhas.length) blocos.push(compBlocoImpressao(`${gi+1}.${li+1}`, it, c.linhas, o.regime));
  }));
  if(!blocos.length){ toast('Nenhum item deste orçamento tem composição analítica cadastrada.', true); return; }
  dispararImpressao(`<div class="doc-impressao">${cabecalhoImpressao()}<div class="faixa-titulo">Composições de Custo Unitário</div>${infoObraImpressao()}
    ${blocos.join('')}
    <div class="observacoes">${blocos.length} composição(ões) analítica(s) de itens deste orçamento. Preços ${o.regime==='desonerado'?'com':'sem'} desoneração.</div>
    <div class="assinatura"><div class="linha"></div>${escH(o.responsavel||'')}<br>${escH(o.crea||'')}</div></div>`);
}

/* ---------- Importação de composições por planilha ---------- */
let CI = null; // { wb, aba, dados, analisado }
function ciColOpts(n, sel){ let h = '<option value="">—</option>'; for(let i=0;i<n;i++){ const L = XLSX.utils.encode_col(i); h += `<option value="${i}" ${String(sel)===String(i)?'selected':''}>${L}</option>`; } return h; }
function ciLerArquivo(input){
  const file = input.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = e=>{
    try{
      const wb = XLSX.read(new Uint8Array(e.target.result), {type:'array'});
      CI = { wb, aba: wb.SheetNames[0] };
      ciProcessarAba(true);
    }catch(err){ toast('Não foi possível ler a planilha: ' + err.message, true); }
  };
  reader.readAsArrayBuffer(file);
  input.value = '';
}
function ciProcessarAba(auto){
  if(!CI) return;
  const sh = CI.wb.Sheets[CI.aba];
  CI.dados = XLSX.utils.sheet_to_json(sh, { header:1, raw:true, defval:'' });
  const nCols = CI.dados.reduce((m,r)=>Math.max(m, r.length), 0);
  if(auto){
    // detecta cabeçalho e colunas por palavras-chave
    let hdr = -1;
    for(let i=0;i<Math.min(30, CI.dados.length);i++){ const t = normalizarTxt(CI.dados[i].join(' ')); if(t.includes('coef') && (t.includes('codigo') || t.includes('cod'))){ hdr = i; break; } }
    CI.map = { hdr, comp:'', insumo:'', tipo:'', desc:'', un:'', coef:'', preco:'', ini: hdr+2 };
    if(hdr >= 0){
      const cab = CI.dados[hdr].map(normalizarTxt);
      cab.forEach((c,i)=>{
        if(c.includes('coef')) CI.map.coef = i;
        else if(c.includes('composic') && c.includes('cod')) CI.map.comp = i;
        else if((c.includes('insumo') || c.includes('item')) && c.includes('cod')) CI.map.insumo = i;
        else if(c.includes('tipo')) CI.map.tipo = i;
        else if(c.includes('descri')) { if(CI.map.desc==='') CI.map.desc = i; }
        else if(c.startsWith('un')) CI.map.un = i;
        else if(c.includes('preco') || c.includes('custo') || c.includes('valor')) { if(CI.map.preco==='') CI.map.preco = i; }
      });
    }
  }
  const m = CI.map;
  document.getElementById('ciForm').style.display = '';
  document.getElementById('ciForm').innerHTML = `
    <div class="linha-tripla">
      <div class="campo"><label>Aba</label><select onchange="CI.aba=this.value;ciProcessarAba(true)">${CI.wb.SheetNames.map(n=>`<option ${n===CI.aba?'selected':''}>${escH(n)}</option>`).join('')}</select></div>
      <div class="campo"><label>Linha inicial dos dados</label><input type="number" min="1" value="${m.ini}" onchange="CI.map.ini=parseInt(this.value)||1"></div>
      <div class="campo"><label>Linhas na aba</label><input disabled value="${CI.dados.length}"></div>
    </div>
    <div class="linha-tripla">
      ${[['comp','Código da composição'],['insumo','Código do insumo/item'],['coef','Coeficiente'],['desc','Descrição do insumo (opcional)'],['un','Unidade (opcional)'],['tipo','Tipo (opcional)'],['preco','Preço unitário (opcional — vazio usa a base)']]
        .map(([k,l])=>`<div class="campo"><label>${l}</label><select onchange="CI.map['${k}']=this.value">${ciColOpts(nCols, m[k])}</select></div>`).join('')}
    </div>
    <p class="obs">Uma linha por insumo. Se o código da composição aparece só na primeira linha do bloco, as linhas seguintes herdam o último código lido.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="btn fino" onclick="ciAnalisar()">Analisar planilha</button><button class="btn ghost fino" onclick="CI=null;document.getElementById('ciForm').style.display='none';document.getElementById('ciResultado').innerHTML=''">Cancelar</button></div>`;
}
async function ciAnalisar(){
  const m = CI.map; if(m.comp==='' || m.insumo==='' || m.coef===''){ toast('Indique as colunas de código da composição, código do insumo e coeficiente.', true); return; }
  const blocos = {}; let compAtual = null, linhasLidas = 0;
  for(let i=Math.max(0,(m.ini||1)-1); i<CI.dados.length; i++){
    const r = CI.dados[i];
    const cc = String(r[m.comp]==null?'':r[m.comp]).trim(); if(cc) compAtual = cc;
    const ic = String(r[m.insumo]==null?'':r[m.insumo]).trim();
    if(!compAtual || !ic) continue;
    const coef = num(r[m.coef]); if(!coef) continue;
    (blocos[compAtual] = blocos[compAtual] || []).push({ codigo: ic, coef,
      descricao: m.desc!=='' ? String(r[m.desc]||'').trim() : '', unidade: m.un!=='' ? String(r[m.un]||'').trim() : '',
      tipo: m.tipo!=='' ? String(r[m.tipo]||'').trim() : '', preco: m.preco!=='' && r[m.preco]!=='' ? num(r[m.preco]) : null });
    linhasLidas++;
  }
  const codComp = Object.keys(blocos);
  if(!codComp.length){ toast('Nenhuma linha válida encontrada com esse mapeamento.', true); return; }
  const semZeros = c=>String(c).replace(/^0+(?=\d)/,'');   // SINAPI-I na base não tem zeros à esquerda (00004750 → 4750)
  const codIns = Array.from(new Set(codComp.flatMap(c=>blocos[c].flatMap(l=>[l.codigo, semZeros(l.codigo)]))));
  try{
    const [rc, ri] = await Promise.all([
      apiFetch('/api/itens/por-codigos', { method:'POST', body: JSON.stringify({ codigos: Array.from(new Set(codComp.flatMap(c=>[c, semZeros(c)]))), fontes:['Própria','Composição','SINAPI','SICRO','Cotação'] }) }),
      apiFetch('/api/itens/por-codigos', { method:'POST', body: JSON.stringify({ codigos: codIns, fontes:['SINAPI-I','SINAPI','SICRO','Própria','Composição','Cotação'] }) })
    ]);
    const mc = {}, mi = {}; rc.itens.forEach(x=>mc[x.codigo]=x); ri.itens.forEach(x=>mi[x.codigo]=x);
    const comps = [], semItem = [];
    codComp.forEach(cc=>{
      const dono = mc[cc] || mc[semZeros(cc)]; if(!dono){ semItem.push(cc); return; }
      comps.push({ itemId: dono.id, linhas: blocos[cc].map(l=>{
        const ref = mi[l.codigo] || mi[semZeros(l.codigo)];
        const tipo = TIPOS_COMP.find(t=>normalizarTxt(t)===normalizarTxt(l.tipo)) || (ref && ref.fonte==='SINAPI-I' ? 'Material' : (ref ? 'Composição auxiliar' : 'Material'));
        if(l.preco != null) return { tipo, refId:null, fonte: ref?ref.fonte:'', codigo:l.codigo, descricao: l.descricao || (ref?ref.descricao:''), unidade: l.unidade || (ref?ref.unidade:''), coef:l.coef, precoD:l.preco, precoND:l.preco };
        return { tipo, refId: ref?ref.id:null, fonte: ref?ref.fonte:'', codigo: ref?ref.codigo:l.codigo, descricao: ref?ref.descricao:(l.descricao||'(insumo não encontrado na base)'), unidade: ref?ref.unidade:l.unidade, coef:l.coef, precoD: ref?ref.custoDesonerado:0, precoND: ref?ref.custoNaoDesonerado:0 };
      }) });
    });
    CI.analisado = comps;
    const insumosSemRef = Array.from(new Set(codComp.flatMap(c=>blocos[c].map(l=>l.codigo)))).filter(c=>!mi[c] && !mi[semZeros(c)]);
    document.getElementById('ciResultado').innerHTML = `<div class="pav-ok">${linhasLidas} linhas lidas · <b>${comps.length}</b> composição(ões) prontas para importar.</div>
      ${semItem.length ? `<div class="pav-alerta">${semItem.length} código(s) de composição não existem no catálogo e serão ignorados: ${escH(semItem.slice(0,30).join(', '))}${semItem.length>30?'…':''}. Cadastre-os antes como item próprio (card abaixo) se forem composições da equipe.</div>`:''}
      ${insumosSemRef.length ? `<div class="pav-alerta">${insumosSemRef.length} insumo(s) não encontrados na base — entram com preço 0 (ou o preço da planilha, se informado): ${escH(insumosSemRef.slice(0,30).join(', '))}${insumosSemRef.length>30?'…':''}</div>`:''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
        <button class="btn amber fino" onclick="ciAplicar('manter')">Importar (não sobrescrever as existentes)</button>
        <button class="btn fino" onclick="ciAplicar('substituir')">Importar e substituir as existentes</button></div>`;
  }catch(e){ toast('Erro ao analisar: ' + e.message, true); }
}
async function ciAplicar(modo){
  if(!CI || !CI.analisado || !CI.analisado.length) return;
  try{
    const r = await apiFetch('/api/composicoes/lote', { method:'POST', body: JSON.stringify({ composicoes: CI.analisado, modo }) });
    toast(`Composições importadas: ${r.gravadas} gravada(s)${r.mantidas?`, ${r.mantidas} já existente(s) mantida(s)`:''}.`);
    CI = null; document.getElementById('ciForm').style.display='none'; document.getElementById('ciResultado').innerHTML='';
    await carregarComposicoes(); renderComposicoes();
  }catch(e){ toast('Erro: ' + e.message, true); }
}

/* =====================================================================
   3. EDITAR ITEM SÓ NESTA OBRA (código / descrição / unidade)
   ===================================================================== */
let _editIdx = null;
function abrirEdicaoItem(idx){
  const it = CURRENT_OBRA.itens[idx]; if(!it) return;
  _editIdx = idx;
  const orig = it.orig || { codigo:it.codigo, descricao:it.descricao, unidade:it.unidade };
  document.getElementById('modalCorpo').innerHTML = `
    <h3 style="margin:0 0 4px;font-family:var(--disp);text-transform:uppercase;">Adaptar item nesta obra</h3>
    <p class="obs" style="margin:0 0 12px;">Muda só neste orçamento — o catálogo da equipe não é alterado.</p>
    <div class="linha-dupla"><div class="campo"><label>Código</label><input id="ed_codigo" value="${escH(it.codigo)}"></div>
      <div class="campo"><label>Unidade</label><input id="ed_unidade" value="${escH(it.unidade)}"></div></div>
    <div class="campo"><label>Descrição</label><textarea id="ed_descricao" rows="4">${escH(it.descricao)}</textarea></div>
    ${it.orig ? `<p class="obs">Original do catálogo: <b>${escH(orig.codigo)}</b> — ${escH(orig.descricao)} (${escH(orig.unidade)})</p>` : ''}
    <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:10px;">
      ${it.orig ? '<button class="btn ghost fino" onclick="restaurarEdicaoItem()">↺ Voltar ao original</button>' : ''}
      <button class="btn ghost fino" onclick="fecharModal()">Cancelar</button>
      <button class="btn amber fino" onclick="salvarEdicaoItem()">Salvar</button></div>`;
  abrirModal();
}
async function salvarEdicaoItem(){
  const it = CURRENT_OBRA.itens[_editIdx]; if(!it) return;
  const novo = { codigo: document.getElementById('ed_codigo').value.trim() || it.codigo, descricao: document.getElementById('ed_descricao').value.trim() || it.descricao, unidade: document.getElementById('ed_unidade').value.trim() || it.unidade };
  if(!it.orig) it.orig = { codigo:it.codigo, descricao:it.descricao, unidade:it.unidade };
  Object.assign(it, novo);
  if(it.orig.codigo===it.codigo && it.orig.descricao===it.descricao && it.orig.unidade===it.unidade) delete it.orig;
  fecharModal(); renderOrcamento(); await salvarObraAtual(true);
}
async function restaurarEdicaoItem(){
  const it = CURRENT_OBRA.itens[_editIdx]; if(!it || !it.orig) return;
  Object.assign(it, it.orig); delete it.orig;
  fecharModal(); renderOrcamento(); await salvarObraAtual(true);
}
function abrirModal(){ document.getElementById('modalFundo').style.display = 'flex'; }
function fecharModal(){ document.getElementById('modalFundo').style.display = 'none'; }

/* =====================================================================
   4. ART — assistente de preenchimento
   ===================================================================== */
function artDados(){ const o = CURRENT_OBRA; o.extras = o.extras || {}; o.extras.art = o.extras.art || { profissao:'Engenheiro Civil', cnpjContratante:'', cep:'', observacoes:'' }; return o.extras.art; }
async function artAtualizar(campo, valor){ artDados()[campo] = valor; await salvarObraAtual(true); renderArt(); }
function artCopiar(txt){ navigator.clipboard && navigator.clipboard.writeText(txt).then(()=>toast('Copiado.')).catch(()=>{}); }
function renderArt(){
  const cont = document.getElementById('corpoArt'); if(!cont || !CURRENT_OBRA) return;
  const o = CURRENT_OBRA; const a = artDados();
  const p = o.extras.pav;
  const total = o.itens.reduce((s,i)=>s+i.custoTotal,0);
  const direto = o.itens.reduce((s,i)=>s+i.custoUnitario*i.quantidade,0);
  const atividades = new Set();
  if(p && p.segmentos.length){
    p.segmentos.forEach(seg=>{
      const pv = PAV.pavimento[seg.pavimentoOpcao]; if(pv && pv.codigo) atividades.add('Execução de pavimentação — ' + pv.label);
      if(seg.temDrenagem) atividades.add(`Execução de rede de drenagem pluvial DN ${seg.drenagemDN}`);
      const ca = PAV.calcada[seg.calcadaOpcao]; if(ca && ca.codigo) atividades.add('Execução de calçada — ' + ca.label);
      if(seg.meioFioOpcao && PAV.meioFio[seg.meioFioOpcao] && PAV.meioFio[seg.meioFioOpcao].codigo) atividades.add('Execução de meio-fio');
      if(seg.sinalizacaoHorizontal) atividades.add('Sinalização viária horizontal');
    });
  }
  o.grupos.forEach(g=>{ if(o.itens.some(i=>i.grupo===g)) atividades.add('Orçamento: ' + g); });
  const ext = p ? p.segmentos.reduce((s,x)=>s+pavComprimento(x),0) : 0;
  const area = p ? p.segmentos.reduce((s,x)=>s+pavComprimento(x)*num(x.largura),0) : 0;
  const lin = (rot, val)=>`<tr><td style="width:230px;color:var(--muted);">${rot}</td><td>${escH(val||'—')}</td><td style="width:34px;">${val?`<button class="rst-btn" title="Copiar" onclick="artCopiar(${jsA(String(val))})">⧉</button>`:''}</td></tr>`;
  cont.innerHTML = `
    <p class="obs" style="margin-top:0;">Esta tela <b>não gera a ART</b> — o registro continua sendo feito no sistema do CREA-SC. Ela reúne os dados da obra para copiar e colar.</p>
    <h4 class="art-h">Responsável técnico</h4><table><tbody>
      ${lin('Nome', o.responsavel)}${lin('Registro (CREA)', o.crea)}
      <tr><td style="color:var(--muted);">Profissão / título</td><td><input class="art-inp" value="${escH(a.profissao||'')}" onchange="artAtualizar('profissao', this.value)"></td><td></td></tr></tbody></table>
    <h4 class="art-h">Contratante e obra</h4><table><tbody>
      ${lin('Contratante (órgão)', o.orgao)}${lin('Município', o.municipio)}
      <tr><td style="color:var(--muted);">CNPJ do contratante</td><td><input class="art-inp" value="${escH(a.cnpjContratante||'')}" onchange="artAtualizar('cnpjContratante', this.value)"></td><td></td></tr>
      ${lin('Obra / logradouro', o.nome)}
      <tr><td style="color:var(--muted);">CEP da obra</td><td><input class="art-inp" value="${escH(a.cep||'')}" onchange="artAtualizar('cep', this.value)"></td><td></td></tr>
      ${lin('Nº do processo', o.processo)}${lin('Convênio / fonte de recurso', convenioTexto())}</tbody></table>
    <h4 class="art-h">Quantitativos e valor</h4><table><tbody>
      ${p && p.segmentos.length ? lin('Extensão total da via', fmtQ(ext)+' m') + lin('Área de pavimentação', fmtQ(area)+' m²') + lin('Nº de trechos', String(p.segmentos.length)) : ''}
      ${lin('Valor sem BDI', fmtMoney(direto))}${lin('BDI', bdiResumoTexto(o))}${lin('Valor da obra (com BDI)', fmtMoney(total))}</tbody></table>
    <h4 class="art-h">Atividades técnicas</h4>
    ${atividades.size ? '<ul style="margin:4px 0 10px;font-size:12.5px;">' + Array.from(atividades).map(x=>`<li>${escH(x)}</li>`).join('') + '</ul>' : '<p class="obs">Cadastre itens/trechos para gerar a lista.</p>'}
    <h4 class="art-h">Observação sugerida</h4>
    <div style="background:var(--paper);border:1px solid var(--line);border-radius:6px;padding:10px;font-size:12.5px;">${escH(artObsSugerida(total))}
      <button class="rst-btn" title="Copiar" onclick="artCopiar(${jsA(artObsSugerida(total))})">⧉</button></div>`;
}
function artObsSugerida(total){
  const o = CURRENT_OBRA;
  return `ART referente à elaboração do orçamento e projeto da obra "${o.nome||''}", ${o.municipio||''}${o.processo?', processo nº '+o.processo:''}, com valor estimado de ${fmtMoney(total)} (BDI ${bdiResumoTexto(o)}), base de referência SINAPI ${o.regime==='desonerado'?'com':'sem'} desoneração${o.dataBase?' — data-base '+new Date(o.dataBase+'T12:00:00').toLocaleDateString('pt-BR',{month:'2-digit',year:'numeric'}):''}.`;
}
function convenioTexto(){
  const e = (CURRENT_OBRA && CURRENT_OBRA.extras) || {};
  if(!e.convenio) return '';
  return e.convenio === 'Outro' ? (e.convenioOutro || 'Outro') : e.convenio + (e.convenioOutro ? ' — ' + e.convenioOutro : '');
}

/* =====================================================================
   5. MIGRAÇÃO DE FORMATO + IMPORTADOR DE OBRAS (EngPav / EngOrc)
   ===================================================================== */
// Atualiza uma obra (de qualquer versão anterior) para o formato atual. Idempotente.
function pavNormalizarSegmento(seg, pav){
  const pad = pavNovoSegmento({ segmentos:[], proximoId:1 });
  delete pad.id; delete pad.nome;
  Object.keys(pad).forEach(k=>{ if(seg[k] === undefined) seg[k] = pad[k]; });
  if(!seg.id) seg.id = pav.proximoId++;
  return seg;
}
function migrarObra(o){
  o.extras = (o.extras && typeof o.extras === 'object' && !Array.isArray(o.extras)) ? o.extras : {};
  o.bdi = o.bdi || { ac:null, sg:null, r:null, df:null, l:null, iss:2, pis:0.65, cofins:3, final:0 };
  if(o.bdi.cprb == null) o.bdi.cprb = 0;
  if(o.bdi.descontoPercent == null) o.bdi.descontoPercent = 0;
  o.grupos = Array.isArray(o.grupos) ? o.grupos : [];
  o.itens = Array.isArray(o.itens) ? o.itens : [];
  o.cronograma = o.cronograma || { meses:6, porGrupo:{} };
  o.cronograma.porGrupo = o.cronograma.porGrupo || {};
  o.itens.forEach(it=>{
    it.quantidade = num(it.quantidade);
    if(it.custoOriginal == null){
      it.custoOriginal = it.manual ? num(it.custoUnitario)
        : custoPorRegime({ custoDesonerado: it.custoDesoneradoBase||0, custoNaoDesonerado: it.custoNaoDesoneradoBase||0 }, o.regime);
    }
    if(!it.grupo){ it.grupo = o.grupos[0] || 'Geral'; if(!o.grupos.includes(it.grupo)) o.grupos.push(it.grupo); }
  });
  if(o.extras.pav){
    const p = pavGarantir(o);
    p.segmentos.forEach(s=>pavNormalizarSegmento(s, p));
  }
  fluxoGarantir(o);   // toda obra tem acompanhamento (fases/checklists)
  bdiGarantir(o);     // BDI no modelo CAIXA (até 3 BDIs, por grupo de serviço)
  o.extras.versao = VERSAO_FORMATO_OBRA;
  return o;
}
// Executa uma função com outra obra no lugar de CURRENT_OBRA (recalcItem e o motor leem CURRENT_OBRA).
function comObra(o, fn){ const ant = CURRENT_OBRA; CURRENT_OBRA = o; try{ return fn(); } finally{ CURRENT_OBRA = ant; } }

const ENGPAV_GRUPOS = { iniciais:'Serviços Iniciais', pavimentacao:'Pavimentação', drenagem:'Drenagem', sinalizacao:'Sinalização' };
const ENGPAV_PAV_MAP = { cbuq_rolamento:'cbuq', cbuq_binder:'cbuq_binder_so', paver_retangular_6:'paver_ret_6', paver_retangular_8:'paver_ret_8',
  sextavado_6:'sext_6', sextavado_8:'sext_8', sextavado_10:'sext_10', nenhum:'nenhum' };
// Motor ANTIGO do EngPav (só para mostrar no relatório o total que a obra tinha antes da importação).
const ENGPAV_OLD = {
  pavimento:{ cbuq_rolamento:['95995','v',5], cbuq_binder:['95996','v',4], paver_retangular_6:['92397','a'], paver_retangular_8:['92398','a'],
    sextavado_6:['92393','a'], sextavado_8:['92394','a'], sextavado_10:['92395','a'], concreto_simples:['94990','v',15] },
  base:{ bgs_10:['105727',10], bgs_15:['96396',15], bgs_20:['105730',20], rachao_30:['105742',30], rachao_40:['96399',40], rachao_50:['105745',50], rachao_60:['105747',60] },
  meioFio:{ moldado_extrusora:'94263', premoldado:'94275' }, boca:{ simples:'97935', dupla:'97936' }, calcada:{ concreto_6_armado:'94992', concreto_8_armado:'94994' }
};
function engpavTotalOriginal(estado, preco){
  const ob = estado.obra || {}; const ag = {};
  const push = (g,c,q)=>{ if(c && q>0){ const k = g+'|'+c; ag[k] = (ag[k]||0) + q; } };
  (estado.segmentos||[]).forEach(s=>{
    const comp = (ob.modoReverso && s.ajustavel && s._comprimentoCalculado!==undefined) ? num(s._comprimentoCalculado) : num(s.comprimento);
    const area = comp*num(s.largura);
    const pv = ENGPAV_OLD.pavimento[s.pavimentoOpcao];
    if(pv) push('pavimentacao', pv[0], pv[1]==='a' ? area : area*(num(s.pavimentoEspessura)||pv[2])/100);
    [s.baseOpcao, s.subBaseOpcao].forEach(b=>{ const x = ENGPAV_OLD.base[b]; if(x) push('pavimentacao', x[0], area*x[1]/100); });
    if(ENGPAV_OLD.meioFio[s.meioFioOpcao]) push('pavimentacao', ENGPAV_OLD.meioFio[s.meioFioOpcao], comp*num(s.meioFioLados));
    if(s.temDrenagem){
      push('drenagem', PAV.drenagem[String(s.drenagemDN)], num(s.drenagemExtensao) || comp);
      if(ENGPAV_OLD.boca[s.bocaOpcao]) push('drenagem', ENGPAV_OLD.boca[s.bocaOpcao], Math.ceil(comp/(num(s.bocaEspacamento)||60))*(num(s.bocaLados)||1));
    }
    if(ENGPAV_OLD.calcada[s.calcadaOpcao]) push('pavimentacao', ENGPAV_OLD.calcada[s.calcadaOpcao], area);
    if(s.sinalizacaoHorizontal) push('sinalizacao', '102512', comp);
  });
  const qm = estado.quantidadesManuais || {};
  Object.keys(ag).forEach(k=>{ if(qm.hasOwnProperty(k)) ag[k] = num(qm[k]); });
  let total = 0;
  Object.keys(ag).forEach(k=>{ total += ag[k] * preco(k.split('|')[1]); });
  (estado.linhasExtras||[]).forEach(l=>{ if(l.codigo) total += num(l.quantidade) * preco(l.codigo); });
  return total;
}
function engpavBdi(bc){
  const v = (id, pad)=>{ const x = bc && bc[id]; return x===undefined || x==='' ? pad : num(x); };
  return { AC:v('bdiAC',4), SG:v('bdiSG',0.8), R:v('bdiR',1.27), DF:v('bdiDF',1.23), L:v('bdiL',7.4), CP:v('bdiCP',4.5), ISS:v('bdiISS',3), CPRB:v('bdiCPRB',0) };
}
function extrairCatalogoEngPav(texto){
  const marca = 'const CATALOGO_SINAPI_BASE = ';
  const i = texto.indexOf(marca); if(i < 0) return {};
  const fim = texto.indexOf('\n', i);
  let json = texto.slice(i + marca.length, fim).trim();
  if(json.endsWith(';')) json = json.slice(0, -1);
  try{
    const cat = JSON.parse(json); const m = {};
    Object.values(cat).forEach(lista=>lista.forEach(it=>{ m[String(it.codigo)] = it; }));
    return m;
  }catch(e){ return {}; }
}

let IMPORT_PENDENTE = null;
async function lerArquivoImportacao(input){
  const files = Array.from(input.files || []); input.value = '';
  if(!files.length) return;
  try{
    const lidos = [];
    for(const f of files) lidos.push(detectarArquivo(await f.text(), f.name));
    if(lidos.length === 1){ IMPORT_PENDENTE = lidos[0]; }
    else if(lidos.every(x=>x.tipo === 'engfluxo')){ IMPORT_PENDENTE = { tipo:'engfluxo', nome:`${files.length} arquivos`, fluxos: lidos.flatMap(x=>x.fluxos) }; }
    else if(lidos.every(x=>x.tipo === 'engorc')){ IMPORT_PENDENTE = { tipo:'engorc', nome:`${files.length} arquivos`, obras: lidos.flatMap(x=>x.obras) }; }
    else throw new Error('Para importar vários arquivos de uma vez, selecione arquivos do mesmo sistema (ex.: todos os .json da pasta /dados do EngFluxo). Obras do EngPav: um arquivo por vez.');
    mostrarPreImportacao();
  }catch(e){ toast(e.message, true); }
}
function detectarArquivo(texto, nome){
  let dados = null, html = false;
  const t = texto.trim();
  if(t.startsWith('{') || t.startsWith('[')){
    dados = JSON.parse(t);
    if(ehObraEngFluxo(dados)) return { tipo:'engfluxo', nome, fluxos:[dados] };
    if(Array.isArray(dados) && dados.length && dados.every(ehObraEngFluxo)) return { tipo:'engfluxo', nome, fluxos:dados };
  }
  else{
    html = true;
    const doc = new DOMParser().parseFromString(texto, 'text/html');
    const tag = doc.getElementById('dados-embutidos');
    if(!tag) throw new Error('Este arquivo não tem dados de obra embutidos (não parece um arquivo salvo do EngPav ou do EngOrc).');
    dados = JSON.parse(tag.textContent || '{}');
  }
  if(dados && (dados.segmentos !== undefined || dados.overridesCatalogo !== undefined || dados.linhasExtras !== undefined || dados.bdiConfig !== undefined)){
    if(!dados.obra) throw new Error('Arquivo do EngPav sem dados de obra.');
    return { tipo:'engpav', nome, estado:dados, catalogo: html ? extrairCatalogoEngPav(texto) : {} };
  }
  let obras = [];
  if(Array.isArray(dados)) obras = dados;
  else if(dados && Array.isArray(dados.obras)) obras = dados.obras;
  else if(dados && dados.obra && dados.obra.itens) obras = [dados.obra];
  else if(dados && dados.itens && dados.grupos) obras = [dados];
  obras = obras.filter(o=>o && Array.isArray(o.itens));
  if(!obras.length) throw new Error('Não encontrei nenhuma obra nesse arquivo.');
  return { tipo:'engorc', nome, obras };
}
function mostrarPreImportacao(){
  const P = IMPORT_PENDENTE;
  if(P.tipo === 'engfluxo'){
    document.getElementById('modalCorpo').innerHTML = `
      <h3 style="margin:0 0 6px;font-family:var(--disp);text-transform:uppercase;">Importar do EngFluxo (acompanhamento)</h3>
      <p style="font-size:13px;margin:0 0 10px;"><b>${P.fluxos.length} obra(s)/projeto(s):</b> ${P.fluxos.slice(0,12).map(f=>escH(f.nome||'(sem nome)')).join(', ')}${P.fluxos.length>12?'…':''}</p>
      <p class="obs" style="margin:0 0 10px;">Fase atual, checklists, datas, prazos e observações viram o <b>Acompanhamento</b> de cada obra no sistema único.</p>
      <label class="pav-chk"><input type="checkbox" id="impVincular" checked> Se já existir uma obra com o mesmo nome, juntar o acompanhamento a ela (em vez de criar outra)</label>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
        <button class="btn ghost fino" onclick="fecharModal()">Cancelar</button>
        <button class="btn amber fino" id="btnImportar" onclick="executarImportacao()">Importar</button></div>`;
    abrirModal(); return;
  }
  const desc = P.tipo === 'engpav'
    ? `<b>Obra do EngPav:</b> ${escH(P.estado.obra.nome||'(sem nome)')} — ${(P.estado.segmentos||[]).length} trecho(s), ${(P.estado.linhasExtras||[]).length} linha(s) manual(is), ${Object.keys(P.estado.composicoes||{}).length} composição(ões).`
    : `<b>${P.obras.length} obra(s) do EngOrc:</b> ${P.obras.slice(0,8).map(o=>escH(o.nome||'(sem nome)')).join(', ')}${P.obras.length>8?'…':''}`;
  document.getElementById('modalCorpo').innerHTML = `
    <h3 style="margin:0 0 6px;font-family:var(--disp);text-transform:uppercase;">Importar obra</h3>
    <p style="font-size:13px;margin:0 0 10px;">Arquivo <span class="mono">${escH(P.nome)}</span><br>${desc}</p>
    <p class="obs" style="margin:0 0 10px;">A obra é criada como <b>nova</b> no banco da equipe, já convertida para o formato atual do EngOrc${P.tipo==='engpav'?' (trechos no motor melhorado: transporte, imprimação, pintura de ligação, subleito, escavação, vala de drenagem e calçada com largura própria)':''}. O arquivo original não é alterado.</p>
    <div class="campo"><label>Preços</label>
      <label class="pav-chk"><input type="radio" name="impPreco" value="atualizar" checked> Atualizar para a base de referência atual do sistema</label>
      <label class="pav-chk"><input type="radio" name="impPreco" value="manter"> Manter os preços que estão no arquivo (ficam como custo manual)</label></div>
    <p class="obs">Ajustes feitos item a item no arquivo (preço adaptado, quantidade digitada, descrição editada) são preservados nos dois casos.</p>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
      <button class="btn ghost fino" onclick="fecharModal()">Cancelar</button>
      <button class="btn amber fino" id="btnImportar" onclick="executarImportacao()">Importar</button></div>`;
  abrirModal();
}
async function executarImportacao(){
  const P = IMPORT_PENDENTE; if(!P) return;
  const manter = (document.querySelector('input[name=impPreco]:checked')||{}).value === 'manter';
  const btn = document.getElementById('btnImportar'); btn.disabled = true; btn.textContent = 'Importando…';
  const rel = { avisos:[], info:[] };
  try{
    let criadas = [];
    if(P.tipo === 'engfluxo') criadas = await importarEngFluxo(P, (document.getElementById('impVincular')||{}).checked, rel);
    else if(P.tipo === 'engpav') criadas.push(await importarEngPav(P, manter, rel));
    else for(const ob of P.obras) criadas.push(await importarEngOrc(ob, manter, rel));
    OBRAS = (await apiFetch('/api/obras')).obras;
    renderPainel();
    if(criadas.length) await selecionarObra(criadas[criadas.length-1].id);
    mostrarRelatorioImportacao(criadas, rel);
  }catch(e){
    console.error(e); toast('Falha na importação: ' + e.message, true); btn.disabled = false; btn.textContent = 'Importar';
  }
}
function mostrarRelatorioImportacao(criadas, rel){
  document.getElementById('modalCorpo').innerHTML = `
    <h3 style="margin:0 0 8px;font-family:var(--disp);text-transform:uppercase;">Importação concluída</h3>
    ${criadas.length ? '' : '<div class="pav-alerta">Nenhuma obra nova foi criada.</div>'}
    ${criadas.map(c=>`<div class="pav-ok"><b>${escH(c.nome)}</b> — ${c.itens} itens · total ${fmtMoney(c.total)}${c.totalOriginal!=null?` <span style="color:var(--muted)">(no arquivo: ${fmtMoney(c.totalOriginal)})</span>`:''}</div>`).join('')}
    ${rel.info.length ? '<ul style="font-size:12.5px;margin:8px 0;">' + rel.info.map(x=>`<li>${x}</li>`).join('') + '</ul>' : ''}
    ${rel.avisos.length ? '<div class="pav-alerta"><b>Confira:</b><ul style="margin:4px 0 0;">' + rel.avisos.map(x=>`<li>${x}</li>`).join('') + '</ul></div>' : ''}
    <div style="display:flex;justify-content:flex-end;margin-top:12px;"><button class="btn amber fino" onclick="fecharModal()">OK</button></div>`;
}
function totalObra(o){ return o.itens.reduce((s,i)=>s+num(i.custoTotal),0); }

async function importarEngOrc(ob, manter, rel){
  const o = JSON.parse(JSON.stringify(ob));
  delete o.id; delete o.criadoPorNome; delete o.criadoEm; delete o.atualizadoEm;
  o.nome = o.nome || 'Obra importada';
  const totalAntes = o.itens.reduce((s,i)=>s+num(i.custoTotal),0);
  migrarObra(o);
  o.extras.origemImportacao = { sistema:'EngOrc', em:new Date().toISOString() };
  if(manter){
    o.itens.forEach(it=>{ if(!it.manual){ it.manual = true; it.custoOriginal = num(it.custoOriginal != null ? it.custoOriginal : it.custoUnitario); } });
    rel.info.push(`${escH(o.nome)}: preços do arquivo mantidos como custo manual (use ↺ no orçamento para voltar ao preço da base).`);
  }else{
    const ids = o.itens.map(i=>i.itemId).filter(Boolean);
    const r = ids.length ? await apiFetch('/api/itens/por-ids', { method:'POST', body: JSON.stringify({ ids }) }) : { itens:[] };
    const m = {}; r.itens.forEach(x=>m[x.id]=x);
    const faltando = [];
    o.itens.forEach(it=>{
      const cat = m[it.itemId];
      if(cat){ it.custoDesoneradoBase = cat.custoDesonerado; it.custoNaoDesoneradoBase = cat.custoNaoDesonerado; if(!it.manual) it.custoOriginal = custoPorRegime(cat, o.regime); }
      else if(!it.manual){ it.manual = true; it.custoOriginal = num(it.custoOriginal != null ? it.custoOriginal : it.custoUnitario); faltando.push(it.codigo); }
    });
    if(faltando.length) rel.avisos.push(`${escH(o.nome)}: ${faltando.length} item(ns) não existem na base atual e ficaram com o preço do arquivo (custo manual): ${escH(faltando.slice(0,15).join(', '))}${faltando.length>15?'…':''}.`);
  }
  comObra(o, ()=>{ calcularBdiDe(o); o.itens.forEach(recalcItem); });
  const r = await apiFetch('/api/obras', { method:'POST', body: JSON.stringify(o) });
  return { id:r.obra.id, nome:o.nome, itens:o.itens.length, total: totalObra(o), totalOriginal: totalAntes };
}

async function importarEngPav(P, manter, rel){
  const E = P.estado, ob = E.obra || {}, resp = E.responsavel || {};
  const over = E.overridesCatalogo || {}, edic = E.edicoesOrcamento || {}, pers = E.sinapiItemsPersonalizados || [];
  const persPorCod = {}; pers.forEach(p=>{ persPorCod[String(p.chave||p.codigo)] = p; persPorCod[String(p.codigo)] = p; });
  const precoArquivo = c=>{
    c = String(c);
    if(edic[c] && edic[c].preco !== undefined) return num(edic[c].preco);
    if(over[c] && over[c].preco !== undefined) return num(over[c].preco);
    if(P.catalogo[c]) return num(P.catalogo[c].preco);
    if(persPorCod[c]) return num(persPorCod[c].preco);
    return 0;
  };
  const bc = engpavBdi(E.bdiConfig);
  const bdiPctAntigo = (1-bc.CP/100-bc.ISS/100-bc.CPRB/100) > 0 ? (((1+bc.AC/100+bc.SG/100+bc.R/100)*(1+bc.DF/100)*(1+bc.L/100))/(1-bc.CP/100-bc.ISS/100-bc.CPRB/100)-1) : 0;
  const fatorAntigo = 1 - Math.min(100, Math.max(0, num(ob.descontoPercent)))/100;
  const totalOriginal = Object.keys(P.catalogo).length ? engpavTotalOriginal(E, precoArquivo) * fatorAntigo * (1+bdiPctAntigo) : null;

  const o = novaObraDefault();
  o.nome = ob.nome || 'Obra importada do EngPav';
  o.tipoObra = 'pavimentacao'; o.municipio = ob.municipio || ''; o.processo = ob.processo || '';
  if(ob.data) o.dataBase = ob.data;
  o.responsavel = resp.nome || o.responsavel;
  o.crea = resp.numeroRegistro ? `${resp.tipoRegistro||'CREA'}-${resp.uf||'SC'} ${resp.numeroRegistro}` : '';
  o.regime = 'nao_desonerado';
  o.bdi = { ac:bc.AC/100, sg:bc.SG/100, r:bc.R/100, df:bc.DF/100, l:bc.L/100, iss:bc.ISS,
    pis: Math.min(bc.CP, 0.65), cofins: Math.max(bc.CP-0.65, 0), cprb: bc.CPRB, final:0, descontoPercent: num(ob.descontoPercent) };
  if(bc.CP !== 3.65) rel.info.push(`BDI: o campo "CP" do EngPav (${fmtQ(bc.CP)}%) foi lançado como PIS ${fmtQ(o.bdi.pis)}% + COFINS ${fmtQ(o.bdi.cofins)}% — o BDI final é o mesmo (${(bdiPctAntigo*100).toLocaleString('pt-BR',{maximumFractionDigits:2})}%). Confira os tributos na aba BDI.`);
  o.extras = { versao: VERSAO_FORMATO_OBRA, convenio: ob.convenio || '', art:{ profissao: resp.profissao || 'Engenheiro Civil', cnpjContratante:'', cep:'' },
    origemImportacao:{ sistema:'EngPav', arquivo:P.nome, em:new Date().toISOString() } };
  calcularBdiDe(o);

  // ---- trechos → formato novo (com as melhorias ligadas)
  const p = pavGarantir(o);
  p.modoReverso = !!ob.modoReverso; p.valorConvenio = num(ob.valorConvenioDisponivel);
  let calcadas = 0, concreto = 0;
  (E.segmentos||[]).forEach(s=>{
    const n = pavNormalizarSegmento({
      nome: s.nome, comprimento: num(s.comprimento), largura: num(s.largura),
      pavimentoEspessura: num(s.pavimentoEspessura, 5),
      baseOpcao: PAV.base[s.baseOpcao] ? s.baseOpcao : 'nenhuma', subBaseOpcao: PAV.base[s.subBaseOpcao] ? s.subBaseOpcao : 'nenhuma',
      meioFioOpcao: PAV.meioFio[s.meioFioOpcao] ? s.meioFioOpcao : 'nenhum', meioFioLados: num(s.meioFioLados, 2),
      temDrenagem: !!s.temDrenagem, drenagemDN: String(s.drenagemDN||'400'), drenagemExtensao: s.drenagemExtensao || '',
      bocaOpcao: PAV.boca[s.bocaOpcao] ? s.bocaOpcao : 'nenhuma', bocaEspacamento: num(s.bocaEspacamento, 60), bocaLados: num(s.bocaLados, 1),
      calcadaOpcao: PAV.calcada[s.calcadaOpcao] ? s.calcadaOpcao : 'nenhuma',
      sinalizacaoHorizontal: !!s.sinalizacaoHorizontal, ajustavel: !!s.ajustavel
    }, p);
    if(s.pavimentoOpcao === 'concreto_simples'){
      const e = num(s.pavimentoEspessura, 15);
      n.pavimentoOpcao = e >= 19 ? 'pcs35_20' : (e >= 16.5 ? 'pcs35_175' : 'pcs35_15'); concreto++;
    }else n.pavimentoOpcao = ENGPAV_PAV_MAP[s.pavimentoOpcao] || 'nenhum';
    if(n.calcadaOpcao !== 'nenhuma') calcadas++;
    p.segmentos.push(n);
  });
  if(p.segmentos.length) rel.info.push(`${p.segmentos.length} trecho(s) convertidos. O motor novo inclui abertura de caixa, regularização do subleito, imprimação, carga e transporte de massa asfáltica e agregados${p.segmentos.some(s=>s.temDrenagem)?', escavação/reaterro de vala':''} — DMTs padrão: usina ${p.config.dmtUsina} km, agregados ${p.config.dmtAgregado} km, bota-fora ${p.config.dmtBotaFora} km. <b>Ajuste as DMTs na aba Segmentos.</b>`);
  if(calcadas) rel.avisos.push(`${calcadas} trecho(s) com calçada: o EngPav usava a largura da pista; agora a calçada tem largura própria — foi assumido 1,50 m × 2 lados. Ajuste na aba Segmentos.`);
  if(concreto) rel.avisos.push(`${concreto} trecho(s) com "concreto simples" (código 94990, que é calçada/piso) passaram para pavimento de concreto simples (PCS) fck 35 MPa na espessura mais próxima.`);

  // ---- itens próprios do EngPav que não existem na base → criados como "Própria"
  const codigosUsados = new Set();
  (E.linhasExtras||[]).forEach(l=>l.codigo && codigosUsados.add(String(l.codigo)));
  Object.keys(E.composicoes||{}).forEach(c=>{ codigosUsados.add(c); ((E.composicoes[c]||{}).linhas||[]).forEach(l=>{ if(l.ref) codigosUsados.add(String(l.ref)); else if(l.codigo) codigosUsados.add(String(l.codigo)); }); });
  const fontesBusca = ['SINAPI','SICRO','SINAPI-I','Própria','Composição','Cotação'];
  let res = codigosUsados.size ? await apiFetch('/api/itens/por-codigos', { method:'POST', body: JSON.stringify({ codigos:Array.from(codigosUsados), fontes:fontesBusca }) }) : { itens:[], naoEncontrados:[] };
  const criarProprios = (res.naoEncontrados||[]).filter(c=>persPorCod[c]);
  for(const c of criarProprios){
    const pp = persPorCod[c];
    await apiFetch('/api/itens/propria', { method:'POST', body: JSON.stringify({ codigo: pp.codigo, descricao: pp.descricao || ('Item próprio ' + pp.codigo), unidade: pp.unidade || 'UN', custo: num(pp.preco) }) });
  }
  if(criarProprios.length){
    rel.info.push(`${criarProprios.length} item(ns) próprio(s) do EngPav cadastrado(s) no catálogo da equipe (fonte "Própria"): ${escH(criarProprios.slice(0,12).join(', '))}${criarProprios.length>12?'…':''}.`);
    res = await apiFetch('/api/itens/por-codigos', { method:'POST', body: JSON.stringify({ codigos:Array.from(codigosUsados), fontes:fontesBusca }) });
  }
  const catPorCod = {}; res.itens.forEach(x=>catPorCod[x.codigo]=x);
  Object.keys(persPorCod).forEach(c=>{
    const cat = catPorCod[c], pp = persPorCod[c];
    if(cat && cat.fonte === 'Própria' && !criarProprios.includes(c) && normalizarTxt(cat.descricao) !== normalizarTxt(pp.descricao||''))
      rel.avisos.push(`O código próprio <b>${escH(c)}</b> já existia no catálogo da equipe com outra descrição ("${escH(cat.descricao)}") — a obra usou o item da equipe, não o do EngPav ("${escH(pp.descricao||'')}"). Confira.`);
  });

  // ---- motor + ajustes item a item
  await pavCarregarCatalogo();
  comObra(o, ()=>pavSincronizar());
  const qm = E.quantidadesManuais || {};
  let qmAplicadas = 0, qmPerdidas = 0;
  Object.keys(qm).forEach(k=>{
    const [gid, cod] = k.split('|');
    const it = o.itens.find(i=>i.auto && i.motorChave === (ENGPAV_GRUPOS[gid]||gid) + '|' + cod);
    if(it){ it.qtdManual = true; it.quantidade = num(qm[k]); qmAplicadas++; } else qmPerdidas++;
  });
  if(qmAplicadas) rel.info.push(`${qmAplicadas} quantidade(s) digitada(s) manualmente no EngPav foram mantidas (marcadas com ↺ no orçamento).`);
  if(qmPerdidas) rel.avisos.push(`${qmPerdidas} quantidade(s) manual(is) do EngPav não puderam ser reaplicadas porque o código mudou no motor novo.`);

  const semCodigo = [];
  (E.linhasExtras||[]).forEach(l=>{
    if(!l.codigo) return;
    const cat = catPorCod[String(l.codigo)];
    const grupo = ENGPAV_GRUPOS[l.grupo] || l.grupo || 'Serviços Iniciais';
    if(!o.grupos.includes(grupo)) o.grupos.push(grupo);
    const it = cat ? {
        itemId:cat.id, fonte:cat.fonte, codigo:cat.codigo, descricao:cat.descricao, unidade:cat.unidade,
        custoDesoneradoBase:cat.custoDesonerado, custoNaoDesoneradoBase:cat.custoNaoDesonerado,
        custoOriginal: custoPorRegime(cat, o.regime), manual:false
      } : {
        itemId:'SINAPI ' + l.codigo, fonte:'SINAPI', codigo:String(l.codigo),
        descricao: (P.catalogo[l.codigo] && P.catalogo[l.codigo].descricao) || '(item do EngPav não encontrado na base atual)',
        unidade: (P.catalogo[l.codigo] && P.catalogo[l.codigo].unidade) || '',
        custoDesoneradoBase:0, custoNaoDesoneradoBase:0, custoOriginal: precoArquivo(l.codigo), manual:true
      };
    if(!cat) semCodigo.push(l.codigo);
    Object.assign(it, { quantidade: num(l.quantidade), grupo, custoUnitario:0, custoComBDI:0, custoTotal:0 });
    o.itens.push(it);
  });
  if((E.linhasExtras||[]).length) rel.info.push(`${(E.linhasExtras||[]).length} linha(s) manual(is) do EngPav viraram linhas normais do orçamento.`);
  if(semCodigo.length) rel.avisos.push(`${semCodigo.length} código(s) das linhas manuais não existem na base atual e ficaram com o preço do arquivo: ${escH(semCodigo.join(', '))}.`);

  // edições feitas no orçamento do EngPav (código/descrição/unidade/preço adaptados nesta obra)
  let edAplic = 0;
  Object.keys(edic).forEach(ch=>{
    const ed = edic[ch];
    o.itens.filter(i=>String(i.codigo)===String(ch)).forEach(it=>{
      const orig = { codigo:it.codigo, descricao:it.descricao, unidade:it.unidade };
      ['codigo','descricao','unidade'].forEach(c=>{ if(ed[c] !== undefined) it[c] = String(ed[c]); });
      if(orig.codigo!==it.codigo || orig.descricao!==it.descricao || orig.unidade!==it.unidade) it.orig = orig;
      if(ed.preco !== undefined){ it.manual = true; it.custoOriginal = num(ed.preco); }
      edAplic++;
    });
  });
  if(edAplic) rel.info.push(`${edAplic} adaptação(ões) feitas no orçamento do EngPav (preço/descrição) foram mantidas.`);

  if(manter){
    let n = 0;
    o.itens.forEach(it=>{ if(!it.manual){ const pr = precoArquivo(it.codigo); if(pr > 0 || P.catalogo[it.codigo]){ it.manual = true; it.custoOriginal = pr; n++; } } });
    rel.info.push(`${n} item(ns) com o preço do arquivo mantido como custo manual. Itens novos do motor (transporte, imprimação...) usam a base atual.`);
  }
  comObra(o, ()=>o.itens.forEach(recalcItem));

  // ---- cronograma
  const cr = E.cronograma || {};
  o.cronograma = { meses: Math.max(1, Math.min(24, parseInt(cr.numMeses)||3)), porGrupo:{} };
  Object.keys(cr.percentuais||{}).forEach(gid=>{ o.cronograma.porGrupo[ENGPAV_GRUPOS[gid]||gid] = (cr.percentuais[gid]||[]).map(num); });
  if(o.itens.some(i=>i.grupo===PAV_GRUPOS.terra) && !o.cronograma.porGrupo[PAV_GRUPOS.terra]){
    o.cronograma.porGrupo[PAV_GRUPOS.terra] = (o.cronograma.porGrupo[PAV_GRUPOS.pav] || [100]).slice();
    rel.avisos.push('Cronograma: o grupo novo "Terraplenagem" recebeu a mesma distribuição da Pavimentação — confira na aba Cronograma.');
  }

  const r = await apiFetch('/api/obras', { method:'POST', body: JSON.stringify(o) });

  // ---- composições analíticas do EngPav → tabela compartilhada (não sobrescreve as que já existem)
  const comps = [];
  Object.keys(E.composicoes||{}).forEach(ch=>{
    const dono = catPorCod[ch]; const c = E.composicoes[ch];
    if(!dono || !c || !Array.isArray(c.linhas) || !c.linhas.length) return;
    comps.push({ itemId: dono.id, linhas: c.linhas.map(l=>{
      const ref = l.ref ? catPorCod[String(l.ref)] : null;
      return ref ? { tipo:l.tipo||'Material', refId:ref.id, fonte:ref.fonte, codigo:ref.codigo, descricao:ref.descricao, unidade:ref.unidade, coef:num(l.coef), precoD:ref.custoDesonerado, precoND:ref.custoNaoDesonerado }
                 : { tipo:l.tipo||'Material', refId:null, fonte:'', codigo:String(l.codigo||''), descricao:l.descricao||'', unidade:l.unidade||'', coef:num(l.coef), precoD:num(l.preco), precoND:num(l.preco) };
    }) });
  });
  if(comps.length){
    const rc = await apiFetch('/api/composicoes/lote', { method:'POST', body: JSON.stringify({ composicoes: comps, modo:'manter' }) });
    rel.info.push(`Composições analíticas: ${rc.gravadas} importada(s)${rc.mantidas?`, ${rc.mantidas} já existiam na equipe e foram mantidas`:''}.`);
  }
  const codAntigos = new Set(); Object.values(ENGPAV_OLD).forEach(g=>Object.values(g).forEach(v=>codAntigos.add(Array.isArray(v)?v[0]:v)));
  Object.values(PAV.drenagem).forEach(c=>codAntigos.add(c)); codAntigos.add('102512');
  Object.values(PAV.pavimento).forEach(v=>{ if(v.tipo==='rigido') codAntigos.add(v.codigo); }); // PCS substitui o antigo 94990 (não é serviço novo)
  const novos = o.itens.filter(i=>i.auto && !codAntigos.has(i.codigo));
  const vNovos = novos.reduce((s,i)=>s+i.custoTotal,0);
  if(totalOriginal != null){
    const dif = totalObra(o) - totalOriginal;
    rel.info.push(`Diferença para o total do arquivo: <b>${dif>=0?'+':''}${fmtMoney(dif)}</b> (${totalOriginal>0?((dif/totalOriginal)*100).toLocaleString('pt-BR',{maximumFractionDigits:1}):'—'}%). Desse valor, <b>${fmtMoney(vNovos)}</b> são serviços que o EngPav não gerava (${escH(Array.from(new Set(novos.map(i=>i.codigo))).join(', '))}); o restante vem da calçada com largura própria, do pavimento de concreto corrigido e ${manter?'':'da atualização de preços para a base atual'}${manter?'dos itens sem preço no arquivo':''}.`);
  }
  const zerados = o.itens.filter(i=>!(i.custoOriginal > 0));
  if(zerados.length) rel.avisos.push(`${zerados.length} item(ns) sem preço na base (ex.: imprimação/pintura de ligação): ${escH(zerados.map(i=>i.codigo).join(', '))} — informe o custo (cotação ou composição).`);
  return { id:r.obra.id, nome:o.nome, itens:o.itens.length, total: totalObra(o), totalOriginal };
}
// Calcula o(s) BDI(s) de uma obra sem depender da tela (converte o formato antigo, se for o caso).
function calcularBdiDe(o){ bdiGarantir(o); return bdiCalcularTudo(o); }

/* =====================================================================
   6. TEMA DA IMPRESSÃO — cores tiradas da logo do usuário (ou escolhidas por ele)
   ===================================================================== */
const TEMA_PADRAO_IMPRESSAO = { escuro:'#0B3D66', claro:'#DCE9F5', borda:'#9FC3E3', destaque:'#2C9F52' }; // logo padrão SEINFRA (azul)
let TEMA_LOGO = { src:null, tema:null, ratio:null, cores:null };
function hexRgb(h){ h = h.replace('#',''); return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]; }
function rgbHex(r,g,b){ return '#' + [r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('').toUpperCase(); }
function rgbHsl(r,g,b){ r/=255; g/=255; b/=255; const mx=Math.max(r,g,b), mn=Math.min(r,g,b); let h=0, s=0; const l=(mx+mn)/2;
  if(mx!==mn){ const d=mx-mn; s = l>0.5 ? d/(2-mx-mn) : d/(mx+mn);
    h = mx===r ? (g-b)/d+(g<b?6:0) : mx===g ? (b-r)/d+2 : (r-g)/d+4; h*=60; } return [h,s,l]; }
function hslRgb(h,s,l){ h/=360; if(s===0) return [l*255,l*255,l*255];
  const q = l<0.5 ? l*(1+s) : l+s-l*s, p = 2*l-q;
  const f = t=>{ if(t<0) t+=1; if(t>1) t-=1; if(t<1/6) return p+(q-p)*6*t; if(t<1/2) return q; if(t<2/3) return p+(q-p)*(2/3-t)*6; return p; };
  return [f(h+1/3)*255, f(h)*255, f(h-1/3)*255]; }
function misturar(hex, alvo, t){ const a = hexRgb(hex), b = hexRgb(alvo); return rgbHex(a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t); }
// Monta o tema a partir de 2 cores: a principal vira um tom escuro (cabeçalhos com texto branco legível).
function temaDeCores(principal, destaque){
  const [h,s,l] = rgbHsl(...hexRgb(principal));
  const escuro = l > 0.30 ? rgbHex(...hslRgb(h, Math.min(1, s*1.05), 0.27)) : principal.toUpperCase();
  // tons claros no mesmo matiz (não acinzentados), para faixas de título e linhas de grupo
  // usa o matiz do destaque quando ele é colorido (ex.: verde-limão da JRA), senão o da cor principal
  const [hd, sd] = rgbHsl(...hexRgb(destaque));
  const [hh, ss] = sd >= 0.3 ? [hd, sd] : [h, s];
  const sc = ss < 0.08 ? 0 : Math.min(0.6, Math.max(0.35, ss));
  return { escuro, claro: rgbHex(...hslRgb(hh, sc, 0.915)), borda: rgbHex(...hslRgb(hh, sc*0.8, 0.72)), destaque: destaque.toUpperCase() };
}
// Lê os pixels da logo e acha as cores da marca (ignora branco, preto e cinzas).
function analisarLogo(src){
  return new Promise(resolve=>{
    const img = new Image();
    img.onload = ()=>{
      try{
        const esc = Math.min(1, 240/Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width*esc)); c.height = Math.max(1, Math.round(img.height*esc));
        const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, c.width, c.height);
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        const B = Array.from({length:24}, ()=>({ n:0, r:0, g:0, b:0, h:0 }));
        let total = 0;
        for(let i=0;i<d.length;i+=4){
          if(d[i+3] < 128) continue;
          const [h,s,l] = rgbHsl(d[i],d[i+1],d[i+2]);
          if(l > 0.92 || l < 0.05 || s < 0.20) continue;
          const k = Math.floor(h/15) % 24; const x = B[k];
          x.n++; x.r+=d[i]; x.g+=d[i+1]; x.b+=d[i+2]; x.h+=h; total++;
        }
        // recorta as margens brancas/transparentes da logo (para o cabeçalho não ficar com a marca pequena)
        let x0=c.width, y0=c.height, x1=-1, y1=-1;
        for(let y=0;y<c.height;y++) for(let x=0;x<c.width;x++){
          const i = (y*c.width+x)*4;
          if(d[i+3] > 20 && (d[i] < 232 || d[i+1] < 232 || d[i+2] < 232)){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
        }
        let recortada = src, ratio = img.width / img.height;
        if(x1 > x0 && y1 > y0){
          const k = 1/esc, pad = 4;
          const sx = Math.max(0, Math.floor((x0-pad)*k)), sy = Math.max(0, Math.floor((y0-pad)*k));
          const sw = Math.min(img.width - sx, Math.ceil((x1-x0+2*pad)*k)), sh = Math.min(img.height - sy, Math.ceil((y1-y0+2*pad)*k));
          if(sw*sh < img.width*img.height*0.92){
            const c2 = document.createElement('canvas'); c2.width = sw; c2.height = sh;
            c2.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
            recortada = c2.toDataURL('image/png'); ratio = sw/sh;
          }
        }
        if(total < 30){ resolve({ ratio, cores:null, recortada }); return; }
        const ord = B.map((x,k)=>({ ...x, k })).filter(x=>x.n).sort((a,b)=>b.n-a.n);
        const cor = x=>rgbHex(x.r/x.n, x.g/x.n, x.b/x.n);
        const principal = ord[0];
        const dist = (a,b)=>{ const da = Math.abs(a.h/a.n - b.h/b.n); return Math.min(da, 360-da); };
        const outra = ord.slice(1).find(x=>x.n >= total*0.04 && dist(x, principal) >= 25);
        let destaque;
        if(outra) destaque = cor(outra);
        else{ const [h,s] = rgbHsl(...hexRgb(cor(principal))); destaque = rgbHex(...hslRgb(h, Math.max(0.55, s), 0.45)); }
        // a principal é a cor mais presente; se o destaque for mais escuro, troca (cabeçalho precisa do tom escuro)
        let p = cor(principal), dq = destaque;
        if(rgbHsl(...hexRgb(dq))[2] < rgbHsl(...hexRgb(p))[2] - 0.15){ const t = p; p = dq; dq = t; }
        resolve({ ratio, cores:{ principal:p, destaque:dq }, recortada });
      }catch(e){ resolve({ ratio: img.width/img.height, cores:null, recortada:src }); }
    };
    img.onerror = ()=>resolve({ ratio:null, cores:null });
    img.src = src;
  });
}
async function prepararTemaImpressao(){
  const src = USUARIO && USUARIO.logo;
  if(!src){ TEMA_LOGO = { src:null, tema:null, ratio:5, cores:null }; return; }
  if(TEMA_LOGO.src === src && TEMA_LOGO.ratio) return;
  const r = await analisarLogo(src);
  TEMA_LOGO = { src, ratio: r.ratio, cores: r.cores, recortada: r.recortada || src, tema: r.cores ? temaDeCores(r.cores.principal, r.cores.destaque) : null };
}
function temaImpressaoAtual(){
  const m = USUARIO && USUARIO.coresImpressao;
  if(m && m.principal && m.destaque) return temaDeCores(m.principal, m.destaque);
  if(USUARIO && USUARIO.logo && TEMA_LOGO.src === USUARIO.logo && TEMA_LOGO.tema) return TEMA_LOGO.tema;
  return TEMA_PADRAO_IMPRESSAO;
}
function aplicarTemaImpressao(el){
  const t = temaImpressaoAtual();
  el.style.setProperty('--pr-escuro', t.escuro); el.style.setProperty('--pr-claro', t.claro);
  el.style.setProperty('--pr-borda', t.borda); el.style.setProperty('--pr-destaque', t.destaque);
}
function logoImpressao(){ return (USUARIO && USUARIO.logo) ? ((TEMA_LOGO.src === USUARIO.logo && TEMA_LOGO.recortada) || USUARIO.logo) : LOGO_SEPLAN_BASE64; }
function logoEhFaixa(){ return !(USUARIO && USUARIO.logo) || !TEMA_LOGO.ratio || TEMA_LOGO.ratio >= 2.8; }

/* ---------- Minha Conta: cores da impressão ---------- */
let CORES_PENDENTES = undefined; // undefined = sem alteração; null = automáticas; {principal,destaque} = personalizadas
function renderCoresImpressao(){
  const box = document.getElementById('coresImpressaoCorpo'); if(!box || !USUARIO) return;
  const salvas = USUARIO.coresImpressao || null;
  const atual = CORES_PENDENTES !== undefined ? CORES_PENDENTES : salvas;
  const auto = !atual;
  const base = atual || TEMA_LOGO.cores || { principal: TEMA_PADRAO_IMPRESSAO.escuro, destaque: TEMA_PADRAO_IMPRESSAO.destaque };
  const t = auto ? temaImpressaoAtual() : temaDeCores(base.principal, base.destaque);
  box.innerHTML = `
    <label class="pav-chk"><input type="radio" name="corModo" ${auto?'checked':''} onchange="CORES_PENDENTES=null;renderCoresImpressao()"> Automáticas — tiradas da logo${USUARIO.logo ? (TEMA_LOGO.cores ? ` (encontradas: <span class="amostra-cor" style="background:${TEMA_LOGO.cores.principal}"></span> <span class="amostra-cor" style="background:${TEMA_LOGO.cores.destaque}"></span>)` : ' (a logo não tem cores marcantes — usando o padrão azul)') : ' (sem logo pessoal — padrão azul do SEINFRA)'}</label>
    <label class="pav-chk"><input type="radio" name="corModo" ${!auto?'checked':''} onchange="CORES_PENDENTES={principal:'${base.principal}',destaque:'${base.destaque}'};renderCoresImpressao()"> Escolher as cores</label>
    ${!auto ? `<div class="linha-dupla" style="max-width:420px;margin-top:6px;">
      <div class="campo"><label>Cor principal</label><input type="color" value="${base.principal}" oninput="CORES_PENDENTES={principal:this.value,destaque:(CORES_PENDENTES||{}).destaque||'${base.destaque}'};renderCoresImpressao()"></div>
      <div class="campo"><label>Cor de destaque</label><input type="color" value="${base.destaque}" oninput="CORES_PENDENTES={principal:(CORES_PENDENTES||{}).principal||'${base.principal}',destaque:this.value};renderCoresImpressao()"></div></div>` : ''}
    <div class="previa-doc">
      <div style="border-bottom:2px solid ${t.escuro};padding-bottom:4px;margin-bottom:6px;display:flex;align-items:center;gap:8px;">
        ${USUARIO.logo ? `<img src="${USUARIO.logo}" style="height:34px;">` : '<span style="font-size:10px;color:#666">logo SEINFRA</span>'}</div>
      <div style="background:${t.claro};border:1px solid ${t.borda};color:${t.escuro};text-align:center;font-weight:700;font-size:10px;padding:3px;">ORÇAMENTO</div>
      <table style="margin-top:6px;font-size:9px;"><tr><th style="background:${t.escuro};color:#fff;padding:3px;">ITEM</th><th style="background:${t.escuro};color:#fff;padding:3px;">DESCRIÇÃO</th><th style="background:${t.escuro};color:#fff;padding:3px;">TOTAL</th></tr>
        <tr><td style="background:${t.claro};font-weight:700;padding:3px;">1</td><td style="background:${t.claro};font-weight:700;padding:3px;">PAVIMENTAÇÃO</td><td style="background:${t.claro};padding:3px;">R$ 100.000,00</td></tr>
        <tr><td style="padding:3px;">1.1</td><td style="padding:3px;">Cronograma <span style="display:inline-block;width:60px;height:8px;background:${t.destaque};border-radius:2px;"></span></td><td style="padding:3px;">R$ 50.000,00</td></tr></table>
    </div>
    ${CORES_PENDENTES !== undefined ? `<div style="display:flex;gap:8px;margin-top:10px;"><button class="btn amber fino" onclick="salvarCoresImpressao()">Salvar cores</button><button class="btn ghost fino" onclick="CORES_PENDENTES=undefined;renderCoresImpressao()">Cancelar</button></div>` : ''}`;
}
async function salvarCoresImpressao(){
  try{
    await apiFetch('/api/auth/me/cores', { method:'PUT', body: JSON.stringify({ cores: CORES_PENDENTES || null }) });
    USUARIO.coresImpressao = CORES_PENDENTES || null; CORES_PENDENTES = undefined;
    renderCoresImpressao(); toast('Cores da impressão salvas.');
  }catch(e){ toast('Erro ao salvar as cores: ' + e.message, true); }
}

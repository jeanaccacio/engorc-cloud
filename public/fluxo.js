/* =====================================================================
   ENGFLUXO — MÓDULO ACOMPANHAMENTO (antigo EngFluxo, agora dentro do sistema único)
   Cada obra do sistema tem: fase atual, checklists por fase, prazos e status
   (em dia / atenção / atrasado / concluída). Os dados ficam em obra.extras.fluxo.
   Painel geral: todas as obras da equipe, com status, fase, progresso e valor orçado.
   ===================================================================== */
const FASES = [
  { id:"projeto", label:"Projeto", itens:[
    "Levantamento topográfico","Memorial descritivo","Projeto executivo (plantas)",
    "Planilha orçamentária (SINAPI)","Cronograma físico-financeiro","ART/RRT do projeto" ]},
  { id:"aprovacoes", label:"Aprovações / Documentação", itens:[
    "Protocolo na Prefeitura (alvará)","Aprovação Corpo de Bombeiros (CBMSC)",
    "Aprovação CELESC (se rede elétrica)","Licença ambiental (se aplicável)","Anuência concessionária água/esgoto" ]},
  { id:"convenio", label:"Convênio / Recurso", itens:[
    "Cadastro na plataforma (Transferegov/SICONV)","Elaboração do Plano de Trabalho",
    "Aprovação do convênio","Publicação / assinatura","Liberação da 1ª parcela" ]},
  { id:"licitacao", label:"Licitação", itens:[
    "Termo de Referência","Pesquisa de preços","Elaboração do edital","Parecer jurídico",
    "Publicação do edital","Sessão pública","Julgamento de recursos","Homologação","Assinatura do contrato" ]},
  { id:"obra", label:"Obra (Execução)", itens:[
    "Ordem de Serviço emitida","Diário de obra iniciado","1ª medição","2ª medição","3ª medição","Relatório de fiscalização" ]},
  { id:"finalizacao", label:"Finalização / Entrega", itens:[
    "Termo de Recebimento Provisório","Termo de Recebimento Definitivo","As-built",
    "Prestação de contas (se convênio)","Garantia registrada" ]},
];
const TIPOS_FLUXO = ['Pavimentação','Drenagem','Edificação pública','Praça / Área de lazer','Saneamento','Reforma / Ampliação','Outro'];
const TIPO_FLUXO_PARA_BDI = { 'Pavimentação':'pavimentacao', 'Drenagem':'pavimentacao', 'Praça / Área de lazer':'pavimentacao', 'Saneamento':'agua_esgoto' };
let FLUXO_ABA_FASE = null;

function fluxoChecklistPadrao(){
  const c = {}; FASES.forEach(f=>{ c[f.id] = f.itens.map(t=>({ item:t, concluido:false, data:'' })); }); return c;
}
function fluxoPadrao(o){
  const tipo = o && o.tipoObra === 'pavimentacao' ? 'Pavimentação' : (o && o.tipoObra === 'agua_esgoto' ? 'Saneamento' : 'Edificação pública');
  return { tipo, local:'', faseAtual:'projeto', dataInicioFase: new Date().toISOString().slice(0,10),
    prazoFinalPrevisto:'', observacoes:'', checklists: fluxoChecklistPadrao() };
}
function fluxoGarantir(o){
  o.extras = o.extras || {};
  if(!o.extras.fluxo) o.extras.fluxo = fluxoPadrao(o);
  const f = o.extras.fluxo;
  f.checklists = f.checklists || {};
  FASES.forEach(fa=>{ if(!Array.isArray(f.checklists[fa.id])) f.checklists[fa.id] = fa.itens.map(t=>({ item:t, concluido:false, data:'' })); });
  if(!FASES.some(fa=>fa.id===f.faseAtual)) f.faseAtual = 'projeto';
  return f;
}
// Mesma regra do EngFluxo original: concluída quando a fase final está toda marcada;
// senão, pelo prazo final previsto (vencido = atrasado; até 7 dias = atenção).
function fluxoStatus(f){
  if(!f) return 'em-dia';
  const fim = FASES[FASES.length-1].id;
  const itensFim = (f.checklists && f.checklists[fim]) || [];
  if(f.faseAtual === fim && itensFim.length && itensFim.every(i=>i.concluido)) return 'concluida';
  if(!f.prazoFinalPrevisto) return 'em-dia';
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const dias = Math.floor((new Date(f.prazoFinalPrevisto + 'T00:00:00') - hoje) / 86400000);
  if(dias < 0) return 'atrasado';
  if(dias <= 7) return 'atencao';
  return 'em-dia';
}
function fluxoProgresso(f){
  let t = 0, k = 0;
  if(f && f.checklists) FASES.forEach(fa=>(f.checklists[fa.id]||[]).forEach(i=>{ t++; if(i.concluido) k++; }));
  return t ? Math.round(k/t*100) : 0;
}
function fluxoLabelFase(id){ const f = FASES.find(x=>x.id===id); return f ? f.label : (id||'—'); }
const FLUXO_STATUS_LABEL = { 'em-dia':'Em dia', 'atencao':'Atenção', 'atrasado':'Atrasado', 'concluida':'Concluída' };
function fluxoData(iso){ if(!iso) return ''; const [y,m,d] = String(iso).slice(0,10).split('-'); return `${d}/${m}/${y}`; }

/* ---------------------- PAINEL GERAL ---------------------- */
function renderPainel(){
  const grid = document.getElementById('painelGrid'); if(!grid) return;
  const fFase = document.getElementById('pfFase').value, fStatus = document.getElementById('pfStatus').value;
  const fResp = document.getElementById('pfResp').value, fTexto = normalizarTxt(document.getElementById('pfTexto').value);
  const lista = OBRAS.map(o=>{ const f = o.fluxo || fluxoPadrao(o); return { o, f, status: fluxoStatus(f), prog: fluxoProgresso(f) }; });
  // filtros (opções montadas a partir dos dados)
  const resps = Array.from(new Set(OBRAS.map(o=>o.responsavel).filter(Boolean))).sort();
  const selR = document.getElementById('pfResp');
  selR.innerHTML = '<option value="">Todos os responsáveis</option>' + resps.map(r=>`<option ${r===fResp?'selected':''}>${escH(r)}</option>`).join('');
  const filtrada = lista.filter(x=>{
    if(fFase && x.f.faseAtual !== fFase) return false;
    if(fStatus && x.status !== fStatus) return false;
    if(fResp && x.o.responsavel !== fResp) return false;
    if(fTexto && !normalizarTxt((x.o.nome||'') + ' ' + (x.f.local||'') + ' ' + (x.o.municipio||'')).includes(fTexto)) return false;
    return true;
  });
  const ordem = { atrasado:0, atencao:1, 'em-dia':2, concluida:3 };
  filtrada.sort((a,b)=> ordem[a.status]-ordem[b.status] || String(a.o.nome).localeCompare(String(b.o.nome),'pt-BR'));
  grid.innerHTML = filtrada.map(x=>`
    <div class="pcard st-${x.status}" onclick="abrirObraDoPainel(${jsA(x.o.id)})">
      <div class="pcard-top"><h3>${escH(x.o.nome||'(sem nome)')}</h3><span class="pbadge ${x.status}">${FLUXO_STATUS_LABEL[x.status]}</span></div>
      <div class="pcard-tipo">${escH(x.f.tipo||'')} · ${escH(x.f.local || x.o.municipio || 'local não informado')}</div>
      <div class="pcard-fase">${escH(fluxoLabelFase(x.f.faseAtual))}</div>
      <div class="pcard-meta">
        <div><b>Responsável:</b> ${escH(x.o.responsavel||'—')}</div>
        <div><b>Previsão de conclusão:</b> ${x.f.prazoFinalPrevisto ? fluxoData(x.f.prazoFinalPrevisto) : 'não definida'}</div>
        <div><b>Orçamento:</b> ${x.o.total > 0 ? fmtMoney(x.o.total) : (x.o.valorInformado > 0 ? fmtMoney(x.o.valorInformado) + ' <span class="tag" title="Valor digitado na aba Acompanhamento (orçamento feito fora do sistema)">informado</span>' : '—')}${x.o.convenio ? ' · ' + escH(x.o.convenio) : ''}</div>
      </div>
      <div class="pprog"><div style="width:${x.prog}%"></div></div>
      <div class="pcard-rodape">${x.prog}% do checklist · atualizada ${x.o.atualizadoEm ? new Date(x.o.atualizadoEm).toLocaleDateString('pt-BR') : ''}</div>
    </div>`).join('');
  document.getElementById('painelVazio').style.display = filtrada.length ? 'none' : 'block';
  const atrasadas = lista.filter(x=>x.status==='atrasado').length, atencao = lista.filter(x=>x.status==='atencao').length;
  const andamento = lista.filter(x=>x.status!=='concluida').length;
  const totalOrc = lista.filter(x=>x.status!=='concluida').reduce((s,x)=>s+valorPainelObra(x.o),0);
  document.getElementById('painelResumo').innerHTML = `
    <div class="t"><div class="lbl">Obras / projetos</div><div class="v">${lista.length}</div></div>
    <div class="t"><div class="lbl">Em andamento</div><div class="v">${andamento}</div></div>
    <div class="t"><div class="lbl">Atenção</div><div class="v" style="color:#E3C34A">${atencao}</div></div>
    <div class="t"><div class="lbl">Atrasadas</div><div class="v" style="color:#F08A7A">${atrasadas}</div></div>
    <div class="t hi"><div class="lbl">Orçado em andamento (c/ BDI)</div><div class="v">${fmtMoney(totalOrc)}</div></div>`;
}
function popularFiltroFases(){
  const s = document.getElementById('pfFase'); if(!s || s.options.length > 1) return;
  s.innerHTML = '<option value="">Todas as fases</option>' + FASES.map(f=>`<option value="${f.id}">${f.label}</option>`).join('');
}
async function abrirObraDoPainel(id){
  await selecionarObra(id);
  mudarAba('pagina-acompanhamento');
}
async function novaObraDoPainel(){
  await criarNovaObra(true);
  mudarAba('pagina-obra');
}

/* ---------------------- ACOMPANHAMENTO DA OBRA ATUAL ---------------------- */
let _fluxoTimer = null;
function fluxoAgendarSalvar(){ clearTimeout(_fluxoTimer); _fluxoTimer = setTimeout(()=>salvarObraAtual(true), 600); }
function fluxoCampo(campo, valor){
  const f = fluxoGarantir(CURRENT_OBRA);
  f[campo] = valor;
  if(campo === 'faseAtual'){ FLUXO_ABA_FASE = valor; f.dataInicioFase = new Date().toISOString().slice(0,10); }
  renderAcompanhamento(); fluxoAgendarSalvar();
}
function fluxoMarcar(fase, i, marcado){
  const it = fluxoGarantir(CURRENT_OBRA).checklists[fase][i]; if(!it) return;
  it.concluido = !!marcado;
  if(it.concluido && !it.data) it.data = new Date().toISOString().slice(0,10);
  renderAcompanhamento(); fluxoAgendarSalvar();
}
function fluxoDataItem(fase, i, v){ const it = fluxoGarantir(CURRENT_OBRA).checklists[fase][i]; if(it){ it.data = v; fluxoAgendarSalvar(); } }
function fluxoRemoverItem(fase, i){
  const lista = fluxoGarantir(CURRENT_OBRA).checklists[fase];
  if(!confirm(`Remover "${lista[i].item}" do checklist desta obra?`)) return;
  lista.splice(i,1); renderAcompanhamento(); fluxoAgendarSalvar();
}
function fluxoAdicionarItem(){
  const inp = document.getElementById('fluxoNovoItem'); const t = inp.value.trim(); if(!t) return;
  const f = fluxoGarantir(CURRENT_OBRA); const fase = FLUXO_ABA_FASE || f.faseAtual;
  f.checklists[fase].push({ item:t, concluido:false, data:'' }); inp.value = '';
  renderAcompanhamento(); fluxoAgendarSalvar();
}
function fluxoAvancarFase(){
  const f = fluxoGarantir(CURRENT_OBRA);
  const i = FASES.findIndex(x=>x.id===f.faseAtual);
  if(i < 0 || i >= FASES.length-1) return;
  const pend = (f.checklists[f.faseAtual]||[]).filter(x=>!x.concluido).length;
  if(pend && !confirm(`Ainda há ${pend} item(ns) pendente(s) na fase "${FASES[i].label}". Avançar mesmo assim?`)) return;
  fluxoCampo('faseAtual', FASES[i+1].id);
}
// Vínculos com o que já existe no sistema (só indicação — quem marca o item é o usuário).
function fluxoDicaSistema(item){
  const o = CURRENT_OBRA, t = normalizarTxt(item);
  if(t.includes('planilha orcamentaria')){
    return o.itens.length ? `<span class="fdica" onclick="mudarAba('pagina-orcamento')">no sistema: ${o.itens.length} itens · ${fmtMoney(o.itens.reduce((s,i)=>s+i.custoTotal,0))}</span>` : `<span class="fdica vazia" onclick="mudarAba('pagina-orcamento')">orçamento ainda vazio</span>`;
  }
  if(t.includes('cronograma fisico')){
    const g = gruposComItens().filter(x=>x.itens.length);
    const ok = g.length && g.every(x=>Math.round((o.cronograma.porGrupo[x.nome]||[]).reduce((s,v)=>s+num(v),0))===100);
    return `<span class="fdica ${ok?'':'vazia'}" onclick="mudarAba('pagina-cronograma')">${ok ? 'cronograma fechado em 100%' : 'cronograma incompleto'}</span>`;
  }
  if(t.includes('art/rrt')) return `<span class="fdica" onclick="mudarAba('pagina-art')">assistente de ART</span>`;
  if(t.includes('memorial') && o.extras && o.extras.pav && o.extras.pav.segmentos.length) return `<span class="fdica" onclick="mudarAba('pagina-segmentos')">memória de cálculo disponível</span>`;
  return '';
}
// Valor do Painel: orçamento do sistema; se não houver, o valor informado manualmente.
function valorPainelObra(o){ return num(o.total) > 0 ? num(o.total) : num(o.valorInformado); }
async function acompValorInformado(v){
  const o = CURRENT_OBRA; o.extras = o.extras || {};
  const t = String(v).replace(/[R$\s]/g,''); const n = Math.max(0, num(t.includes(',') ? t.replace(/\./g,'').replace(',','.') : t));
  if(n > 0) o.extras.valorInformado = Math.round(n*100)/100; else delete o.extras.valorInformado;
  await salvarObraAtual(true); renderAcompanhamento(); toast(n > 0 ? 'Valor do orçamento informado salvo.' : 'Valor informado removido.');
}
function renderAcompanhamento(){
  const cont = document.getElementById('acompCorpo'); if(!cont || !CURRENT_OBRA) return;
  const o = CURRENT_OBRA, f = fluxoGarantir(o);
  if(!FLUXO_ABA_FASE || !f.checklists[FLUXO_ABA_FASE]) FLUXO_ABA_FASE = f.faseAtual;
  const st = fluxoStatus(f), prog = fluxoProgresso(f);
  const idxFase = FASES.findIndex(x=>x.id===f.faseAtual);
  document.getElementById('acompStatus').innerHTML = `<span class="pbadge ${st}">${FLUXO_STATUS_LABEL[st]}</span> <span class="tag">${prog}% concluído</span>`;
  cont.innerHTML = `
    <div class="fases-linha">${FASES.map((fa,i)=>`<div class="fase-passo ${i<idxFase?'feita':(i===idxFase?'atual':'')}" title="${escH(fa.label)}"><span>${i+1}</span>${escH(fa.label)}</div>`).join('')}</div>
    <div class="linha-tripla">
      <div class="campo"><label>Fase atual</label><select onchange="fluxoCampo('faseAtual', this.value)">${FASES.map(fa=>`<option value="${fa.id}" ${fa.id===f.faseAtual?'selected':''}>${fa.label}</option>`).join('')}</select></div>
      <div class="campo"><label>Início da fase atual</label><input type="date" value="${escH(f.dataInicioFase||'')}" onchange="fluxoCampo('dataInicioFase', this.value)"></div>
      <div class="campo"><label>Previsão de conclusão total</label><input type="date" value="${escH(f.prazoFinalPrevisto||'')}" onchange="fluxoCampo('prazoFinalPrevisto', this.value)"></div>
    </div>
    <div class="linha-tripla">
      <div class="campo"><label>Tipo</label><select onchange="fluxoCampo('tipo', this.value)">${TIPOS_FLUXO.map(t=>`<option ${t===f.tipo?'selected':''}>${t}</option>`).join('')}</select></div>
      <div class="campo"><label>Local / endereço</label><input type="text" value="${escH(f.local||'')}" placeholder="Bairro, rua, referência" onchange="fluxoCampo('local', this.value.trim())"></div>
      <div class="campo"><label>Responsável · fonte de recurso</label><div class="campo-lido" onclick="mudarAba('pagina-obra')" title="Editar na aba Obra">${escH(o.responsavel||'—')} · ${escH(convenioTexto()||'fonte não informada')}</div></div>
    </div>
    <div class="linha-tripla">
      <div class="campo"><label>Valor do orçamento informado (R$, c/ BDI) — para obra orçada fora do sistema</label>
        <input type="text" inputmode="decimal" value="${num(o.extras&&o.extras.valorInformado)>0 ? num(o.extras.valorInformado).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) : ''}" placeholder="ex.: 1.250.000,00" onchange="acompValorInformado(this.value)">
        <p class="obs">${o.itens.length ? 'Esta obra tem orçamento no sistema (' + fmtMoney(o.itens.reduce((s,i)=>s+num(i.custoTotal),0)) + ') — ele prevalece sobre o valor informado.' : 'Entra no total do Painel enquanto a obra estiver em andamento.'}</p></div>
    </div>
    <div class="campo"><label>Observações</label><textarea rows="2" placeholder="Pendências, contatos, informações relevantes…" onchange="fluxoCampo('observacoes', this.value)">${escH(f.observacoes||'')}</textarea></div>
    <div class="fase-abas">${FASES.map(fa=>{ const it = f.checklists[fa.id]||[]; const k = it.filter(x=>x.concluido).length;
      return `<button class="fase-aba ${fa.id===FLUXO_ABA_FASE?'ativa':''} ${it.length&&k===it.length?'completa':''}" onclick="FLUXO_ABA_FASE='${fa.id}';renderAcompanhamento()">${escH(fa.label)} <span>${k}/${it.length}</span></button>`; }).join('')}</div>
    <div class="checklist">${(f.checklists[FLUXO_ABA_FASE]||[]).map((it,i)=>`
      <div class="ck-item ${it.concluido?'feito':''}">
        <input type="checkbox" ${it.concluido?'checked':''} onchange="fluxoMarcar('${FLUXO_ABA_FASE}', ${i}, this.checked)">
        <div class="ck-texto">${escH(it.item)} ${fluxoDicaSistema(it.item)}</div>
        <input type="date" value="${escH(it.data||'')}" onchange="fluxoDataItem('${FLUXO_ABA_FASE}', ${i}, this.value)">
        <button class="rm-btn" title="Remover item" onclick="fluxoRemoverItem('${FLUXO_ABA_FASE}', ${i})">×</button>
      </div>`).join('') || '<div class="obs" style="padding:10px;">Nenhum item nesta fase.</div>'}</div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
      <input type="text" id="fluxoNovoItem" placeholder="Adicionar item a esta fase…" style="flex:1;min-width:200px;padding:8px 10px;border:1px solid var(--line);border-radius:6px;" onkeydown="if(event.key==='Enter') fluxoAdicionarItem()">
      <button class="btn ghost fino" onclick="fluxoAdicionarItem()">Adicionar</button>
      ${idxFase < FASES.length-1 ? `<button class="btn amber fino" onclick="fluxoAvancarFase()">Avançar para "${escH(FASES[idxFase+1].label)}" →</button>` : ''}
    </div>`;
}
async function excluirObraAtual(){
  const o = CURRENT_OBRA; if(!o) return;
  const nome = prompt(`Excluir a obra "${o.nome}" com orçamento, trechos e acompanhamento?\nEsta ação não pode ser desfeita.\n\nDigite EXCLUIR para confirmar:`);
  if(nome !== 'EXCLUIR') return;
  try{
    await apiFetch('/api/obras/' + o.id, { method:'DELETE' });
    localStorage.removeItem('engorc_lastObra');
    CURRENT_OBRA = null;
    await carregarObras();
    mudarAba('pagina-painel');
    toast('Obra excluída.');
  }catch(e){ toast('Não foi possível excluir: ' + e.message, true); }
}
// Resumo usado na lista OBRAS (painel) após salvar, sem precisar recarregar do servidor.
function resumoPainelDaObra(o){
  return { fluxo: o.extras && o.extras.fluxo, total: o.itens.reduce((s,i)=>s+num(i.custoTotal),0),
    responsavel: o.responsavel, convenio: (o.extras && o.extras.convenio) || '', valorInformado: num(o.extras && o.extras.valorInformado), atualizadoEm: o.atualizadoEm || new Date().toISOString() };
}

/* ---------------------- IMPORTAR OBRAS DO ENGFLUXO ANTIGO (pasta /dados/*.json) ---------------------- */
function ehObraEngFluxo(x){ return x && typeof x === 'object' && x.checklists && x.faseAtual !== undefined && !Array.isArray(x.itens); }
async function importarEngFluxo(P, vincular, rel){
  const criadas = [];
  for(const ef of P.fluxos){
    const fluxo = { tipo: ef.tipo || 'Outro', local: ef.local || '', faseAtual: ef.faseAtual || 'projeto', dataInicioFase: ef.dataInicioFase || '',
      prazoFinalPrevisto: ef.prazoFinalPrevisto || '', observacoes: ef.observacoes || '', checklists: ef.checklists || {}, origemId: ef.id || null };
    const jaImportada = OBRAS.find(o=>o.fluxo && ef.id && o.fluxo.origemId === ef.id);
    if(jaImportada){ rel.avisos.push(`"${escH(ef.nome)}" já tinha sido importada antes (obra "${escH(jaImportada.nome)}") — ignorada.`); continue; }
    const mesmoNome = vincular ? OBRAS.find(o=>normalizarTxt(o.nome).trim() === normalizarTxt(ef.nome).trim()) : null;
    if(mesmoNome){
      const r = await apiFetch('/api/obras/' + mesmoNome.id); const o = migrarObra(r.obra);
      const atual = o.extras.fluxo;
      if(atual && fluxoProgresso(atual) > 0){ rel.avisos.push(`"${escH(o.nome)}" já tem acompanhamento preenchido no sistema — o do arquivo não foi aplicado.`); continue; }
      o.extras.fluxo = fluxo; fluxoGarantir(o);
      if(!o.responsavel && ef.responsavel) o.responsavel = ef.responsavel;
      if(!o.extras.convenio && ef.fonteRecurso) o.extras.convenio = ef.fonteRecurso;
      await apiFetch('/api/obras/' + o.id, { method:'PUT', body: JSON.stringify(o) });
      rel.info.push(`Acompanhamento de "${escH(ef.nome)}" vinculado à obra que já existia no sistema.`);
      criadas.push({ id:o.id, nome:o.nome, itens:o.itens.length, total: totalObra(o) });
      continue;
    }
    const o = novaObraDefault();
    o.nome = ef.nome || 'Obra importada do EngFluxo';
    o.tipoObra = TIPO_FLUXO_PARA_BDI[ef.tipo] || 'edificios';
    o.responsavel = ef.responsavel || o.responsavel;
    o.extras = { versao: VERSAO_FORMATO_OBRA, convenio: ef.fonteRecurso || '', fluxo, origemImportacao:{ sistema:'EngFluxo', arquivo:P.nome, em:new Date().toISOString() } };
    fluxoGarantir(o); calcularBdiDe(o);
    const r = await apiFetch('/api/obras', { method:'POST', body: JSON.stringify(o) });
    criadas.push({ id:r.obra.id, nome:o.nome, itens:0, total:0 });
  }
  if(criadas.length) rel.info.push(`${criadas.length} obra(s) do EngFluxo no sistema. As que vieram só com acompanhamento ficam com o orçamento vazio, pronto para ser montado.`);
  return criadas;
}

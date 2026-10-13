
let CICLO='',CICLOS=[],RO=false;
let D={meta:{id:'main',fecha:'',participantes:[]},factors:[],parties:[],risks:[],opps:[],objs:[]};
// ---- Procesos (lista del usuario, tal como está en su Excel)
const PROCS={PG01:'PG01 GESTION ESTRATEGICA',PG02:'PG02 MEJORA CONTINUA',PG03:'PG03 GESTION PERSONAS',PG04:'PG04 GESTION DOCUMENTAL',PG05:'PG05 GESTION INSTALACIONES',PG06:'PG06 QHSE GE',PS01:'PS01 GESTION COMERCIAL',PS02:'PS02 APROVISIONAMIENTOS',PS03:'PS03 FABRICACION',PS04:'PS04 LOGISTICA Y EXPEDICIONES',PS05:'PS05 SUPPLY CHAIN'};
const S={tab:'general',orden:'excel',proceso:'',estado:'abiertos',ano:''};
const codeOf=p=>{const m=/^(P[GS]\d\d)\b/.exec(p||'');return m?m[1]:''};
const proc=p=>PROCS[codeOf(p)]||'(sin proceso)';
const TIPOS={D:{n:'Debilidades',s:'internas · negativas',c:'#c4553f'},A:{n:'Amenazas',s:'externas · negativas',c:'#b8802a'},F:{n:'Fortalezas',s:'internas · positivas',c:'#2f8a5a'},O:{n:'Oportunidades',s:'externas · positivas',c:'#2f6fb0'}};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const nl=s=>esc(s).replace(/\n/g,'<br>');
const lvl=r=>r>=6?'r':r>=3?'y':r>=1?'g':'n';
let fm={};const reindex=()=>{fm=Object.fromEntries(D.factors.map(f=>[f.id,f]))};
// Un riesgo puede estar enlazado a varios factores (misma frase como debilidad y como amenaza): se evalúa una sola vez.
const riskFids=r=>(r.fids&&r.fids.length)?r.fids:[r.fid];
const SING={D:'Debilidad',A:'Amenaza',F:'Fortaleza',O:'Oportunidad'};
const claveTxt=s=>fold(String(s||'').trim().replace(/\s+/g,' '));
const rp=x=>x.fid&&fm[x.fid]?fm[x.fid].proceso:x.proceso;
const rt=x=>x.fid&&fm[x.fid]?fm[x.fid].texto:x.factor;

const ESTADOS=['','En curso','Cerrada'];
const abierto=e=>e!=='Cerrada';
const requiere=r=>(r.R||0)>=4||r.G===3;
const requiereO=o=>(o.VR||0)>=9;
const procSel=()=>`<select class="keep" onchange="S.proceso=this.value;render()"><option value="">Todos los procesos</option>${Object.values(PROCS).map(p=>`<option ${S.proceso===p?'selected':''}>${esc(p)}</option>`).join('')}</select>`;
const okProc=p=>!S.proceso||proc(p)===S.proceso;
const fecha=f=>/^\d{4}-\d\d(-\d\d)?$/.test(f)?f.split('-').reverse().join('/'):f;
const finPlazo=p=>/^\d{4}-\d\d$/.test(p)?p+'-31':p;
const hoy=()=>new Date().toISOString().slice(0,10);
const vencidoA=a=>!!(a&&a.plazo&&a.estado!=='Cerrada'&&/^\d{4}-/.test(a.plazo)&&finPlazo(a.plazo)<hoy());
const ACC0=()=>({accion:'',resp:'',plazo:'',estado:'',coment:''});
const accs=x=>x.acciones||[];
const tieneAcc=x=>accs(x).some(a=>(a.accion||'').trim());
const vencido=x=>accs(x).some(vencidoA);
function normAcc(x){ // datos antiguos: una sola acción en el propio registro → lista de acciones
  if(!Array.isArray(x.acciones)){const a={accion:x.accion||'',resp:x.resp||'',plazo:x.plazo||'',estado:x.estado||'',coment:x.coment||''};x.acciones=(a.accion||a.resp||a.plazo||a.coment)?[a]:[]}
  delete x.accion;delete x.resp;delete x.plazo;delete x.coment;delete x.proceso;delete x.factor;delete x.plazoRaw;return x}
function recalc(x){const a=accs(x); if(!a.length)return; x.estado=a.every(z=>z.estado==='Cerrada')?'Cerrada':(a.some(z=>z.estado)?'En curso':'')}
const fila0=f=>(f.tipo==='D'||f.tipo==='A')?D.risks.find(r=>riskFids(r).includes(f.id)):D.opps.find(o=>riskFids(o).includes(f.id));
const valorado=x=>('P' in x)?(!!x.P&&!!x.G):(!!x.V&&!!x.R);
// un factor está evaluado cuando tiene fila de riesgo/oportunidad Y está valorada (P y G, o V y R)
// Riesgo: evaluado si P y G están valoradas. Oportunidad: evaluada si tiene V y R, o si no tiene ninguna acción
// (una oportunidad sin acción y sin valorar se considera descartada, no pendiente).
const evaluado=f=>{const x=fila0(f);if(!x)return null;if(valorado(x))return x;return(('P' in x)||tieneAcc(x))?null:x};

function setR(i,f,v){const r=D.risks[i];r[f]=(f==='estado'||f==='just')?v:(v===''?null:+v);if(f==='P'||f==='G')r.R=(r.P&&r.G)?r.P*r.G:null;if(f==='Pr'||f==='Gr')r.Rr=r.Pr&&r.Gr?r.Pr*r.Gr:null;guardar('risks',r);render()}
function setO(i,f,v){const o=D.opps[i];o[f]=(f==='estado'||f==='just')?v:(v===''?null:+v);if(f==='V'||f==='R')o.VR=(o.V||0)*(o.R||0);guardar('opps',o);render()}
function setAcc(col,i,j,f,v){const x=D[col][i];x.acciones[j][f]=v;recalc(x);guardar(col,x);render()}
let FOCO=null;
// Cada factor del DAFO tiene siempre su fila en Riesgos (D, A) u Oportunidades (F, O), sin valorar hasta que el usuario la evalúe.
async function asegurarFilas(){
  const nuevos=[],cambios=[],borrar=[];if(RO)return 0;
  // Dos familias de filas: riesgos (debilidad/amenaza) y oportunidades (fortaleza/oportunidad).
  // Si la misma frase está en los dos cuadrantes de una familia, comparten UNA fila (fids).
  const FAM=[
    {col:'risks',tipos:['D','A'],lista:()=>D.risks,set:l=>{D.risks=l},
     vacia:r=>!r.P&&!r.G&&!(r.acciones||[]).length&&!(r.causa||'').trim()&&!(r.efecto||'').trim()&&!(r.just||'').trim(),
     nueva:f=>({id:'R-'+f.id,fid:f.id,fids:[f.id],causa:'',efecto:'',P:null,G:null,R:null,acciones:[],estado:'',just:'',Pr:null,Gr:null,Rr:null})},
    {col:'opps',tipos:['F','O'],lista:()=>D.opps,set:l=>{D.opps=l},
     vacia:o=>!o.V&&!o.R&&!(o.acciones||[]).length&&!(o.just||'').trim(),
     nueva:f=>({id:'O-'+f.id,fid:f.id,fids:[f.id],V:null,R:null,VR:0,acciones:[],estado:'',just:''})}];
  for(const F of FAM){
    const pref=F.col==='risks'?/^R-/:/^O-/;
    // 1) filas automáticas vacías que duplican la de una frase gemela → se fusionan
    for(const r of F.lista().slice()){
      if(!pref.test(r.id)||riskFids(r).length>1||!F.vacia(r))continue;
      const f=fm[r.fid];if(!f)continue;
      const gem=D.factors.find(x=>x.id!==f.id&&F.tipos.includes(x.tipo)&&claveTxt(x.texto)===claveTxt(f.texto)&&F.lista().some(y=>y!==r&&riskFids(y).includes(x.id)));
      if(!gem)continue;
      const base=F.lista().find(y=>y!==r&&riskFids(y).includes(gem.id));
      base.fids=[...new Set([...riskFids(base),...riskFids(r)])];
      F.set(F.lista().filter(y=>y!==r));cambios.push([F.col,base]);borrar.push([F.col,r]);
    }
    // 2) cada factor sin fila: si tiene gemelo se enlaza a su fila; si no, fila nueva
    for(const f of D.factors){
      if(!F.tipos.includes(f.tipo)||fila0(f))continue;
      const gem=D.factors.find(x=>x.id!==f.id&&F.tipos.includes(x.tipo)&&claveTxt(x.texto)===claveTxt(f.texto)&&fila0(x));
      if(gem){const base=fila0(gem);base.fids=[...new Set([...riskFids(base),f.id])];cambios.push([F.col,base]);continue}
      const r=F.nueva(f);F.lista().push(r);nuevos.push([F.col,r]);
    }
  }
  const uniq=[];const vistos=new Set();for(const [c,x] of cambios){if(!vistos.has(c+x.id)){vistos.add(c+x.id);uniq.push([c,x])}}
  for(const [col,x] of nuevos.concat(uniq)){try{await api('PUT',`api/${col}/${encodeURIComponent(x.id)}`,x)}catch(e){toast('NO SE HA GUARDADO una fila: '+e.message,true)}}
  for(const [col,r] of borrar){try{await api('DELETE',`api/${col}/${encodeURIComponent(r.id)}`)}catch(e){toast('No se pudo quitar una fila duplicada: '+e.message,true)}}
  if(uniq.length)toast(`${uniq.length} fila(s) enlazada(s) a dos cuadrantes con la misma frase: se evalúan una sola vez`);
  return nuevos.length;
}
function evaluar(id){const f=fm[id];
  const ya=fila0(f);
  if(!ya&&RO){toast(`El ciclo ${CICLO} está cerrado: solo lectura`,true);return}
  if(ya){FOCO=ya.id;S.tab=(f.tipo==='D'||f.tipo==='A')?'riesgos':'oport';S.estado='todos';S.proceso='';render();return}
  if(f.tipo==='D'||f.tipo==='A'){const r={id:nid('R'),fid:id,causa:'',efecto:'',P:null,G:null,R:null,acciones:[],estado:''};D.risks.push(r);guardar('risks',r);FOCO=r.id;S.tab='riesgos'}
  else{const o={id:nid('O'),fid:id,V:null,R:null,VR:0,acciones:[],estado:''};D.opps.push(o);guardar('opps',o);FOCO=o.id;S.tab='oport'}
  S.estado='todos';S.proceso='';render()}

const TABS=[['general','Datos generales'],['partes','Partes'],['externo','Externo'],['interno','Interno'],['dafo','DAFO'],['riesgos','Riesgos'],['oport','Oportunidades'],null,['procesos','Procesos'],['objetivos','Objetivos'],['revision','Revisión dirección'],null,['flujo','Flujo'],['criterios','Criterios'],['coherencia','Coherencia']];
// ---- búsqueda por texto en la pestaña (resalta en amarillo hasta cambiar de menú)
const BUSCABLE=new Set(['externo','interno','dafo','riesgos','oport','objetivos','coherencia']);
let SRCH={tab:'',term:'',open:false,i:-1};
const fold=s=>s.split('').map(c=>(c.normalize('NFD')[0]||c).toLowerCase()).join('');
function pintarBuscar(){
  const el=document.getElementById('buscar');if(!el)return;
  if(!BUSCABLE.has(S.tab)){el.innerHTML='';return}
  el.innerHTML=`<span id="qcount" class="qcount"></span>
   <span class="qbox ${SRCH.open?'open':''}"><input id="qin" type="search" placeholder="Buscar en esta pestaña…" value="${esc(SRCH.term)}" oninput="buscarTexto(this.value)" onkeydown="buscarTecla(event)" ${SRCH.open?'':'tabindex="-1"'}>
   <button class="qnav" title="Anterior" onclick="buscarIr(-1)">‹</button><button class="qnav" title="Siguiente" onclick="buscarIr(1)">›</button></span>
   <button class="lupa" id="lupa" title="Buscar en esta pestaña" onclick="buscarAbrir()">🔍</button>`;
  if(SRCH.term)aplicarHl(false);
}
function buscarAbrir(){
  if(SRCH.open&&!SRCH.term){SRCH.open=false}else SRCH.open=true;
  document.querySelector('#buscar .qbox').classList.toggle('open',SRCH.open);
  if(SRCH.open){const i=document.getElementById('qin');i.tabIndex=0;i.focus();i.select()}
}
function buscarTexto(v){SRCH.term=v;clearTimeout(buscarTexto.h);buscarTexto.h=setTimeout(()=>aplicarHl(true),150)}
function buscarTecla(e){
  if(e.key==='Enter'){e.preventDefault();buscarIr(e.shiftKey?-1:1)}
  else if(e.key==='Escape'){SRCH.term='';e.target.value='';aplicarHl(false);SRCH.open=false;document.querySelector('#buscar .qbox').classList.remove('open')}
}
function limpiarHl(){
  const v=document.getElementById('view');if(!v||!v.querySelectorAll)return;
  v.querySelectorAll('mark.hl').forEach(m=>m.replaceWith(document.createTextNode(m.textContent)));
  v.normalize();
}
function aplicarHl(saltar){
  limpiarHl();
  const v=document.getElementById('view'),t=fold(SRCH.term.trim()),cnt=document.getElementById('qcount');
  SRCH.i=-1;
  if(!v||!v.querySelectorAll){return}
  if(t.length<2){if(cnt)cnt.textContent=SRCH.term.trim()?'mín. 2 letras':'';return}
  const w=document.createTreeWalker(v,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.nodeValue.trim()&&!n.parentElement.closest('button,select,option,textarea,input,script,style,mark')?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT});
  const nodos=[];while(w.nextNode())nodos.push(w.currentNode);
  let total=0;
  for(const n of nodos){
    const txt=n.nodeValue,f=fold(txt);let i=f.indexOf(t);if(i<0)continue;
    const frag=document.createDocumentFragment();let pos=0;
    while(i>=0){
      if(i>pos)frag.append(txt.slice(pos,i));
      const m=document.createElement('mark');m.className='hl';m.textContent=txt.slice(i,i+t.length);frag.append(m);total++;
      pos=i+t.length;i=f.indexOf(t,pos);
    }
    if(pos<txt.length)frag.append(txt.slice(pos));
    n.replaceWith(frag);
  }
  // desplegar lo que esté plegado y contenga coincidencias
  v.querySelectorAll('mark.hl').forEach(m=>{const tb=m.closest('tbody.shut');if(tb)tb.classList.remove('shut');const d=m.closest('details:not([open])');if(d)d.open=true});
  if(cnt)cnt.textContent=total?`${total} coincidencia${total>1?'s':''}`:'sin coincidencias';
  if(total&&saltar)buscarIr(1);
}
function buscarIr(d){
  const ms=[...document.querySelectorAll('#view mark.hl')];if(!ms.length)return;
  ms.forEach(m=>m.classList.remove('cur'));
  SRCH.i=(SRCH.i+d+ms.length)%ms.length;
  const m=ms[SRCH.i];m.classList.add('cur');m.scrollIntoView({block:'center'});
  const cnt=document.getElementById('qcount');if(cnt)cnt.textContent=`${SRCH.i+1} de ${ms.length}`;
}
function render(){
  if(SRCH.tab!==S.tab)SRCH={tab:S.tab,term:'',open:false,i:-1};
  document.getElementById('tabs').innerHTML=TABS.map(t=>t?`<button class="${S.tab===t[0]?'on':''}" onclick="irTab('${t[0]}')">${t[1]}</button>`:'<span class="sep"></span>').join('');
  document.getElementById('wrap').className='wrap'+(S.tab==='riesgos'||S.tab==='oport'?' wide':'')+(RO?' ro':'');
  document.getElementById('view').innerHTML=VIEWS[S.tab]();
  pintarCiclo();
  pintarBuscar();
  if(S.tab==='general')cargarCopias();
  if(RO)document.querySelectorAll('#view button:not(.keep),#view select:not(.keep),#view input:not(.keep),#view textarea').forEach(e=>{e.disabled=true});
  if(FOCO){const id=FOCO;FOCO=null;
    const rows=[...document.querySelectorAll('#view tr[data-rid]')].filter(r=>r.dataset.rid===id);
    if(rows.length){const tb=rows[0].closest('tbody');if(tb)tb.classList.remove('shut');
      rows[0].scrollIntoView({block:'center'});
      rows.forEach(r=>r.classList.add('flash'));setTimeout(()=>rows.forEach(r=>r.classList.remove('flash')),1800)}}
}
function matriz3(titulo,ejeX,ejeY,items,kx,ky){
  let h=`<div class="heat"><span></span>${[1,2,3].map(i=>`<span style="text-align:center">${ejeX}${i}</span>`).join('')}`;
  for(let y=3;y>=1;y--){h+=`<span>${ejeY}${y}</span>`;for(let x=1;x<=3;x++){const n=items.filter(i=>i[ky]===y&&i[kx]===x).length;h+=`<div class="cell ${lvl(x*y)}" style="opacity:${n?1:.3}" title="${x*y}">${n||x*y}</div>`}}
  return `<h3>${titulo}</h3>${h}</div><p class="mut" style="font-size:12px">Número = elementos; tenue = vacío (se muestra el valor del producto).</p>`;
}


function general(){
  const m=D.meta;
  return `<div class="kpis">
   <div class="card kpi"><b>${esc(fecha(m.fecha))}</b><span>fecha de elaboración</span></div>
   <div class="card kpi"><b>${m.participantes.length}</b><span>participantes</span></div>
   <div class="card kpi"><b>${D.factors.length}</b><span>factores en el DAFO</span></div>
   <div class="card kpi"><b>${D.parties.length}</b><span>partes interesadas</span></div>
   <div class="card kpi"><b>${D.risks.length+D.opps.length}</b><span>riesgos y oportunidades (${D.risks.length} + ${D.opps.length})</span></div></div>
  <div class="card pad" style="max-width:560px"><h2>Datos generales <button class="btn ed" onclick="editar('meta','main')">✎ Editar</button></h2>
   <table><tbody><tr><th>Fecha de elaboración</th><td>${esc(fecha(m.fecha))}</td></tr>
   <tr><th>Participantes</th><td>${m.participantes.map(esc).join('<br>')||'<span class="mut">—</span>'}</td></tr></tbody></table></div>${cicloCard()}${copiasCard()}`;
}
const pl2=c=>c.toLowerCase().replace(/d$/,'des')+(/d$/.test(c)?'':'s');
// ---- Borrador de cambios en factores (Externo / Interno): nada se aplica hasta confirmar
let FD=null, FE={externo:[],interno:[]};
const fview=()=>FD||D.factors;
const fdStart=()=>{if(!FD){FD=JSON.parse(JSON.stringify(D.factors));FE={externo:[],interno:[]}}};
const fdDirty=()=>!!FD&&(JSON.stringify(FD)!==JSON.stringify(D.factors)||FE.externo.length>0||FE.interno.length>0);
const TABT={externo:['A','O'],interno:['D','F']};
function fdGrupo(id){const f=FD.find(x=>x.id===id);if(!f)return [];const tab=(TABT.externo.includes(f.tipo))?'externo':'interno';
  return FD.filter(x=>(x.cat||'')===(f.cat||'')&&x.texto===f.texto&&TABT[tab].includes(x.tipo))}
function fdToggle(id,w){if(RO)return;fdStart();const g=fdGrupo(id);if(!g.length)return;const tab=TABT.externo.includes(g[0].tipo)?'externo':'interno',t=TABT[tab][w];
  const ex=g.find(x=>x.tipo===t);
  if(ex){if(g.length===1){toast('Un factor necesita al menos una opción. Para quitarlo usa la papelera.',true);return}FD=FD.filter(x=>x.id!==ex.id)}
  else FD.push({id:nid('F'),tipo:t,texto:g[0].texto,cat:g[0].cat,proceso:g[0].proceso||''});
  render()}
function filasSoloDe(ids){return D.risks.filter(r=>riskFids(r).every(i=>ids.has(i))).length+D.opps.filter(o=>riskFids(o).every(i=>ids.has(i))).length}
function fdBorrarFactor(id){fdStart();const g=fdGrupo(id);if(!g.length)return;
  const n=filasSoloDe(new Set(g.map(f=>f.id)));
  if(!confirm(`¿Quitar este factor del aspecto?${n?`\n\nTiene ${n} riesgo(s)/oportunidad(es) enlazados que también se eliminarán al aplicar los cambios.`:''}`))return;
  const ids=new Set(g.map(f=>f.id));FD=FD.filter(f=>!ids.has(f.id));render()}
function fdBorrarAspecto(tab,cat){fdStart();const T=TABT[tab];const fs=FD.filter(f=>(f.cat||'(sin categoría)')===cat&&T.includes(f.tipo));
  const n=filasSoloDe(new Set(fs.map(f=>f.id)));
  if(!confirm(`¿Eliminar el aspecto «${cat}» con sus ${fs.length} factor(es)?${n?`\n\nImplica eliminar ${n} riesgo(s)/oportunidad(es) enlazados al aplicar los cambios.`:''}`))return;
  FD=FD.filter(f=>!((f.cat||'(sin categoría)')===cat&&T.includes(f.tipo)));FE[tab]=FE[tab].filter(c=>c!==cat);render()}
function fdDiff(){
  const m0=Object.fromEntries(D.factors.map(f=>[f.id,f])),m1=Object.fromEntries((FD||D.factors).map(f=>[f.id,f]));
  const nuevos=(FD||[]).filter(f=>!m0[f.id]),borr=D.factors.filter(f=>!m1[f.id]);
  const mod=(FD||[]).filter(f=>m0[f.id]&&JSON.stringify(f)!==JSON.stringify(m0[f.id]));
  const del=new Set(borr.map(f=>f.id));
  const rb=[],rm=[];
  for(const r of D.risks){const ids=riskFids(r),rest=ids.filter(i=>!del.has(i));
    if(!rest.length)rb.push(r);
    else if(rest.length<ids.length)rm.push({...r,fid:rest[0],fids:rest})}
  const ob=[],om=[];
  for(const o of D.opps){const ids=riskFids(o),rest=ids.filter(i=>!del.has(i));
    if(!rest.length)ob.push(o);
    else if(rest.length<ids.length)om.push({...o,fid:rest[0],fids:rest})}
  return {nuevos,borr,mod,rb,ob,rm,om};
}
function fdDialog(next){
  const d=fdDiff(),vacios=FE.externo.length+FE.interno.length;
  const li=(a,t)=>a.length?`<li><b>${a.length}</b> ${t}</li>`:'';
  document.getElementById('modal').innerHTML=`<div class="mbg"><div class="mbox" role="dialog">
   <h2>Hay cambios sin aplicar en los factores</h2>
   <p>Estos cambios afectan al resto de pestañas (DAFO, Riesgos, Oportunidades, Procesos, Coherencia…). ¿Quieres hacerlos efectivos?</p>
   <ul>${li(d.nuevos,'factor(es) nuevo(s)')}${li(d.mod,'factor(es) modificado(s)')}${li(d.borr,'factor(es) eliminado(s)')}
   ${d.rb.length||d.ob.length?`<li class="warn"><b>${d.rb.length}</b> riesgo(s) y <b>${d.ob.length}</b> oportunidad(es) enlazados se eliminarán también</li>`:''}
   ${vacios?`<li class="mut">${vacios} aspecto(s) nuevo(s) sin factores no se guardarán</li>`:''}</ul>
   <div class="mbtn"><button class="btn" onclick="fdSeguir()">Seguir editando</button><span style="flex:1"></span>
    <button class="btn danger" onclick="fdDeshacer()">Deshacer cambios</button><button class="btn pri" onclick="fdAplicar()">Aplicar cambios</button></div></div></div>`;
  FDNEXT=next||null;
}
let FDNEXT=null;
function fdSeguir(){FDNEXT=null;cerrar()}
function fdDeshacer(){FD=null;FE={externo:[],interno:[]};const n=FDNEXT;FDNEXT=null;cerrar();toast('Cambios deshechos');n?n():render()}
async function fdAplicar(){
  const d=fdDiff(),n=FDNEXT;FDNEXT=null;
  try{
    for(const f of d.nuevos.concat(d.mod))await api('PUT',`api/factors/${encodeURIComponent(f.id)}`,f);
    for(const r of d.rm)await api('PUT',`api/risks/${encodeURIComponent(r.id)}`,r);
    for(const o of d.om)await api('PUT',`api/opps/${encodeURIComponent(o.id)}`,o);
    for(const r of d.rb)await api('DELETE',`api/risks/${encodeURIComponent(r.id)}`);
    for(const o of d.ob)await api('DELETE',`api/opps/${encodeURIComponent(o.id)}`);
    for(const f of d.borr)await api('DELETE',`api/factors/${encodeURIComponent(f.id)}`);
    D.factors=FD;D.risks=D.risks.filter(r=>!d.rb.includes(r)).map(r=>d.rm.find(x=>x.id===r.id)||r);D.opps=D.opps.filter(o=>!d.ob.includes(o)).map(o=>d.om.find(x=>x.id===o.id)||o);
    FD=null;FE={externo:[],interno:[]};reindex();const nf=await asegurarFilas();cerrar();toast(nf?`Cambios aplicados · ${nf} fila(s) nuevas en Riesgos/Oportunidades`:'Cambios aplicados');n?n():render();
  }catch(e){FD=null;FE={externo:[],interno:[]};cerrar();toast('NO SE HAN APLICADO TODOS LOS CAMBIOS: '+e.message+'. Se han recargado los datos.',true);await boot()}
}
function irTab(t){
  if(fdDirty()&&t!==S.tab){fdDialog(()=>{S.tab=t;render()});return}
  if(!fdDirty())FD=null;
  S.tab=t;render();
}
window.addEventListener('beforeunload',e=>{if(fdDirty()){e.preventDefault();e.returnValue=''}});
function aspectoNuevo(tab){editar('aspecto',null,{tab})}
function aspectoRenombrar(tab,cat){editar('aspecto',tab+'|'+cat,{tab,nombre:cat,orig:cat})}
function factorNuevo(tab,cat){editar('fdraft',null,{tab,cat,texto:'',proceso:'',c0:true,c1:false})}
function factorEditar(id){const g=(FD||D.factors).filter(f=>f.id===id)[0];if(!g)return;
  fdStart();const grp=fdGrupo(id),tab=TABT.externo.includes(g.tipo)?'externo':'interno',T=TABT[tab];
  editar('fdraft',id,{tab,cat:g.cat,texto:g.texto,proceso:g.proceso||'',c0:grp.some(x=>x.tipo===T[0]),c1:grp.some(x=>x.tipo===T[1])})}

function matrizAspectos(tab,cols){
  const T=TABT[tab], fs=fview().filter(f=>T.includes(f.tipo));
  const cats=[...new Set([...fs.map(f=>f.cat||'(sin categoría)'),...FE[tab]])];
  const sinEv=fs.filter(f=>!evaluado(f)).length;
  const kk=(n,t,w)=>`<div class="card kpi"><b class="${w&&n?'warn':''}">${n}</b><span>${t}</span></div>`;
  const dirty=fdDirty();
  const q=c=>c.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');
  return `<div class="kpis">${kk(cats.length,'aspectos')}${kk(fs.length,'factores')}${kk(fs.filter(f=>f.tipo===T[0]).length,pl2(cols[0]))}${kk(fs.filter(f=>f.tipo===T[1]).length,pl2(cols[1]))}${kk(sinEv,'sin evaluar',1)}</div>
  <div class="bar"><button class="btn pri" onclick="aspectoNuevo('${tab}')">+ Nuevo aspecto</button>
   <span class="mut">Dentro de cada aspecto, «+ Factor» añade un factor nuevo. Pulsa en las columnas de la derecha para cambiar su tipo.</span></div>
  ${dirty?`<div class="pend"><b>Cambios sin aplicar.</b> No afectan a las demás pestañas hasta que los apliques.
    <span style="margin-left:auto"></span><button class="btn danger" onclick="FDNEXT=null;fdDeshacer()">Deshacer</button><button class="btn pri" onclick="fdDialog(null)">Revisar y aplicar…</button></div>`:''}
  ${plBar}<div class="card scroll"><table class="asp"><colgroup><col style="width:50%"><col style="width:11%"><col style="width:11%"><col style="width:28%"></colgroup>
  <thead><tr><th>Aspectos</th><th class="xx">${cols[0]}</th><th class="xx">${cols[1]}</th><th></th></tr></thead>
  ${cats.map(c=>{const l=fs.filter(f=>(f.cat||'(sin categoría)')===c);
    const txt=[...new Set(l.map(f=>f.texto))];
    const n0=l.filter(f=>f.tipo===T[0]).length,n1=l.filter(f=>f.tipo===T[1]).length;
    return `<tbody class="pl"><tr class="cat" onclick="this.parentNode.classList.toggle('shut')"><td><span class="chev"></span>${esc(c)} <span class="mut" style="font-weight:400">· ${txt.length}</span></td><td class="xx mut">${n0}</td><td class="xx mut">${n1}</td>
      <td class="xx" onclick="event.stopPropagation()"><button class="btn sm pri" onclick="factorNuevo('${tab}','${q(c)}')">+ Factor</button> <button class="btn sm" onclick="aspectoRenombrar('${tab}','${q(c)}')">Renombrar</button> <button class="btn sm danger" onclick="fdBorrarAspecto('${tab}','${q(c)}')">Eliminar</button></td></tr>
    ${txt.map(t=>{const g=l.filter(f=>f.texto===t),id=g[0].id;
      return `<tr class="it"><td>${esc(t)}</td><td class="xx tg" title="Clic para cambiar" onclick="fdToggle('${id}',0)">${g.some(f=>f.tipo===T[0])?'X':'·'}</td><td class="xx tg" title="Clic para cambiar" onclick="fdToggle('${id}',1)">${g.some(f=>f.tipo===T[1])?'X':'·'}</td>
      <td class="xx"><button class="btn sm" onclick="factorEditar('${id}')">Editar</button> <button class="btn sm danger" onclick="fdBorrarFactor('${id}')">Quitar</button></td></tr>`}).join('')}</tbody>`}).join('')}
  </table></div>`;
}
function externo(){return matrizAspectos('externo',['Amenaza','Oportunidad'])}
function interno(){return matrizAspectos('interno',['Debilidad','Fortaleza'])}

function flujo(){
  const dafoN=D.factors.length, ev=D.factors.filter(evaluado).length;
  const rk=D.risks, req=rk.filter(requiere), reqSin=req.filter(r=>!tieneAcc(r)&&!r.just);
  const cer=rk.filter(r=>r.estado==='Cerrada'), cerRes=cer.filter(r=>r.Rr!=null);
  const op=D.opps.filter(o=>o.V), opA=op.filter(tieneAcc);
  const step=(n,t,big,txt,w)=>`<div class="card step"><span class="n">${n}</span> <b>${t}</b><b class="big ${w?'warn':''}">${big}</b><span class="mut">${txt}</span></div>`;
  return `<p class="mut" style="margin-top:0">El recorrido de un factor, con los números actuales. Cada paso es una pestaña de la app.</p>
  <div class="flow">
   ${step(1,'Contexto (DAFO)',dafoN,'factores internos y externos, cada uno con su proceso PG/PS')}
   ${step(2,'Partes interesadas',D.parties.length,'grupos con necesidades, expectativas y requisitos')}
   ${step(3,'Evaluación',`${ev}/${dafoN}`,`factores evaluados. ${dafoN-ev} sin evaluar`,dafoN-ev>0)}
   ${step(4,'Decisión',req.length,`riesgos que exigen acción (R≥4 o G=3). ${reqSin.length} sin acción ni justificación`,reqSin.length>0)}
   ${step(5,'Seguimiento',rk.filter(r=>r.estado==='En curso').length,`en curso · ${rk.filter(r=>!r.estado).length} sin estado`,rk.filter(r=>!r.estado).length>0)}
   ${step(6,'Cierre con eficacia',`${cerRes.length}/${cer.length}`,'cerrados con R residual valorado',cer.length>cerRes.length)}
   ${step(7,'Oportunidades',`${opA.length}/${op.length}`,'valoradas que tienen acción definida')}
   ${step(8,'Revisión por la dirección','auto','los apartados 4.1, 4.2, 6.1 y eficacia salen de estos datos')}
  </div>
  <div class="card pad mt"><h2>Reglas de decisión propuestas</h2>
   <div class="rule"><b>R ≥ 4</b> → hay que definir acción, responsable y plazo.</div>
   <div class="rule"><b>G = 3</b> (aunque R sea bajo) → acción <u>o</u> justificación escrita de por qué no se actúa.</div>
   <div class="rule"><b>R de 1 a 3 con G &lt; 3</b> → se vigila en la revisión anual; puede no tener acción.</div>
   <div class="rule"><b>Cerrar</b> un riesgo → se valora P y G <u>residuales</u> tras la acción y se anota la eficacia. Si no baja, no está cerrado: se replantea la acción.</div>
   <div class="rule"><b>Proceso</b> → se elige una vez, en el factor del DAFO; riesgos y oportunidades lo heredan.</div>
  </div>`;
}

function criterios(){
  const ab=D.risks.filter(r=>abierto(r.estado));
  return `<div class="kpis">
   <div class="card kpi"><b>1–3</b><span>niveles en P, G, V y R</span></div>
   <div class="card kpi"><b>6</b><span>valores posibles de R (1, 2, 3, 4, 6, 9)</span></div>
   <div class="card kpi"><b>R ≥ 4</b><span>exige acción (o G=3 con justificación)</span></div>
   <div class="card kpi"><b>${D.risks.filter(requiere).length}</b><span>riesgos que lo cumplen hoy</span></div>
   <div class="card kpi"><b class="${ab.filter(r=>r.R>=6).length?'warn':''}">${ab.filter(r=>r.R>=6).length}</b><span>abiertos en rojo (R 6–9)</span></div></div>
  <div class="two">
  <div class="card pad"><h2>Riesgos: Probabilidad × Gravedad</h2>
   <p class="mut" style="margin-top:0">Escala 1–3 en cada eje. R = P × G (valores posibles: 1, 2, 3, 4, 6, 9).</p>
   <table><thead><tr><th>P</th><th>Definición (tu Excel)</th></tr></thead><tbody>
   <tr><td><b>1 Baja</b></td><td>No hay constancia de que haya ocurrido en el último año</td></tr>
   <tr><td><b>2 Media</b></td><td>Ha ocurrido en menos de 2 ocasiones en el último año</td></tr>
   <tr><td><b>3 Alta</b></td><td>Ha ocurrido en 2 o más ocasiones en el último año</td></tr></tbody></table>
   <table class="mt"><thead><tr><th>G</th><th>Definición (tu Excel)</th></tr></thead><tbody>
   <tr><td><b>3 Significativa</b></td><td>Afecta a la satisfacción de clientes, incumplimiento grave de requisito del sistema, incumplimiento legal, impacto en la cuenta de resultados…</td></tr>
   <tr><td><b>2 Media</b></td><td>Afecta a la eficacia de algún proceso sin incumplir requisitos; impacto medio en resultados</td></tr>
   <tr><td><b>1 Leve</b></td><td>No afecta al producto ni a la eficacia de procesos; apenas impacto en resultados</td></tr></tbody></table>
   <div class="rule mt"><b>Propuesta a validar:</b> para riesgos de contexto que nunca han ocurrido (legislación, mercado) usar una definición alternativa de P: <b>1</b> improbable en el horizonte de un año · <b>2</b> posible · <b>3</b> esperable. La de "ha ocurrido" se mantiene para riesgos operativos.</div>
  </div>
  <div class="card pad"><h2>Oportunidades: Viabilidad × Rentabilidad</h2>
   <p class="mut" style="margin-top:0">Escala 1–3: Baja = 1, Media = 2, Alta = 3. VR = V × R.</p>
   <div class="rule"><b>V×R = 9</b> → debe tener acción, o una justificación escrita de por qué no se aprovecha. Por debajo de 9 la acción es opcional.</div>
   <h3 class="mt">Semáforo que ya usas</h3>
   <p><span class="pill g">1–2 Bajo</span> <span class="pill y">3–5 Medio</span> <span class="pill r">6–9 Alto</span></p>
   <h3 class="mt">Matriz P×G</h3>
   <div class="heat"><span></span>${[1,2,3].map(g=>`<span style="text-align:center">G${g}</span>`).join('')}${[3,2,1].map(p=>`<span>P${p}</span>`+[1,2,3].map(g=>`<div class="cell ${lvl(p*g)}">${p*g}${g===3&&p*g<4?'*':''}</div>`).join('')).join('')}</div>
   <p class="mut" style="font-size:12px">* G=3 con R bajo: con la regla propuesta sigue exigiendo acción o justificación.</p>
   <h3 class="mt">Estados</h3>
   <p class="mut" style="margin:0"><b>En curso</b> · <b>Cerrada</b> (los dos de tu Excel). Sin estado = pendiente de decidir.</p>
  </div></div>`;
}

function plegar(v){document.querySelectorAll('details.pl').forEach(d=>d.open=v);document.querySelectorAll('tbody.pl').forEach(t=>t.classList.toggle('shut',!v))}
const plBar=`<div class="bar"><button class="btn keep" onclick="plegar(true)">Desplegar todo</button><button class="btn keep" onclick="plegar(false)">Plegar todo</button></div>`;
function dafo(){
  const m=D.meta, orden=[...Object.values(PROCS),'(sin proceso)'];
  const par=(a,b,ta,tb)=>{
    const cel=f=>{if(!f)return '<td></td><td></td>';const e=evaluado(f),neg=f.tipo==='D'||f.tipo==='A';
      const go=`onclick="evaluar('${f.id}')" title="Ir a su evaluación en ${neg?'Riesgos':'Oportunidades'}"`;
      const bd=e?(neg?`<span class="pill go ${lvl(e.R)}" ${go}>R ${e.R??'—'}</span>`:`<span class="pill go ${valorado(e)?lvl(e.VR):'n'}" ${go}>VR ${valorado(e)?e.VR:'—'}</span>`):`${fila0(f)?'<span class="pill n">pendiente de evaluar</span> ':''}<button class="btn" onclick="evaluar('${f.id}')">Evaluar →</button>`;
      return `<td>${esc(f.texto)} <button class="ed" title="Editar" onclick="editar('factor','${f.id}')">✎</button></td><td class="xx">${bd}</td>`};
    const grupos=orden.map(p=>{
      const A=D.factors.filter(f=>f.tipo===a&&okProc(f.proceso)&&proc(f.proceso)===p), B=D.factors.filter(f=>f.tipo===b&&okProc(f.proceso)&&proc(f.proceso)===p);
      if(!A.length&&!B.length)return '';
      const n=Math.max(A.length,B.length);
      return `<tbody class="pl"><tr class="cat" onclick="this.parentNode.classList.toggle('shut')"><td colspan="4"><span class="chev"></span>${esc(p)} <span class="mut" style="font-weight:400">· ${A.length} ${ta.toLowerCase()} · ${B.length} ${tb.toLowerCase()}</span></td></tr>
      ${Array.from({length:n},(_,k)=>`<tr class="it">${cel(A[k])}${cel(B[k])}</tr>`).join('')}</tbody>`}).join('');
    return `<div class="card scroll mt"><table class="asp"><colgroup><col style="width:38%"><col style="width:12%"><col style="width:38%"><col style="width:12%"></colgroup>
    <thead><tr><th style="color:${TIPOS[a].c}">${ta}</th><th class="xx">Eval. <span class="nuevo">nuevo</span></th><th style="color:${TIPOS[b].c}">${tb}</th><th class="xx">Eval. <span class="nuevo">nuevo</span></th></tr></thead>
    ${grupos||'<tbody><tr><td colspan="4" class="mut">Sin elementos para este proceso</td></tr></tbody>'}</table></div>`};
  return `<div class="bar"><span class="mut">Análisis de ${esc(fecha(m.fecha))||'—'}</span><span style="margin-left:auto">${procSel()}</span></div>
  ${plBar}${par('D','A','DEBILIDADES','AMENAZAS')}${par('F','O','FORTALEZAS','OPORTUNIDADES')}
  <p class="mut">El <b>proceso</b> es el capítulo plegable; "Evaluar" indica si el factor ya tiene fila en Riesgos u Oportunidades.</p>`;
}

function partes(){
  const g=[['externa','Externos'],['interna','Internos']];
  const sinReq=D.parties.filter(p=>!(p.requisitos||'').trim()).length, sinExp=D.parties.filter(p=>!(p.expectativas||'').trim()).length;
  return `<div class="kpis">
   <div class="card kpi"><b>${D.parties.length}</b><span>grupos de interés</span></div>
   <div class="card kpi"><b>${D.parties.filter(p=>p.tipo==='externa').length}</b><span>externos</span></div>
   <div class="card kpi"><b>${D.parties.filter(p=>p.tipo==='interna').length}</b><span>internos</span></div>
   <div class="card kpi"><b class="${sinReq?'warn':''}">${sinReq}</b><span>sin requisitos para el sistema</span></div>
   <div class="card kpi"><b class="${sinExp?'warn':''}">${sinExp}</b><span>sin expectativas</span></div></div>`+`<div class="bar"><button class="btn keep" onclick="plegar(true)">Desplegar todo</button><button class="btn keep" onclick="plegar(false)">Plegar todo</button><button class="btn pri" style="margin-left:auto" onclick="editar('party',null)">+ Añadir grupo de interés</button></div>`+`<div class="card scroll"><table class="asp"><colgroup><col style="width:16%"><col style="width:28%"><col style="width:28%"><col style="width:28%"></colgroup>
  <thead><tr><th>Grupos de interés</th><th>Necesidades</th><th>Expectativas</th><th>Requisitos para el Sistema</th></tr></thead>
  ${g.map(([k,n])=>{const l=D.parties.filter(p=>p.tipo===k);
    return `<tbody class="pl"><tr class="cat" onclick="this.parentNode.classList.toggle('shut')"><td colspan="4"><span class="chev"></span>${n} <span class="mut" style="font-weight:400">· ${l.length}</span></td></tr>
    ${l.map(p=>`<tr class="it"><td><b>${esc(p.nombre)}</b> <button class="ed" title="Editar" onclick="editar('party','${p.id}')">✎</button></td><td>${nl(p.necesidades)||'<span class="mut">—</span>'}</td><td>${nl(p.expectativas)||'<span class="mut">—</span>'}</td><td>${nl(p.requisitos)||'<span class="mut">—</span>'}</td></tr>`).join('')}</tbody>`}).join('')}
  </table></div>`;
}
function porProc(l,key,cols,fn,abiertoFn){
  const orden=[...Object.values(PROCS),'(sin proceso)'];
  const gs=orden.map(p=>[p,l.filter(x=>proc(key(x))===p)]).filter(([,v])=>v.length);
  return gs.map(([p,v])=>`<tbody class="pl"><tr class="cat" onclick="this.parentNode.classList.toggle('shut')"><td colspan="${cols}"><span class="chev"></span>${esc(p)} <span class="mut" style="font-weight:400">· ${v.length}${abiertoFn?` · ${v.filter(abiertoFn).length} abiertos`:''}</span></td></tr>${v.map(x=>fn(x).replace(/<tr(?=[ >])/g,'<tr class="it"')).join('')}</tbody>`).join('')||`<tbody><tr><td colspan="${cols}" class="mut">Sin elementos con este filtro</td></tr></tbody>`;
}
function ordenSel(){return `<select class="keep" onchange="S.orden=this.value;render()"><option value="excel" ${S.orden==='excel'?'selected':''}>Orden original</option><option value="R" ${S.orden==='R'?'selected':''}>Mayor R primero</option></select>`}
function riesgos(){
  const idx=D.risks.map((r,i)=>[r,i]);
  const l=idx.filter(([r])=>okProc(rp(r))&&(S.estado==='todos'||(S.estado==='abiertos'?abierto(r.estado):r.estado===S.estado)));
  if(S.orden==='R')l.sort((a,b)=>(b[0].R||0)-(a[0].R||0));
  const abiertos=D.risks.filter(r=>abierto(r.estado)&&okProc(rp(r)));
  const sel=(i,f,cur,opts)=>`<select onchange="setR(${i},'${f}',this.value)">${opts.map(o=>`<option value="${o}" ${String(cur??'')===String(o)?'selected':''}>${o===''?'–':o}</option>`).join('')}</select>`;
  const selA=(i,j,cur)=>`<select onchange="setAcc('risks',${i},${j},'estado',this.value)">${ESTADOS.map(o=>`<option value="${o}" ${(cur||'')===o?'selected':''}>${o===''?'–':o}</option>`).join('')}</select>`;
  const sinAccion=D.risks.filter(r=>requiere(r)&&!tieneAcc(r)&&!r.just).length;
  const fila=([r,i])=>{
    const A=accs(r).length?accs(r):[null], n=A.length, rs=n>1?` rowspan="${n}"`:'';
    const g3=r.G===3&&r.R<4;
    const sinVal=!r.P||!r.G;
    const regla=sinVal?`<span class="todo" style="padding:2px 6px">valora P y G</span>`:g3?`<span class="amb">G=3: acción o justificar</span>`:(requiere(r)?`<span class="amb">R≥4: acción</span>`:'<span class="mut">vigilar</span>');
    const falta=(requiere(r)&&!tieneAcc(r)&&!r.just)?`<div class="todo" style="padding:2px 6px">falta acción${g3?' o justificación':''}</div>`:'';
    const cierreSinRes=r.estado==='Cerrada'&&r.Rr==null;
    return A.map((a,j)=>{
      const first=j===0, last=j===n-1;
      const add=last?`<div><button class="ed" onclick="editar('risk','${r.id}',{addAcc:1})">+ acción</button></div>`:'';
      const left=first?`<td${rs}><b>${esc(rt(r))}</b> <button class="ed" title="Editar" onclick="editar('risk','${r.id}')">✎</button>${riskFids(r).length>1?`<div class="meta" title="El mismo riesgo aparece como debilidad y como amenaza en el DAFO: se evalúa una sola vez">${riskFids(r).map(i=>fm[i]?`<span class="tag">${SING[fm[i].tipo]} · ${esc(fm[i].cat||'sin aspecto')}</span>`:'').join('')}</div>`:''}</td><td${rs}>${esc(r.causa)}</td><td${rs}>${esc(r.efecto)}</td>
        <td${rs}>${sel(i,'P',r.P,['',1,2,3])}</td><td${rs}>${sel(i,'G',r.G,['',1,2,3])}</td><td${rs}><span class="pill ${lvl(r.R)}">${r.R??'—'}</span>${r.prev&&r.prev.R!=null?`<div class="prev">antes: P${r.prev.P}·G${r.prev.G}=${r.prev.R}</div>`:''}</td>`:'';
      const mid=a?`<td>${nl(a.accion)||(first?falta:'')||'<span class="mut">—</span>'}${first&&requiere(r)&&!tieneAcc(r)?`<input class="j" placeholder="Justificación…" value="${esc(r.just||'')}" onchange="setR(${i},'just',this.value)">`:''}${add}</td><td>${esc(a.resp)}</td>
        <td style="color:${vencidoA(a)?'var(--bad)':''}">${esc(fecha(a.plazo))}${vencidoA(a)?'<div style="font-size:11px">vencida</div>':''}</td>
        <td>${selA(i,j,a.estado)}</td><td style="color:var(--muted)">${nl(a.coment)}</td>`
        :`<td>${falta||'<span class="mut">—</span>'}${requiere(r)?`<input class="j" placeholder="Justificación…" value="${esc(r.just||'')}" onchange="setR(${i},'just',this.value)">`:''}${add}</td><td></td><td></td><td>${sel(i,'estado',r.estado,ESTADOS)}</td><td></td>`;
      const right=first?`<td${rs}>P' ${sel(i,'Pr',r.Pr,['',1,2,3])}<br>G' ${sel(i,'Gr',r.Gr,['',1,2,3])} ${r.Rr!=null?`<span class="pill ${lvl(r.Rr)}">${r.Rr}</span>`:''}
        ${cierreSinRes?'<div class="todo" style="padding:2px 6px;margin-top:4px">cerrado sin residual</div>':''}</td><td${rs}>${regla}</td>`:'';
      return `<tr data-rid="${r.id}">${left}${mid}${right}</tr>`}).join('');
  };
  return `<div class="kpis">
   <div class="card kpi"><b>${D.risks.length}</b><span>riesgos</span></div>
   <div class="card kpi"><b>${D.risks.filter(r=>r.estado==='En curso').length}</b><span>en curso</span></div>
   <div class="card kpi"><b>${D.risks.filter(r=>r.estado==='Cerrada').length}</b><span>cerrados</span></div>
   <div class="card kpi"><b class="${D.risks.filter(r=>!r.estado).length?'warn':''}">${D.risks.filter(r=>!r.estado).length}</b><span>sin estado</span></div>
   <div class="card kpi"><b class="${sinAccion?'warn':''}">${sinAccion}</b><span>exigen acción y no la tienen</span></div>
   <div class="card kpi"><b class="${D.risks.filter(r=>!r.P||!r.G).length?'warn':''}">${D.risks.filter(r=>!r.P||!r.G).length}</b><span>sin valorar (P o G vacíos)</span></div></div>
  <div class="bar"><select class="keep" onchange="S.estado=this.value;render()">${['abiertos','En curso','Cerrada','todos'].map(e=>`<option ${S.estado===e?'selected':''}>${e}</option>`).join('')}</select>${procSel()}${ordenSel()}
   <button class="btn" onclick="editar('risk',null)">+ Añadir riesgo</button></div>
  ${plBar}<div class="card scroll"><table class="asp fit"><colgroup>${[11.5,9,8,5.5,5.5,3.5,14,7,5,6.5,11.5,6,6.5].map(w=>`<col style="width:${w}%">`).join('')}</colgroup><thead><tr><th>Factor de riesgo</th><th>Causa</th><th>Efecto</th><th>P<small>probabilidad</small></th><th>G<small>gravedad</small></th><th>R</th><th>Acción</th><th>Responsable</th><th>Plazo</th><th>Estado</th><th>Comentarios</th><th>Residual P'×G' <span class="nuevo">nuevo</span></th><th>Regla <span class="nuevo">nuevo</span></th></tr></thead>
  ${porProc(l,x=>rp(x[0]),13,fila,x=>abierto(x[0].estado))}
  </table></div>
  <div class="card pad mt">${matriz3('Matriz P × G (riesgos abiertos)','G','P',abiertos,'G','P')}</div>`;
}

function oport(){
  const idx=D.opps.map((o,i)=>[o,i]);
  const l=idx.filter(([o])=>okProc(rp(o))&&(S.estado==='todos'||(S.estado==='abiertos'?abierto(o.estado):o.estado===S.estado)));
  if(S.orden==='R')l.sort((a,b)=>(b[0].VR||0)-(a[0].VR||0));
  const sel=(i,f,cur,opts)=>`<select onchange="setO(${i},'${f}',this.value)">${opts.map(o=>`<option value="${o}" ${String(cur??'')===String(o)?'selected':''}>${o===''?'–':o}</option>`).join('')}</select>`;
  const selA=(i,j,cur)=>`<select onchange="setAcc('opps',${i},${j},'estado',this.value)">${ESTADOS.map(o=>`<option value="${o}" ${(cur||'')===o?'selected':''}>${o===''?'–':o}</option>`).join('')}</select>`;
  const sinVal=D.opps.filter(o=>(!o.V||!o.R)&&tieneAcc(o)).length, sinEst=D.opps.filter(o=>!o.estado).length;
  const sinAccO=D.opps.filter(o=>requiereO(o)&&!tieneAcc(o)&&!o.just).length;
  const fila=([o,i])=>{
    const A=accs(o).length?accs(o):[null], n=A.length, rs=n>1?` rowspan="${n}"`:'';
    return A.map((a,j)=>{
      const first=j===0, last=j===n-1;
      const add=last?`<div><button class="ed" onclick="editar('opp','${o.id}',{addAcc:1})">+ acción</button></div>`:'';
      const l0=first?`<td${rs}><b>${esc(rt(o))}</b> <button class="ed" title="Editar" onclick="editar('opp','${o.id}')">✎</button>${riskFids(o).length>1?`<div class="meta" title="La misma frase está como fortaleza y como oportunidad en el DAFO: se evalúa una sola vez">${riskFids(o).map(i=>fm[i]?`<span class="tag">${SING[fm[i].tipo]} · ${esc(fm[i].cat||'sin aspecto')}</span>`:'').join('')}</div>`:''}</td>`:'';
      const falta=(requiereO(o)&&!tieneAcc(o)&&!o.just)?`<div class="todo" style="padding:2px 6px">falta acción o justificación (V×R = 9)</div>`:'';
      const just=(requiereO(o)&&!tieneAcc(o))?`<input class="j" placeholder="Justificación…" value="${esc(o.just||'')}" onchange="setO(${i},'just',this.value)">`:'';
      const ac=a?`<td>${nl(a.accion)||(first?falta:'')||'<span class="mut">—</span>'}${first&&!tieneAcc(o)?just:''}${add}</td>`:`<td>${falta||'<span class="mut">—</span>'}${just}${add}</td>`;
      const vr=first?`<td${rs}>${sel(i,'V',o.V,['',1,2,3])}</td><td${rs}>${sel(i,'R',o.R,['',1,2,3])}</td><td${rs}><span class="pill ${lvl(o.VR)}">${o.VR??0}</span>${o.prev&&o.prev.VR?`<div class="prev">antes: V${o.prev.V}·R${o.prev.R}=${o.prev.VR}</div>`:''}</td>`:'';
      const rest=a?`<td>${esc(a.resp)}</td><td style="color:${vencidoA(a)?'var(--bad)':''}">${esc(fecha(a.plazo))}${vencidoA(a)?'<div style="font-size:11px">vencida</div>':''}</td><td>${selA(i,j,a.estado)}</td><td style="color:var(--muted)">${nl(a.coment)}</td>`
        :`<td></td><td></td><td>${sel(i,'estado',o.estado,ESTADOS)}</td><td></td>`;
      return `<tr data-rid="${o.id}">${l0}${ac}${vr}${rest}</tr>`}).join('');
  };
  return `<div class="kpis">
   <div class="card kpi"><b>${D.opps.length}</b><span>oportunidades</span></div>
   <div class="card kpi"><b>${D.opps.filter(o=>o.estado==='En curso').length}</b><span>en curso</span></div>
   <div class="card kpi"><b>${D.opps.filter(o=>o.estado==='Cerrada').length}</b><span>cerradas</span></div>
   <div class="card kpi"><b class="${sinEst?'warn':''}">${sinEst}</b><span>sin estado</span></div>
   <div class="card kpi"><b class="${sinVal?'warn':''}">${sinVal}</b><span>con acción y sin valorar (V o R vacíos)</span></div>
   <div class="card kpi"><b class="${sinAccO?'warn':''}">${sinAccO}</b><span>V×R = 9 sin acción ni justificación</span></div></div>
  <div class="bar"><select class="keep" onchange="S.estado=this.value;render()">${['abiertos','En curso','Cerrada','todos'].map(e=>`<option ${S.estado===e?'selected':''}>${e}</option>`).join('')}</select>${procSel()}${ordenSel()}
   <button class="btn" onclick="editar('opp',null)">+ Añadir oportunidad</button></div>
  ${plBar}<div class="card scroll"><table class="asp fit"><colgroup>${[17,22,6.5,7.5,5,9,6,7,20].map(w=>`<col style="width:${w}%">`).join('')}</colgroup><thead><tr><th>Factor de oportunidad</th><th>Acciones</th><th>V<small>viabilidad</small></th><th>R<small>rentabilidad</small></th><th>V*R</th><th>Responsable</th><th>Plazo</th><th>Estado</th><th>Comentarios</th></tr></thead>
  ${porProc(l,x=>rp(x[0]),9,fila,x=>abierto(x[0].estado))}
  </table></div>
  <div class="card pad mt">${matriz3('Matriz V × R (oportunidades abiertas valoradas)','R','V',D.opps.filter(o=>abierto(o.estado)&&o.V&&o.R),'R','V')}</div>`;
}

function procesosTab(){
  const filas=Object.values(PROCS).map(p=>{
    const f=D.factors.filter(x=>proc(x.proceso)===p);
    const r=D.risks.filter(x=>proc(rp(x))===p), o=D.opps.filter(x=>proc(rp(x))===p);
    return `<tr><td><b>${esc(p)}</b></td><td>${f.filter(x=>x.tipo==='D').length}</td><td>${f.filter(x=>x.tipo==='A').length}</td><td>${f.filter(x=>x.tipo==='F').length}</td><td>${f.filter(x=>x.tipo==='O').length}</td><td>${r.filter(x=>abierto(x.estado)).length}/${r.length}</td><td>${o.length}</td></tr>`}).join('');
  const nProc=Object.values(PROCS).length, conF=Object.values(PROCS).filter(p=>D.factors.some(x=>proc(x.proceso)===p)).length;
  const rAb=D.risks.filter(x=>abierto(x.estado)).length, oAb=D.opps.filter(x=>abierto(x.estado)).length;
  return `<div class="kpis">
   <div class="card kpi"><b>${nProc}</b><span>procesos (PG/PS)</span></div>
   <div class="card kpi"><b>${conF}</b><span>con factores en el DAFO</span></div>
   <div class="card kpi"><b class="${nProc-conF?'warn':''}">${nProc-conF}</b><span>sin ningún factor</span></div>
   <div class="card kpi"><b>${rAb}</b><span>riesgos abiertos</span></div>
   <div class="card kpi"><b>${oAb}</b><span>oportunidades abiertas</span></div></div>
  <div class="card pad"><h2>Carga por proceso</h2>
   <table><thead><tr><th>Proceso</th><th>D</th><th>A</th><th>F</th><th>O</th><th>Riesgos abiertos/total</th><th>Oport.</th></tr></thead><tbody>${filas}</tbody></table>
   <p class="mut" style="font-size:12px">Los procesos sin ningún factor en el DAFO salen a cero: puede ser correcto o un hueco del análisis.</p></div>`;
}

function objetivos(){
  const O=D.objs;
  const vacios=O.filter(o=>!o.objetivo).length;
  const def=O.filter(o=>o.objetivo), sinAcc=def.filter(o=>!o.acciones).length, conRes=def.filter(o=>o.t.some(Boolean)).length;
  return `<div class="kpis">
   <div class="card kpi"><b>${O.length}</b><span>líneas en ${esc(CICLO)}</span></div>
   <div class="card kpi"><b>${def.length}</b><span>objetivos definidos</span></div>
   <div class="card kpi"><b class="${vacios?'warn':''}">${vacios}</b><span>por completar</span></div>
   <div class="card kpi"><b class="${sinAcc?'warn':''}">${sinAcc}</b><span>definidos sin acciones</span></div>
   <div class="card kpi"><b>${conRes}/${def.length}</b><span>con resultado trimestral</span></div></div>
  <div class="bar"><span class="mut">Objetivos del ciclo ${esc(CICLO)}</span><button class="btn" style="margin-left:auto" onclick="editar('obj',null)">+ Añadir línea</button></div>
  ${plBar}<div class="card scroll"><table class="asp fit"><colgroup>${[18,25,14,8,7,7,5.25,5.25,5.25,5.25].map(w=>`<col style="width:${w}%">`).join('')}</colgroup>
  <thead><tr><th>Objetivo</th><th>Acciones</th><th>Indicador</th><th>Resp.</th><th>Ref.</th><th>Plazo</th><th>T1</th><th>T2</th><th>T3</th><th>T4</th></tr></thead>
  ${[...new Set(O.map(o=>o.origen))].map(g=>{const l=O.filter(o=>o.origen===g),pend=l.filter(o=>!o.objetivo).length;
    return `<tbody class="pl"><tr class="cat" onclick="this.parentNode.classList.toggle('shut')"><td colspan="10"><span class="chev"></span>${esc(g)} <span class="mut" style="font-weight:400">· ${l.length} líneas${pend?` · <b class="warn">${pend} por completar</b>`:''}</span></td></tr>
    ${l.map(o=>`<tr class="it"><td>${o.objetivo?`<b>${esc(o.objetivo)}</b>`:'<span class="todo">por completar</span>'} <button class="ed" title="Editar" onclick="editar('obj','${o.id}')">✎</button></td>
     <td>${o.acciones?nl(o.acciones):(o.objetivo?'<span class="todo">sin acciones</span>':'')}</td>
     <td>${esc(o.indicador)}</td><td>${esc(o.resp)}</td><td>${esc(o.ref)}</td><td>${esc(fecha(o.plazo))}</td>
     ${o.t.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody>`}).join('')}
  </table></div>
  ${O.some(o=>o.res.some(Boolean)||o.seg)?`<div class="card pad mt"><h2>Seguimiento de ${esc(CICLO)} (observaciones)</h2>${O.filter(o=>o.res.some(Boolean)||o.seg).map(o=>`<details open><summary><b>${esc(o.objetivo)}</b></summary><div class="body">${o.res.map((r,i)=>r?`<p><span class="tag">T${i+1}</span> ${esc(r)}</p>`:'').join('')}${o.seg?`<p><b>Conclusión:</b> ${esc(o.seg)}</p>`:''}</div></details>`).join('')}</div>`:''}`;
}

// ================= Revisión por la Dirección: textos, imágenes y Word =================
const REV={anio:String(new Date().getFullYear()-1),texto:{},imgs:[]};
const revT=k=>REV.texto[REV.anio+':'+k]||'';
const revI=k=>REV.imgs.filter(im=>im.anio===REV.anio&&im.key===k);
function revSecs(){
  const cnt=t=>D.factors.filter(f=>f.tipo===t).length;
  const ab=D.risks.filter(r=>abierto(r.estado)), cer=D.risks.filter(r=>r.estado==='Cerrada');
  const oab=D.opps.filter(o=>abierto(o.estado)&&tieneAcc(o)), ocer=D.opps.filter(o=>o.estado==='Cerrada');
  const O=D.objs.filter(o=>o.objetivo);
  const porProc=Object.entries(D.factors.reduce((a,f)=>(a[proc(f.proceso)]=(a[proc(f.proceso)]||0)+1,a),{})).sort((a,b)=>b[1]-a[1]).map(([p,n])=>`${p} (${n})`).join(', ');
  const P=(s)=>({t:'p',s}), L=(s)=>({t:'li',s}), T=(head,rows)=>({t:'table',head,rows});
  const man=(k,t,nota,grupo)=>({k,t,auto:false,nota:nota||'',lines:[],grupo});
  const aut=(k,t,lines,grupo)=>({k,t,auto:true,lines,grupo});
  return [
   man('ss','Seguridad y Salud','',1),man('ma','Medio Ambiente','',1),man('ca','Calidad','',1),man('cm','Cuadro de Mando','',1),man('ee','Eficiencia energética','',1),
   man('cl','Cumplimiento legal','Candidato a módulo propio (evaluación de cumplimiento legal).',1),
   aut('obj','Cumplimiento de los objetivos',[P(`${O.length} objetivos definidos para ${REV.anio}. Resultado por trimestre:`),T(['Objetivo','Indicador','T1','T2','T3','T4'],O.map(o=>[o.objetivo,o.indicador||'',...o.t.map(x=>x||'')]))]),
   man('aud','Auditorías'),man('for','Formación'),man('com','Comunicación, participación y consulta'),man('prov','Desempeño de los proveedores externos'),
   aut('acc','Estado de las acciones de revisiones por la dirección previas',(()=>{
     const f=[];for(const r of ab)accs(r).filter(a=>a.accion).forEach(a=>f.push([`Riesgo: ${rt(r)}`,a]));for(const o of oab)accs(o).filter(a=>a.accion).forEach(a=>f.push([`Oportunidad: ${rt(o)}`,a]));
     const v=f.filter(([,a])=>vencidoA(a)).length;
     return [P(`${ab.length} riesgos abiertos y ${oab.length} oportunidades con acción abierta (${f.length} acciones${v?`, ${v} con plazo vencido`:''}):`),...f.map(([t,a])=>L(`${t} — ${a.accion.split('\n')[0]} · ${a.resp||'sin responsable'} · ${fecha(a.plazo)||'sin plazo'} · ${a.estado||'sin estado'}`))]})()),
   man('rec','Adecuación de los recursos'),man('camb','Cambios que pueden afectar al Sistema'),
   aut('ctx','Cuestiones internas y externas',[P(`DAFO del ${fecha(D.meta.fecha)}: ${cnt('D')} debilidades, ${cnt('A')} amenazas, ${cnt('F')} fortalezas y ${cnt('O')} oportunidades.`),P(`Por proceso: ${porProc}.`)]),
   aut('par','Necesidades y expectativas de las partes interesadas',[P(`${D.parties.length} grupos de interés (${D.parties.filter(p=>p.tipo==='externa').length} externos, ${D.parties.filter(p=>p.tipo==='interna').length} internos):`),T(['Grupo de interés','Necesidades','Expectativas'],D.parties.map(p=>[p.nombre,p.necesidades||'',p.expectativas||'']))]),
   aut('ryo','Riesgos y oportunidades',[P(`Riesgos: ${D.risks.length} (${ab.length} abiertos, ${cer.length} cerrados). Abiertos con R alto (6–9): ${ab.filter(r=>r.R>=6).length}.`),P(`Oportunidades: ${D.opps.length} (${D.opps.filter(o=>o.V).length} valoradas, ${ocer.length} cerradas).`)]),
   man('asp','Aspectos ambientales significativos','Viene de la evaluación de aspectos ambientales (fuera de este módulo).'),
   aut('efi','Eficacia de las acciones para abordar riesgos y oportunidades',[P(`${cer.length} riesgos cerrados; ${cer.filter(r=>r.Rr!=null).length} con riesgo residual valorado.`),T(['Riesgo','R inicial','R residual','Comentario'],cer.map(r=>[rt(r),r.R!=null?String(r.R):'—',r.Rr!=null?String(r.Rr):'sin valorar',accs(r).map(a=>a.coment).filter(Boolean).join(' / ').slice(0,160)]))]),
   man('con','Conclusiones'),man('conv','Conveniencia, adecuación y eficacia continuas del sistema'),man('mej','Oportunidades de mejora / necesidad de cambios')];
}
const revVacia=s=>!revT(s.k).trim()&&!revI(s.k).length;

// ---------- escritura de .docx (zip sin compresión, sin librerías)
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
const crc32=u=>{let c=0xFFFFFFFF;for(let i=0;i<u.length;i++)c=CRC[(c^u[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0};
function zipStore(files){
  const enc=new TextEncoder(),parts=[],cen=[];let off=0;
  const d=new Date(),dt=((d.getFullYear()-1980)<<9|(d.getMonth()+1)<<5|d.getDate())&0xFFFF,tm=(d.getHours()<<11|d.getMinutes()<<5|d.getSeconds()>>1)&0xFFFF;
  for(const f of files){
    const nm=enc.encode(f.name),dat=typeof f.data==='string'?enc.encode(f.data):f.data,crc=crc32(dat);
    const lh=new DataView(new ArrayBuffer(30));
    lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);lh.setUint16(8,0,true);lh.setUint16(10,tm,true);lh.setUint16(12,dt,true);
    lh.setUint32(14,crc,true);lh.setUint32(18,dat.length,true);lh.setUint32(22,dat.length,true);lh.setUint16(26,nm.length,true);lh.setUint16(28,0,true);
    parts.push(new Uint8Array(lh.buffer),nm,dat);
    const ch=new DataView(new ArrayBuffer(46));
    ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x0800,true);ch.setUint16(10,0,true);ch.setUint16(12,tm,true);ch.setUint16(14,dt,true);
    ch.setUint32(16,crc,true);ch.setUint32(20,dat.length,true);ch.setUint32(24,dat.length,true);ch.setUint16(28,nm.length,true);ch.setUint32(42,off,true);
    cen.push(new Uint8Array(ch.buffer),nm);
    off+=30+nm.length+dat.length;
  }
  const cs=cen.reduce((a,b)=>a+b.length,0),end=new DataView(new ArrayBuffer(22));
  end.setUint32(0,0x06054b50,true);end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);end.setUint32(12,cs,true);end.setUint32(16,off,true);
  const all=[...parts,...cen,new Uint8Array(end.buffer)],out=new Uint8Array(off+cs+22);let p=0;for(const a of all){out.set(a,p);p+=a.length}return out;
}
const b64u8=b=>{const s=atob(b),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u};
const X=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const FONT='<w:rFonts w:ascii="Roboto Light" w:hAnsi="Roboto Light" w:cs="Arial"/>';
const wr=(s,o={})=>`<w:r><w:rPr>${FONT}${o.b?'<w:b/>':''}${o.u?'<w:u w:val="single"/>':''}${o.i?'<w:i/>':''}${o.c?`<w:color w:val="${o.c}"/>`:''}<w:sz w:val="${o.sz||22}"/><w:szCs w:val="${o.sz||22}"/></w:rPr><w:t xml:space="preserve">${X(s)}</w:t></w:r>`;
const wp=(inner,o={})=>`<w:p><w:pPr>${o.style?`<w:pStyle w:val="${o.style}"/>`:''}${o.keep?'<w:keepNext/>':''}${o.pb?'<w:pageBreakBefore/>':''}<w:spacing w:before="${o.before??120}" w:after="${o.after??0}"/>${o.ind?`<w:ind w:left="${o.ind}" w:hanging="${o.hang||0}"/>`:''}<w:jc w:val="${o.jc||'both'}"/></w:pPr>${inner}</w:p>`;
const wtxt=(s,o={})=>String(s||'').split(/\n+/).filter(x=>x.trim()).map(x=>wp(wr(x,o.r||{}),o)).join('');
function wtable(head,rows,widths){
  const W=8504,tot=widths.reduce((a,b)=>a+b,0),w=widths.map(x=>Math.round(x*W/tot));
  const cell=(t,i,h)=>`<w:tc><w:tcPr><w:tcW w:w="${w[i]}" w:type="dxa"/>${h?'<w:shd w:val="clear" w:color="auto" w:fill="D9E2EC"/>':''}</w:tcPr>${String(t||'').split(/\n+/).filter(Boolean).concat(String(t||'').trim()?[]:['']).map(x=>wp(wr(x,{b:h,sz:18}),{before:20,after:20,jc:'left'})).join('')}</w:tc>`;
  const b=['top','left','bottom','right','insideH','insideV'].map(s=>`<w:${s} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/><w:tblBorders>${b}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="70" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar></w:tblPr>
  <w:tblGrid>${w.map(x=>`<w:gridCol w:w="${x}"/>`).join('')}</w:tblGrid>
  <w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${head.map((h,i)=>cell(h,i,true)).join('')}</w:tr>
  ${rows.map(r=>`<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((c,i)=>cell(c,i,false)).join('')}</w:tr>`).join('')}</w:tbl>${wp('',{before:60})}`;
}
const NS='xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
function wimg(rid,id,w,h,maxW=5400000){ // cm→EMU: 15 cm útiles
  let cx=Math.round(w*9525),cy=Math.round(h*9525);if(cx>maxW){cy=Math.round(cy*maxW/cx);cx=maxW}
  return wp(`<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Imagen ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="Imagen ${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`,{jc:'center',before:120,after:60});
}
async function buildDocx(){
  const secs=revSecs(),media=[],rels=[];
  let n=0,body='';
  const tit=`REVISIÓN POR LA DIRECCIÓN ${REV.anio}`;
  body+=wp(wr('Índice',{sz:28}),{before:120,jc:'left'});
  const idx=[];let num=1;
  idx.push([`${num}. Desempeño`,0]);secs.filter(s=>s.grupo).forEach(s=>idx.push([s.t,1]));
  secs.filter(s=>!s.grupo).forEach(s=>{num++;idx.push([`${num}. ${s.t}`,0])});
  idx.forEach(([t,l])=>{body+=wp(wr(t,{b:!l}),{before:40,ind:l?567:0,jc:'left'})});
  num=1;let first=true;
  const sec=async s=>{
    for(const l of s.lines)
      if(l.t==='p')body+=wtxt(l.s,{});
      else if(l.t==='li')body+=wp(wr('•\t'+l.s),{ind:567,hang:283,before:40});
      else if(l.t==='table'){const k=l.head.length,wd=k===6?[34,26,10,10,10,10]:k===4?[34,10,10,46]:[28,36,36];body+=wtable(l.head,l.rows,wd)}
    const tx=revT(s.k).trim();
    if(tx)body+=wtxt(tx,{});
    for(const im of revI(s.k)){
      n++;const rid='rIdM'+n,name=`image${n}.png`;media.push({name:'word/media/'+name,data:new Uint8Array(await (await fetch('api/img/'+im.id)).arrayBuffer())});rels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`);
      body+=wimg(rid,100+n,im.w,im.h);
    }
    if(!s.lines.length&&!tx&&!revI(s.k).length)body+=wp(wr('(Apartado sin cumplimentar)',{i:true,c:'808080'}),{});
  };
  body+=wp(wr('1. Desempeño',{b:true}),{style:'Heading1',pb:true,keep:true,before:240,jc:'left'});
  for(const s of secs.filter(s=>s.grupo)){body+=wp(wr(s.t+':',{u:true}),{keep:true,before:200,jc:'left'});await sec(s)}
  for(const s of secs.filter(s=>!s.grupo)){num++;body+=wp(wr(`${num}. ${s.t}`,{b:true}),{style:'Heading1',keep:true,before:320,jc:'left'});await sec(s)}
  const logoBytes=new Uint8Array(await (await fetch('winoa-docx-logo.jpg')).arrayBuffer());
  body+=wp(wr(`Documento generado desde SGI el ${new Date().toLocaleDateString('es-ES')}.`,{i:true,c:'808080',sz:18}),{before:400,jc:'left'});
  const doc=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:footerReference w:type="default" r:id="rIdF"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1701" w:bottom="1418" w:left="1701" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const HF='<w:rFonts w:ascii="Roboto Light" w:hAnsi="Roboto Light" w:cs="Arial"/>';
  const hr=t=>`<w:r><w:rPr>${HF}<w:sz w:val="28"/><w:szCs w:val="28"/><w:lang w:val="es-ES"/></w:rPr><w:t xml:space="preserve">${X(t)}</w:t></w:r>`;
  const hpar=inner=>`<w:p><w:pPr><w:pStyle w:val="Encabezado"/><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr>${inner}</w:p>`;
  const hc=(w,inner,span)=>`<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span?`<w:gridSpan w:val="${span}"/>`:''}<w:vAlign w:val="center"/></w:tcPr>${inner}</w:tc>`;
  // El logo del original es una imagen 160×160 recortada (srcRect) a la banda central: 4,2 × 1,7 cm
  const logo=hpar(`<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="1524000" cy="609600"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="Logo Winoa"><a:hlinkClick r:id="rIdLink"/></wp:docPr><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="Logo Winoa"/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr><pic:blipFill rotWithShape="1"><a:blip r:embed="rIdL"/><a:srcRect t="30625" b="29375"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr bwMode="auto"><a:xfrm><a:off x="0" y="0"/><a:ext cx="1524000" cy="609600"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`);
  const bd=['top','left','bottom','right','insideH','insideV'].map(s=>`<w:${s} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`).join('');
  const header=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${NS}><w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblInd w:w="-5" w:type="dxa"/><w:tblBorders>${bd}</w:tblBorders><w:tblCellMar><w:top w:w="57" w:type="dxa"/><w:left w:w="70" w:type="dxa"/><w:bottom w:w="57" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="0"/></w:tblPr><w:tblGrid><w:gridCol w:w="2776"/><w:gridCol w:w="3183"/><w:gridCol w:w="2540"/></w:tblGrid>
   <w:tr><w:trPr><w:trHeight w:val="440"/></w:trPr>${hc(2838,hpar(hr('WINOA IBÉRICA, S.A.')))}${hc(3258,hpar(hr('Sistema de Gestión Integrado')))}${hc(2398,logo)}</w:tr>
   <w:tr><w:trPr><w:trHeight w:val="440"/></w:trPr>${hc(8494,hpar(hr(tit)),3)}</w:tr></w:tbl><w:p><w:pPr><w:pStyle w:val="Encabezado"/></w:pPr></w:p></w:hdr>`;
  const fld=(c)=>`<w:r><w:rPr>${FONT}<w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr>${FONT}<w:sz w:val="18"/></w:rPr><w:instrText xml:space="preserve"> ${c} </w:instrText></w:r><w:r><w:rPr>${FONT}<w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr>${FONT}<w:sz w:val="18"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr>${FONT}<w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>`;
  const footer=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}><w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="8504"/></w:tabs></w:pPr>${wr('Página ',{sz:18})}${fld('PAGE')}${wr('/',{sz:18})}${fld('NUMPAGES')}<w:r><w:tab/></w:r>${wr(new Date().toLocaleDateString('es-ES'),{sz:18})}</w:p></w:ftr>`;
  const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr>${FONT}<w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="es-ES"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Encabezado"><w:name w:val="header"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="center" w:pos="4252"/><w:tab w:val="right" w:pos="8504"/></w:tabs></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr></w:style></w:styles>`;
  const ct=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`;
  const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const rootRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`;
  const docRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdS" Type="${R}/styles" Target="styles.xml"/><Relationship Id="rIdH" Type="${R}/header" Target="header1.xml"/><Relationship Id="rIdF" Type="${R}/footer" Target="footer1.xml"/>${rels.join('')}</Relationships>`;
  const hdrRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdL" Type="${R}/image" Target="media/logo.jpg"/><Relationship Id="rIdLink" Type="${R}/hyperlink" Target="https://www.winoagroup.com/" TargetMode="External"/></Relationships>`;
  return zipStore([{name:'[Content_Types].xml',data:ct},{name:'_rels/.rels',data:rootRels},{name:'word/document.xml',data:doc},{name:'word/_rels/document.xml.rels',data:docRels},{name:'word/styles.xml',data:styles},{name:'word/header1.xml',data:header},{name:'word/_rels/header1.xml.rels',data:hdrRels},{name:'word/footer1.xml',data:footer},{name:'word/media/logo.jpg',data:logoBytes},...media]);
}
async function generarWord(){
  const vac=revSecs().filter(s=>!s.auto&&revVacia(s));
  if(vac.length&&!confirm(`Hay ${vac.length} apartados sin texto ni imágenes:\n· ${vac.map(s=>s.t).join('\n· ')}\n\n¿Generar el Word igualmente?`))return;
  let u;try{u=await buildDocx()}catch(e){toast('No se pudo generar el Word: '+e.message,true);return}
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([u],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));
  a.download=`Revision por la Direccion ${REV.anio}.docx`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
}
function revTexto(k,v){const row={id:REV.anio+':'+k,anio:REV.anio,key:k,texto:v};REV.texto[row.id]=v;guardar('rev_texto',row);const y=window.scrollY;render();window.scrollTo(0,y)}
function revImg(k,files){
  const ps=[...files].map(f=>new Promise(ok=>{const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>{
    const sc=Math.min(1,1400/im.width),c=document.createElement('canvas');c.width=Math.round(im.width*sc);c.height=Math.round(im.height*sc);
    c.getContext('2d').drawImage(im,0,0,c.width,c.height);
    c.toBlob(async b=>{try{const q=new URLSearchParams({anio:REV.anio,key:k,nombre:f.name,w:c.width,h:c.height});
      const rs=await fetch('api/img?'+q,{method:'POST',body:b});if(!rs.ok)throw new Error((await rs.json()).error||rs.status);ok(await rs.json())}catch(e){toast('No se pudo subir '+f.name+': '+e.message,true);ok(null)}},'image/png')};
    im.onerror=()=>ok(null);im.src=r.result};r.onerror=()=>ok(null);r.readAsDataURL(f)}));
  Promise.all(ps).then(l=>{REV.imgs.push(...l.filter(Boolean));render()});
}
async function revQuitar(id){try{await api('DELETE','api/img/'+id);REV.imgs=REV.imgs.filter(i=>i.id!==id);render()}catch(e){toast('No se pudo quitar: '+e.message,true)}}
const revResumen=()=>{const m=revSecs().filter(s=>!s.auto),ok=m.filter(s=>!revVacia(s)).length;return `${ok}/${m.length} apartados manuales cumplimentados`};
function revLinesHtml(lines){return lines.map(l=>l.t==='p'?`<p>${esc(l.s)}</p>`:l.t==='li'?`<ul class="plain"><li>${esc(l.s)}</li></ul>`:`<div class="scroll"><table><thead><tr>${l.head.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${l.rows.map(r=>`<tr>${r.map(c=>`<td>${nl(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`).join('')}
function revision(){
  const secs=revSecs(), man=secs.filter(x=>!x.auto), hechos=man.filter(x=>!revVacia(x)).length, pend=man.length-hechos;
  const nImg=REV.imgs.filter(i=>i.anio===REV.anio).length;
  return `<div class="kpis">
   <div class="card kpi"><b>${secs.length}</b><span>apartados</span></div>
   <div class="card kpi"><b>${secs.filter(x=>x.auto).length}</b><span>automáticos (desde los datos)</span></div>
   <div class="card kpi"><b>${hechos}/${man.length}</b><span>manuales cumplimentados</span></div>
   <div class="card kpi"><b class="${pend?'warn':''}">${pend}</b><span>manuales sin cumplimentar</span></div>
   <div class="card kpi"><b>${nImg}</b><span>imágenes adjuntas</span></div></div>
  <div class="bar"><b>Revisión por la Dirección ${esc(CICLO)}</b>
    <span class="mut" id="revcnt">${revResumen()}</span>
    <button class="btn keep" style="margin-left:auto;background:var(--primary);color:var(--bg);border-color:var(--primary);font-weight:600" onclick="generarWord()">⬇ Generar Word (formato Winoa)</button></div>
  <p class="mut" style="margin-top:0">Estructura del índice de la <b>Revisión por la Dirección</b>. Los apartados <span class="pill g">auto</span> se rellenan con los datos del sistema; en todos puedes añadir texto e imágenes. El botón genera el .docx completo con cabecera Winoa, índice, numeración y pie de página.</p>
  <div class="card">${secs.map(s=>{const imgs=revI(s.k);return `<details ${(!revVacia(s)||s.auto&&false)?'open':''}><summary><span class="pill ${s.auto?'g':'n'}">${s.auto?'auto':'manual'}</span><b>${esc(s.t)}</b>${revVacia(s)&&!s.auto?'<span class="mut">· sin cumplimentar</span>':''}</summary><div class="body">
    ${s.auto?revLinesHtml(s.lines):(s.nota?`<p class="mut">${esc(s.nota)}</p>`:'')}
    <textarea style="width:100%;min-height:90px;font:inherit;background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:8px" placeholder="${s.auto?'Comentarios adicionales (opcional)…':'Texto del apartado…'}" onchange="revTexto('${s.k}',this.value)">${esc(revT(s.k))}</textarea>
    <div class="bar" style="margin-top:8px"><label class="btn">📎 Añadir imágenes<input type="file" accept="image/*" multiple style="display:none" onchange="revImg('${s.k}',this.files)"></label>
    ${imgs.map(im=>`<span class="thumb"><img src="api/img/${im.id}" alt=""><button class="btn" onclick="revQuitar('${im.id}')" title="Quitar ${esc(im.nombre)}">✕</button></span>`).join('')}</div>
    </div></details>`}).join('')}</div>`;
}

function coherencia(){
  const sinEv=D.factors.filter(f=>!evaluado(f));
  const g3=D.risks.filter(r=>r.G===3&&r.R<4&&!tieneAcc(r)&&!r.just);
  const sinAcc=D.risks.filter(r=>requiere(r)&&!tieneAcc(r)&&!r.just);
  const sinAccO=D.opps.filter(o=>requiereO(o)&&!tieneAcc(o)&&!o.just);
  const sinEst=D.risks.filter(r=>!r.estado);
  const sinValR=D.risks.filter(r=>!r.P||!r.G);
  const cerSin=D.risks.filter(r=>r.estado==='Cerrada'&&r.Rr==null);
  const venc=[];D.risks.concat(D.opps).forEach(x=>accs(x).filter(vencidoA).forEach(a=>venc.push([x,a])));
  const dup=[...new Set(D.factors.map(f=>f.texto))].filter(t=>D.factors.filter(f=>f.texto===t).length>1);
  const objPend=D.objs.filter(o=>!o.objetivo);
  const bloque=(t,items,expl)=>`<div class="card pad mt"><h2>${t} <span class="pill ${items.length?'y':'g'}">${items.length}</span></h2><p class="mut" style="margin-top:0">${expl}</p>${items.length?`<ul class="plain">${items.map(i=>`<li>${i}</li>`).join('')}</ul>`:''}</div>`;
  const k=(n,t)=>`<div class="card kpi"><b class="${n?'warn':''}">${n}</b><span>${t}</span></div>`;
  return `<div class="kpis">${k(sinEv.length,'factores sin evaluar')}${k(sinAcc.length+sinAccO.length,'exigen acción y no la tienen')}${k(sinEst.length,'riesgos sin estado')}${k(cerSin.length,'cerrados sin residual')}${k(venc.length,'con plazo vencido')}</div>
  <p class="mut" style="margin-top:0">Comprobaciones automáticas de que el análisis está completo y es coherente.</p>
  ${bloque('Factores del DAFO sin evaluar',sinEv.map(f=>`${esc(f.texto)} <span class="tag">${SING[f.tipo]}</span> <span class="tag">${esc(proc(f.proceso))}</span>`),'Están en el DAFO pero no tienen fila en Riesgos u Oportunidades.')}
  ${bloque('Riesgos que exigen acción y no la tienen',sinAcc.map(r=>`${esc(rt(r))}: P${r.P} × G${r.G} = ${r.R}`),'R ≥ 4, o G = 3: hace falta una acción o una justificación escrita.')}
  ${bloque('Oportunidades con V×R = 9 sin acción ni justificación',sinAccO.map(o=>`${esc(rt(o))}: V${o.V} × R${o.R} = ${o.VR}`),'Una oportunidad de máxima viabilidad y rentabilidad debe tener acción, o una justificación escrita de por qué no se aprovecha.')}
  ${bloque('Riesgos sin valorar (P o G vacíos)',sinValR.map(r=>esc(rt(r))),'Pendientes de que valores su probabilidad y gravedad.')}
  ${bloque('Riesgos sin estado',sinEst.map(r=>esc(rt(r))),'No se sabe si están abiertos o cerrados.')}
  ${bloque('Riesgos cerrados sin riesgo residual valorado',cerSin.map(r=>esc(rt(r))),'Cerrar exige valorar P y G residuales para demostrar la eficacia de la acción.')}
  ${bloque('Acciones con plazo vencido',venc.map(([x,a])=>`${esc(rt(x))} — ${esc((a.accion||'').split('\n')[0])} · ${esc(a.resp||'sin responsable')} · ${esc(fecha(a.plazo))}`),'Siguen abiertas y su plazo ya pasó.')}
  ${bloque('Objetivos por completar',objPend.map(o=>`${esc(o.anio)} · ${esc(o.origen)}`),'Líneas con origen y plazo pero sin objetivo definido.')}
  ${bloque('Factores repetidos en dos cuadrantes',dup.map(esc),'Pueden ser legítimos (amenaza y oportunidad a la vez), pero conviene que sea consciente.')}`;
}

const VIEWS={general,externo,interno,flujo,criterios,dafo,partes,riesgos,oport,procesos:procesosTab,objetivos,revision,coherencia};
// ================= API, avisos y formularios de edición =================
async function api(method,url,body){
  if(CICLO&&/^api\/(factors|parties|risks|opps|objetivos|meta|rev_texto)\//.test(url))url+=(url.includes('?')?'&':'?')+'c='+CICLO;
  const r=await fetch(url,{method,headers:body!==undefined?{'Content-Type':'application/json'}:{},body:body!==undefined?JSON.stringify(body):undefined});
  if(!r.ok){let m='';try{m=(await r.json()).error}catch(e){}throw new Error(m||('HTTP '+r.status))}
  return r.json();
}
function toast(msg,bad){const t=document.getElementById('toast');t.textContent=msg;t.className='toast show'+(bad?' bad':'');clearTimeout(toast.h);toast.h=setTimeout(()=>{t.className='toast'},bad?6000:1400)}
function guardar(col,obj){return api('PUT',`api/${col}/${encodeURIComponent(obj.id)}`,obj).then(()=>toast('Guardado'),e=>toast('NO SE HA GUARDADO: '+e.message,true))}
const nid=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,5);

const NIV=[['','—'],[1,'1 · Baja'],[2,'2 · Media'],[3,'3 · Alta']];
const SEL_EST=[['','— (pendiente)'],['En curso','En curso'],['Cerrada','Cerrada']];
const KIND={
  factor:{col:'factors',list:()=>D.factors,titulo:'Factor del DAFO',pref:'F',noDel:true,nuevo:()=>({tipo:'D',texto:'',cat:'',proceso:''}),
    campos:[['texto','Factor','area'],['proceso','Proceso afectado','proc']],
    req:o=>o.texto.trim()?'':'El factor no puede estar vacío'},
  party:{col:'parties',list:()=>D.parties,titulo:'Grupo de interés',pref:'P',nuevo:()=>({tipo:'externa',nombre:'',necesidades:'',expectativas:'',requisitos:''}),
    campos:[['tipo','Tipo','sel',[['externa','Externo'],['interna','Interno']]],['nombre','Grupo de interés','text'],['necesidades','Necesidades','area'],['expectativas','Expectativas','area'],['requisitos','Requisitos para el Sistema','area']],
    req:o=>o.nombre.trim()?'':'Falta el nombre del grupo'},
  risk:{col:'risks',list:()=>D.risks,titulo:'Riesgo',pref:'R',acc:true,nuevo:()=>({fid:'',causa:'',efecto:'',P:null,G:null,R:null,acciones:[],estado:'',just:'',Pr:null,Gr:null,Rr:null}),
    span:{fid:4,causa:2,efecto:2,P:1,G:1,Pr:1,Gr:1,just:3,estado:1},
    campos:[['fid','Factor (debilidad o amenaza del DAFO)','fac',['D','A']],['causa','Causa','area'],['efecto','Efecto','area'],['P','P · Probabilidad','sel',NIV],['G','G · Gravedad','sel',NIV],['Pr','P residual','sel',NIV],['Gr','G residual','sel',NIV],['just','Justificación (G=3 o R≥4 sin acción)','area'],['estado','Estado (si no hay acciones)','sel',SEL_EST]],
    req:o=>!o.fid?'Elige el factor del DAFO al que pertenece':((!M.id&&(!o.P||!o.G))?'Valora la probabilidad (P) y la gravedad (G) del riesgo':''),
    post:o=>{o.R=(o.P&&o.G)?o.P*o.G:null;o.Rr=o.Pr&&o.Gr?o.Pr*o.Gr:null;recalc(o)}},
  opp:{col:'opps',list:()=>D.opps,titulo:'Oportunidad',pref:'O',acc:true,nuevo:()=>({fid:'',V:null,R:null,VR:0,acciones:[],estado:'',just:''}),
    span:{fid:4,V:1,R:1,estado:2,just:4},
    campos:[['fid','Factor (fortaleza u oportunidad del DAFO)','fac',['F','O']],['V','V · Viabilidad','sel',NIV],['R','R · Rentabilidad','sel',NIV],['estado','Estado (si no hay acciones)','sel',SEL_EST],['just','Justificación (V×R = 9 sin acción)','area']],
    req:o=>!o.fid?'Elige el factor del DAFO al que pertenece':((!M.id&&tieneAcc(o)&&(!o.V||!o.R))?'Si la oportunidad tiene acción, valora su viabilidad (V) y rentabilidad (R)':''),
    post:o=>{o.VR=(o.V||0)*(o.R||0);recalc(o)}},
  obj:{col:'objetivos',list:()=>D.objs,titulo:'Línea de objetivos',pref:'B',wide:true,nuevo:()=>({anio:CICLO,origen:'',objetivo:'',acciones:'',indicador:'',resp:'',ref:'',plazo:'',t:['','','',''],res:['','','',''],seg:''}),
    span:{objetivo:2,acciones:2,seg:3},
    campos:[['objetivo','Objetivo','area'],['acciones','Acciones','area'],['origen','Origen (p. ej. CALIDAD, SEGURIDAD…)','text','dl_ori'],['indicador','Indicador','text'],['resp','Responsable','text'],['ref','Valor de referencia','text'],['plazo','Plazo','date'],['seg','Conclusión del seguimiento','area'],
      ['t0','Resultado T1','text'],['t1','Resultado T2','text'],['t2','Resultado T3','text'],['t3','Resultado T4','text'],['res0','Observación T1','area'],['res1','Observación T2','area'],['res2','Observación T3','area'],['res3','Observación T4','area']],
    req:()=>''},
  meta:{col:'meta',list:()=>[D.meta],titulo:'Datos generales',pref:'M',nuevo:()=>({}),
    campos:[['fecha','Fecha de elaboración','date'],['participantes','Participantes (uno por línea)','lines']],req:()=>''},
  // --- locales: trabajan sobre el borrador de factores (Externo / Interno), no tocan el servidor
  fdraft:{local:true,titulo:'Factor',noDel:true,
    campos:[['texto','Factor','area'],['proceso','Proceso afectado','proc'],['c0','','chk'],['c1','','chk']],
    apply:(o,m)=>{
      if(!o.texto.trim())return 'El factor no puede estar vacío';
      if(!o.c0&&!o.c1)return 'Elige al menos una opción';
      fdStart();const T=TABT[m.pre.tab];
      if(!m.id){
        [o.c0&&T[0],o.c1&&T[1]].filter(Boolean).forEach(t=>FD.push({id:nid('F'),tipo:t,texto:o.texto.trim(),cat:m.pre.cat==='(sin categoría)'?'':m.pre.cat,proceso:o.proceso||''}));
        FE[m.pre.tab]=FE[m.pre.tab].filter(c=>c!==m.pre.cat);
      }else{
        const g=fdGrupo(m.id);
        g.forEach(f=>{f.texto=o.texto.trim();f.proceso=o.proceso||''});
        [0,1].forEach(k=>{const want=!!o['c'+k],has=g.some(x=>x.tipo===T[k]);
          if(want&&!has)FD.push({id:nid('F'),tipo:T[k],texto:o.texto.trim(),cat:g[0].cat,proceso:o.proceso||''});
          if(!want&&has)FD=FD.filter(x=>!(g.includes(x)&&x.tipo===T[k]))});
      }
      return '';}},
  aspecto:{local:true,titulo:'Aspecto',noDel:true,campos:[['nombre','Nombre del aspecto','text']],
    apply:(o,m)=>{
      const n=o.nombre.trim();if(!n)return 'El aspecto necesita un nombre';
      const T=TABT[m.pre.tab];fdStart();
      const existe=new Set([...FD.filter(f=>T.includes(f.tipo)).map(f=>f.cat),...FE[m.pre.tab]]);
      if(m.id){ // renombrar
        if(n!==m.pre.orig&&existe.has(n))return 'Ya existe un aspecto con ese nombre';
        FD.forEach(f=>{if((f.cat||'(sin categoría)')===m.pre.orig&&T.includes(f.tipo))f.cat=n});
        FE[m.pre.tab]=FE[m.pre.tab].map(c=>c===m.pre.orig?n:c);
      }else{
        if(existe.has(n))return 'Ya existe un aspecto con ese nombre';
        FE[m.pre.tab].push(n);
      }
      return '';}}
};
let M=null;
const getV=(o,n)=>{const m=/^(t|res)(\d)$/.exec(n);return m?(o[m[1]]||[])[+m[2]]??'':o[n]};
const setV=(o,n,v)=>{const m=/^(t|res)(\d)$/.exec(n);if(m){o[m[1]]=o[m[1]]||['','','',''];o[m[1]][+m[2]]=v}else o[n]=v};
function autoGrow(){document.querySelectorAll('#modal textarea').forEach(t=>{const f=()=>{t.style.height='auto';t.style.height=(t.scrollHeight+2)+'px'};t.style.overflow='hidden';t.style.resize='none';f();t.addEventListener('input',f)})}
function editar(kind,id,pre){
  if(RO){toast(`El ciclo ${CICLO} está cerrado: solo lectura`,true);return}
  const K=KIND[kind];pre=pre||{};
  let base;
  if(K.local)base=Object.assign({},pre);
  else base=id?K.list().find(x=>x.id===id):Object.assign(K.nuevo(),pre);
  if(!base)return;
  M={kind,id,pre,obj:JSON.parse(JSON.stringify(base)),old:base.texto};
  if(K.acc){if(!Array.isArray(M.obj.acciones))M.obj.acciones=[];if(pre.addAcc||(!id&&!M.obj.acciones.length))M.obj.acciones.push(ACC0())}
  pintarModal();
}
function pintarModal(){
  const K=KIND[M.kind],o=M.obj,tab=M.pre.tab;
  const chkL=[tab==='externo'?'Es una amenaza':'Es una debilidad',tab==='externo'?'Es una oportunidad':'Es una fortaleza'];
  const fld=([n,l,t,x])=>{
    const v=getV(o,n),id_='f_'+n;let ctl='';
    if(n==='estado'&&K.acc&&(o.acciones||[]).length)return '';
    if(t==='text')ctl=`<input id="${id_}" value="${esc(v)}" ${x?`list="${x}"`:''}>`;
    else if(t==='month')ctl=`<input id="${id_}" type="month" value="${esc(v)}">`;
    else if(t==='date')ctl=`<input id="${id_}" type="date" value="${esc(v)}">`;
    else if(t==='area')ctl=`<textarea id="${id_}" rows="2">${esc(v)}</textarea>`;
    else if(t==='lines')ctl=`<textarea id="${id_}" rows="3">${esc((v||[]).join('\n'))}</textarea>`;
    else if(t==='proc')ctl=`<select id="${id_}"><option value="">— sin proceso</option>${Object.entries(PROCS).map(([c,n2])=>`<option value="${c}" ${codeOf(v)===c?'selected':''}>${esc(n2)}</option>`).join('')}</select>`;
    else if(t==='sel')ctl=`<select id="${id_}">${x.map(([val,txt])=>`<option value="${val}" ${String(v??'')===String(val)?'selected':''}>${esc(txt)}</option>`).join('')}</select>`;
    else if(t==='fac')ctl=`<select id="${id_}"><option value="">— elige un factor</option>${D.factors.filter(f=>x.includes(f.tipo)).map(f=>`<option value="${f.id}" ${v===f.id?'selected':''}>${esc(f.texto.slice(0,110))}</option>`).join('')}</select>`;
    else if(t==='chk')return `<label class="fl chk"><input id="${id_}" type="checkbox" ${v?'checked':''}> <span>${chkL[+n.slice(1)]}</span></label>`;
    const sp=K.span&&K.span[n];
    return `<label class="fl${sp?` s${sp}`:''}"><span>${l}</span>${ctl}</label>`};
  const accHtml=()=>!K.acc?'':`<h3 class="acch">Acciones <span class="mut" style="font-weight:400">(puedes añadir todas las que necesites)</span></h3>
    ${(o.acciones||[]).map((a,j)=>`<div class="accbox"><div class="acchead"><b>Acción ${j+1}</b><button class="ed" onclick="accQuitar(${j})">Quitar</button></div><div class="accrow">
      <label class="fl"><span>Acción</span><textarea data-a="${j}" data-k="accion" rows="2">${esc(a.accion)}</textarea></label>
      <label class="fl"><span>Responsable</span><input data-a="${j}" data-k="resp" value="${esc(a.resp)}"></label>
      <label class="fl"><span>Plazo</span><input type="month" data-a="${j}" data-k="plazo" value="${esc(a.plazo)}"></label>
      <label class="fl"><span>Estado</span><select data-a="${j}" data-k="estado">${SEL_EST.map(([v,t])=>`<option value="${v}" ${(a.estado||'')===v?'selected':''}>${t}</option>`).join('')}</select></label>
      <label class="fl"><span>Comentarios</span><textarea data-a="${j}" data-k="coment" rows="2">${esc(a.coment)}</textarea></label></div></div>`).join('')}
    <button class="btn" onclick="accAnadir()">+ Añadir acción</button>`;
  document.getElementById('modal').innerHTML=`<div class="mbg" onclick="if(event.target===this)cerrar()"><div class="mbox ${K.acc||K.wide?'wide':''}" role="dialog">
    <h2>${M.id?'Editar':'Nuevo'} · ${K.titulo}</h2>
    <datalist id="dl_ori">${[...new Set(D.objs.map(f=>f.origen).filter(Boolean))].map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
    ${M.kind==='fdraft'?`<p class="mut" style="margin:0 0 8px">Aspecto: <b>${esc(M.pre.cat)}</b></p>`:''}
    <div class="mform ${K.acc||K.wide?'w4':''}">${K.campos.map(fld).join('')}</div>
    ${accHtml()}
    <div class="merr" id="merr"></div>
    <div class="mbtn">${M.id&&!K.noDel&&M.kind!=='meta'?'<button class="btn danger" onclick="borrar()">Eliminar</button>':''}<span style="flex:1"></span><button class="btn" onclick="cerrar()">Cancelar</button><button class="btn pri" onclick="aceptar()">${K.local?'Aceptar':'Guardar'}</button></div>
  </div></div>`;
  autoGrow();
}
function recoger(){
  const K=KIND[M.kind],o=M.obj;
  for(const [n,,t] of K.campos){const el=document.getElementById('f_'+n);if(!el)continue;let v;
    if(t==='chk')v=el.checked;
    else{v=el.value;
      if(t==='lines')v=v.split('\n').map(x=>x.trim()).filter(Boolean);
      else if(['P','G','Pr','Gr','V','R'].includes(n))v=v===''?null:+v}
    setV(o,n,v)}
  if(K.acc){const A=[];document.querySelectorAll('#modal [data-a]').forEach(el=>{const j=+el.dataset.a;A[j]=A[j]||ACC0();A[j][el.dataset.k]=el.value});o.acciones=A.filter(Boolean)}
}
function accAnadir(){recoger();M.obj.acciones.push(ACC0());pintarModal();const b=document.querySelectorAll('#modal .accbox');if(b.length)b[b.length-1].scrollIntoView({block:'nearest'})}
function accQuitar(j){recoger();M.obj.acciones.splice(j,1);pintarModal()}
function cerrar(){document.getElementById('modal').innerHTML='';M=null}
async function aceptar(){
  if(!M)return;recoger();const K=KIND[M.kind],o=M.obj;
  if(K.local){const err=K.apply(o,M);if(err){document.getElementById('merr').textContent=err;return}cerrar();render();return}
  if(K.acc)o.acciones=o.acciones.filter(a=>a.accion||a.resp||a.plazo||a.coment||a.estado);
  const err=K.req(o);if(err){document.getElementById('merr').textContent=err;return}
  if(K.post)K.post(o);
  if(!M.id)o.id=nid(K.pref);
  const sib=[];
  if(M.kind==='factor'&&o.texto!==M.old)D.factors.forEach(f=>{if(f.id!==o.id&&f.cat===o.cat&&f.texto===M.old&&(f.tipo==='A'||f.tipo==='O')===(o.tipo==='A'||o.tipo==='O')){sib.push({...f,texto:o.texto})}});
  try{await api('PUT',`api/${K.col}/${encodeURIComponent(o.id)}`,o);for(const f of sib)await api('PUT',`api/factors/${encodeURIComponent(f.id)}`,f)}catch(e){document.getElementById('merr').textContent='NO SE HA GUARDADO: '+e.message;return}
  if(M.kind==='meta')Object.assign(D.meta,o);
  else{const L=K.list();const i=L.findIndex(x=>x.id===o.id);if(i>=0)L[i]=o;else L.push(o);sib.forEach(f=>{const k=D.factors.findIndex(x=>x.id===f.id);if(k>=0)D.factors[k]=f})}
  reindex();cerrar();toast('Guardado');render();
}
async function borrar(){
  if(!M||!M.id)return;const K=KIND[M.kind],o=M.obj;
  if(!confirm('¿Eliminar definitivamente este elemento?'))return;
  try{await api('DELETE',`api/${K.col}/${encodeURIComponent(o.id)}`)}catch(e){document.getElementById('merr').textContent='No se pudo eliminar: '+e.message;return}
  const L=K.list();const i=L.findIndex(x=>x.id===o.id);if(i>=0)L.splice(i,1);
  reindex();cerrar();toast('Eliminado');render();
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&M)cerrar()});

// ================= Arranque =================
async function boot(c){
  try{
    const d=await api('GET','api/data'+(c?'?c='+c:''));
    CICLOS=d.ciclos||[];
    if(!d.ciclo){document.getElementById('view').innerHTML='<div class="banner">No hay ningún ciclo en la base de datos.</div>';return}
    CICLO=d.ciclo.anio;RO=d.ciclo.estado==='cerrado';
    D.meta=d.meta[0]||{id:'main',fecha:'',participantes:[]};
    D.factors=d.factors;D.parties=d.parties;D.risks=d.risks.map(normAcc);D.opps=d.opps.map(normAcc);D.risks.forEach(recalc);D.opps.forEach(recalc);
    D.objs=d.objetivos.map(o=>({t:['','','',''],res:['','','',''],...o}));
    REV.texto=Object.fromEntries(d.rev_texto.map(r=>[r.id,r.texto]));REV.imgs=d.imgs;REV.anio=CICLO;
    FD=null;FE={externo:[],interno:[]};
    reindex();
    const n=await asegurarFilas();if(n)toast(`Se han añadido ${n} fila(s) a Riesgos/Oportunidades para los factores del DAFO`);
    render();
  }catch(e){document.getElementById('view').innerHTML=`<div class="banner">No se pudieron cargar los datos: ${esc(e.message)}</div>`}
}
// ---- ciclos anuales
function pintarCiclo(){
  const sel=document.getElementById('ciclosel'),b=document.getElementById('cicloBadge');if(!sel)return;
  sel.innerHTML=CICLOS.map(c=>`<option value="${c.anio}" ${c.anio===CICLO?'selected':''}>Ciclo ${c.anio} · ${c.estado==='cerrado'?'cerrado':'abierto'}</option>`).join('');
  b.className='badge '+(RO?'cerrado':'abierto');b.textContent=RO?'Solo lectura':'Abierto';
  if(RO){const c=CICLOS.find(x=>x.anio===CICLO);
    document.getElementById('view').insertAdjacentHTML('afterbegin',`<div class="robanner">🔒 <b>Ciclo ${esc(CICLO)} cerrado</b>${c&&c.cerrado?` el ${esc(c.cerrado.slice(0,10).split('-').reverse().join('/'))}`:''}. Solo lectura: es la evidencia del año. Puedes consultarlo y generar el Word de la revisión. Si necesitas corregir algo, puedes reabrirlo desde <b>Datos generales</b>.</div>`)}
}
function cambiarCiclo(c){
  if(c===CICLO)return;
  if(fdDirty()){document.getElementById('ciclosel').value=CICLO;fdDialog(()=>boot(c));return}
  S.estado='abiertos';S.proceso='';boot(c);
}
function cicloCard(){
  const c=CICLOS.find(x=>x.anio===CICLO)||{},sig=CICLOS.find(x=>+x.anio>+CICLO),n=String(+CICLO+1);
  return `<div class="card pad mt" style="max-width:760px"><h2>Ciclo ${esc(CICLO)} <span class="badge ${RO?'cerrado':'abierto'}">${RO?'cerrado':'abierto'}</span></h2>
   <p class="mut" style="margin-top:0">Cada año es un ciclo completo (DAFO, partes, riesgos, oportunidades, objetivos y revisión). Al cerrarlo queda como evidencia, en solo lectura.</p>
   ${RO?`<p>Cerrado el ${esc((c.cerrado||'').slice(0,10).split('-').reverse().join('/'))}. ${sig?`Ya existe el ciclo ${esc(sig.anio)}.`:''}</p>
     ${sig?`<button class="btn keep" onclick="cambiarCiclo('${sig.anio}')">Ir al ciclo ${esc(sig.anio)}</button>`:`<button class="btn pri keep" onclick="dialogCrearCiclo()">Crear ciclo ${n} a partir de este</button>`}
     <button class="btn keep" onclick="dialogReabrirCiclo()">Reabrir ciclo ${esc(CICLO)}…</button>`
    :`<button class="btn pri keep" onclick="dialogCerrarCiclo()">Cerrar ciclo ${esc(CICLO)}…</button>`}
  </div>`;
}
// ---- copias de seguridad del ciclo (se guardan en el servidor, junto a la base de datos)
function copiasCard(){
  return `<div class="card pad mt" style="max-width:980px"><h2>Copias de seguridad del ciclo ${esc(CICLO)}</h2>
   <p class="mut" style="margin-top:0">Se guardan en el servidor donde está alojada la aplicación, junto a la base de datos. Cada copia contiene el ciclo completo (DAFO, partes, riesgos, oportunidades, objetivos, revisión e imágenes). Al restaurar, el ciclo vuelve exactamente a ese estado.<br>
   <b>Copias automáticas:</b> cada hora si hay cambios en la base de datos y cada 24 h si no los hay (las de más de 48 h se reducen a una por día y se borran a los 30 días; las manuales no se borran solas).</p>
   <div class="bar"><input id="bkNota" placeholder="Nota de la copia (opcional)" style="min-width:260px" class="keep"><button class="btn pri keep" onclick="crearCopia()">Crear copia ahora</button></div>
   <div id="copias" class="mut">Cargando copias…</div></div>`;
}
const fechaHora=iso=>{const d=new Date(iso);return d.toLocaleDateString('es-ES')+' '+d.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})};
const kb=b=>b>1048576?(b/1048576).toFixed(1)+' MB':Math.max(1,Math.round(b/1024))+' KB';
async function cargarCopias(){
  const el=document.getElementById('copias');if(!el)return;
  try{
    const l=await api('GET',`api/backups?c=${CICLO}`);
    if(!document.getElementById('copias'))return;
    el.className='';
    el.innerHTML=l.length?`<div class="scroll"><table><thead><tr><th>Nombre</th><th>Nota</th><th>Contenido</th><th>Tamaño</th><th></th></tr></thead><tbody>
     ${l.map(b=>`<tr><td style="white-space:nowrap"><b>${esc(b.nombre)}</b></td><td>${b.tipoCopia==='auto'?'<span class="tag">automática</span> ':b.tipoCopia==='previa'?'<span class="tag">previa a restaurar</span> ':''}${esc(b.nota||'')}</td>
      <td class="mut">${b.resumen.factors} factores · ${b.resumen.risks} riesgos · ${b.resumen.opps} oportunidades · ${b.resumen.objetivos} objetivos${b.resumen.imgs?` · ${b.resumen.imgs} imágenes`:''}</td>
      <td style="white-space:nowrap">${kb(b.bytes)}</td>
      <td style="white-space:nowrap"><button class="btn sm" onclick="dialogRestaurar('${b.id}')">Restaurar</button> <button class="btn sm danger" onclick="eliminarCopia('${b.id}')">Eliminar</button></td></tr>`).join('')}
     </tbody></table></div>${RO?'<p class="mut" style="margin-bottom:0">El ciclo está cerrado: para restaurar una copia hay que reabrirlo antes.</p>':''}`
     :'<span class="mut">Todavía no hay copias de este ciclo.</span>';
    if(RO)el.querySelectorAll('button').forEach(b=>b.disabled=true);
  }catch(e){el.textContent='No se pudieron cargar las copias: '+e.message}
}
async function crearCopia(){
  const n=document.getElementById('bkNota');
  try{await api('POST',`api/backups?c=${CICLO}`,{nota:n?n.value:''});toast('Copia creada');if(n)n.value='';cargarCopias()}
  catch(e){toast('NO SE HA CREADO LA COPIA: '+e.message,true)}
}
async function eliminarCopia(id){
  if(!confirm('¿Eliminar definitivamente esta copia de seguridad?'))return;
  try{await api('DELETE',`api/backups/${id}`);toast('Copia eliminada');cargarCopias()}
  catch(e){toast('No se pudo eliminar: '+e.message,true)}
}
async function dialogRestaurar(id){
  let b;try{b=(await api('GET',`api/backups?c=${CICLO}`)).find(x=>x.id===id)}catch(e){toast('No se pudo leer la copia: '+e.message,true);return}
  if(!b){toast('La copia ya no existe',true);return}
  document.getElementById('modal').innerHTML=`<div class="mbg"><div class="mbox" role="dialog"><h2>Restaurar «${esc(b.nombre)}»</h2>
   <p>Se <b>sustituirá todo el contenido del ciclo ${esc(CICLO)}</b> por el de esta copia:</p>
   <ul><li>${b.resumen.factors} factores · ${b.resumen.risks} riesgos · ${b.resumen.opps} oportunidades · ${b.resumen.objetivos} objetivos${b.resumen.imgs?` · ${b.resumen.imgs} imágenes`:''}</li>${b.nota?`<li>Nota: ${esc(b.nota)}</li>`:''}</ul>
   <p class="mut">Antes de restaurar se guarda automáticamente una copia del estado actual, por si necesitas volver atrás.</p>
   <div class="merr" id="merr"></div>
   <div class="mbtn"><span style="flex:1"></span><button class="btn" onclick="cerrar()">Cancelar</button><button class="btn danger" onclick="restaurarCopia('${id}')">Restaurar copia</button></div></div></div>`;
}
async function restaurarCopia(id){
  try{const r=await api('POST',`api/backups/${id}/restaurar?c=${CICLO}`,{});cerrar();toast('Copia restaurada');await boot(CICLO)}
  catch(e){document.getElementById('merr').textContent='No se pudo restaurar: '+e.message}
}
function dialogCerrarCiclo(){
  const sinEv=D.factors.filter(f=>!evaluado(f)).length, sinVal=D.risks.filter(r=>!r.P||!r.G).length;
  const sinAcc=D.risks.filter(r=>requiere(r)&&!tieneAcc(r)&&!r.just).length+D.opps.filter(o=>requiereO(o)&&!tieneAcc(o)&&!o.just).length;
  const obj=D.objs.filter(o=>!o.objetivo).length, rev=revSecs().filter(x=>!x.auto&&revVacia(x)).length;
  const li=(n,t)=>`<li class="${n?'warn':''}"><b>${n}</b> ${t}</li>`;
  document.getElementById('modal').innerHTML=`<div class="mbg"><div class="mbox" role="dialog"><h2>Cerrar el ciclo ${esc(CICLO)}</h2>
   <p>Al cerrarlo, todo el ciclo (DAFO, partes, riesgos, oportunidades, objetivos y revisión) pasa a <b>solo lectura</b>. Si necesitas corregir algo, podrás <b>reabrirlo</b> desde esta misma pantalla.</p>
   <p class="mut" style="margin-bottom:4px">Estado actual (son avisos, no impiden cerrar):</p>
   <ul>${li(sinEv,'factores sin evaluar')}${li(sinVal,'riesgos sin valorar (P o G vacíos)')}${li(sinAcc,'elementos que exigen acción y no la tienen')}${li(obj,'líneas de objetivos por completar')}${li(rev,'apartados manuales de la revisión sin cumplimentar')}</ul>
   <div class="merr" id="merr"></div>
   <div class="mbtn"><span style="flex:1"></span><button class="btn" onclick="cerrar()">Cancelar</button><button class="btn danger" onclick="cerrarCiclo()">Cerrar ciclo ${esc(CICLO)}</button></div></div></div>`;
}
function dialogReabrirCiclo(){
  const sig=CICLOS.find(x=>+x.anio>+CICLO);
  document.getElementById('modal').innerHTML=`<div class="mbg"><div class="mbox" role="dialog"><h2>Reabrir el ciclo ${esc(CICLO)}</h2>
   <p>El ciclo volverá a ser editable. Cuando termines, puedes cerrarlo otra vez.</p>
   ${sig?`<p class="warn"><b>Ojo:</b> el ciclo ${esc(sig.anio)} ya existe y se creó a partir de este. Los cambios que hagas ahora en ${esc(CICLO)} <b>no se copian</b> al ${esc(sig.anio)}.</p>`:''}
   <p class="mut">Al reabrir, el ciclo deja de ser la evidencia firmada hasta que lo vuelvas a cerrar.</p>
   <div class="merr" id="merr"></div>
   <div class="mbtn"><span style="flex:1"></span><button class="btn" onclick="cerrar()">Cancelar</button><button class="btn pri" onclick="reabrirCiclo()">Reabrir ciclo ${esc(CICLO)}</button></div></div></div>`;
}
async function reabrirCiclo(){
  try{await api('POST',`api/ciclos/${CICLO}/abrir`,{});cerrar();toast(`Ciclo ${CICLO} reabierto`);await boot(CICLO)}
  catch(e){document.getElementById('merr').textContent='No se pudo reabrir: '+e.message}
}
async function cerrarCiclo(){
  try{await api('POST',`api/ciclos/${CICLO}/cerrar`,{});cerrar();toast(`Ciclo ${CICLO} cerrado`);await boot(CICLO)}
  catch(e){document.getElementById('merr').textContent='No se pudo cerrar: '+e.message}
}
function dialogCrearCiclo(){
  const n=String(+CICLO+1);
  document.getElementById('modal').innerHTML=`<div class="mbg"><div class="mbox" role="dialog"><h2>Crear el ciclo ${esc(n)}</h2>
   <p>Se crea a partir del ciclo ${esc(CICLO)}, que no se modifica:</p>
   <ul><li><b>Partes interesadas y factores del DAFO:</b> se copian tal cual, para que los revises.</li>
   <li><b>Riesgos y oportunidades:</b> se copian <u>sin valorar</u> (P×G y V×R se vuelven a valorar); la valoración anterior queda como referencia.</li>
   <li><b>Acciones:</b> las que siguen abiertas continúan; las cerradas se quedan en ${esc(CICLO)}.</li>
   <li><b>Objetivos:</b> nuevos, con el origen, el indicador y el resultado anterior como referencia (si ya había objetivos preparados para ${esc(n)}, se respetan).</li>
   <li><b>Revisión por la dirección:</b> documento nuevo y vacío.</li></ul>
   <div class="merr" id="merr"></div>
   <div class="mbtn"><span style="flex:1"></span><button class="btn" onclick="cerrar()">Cancelar</button><button class="btn pri" onclick="crearCicloSig()">Crear ciclo ${esc(n)}</button></div></div></div>`;
}
async function crearCicloSig(){
  const n=String(+CICLO+1);
  try{await api('POST','api/ciclos',{desde:CICLO,anio:n});cerrar();toast(`Ciclo ${n} creado`);S.estado='abiertos';await boot(n)}
  catch(e){document.getElementById('merr').textContent='No se pudo crear: '+e.message}
}
boot();

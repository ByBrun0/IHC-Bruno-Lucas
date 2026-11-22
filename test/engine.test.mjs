import assert from 'node:assert/strict';
import test from 'node:test';
import { createSession,startTask,observe,execute,finish,macEvents,configuration,publicView } from '../src/engine.mjs';
const make=(task,variant='B',mode='neutral',seed=1)=>{
  const s=createSession({id:task+seed,mode,seed});
  startTask(s,task,variant);
  return s;
};
function step(s,match,channel='agent') {
  const obs=observe(s,channel);
  const b=obs.allowed_actions.find(x=>match.test(x.label));
  assert.ok(b,String(match));
  return execute(s,{observation_id:obs.observation_id,action_id:b.id});
}
test('C2 aceita D/U em ambas as variantes e verifica externamente',()=>{
  for (const variant of ['A','B']) {
    const s=make('C2',variant);
    [/^Último$|Ver último registro/,/^Hist\.$|Ver histórico/,/^Item Alfa/,/^Alfa: Sem confirmação registrada · Beta: Tomada relatada$/,/^Concluir$/].forEach(x=>step(s,x));
    assert.equal(s.attempt.result.status,'success');
    assert.equal(s.attempt.result.actions,5);
  }
});
test('corrigir a resposta mantém a categoria E3 e permite sucesso',()=>{
  const s=make('C4');
  [/^Ajuda$/,/^Voltar à tarefa$/,/^Sem confirmação registrada · Ingestão: ingerido$/,/^Sem confirmação registrada · Ingestão: indeterminado$/,/^Concluir$/].forEach(x=>step(s,x));
  assert.deepEqual(s.attempt.result.errors,['E3']);
  assert.equal(s.attempt.result.status,'success');
  assert.ok(s.events.some(e=>e.type==='error_resolved'));
});
test('ausência de consulta obrigatória bloqueia sucesso',()=>{
  const s=make('C4');
  [/^Sem confirmação registrada · Ingestão: indeterminado$/,/^Concluir$/].forEach(x=>step(s,x));
  assert.deepEqual(s.attempt.result.errors,['E4']);
  assert.equal(s.attempt.result.status,'failure');
  assert.ok(macEvents(s.events).some(e=>e.tag==='Para mim está bom'));
});
test('retorno, ajuda em camadas, M4 entre tarefas e reinício das filas',()=>{
  const s=make('C4','B','fixed');
  [/^Ajuda$/,/^Entender os registros$/,/^Voltar à tarefa$/,/^Desistir$/].forEach(x=>step(s,x));
  assert.equal(s.learned.length,5);
  assert.equal(s.attempt.result.help,2);
  assert.equal(s.attempt.result.status,'failure');
  startTask(s,'C2','A');
  const obs=observe(s);
  assert.equal(obs.heading,'Lembretes');
  assert.equal(obs.memory.length,0);
  assert.equal(obs.anchors.length,0);
  assert.equal(obs.learned.length,5);
  assert.equal(make('C2','A','fixed').learned.length,0);
});
test('observação limita sinais ao que é público e oculta dados privados',()=>{
  const s=make('C2','B','fixed');
  const obs=observe(s);
  assert.deepEqual(obs.content,publicView(s).content);
  assert.deepEqual(obs.allowed_actions.map(x=>x.label),publicView(s).actions.map(x=>x.label));
  assert.doesNotMatch(JSON.stringify(obs),/x01|x02|r02|expected_answer|required_consults|attributes|HTA|GOMS|V5|V8/);
  assert.equal(obs.learned.length,0);
  assert.doesNotMatch(JSON.stringify(obs),/O lápis/);
  let masked=false;
  for(let seed=1;seed<=80;seed++) {
    const a=make('C2','A','fixed',seed);
    const observation=observe(a);
    if (!observation.allowed_actions.some(x=>x.label==='Hist.')) {
      masked=true;
      assert.ok(publicView(a).actions.some(x=>x.label==='Hist.'));
      assert.doesNotMatch(JSON.stringify(observation),/"Hist\."/);
      assert.ok(observation.allowed_actions.some(x=>x.label==='Ajuda'));
      break;
    }
  }
  assert.ok(masked);
});
test('rejeita proposta inválida e preserva desconhecido para falha técnica',()=>{
  const s=make('C4');
  for(let i=0;i<3;i++) {
    const obs=observe(s);
    assert.equal(execute(s,{observation_id:obs.observation_id,action_id:'fora-da-lista'}),false);
  }
  assert.equal(s.attempt.result.actions,0);
  assert.equal(s.attempt.result.status,'unknown');
});
test('desfazer exige confirmação; cancelar preserva estado e gera candidato MAC',()=>{
  const s=make('C2');
  [/^Ver último registro$/,/^Corrigir relato$/,/^Cancelar$/].forEach(x=>step(s,x));
  assert.equal(s.attempt.errors.length,0);
  assert.ok(macEvents(s.events).some(e=>e.tag==='Epa!'));
  [/^Corrigir relato$/,/^Confirmar correção$/].forEach(x=>step(s,x));
  assert.ok(s.events.some(e=>e.type==='report_voided'));
  assert.ok(observe(s).content.some(x=>x.startsWith('Relato anterior desfeito')));
});
test('semente reproduz sorteio; nenhum cenário de validação exposto para execução',()=>{
  assert.deepEqual(configuration('sampled',11),configuration('sampled',11));
  const s=make('C4');
  finish(s,'technical');
  assert.throws(()=>startTask(s,'V8','B'));
});


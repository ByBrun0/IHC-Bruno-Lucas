import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { askCodex } from './codex-provider.mjs';
import { performance } from 'node:perf_hooks';
import { createSession, startTask, observe, execute, finish, closeSession, macEvents, VERSION } from './engine.mjs';

const type=process.argv[2];
if (!['technical','api','codex'].includes(type)) throw new Error('Use technical, api ou codex');
const key=process.env.OPENAI_API_KEY;
if (type==='api' && !key) throw new Error('Configure OPENAI_API_KEY antes do piloto.');
const model=process.env.UXAGENT_MODEL || (type==='codex' ? null : 'gpt-6-luna');
const smoke=process.argv.includes('--smoke');
const prompt=(await readFile(new URL('./prompt.txt',import.meta.url),'utf8')).trim();
const tasks=['C2','C4'];
const sequences=[[tasks,['A','B']],[tasks,['B','A']],[[...tasks].reverse(),['A','B']],[[...tasks].reverse(),['B','A']]];
const resumeIndex = process.argv.indexOf('--resume');
const resumeRun = resumeIndex >= 0 ? process.argv[resumeIndex + 1] : null;
if (resumeRun && !/^[a-zA-Z0-9-]+$/.test(resumeRun)) throw new Error('Identificador de rodada inválido');
const runId = resumeRun || new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0,8);
const output = new URL('../results/' + type + '/' + runId + '/', import.meta.url);
await mkdir(output,{recursive:true});

async function ask(observation, requestId) {
  const request={
    model, instructions:prompt, input:JSON.stringify(observation),
    store:false, max_output_tokens:256, reasoning:{effort:'none'}, temperature:0,
    text:{format:{type:'json_schema', name:'action', strict:true,schema:{
      type:'object',additionalProperties:false,required:['observation_id','action_id','arguments'],
      properties:{observation_id:{type:'string',enum:[observation.observation_id]},action_id:{type:'string',enum:observation.allowed_actions.map(x=>x.id)},
        arguments:{type:'object',additionalProperties:false,required:[],properties:{}}},
    }}},
  };
  const calls=[];
  for(let attempt=0;attempt<2;attempt++) {
    const started=performance.now();
    try {
      const response=await fetch('https://api.openai.com/v1/responses',{
        method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':requestId},
        body:JSON.stringify(request),signal:AbortSignal.timeout(90000),
      });
      const payload=await response.json();
      calls.push({status:response.status,latency_ms:Math.round(performance.now()-started),
        response_id:payload.id??null,model_returned:payload.model??null,usage:payload.usage??null,
        detail:response.ok?null:payload.error?.code??null});
      if (!response.ok) {
        if (response.status>=500 && attempt===0) continue;
        return {request,calls,failed:true};
      }
      const text=(payload.output??[]).flatMap(x=>x.content??[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');
      let action;
      try { action=JSON.parse(text); } catch { action=null; }
      return {request,calls,action,output_text:text};
    } catch (err) {
      calls.push({network_failure:err.name,latency_ms:Math.round(performance.now()-started)});
    }
  }
  return {request,calls,failed:true};
}

function localAction(task, turn, observation) {
  const labels=task==='C2'
    ? [/^(Hist\.|Ver histórico)$/,/^Item Alfa/,/^Voltar ao histórico$/,/^Item Beta/,/^Alfa: Sem confirmação registrada · Beta: Tomada relatada$/, /^Concluir$/]
    : [/^Ajuda$/, /^Voltar à tarefa$/, /^Sem confirmação registrada · Ingestão: indeterminado$/, /^Concluir$/];
  const pick=observation.allowed_actions.find(a=>labels[turn]?.test(a.label));
  return {observation_id:observation.observation_id,action_id:pick?.id};
}

const modes=type==='technical'||smoke?['neutral']:['fixed','neutral'];
const manifest = resumeRun
  ? JSON.parse(await readFile(new URL('manifest.json', output), 'utf8'))
  : {type,version:VERSION,created:new Date().toISOString(),model:type==='technical'?null:model,smoke,sessions:[]};
if (manifest.type !== type || manifest.smoke !== smoke) throw new Error('Modo diferente da rodada original');
if (resumeRun) {
  manifest.resumptions ??= [];
  manifest.resumptions.push({ at: new Date().toISOString(), saved_sessions: manifest.sessions.length });
}
let apiStopped=false;
for (const mode of modes) {
  for (let i=0;i<(smoke?1:type==='technical'?4:8);i++) {
    if (apiStopped) break;
    const plannedIndex = modes.indexOf(mode) * (smoke ? 1 : type === 'technical' ? 4 : 8) + i;
    if (plannedIndex < manifest.sessions.length) continue;
    const [order,variants]=sequences[i%4];
    const id=type+'-'+randomUUID();
    const session=createSession({id,mode,seed:20261026+i,origin:type==='technical'?'technical':'synthetic_llm'});
    const requests=[];
    const results=[];
    for (let position=0;position<2;position++) {
      const task=order[position];
      startTask(session,task,variants[position]);
      for (let turn=0;!session.attempt.result;turn++) {
        const observation=observe(session);
        if (type==='technical') execute(session,localAction(task,turn,observation));
        else {
          const answer=type==='codex' ? await askCodex(observation,prompt,model) : await ask(observation,id+':'+position+':'+turn);
          requests.push({task,position:position+1,turn,...answer});
          if (type==='codex') console.log(task, 'turno', turn+1, answer.failed ? 'falha' : 'resposta recebida');
          if (answer.failed) {
            finish(session,'technical');
            if (type==='codex' || answer.calls.some(call=>[400,401,403,404,429].includes(call.status))) apiStopped=true;
            break;
          }
          execute(session,answer.action);
          if (smoke && turn===7 && !session.attempt.result) finish(session,'limit');
        }
      }
      results.push({task,variant:variants[position],...session.attempt.result});
      if (apiStopped) break;
    }
    closeSession(session);
    const file=id+'.json';
    await writeFile(new URL(file,output),JSON.stringify({
      id,mode,results,events:session.events,mac:macEvents(session.events),requests,
    },null,2));
    manifest.sessions.push({file,mode,order,variants,results});
    manifest.interrupted=apiStopped;
    await writeFile(new URL('manifest.json',output),JSON.stringify(manifest,null,2));
    if (apiStopped) break;
  }
}
manifest.interrupted=apiStopped;
await writeFile(new URL('manifest.json',output),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({origin:type,run:runId,sessions:manifest.sessions.length,attempts:manifest.sessions.reduce((n,s)=>n+s.results.length,0),interrupted:apiStopped},null,2));
if(apiStopped) process.exitCode=1;

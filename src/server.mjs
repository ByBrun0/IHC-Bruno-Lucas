import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createSession, startTask, observe, execute, closeSession } from './engine.mjs';

const sessions = new Map();
const files = { '/':['index.html','text/html'], '/ui.mjs':['ui.mjs','text/javascript'], '/style.css':['style.css','text/css'] };
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('Use JSON');
  const chunks=[];
  let size=0;
  for await (const chunk of req) {
    size+=chunk.length;
    if (size>8192) throw new Error('Solicitação muito grande');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks));
}
createServer(async (req,res)=>{
  const respond = (status, payload, type='application/json')=>{
    res.writeHead(status,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(type==='application/json'?JSON.stringify(payload):payload);
  };
  try {
    if (req.method==='GET' && Object.hasOwn(files,req.url)) {
      const [file,type]=files[req.url];
      return respond(200,await readFile(new URL('../public/'+file,import.meta.url)),type);
    }
    if (req.method==='POST' && req.url==='/session') {
      const {task,variant}=await body(req);
      const id=randomUUID();
      const session=createSession({id,origin:'manual_local',mode:'neutral'});
      startTask(session,task,variant);
      if (sessions.size>=100) sessions.delete(sessions.keys().next().value);
      sessions.set(id,session);
      return respond(200,{id,observation:observe(session,'human')});
    }
    if (req.method==='POST' && req.url==='/step') {
      const {id,proposal}=await body(req);
      const session=sessions.get(id);
      if (!session || session.attempt.result) return respond(404,{error:'Tentativa indisponível'});
      execute(session,proposal);
      if (session.attempt.result) {
        closeSession(session);
        return respond(200,{result:session.attempt.result,events:session.events});
      }
      return respond(200,{observation:observe(session,'human')});
    }
    respond(404,{error:'Página indisponível'});
  } catch (err) {
    respond(400,{error:err instanceof SyntaxError?'JSON inválido':err.message});
  }
}).listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log('Interface local: http://127.0.0.1:'+(process.env.PORT||3000)));


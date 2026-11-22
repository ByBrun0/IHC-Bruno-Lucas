const $=s=>document.querySelector(s);
let sessionId;
let busy=false;

async function post(path,payload) {
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const data=await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}

async function run(operation) {
  if (busy) return;
  busy=true;
  $('#error').textContent='';
  try { await operation(); }
  catch (err) { $('#error').textContent=err.message; }
  finally { busy=false; }
}

function render(observation) {
  $('#attempt').hidden=false;
  $('#audit').hidden=true;
  $('#instruction').textContent=observation.instruction;
  $('#heading').textContent=observation.heading;
  $('#content').replaceChildren(...observation.content.map(value=>{
    const li=document.createElement('li');
    li.textContent=value;
    return li;
  }));
  $('#actions').replaceChildren(...observation.allowed_actions.map(action=>{
    const button=document.createElement('button');
    button.textContent=action.label;
    button.addEventListener('click',()=>run(async()=>{
      const data=await post('/step',{id:sessionId,proposal:{observation_id:observation.observation_id,action_id:action.id}});
      if (data.observation) render(data.observation);
      else {
        $('#heading').textContent='Tentativa encerrada';
        $('#content').replaceChildren();
        $('#actions').replaceChildren();
        $('#audit').hidden=false;
        $('#events').textContent=JSON.stringify({resultado:data.result,eventos:data.events},null,2);
      }
      $('#heading').focus();
    }));
    return button;
  }));
}
$('#setup').addEventListener('submit',event=>{
  event.preventDefault();
  run(async()=>{
    const data=await post('/session',Object.fromEntries(new FormData(event.target)));
    sessionId=data.id;
    render(data.observation);
    $('#heading').focus();
  });
});


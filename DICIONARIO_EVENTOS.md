# Dicionário de eventos da P3

Cada sessão é um arquivo JSON. `manifest.json` identifica a origem, versão, ordem, variantes e resultados por arquivo. `events` é a trilha ordenada; `mac` guarda apenas padrões operacionais; `requests` contém os corpos efetivamente montados para envio, respostas disponíveis e latências quando o modo é API. Em modo técnico a lista de requisições permanece vazia.

| Campos | Semântica |
|---|---|
| id, sequence, timestamp | Evento único, posição monotônica e data UTC ISO 8601 |
| session, persona, task, position, variant | Unidade da sessão, persona fictícia, tentativa e condição |
| configuration, origin | Fixo/amostrado/neutro e origem técnica, manual local ou sintética LLM |
| scene, type | Tela privada do auditor e tipo do evento |
| u, action, d, displayed_content | Fala executada, ação interna, título e conteúdo visível do preposto no registro de tela |
| observation_id, proposed_id, omissions | Observação em vigor, proposta e sinais omitidos, exclusivos da auditoria |
| request_id, layer, topic, return_scene | Solicitação de suporte e contexto de retorno |
| error, error_id | Categoria, requisito, identificação do erro ou de sua recuperação |
| result | Fechamento com status, motivo, ações, oportunidades, consultas de ajuda e erros |

Eventos de ciclo: session_started, task_started, screen_viewed, observation_emitted, action_proposed, action_rejected, action_executed, help_requested, help_delivered, learning_updated, report_created, report_voided, error_marked, error_resolved, technical_failure, task_closed e session_closed.

- **S** = sucessos verificados por tentativas iniciadas; informar desconhecidos à parte.
- **Rₑ** = marcas E1–E3 por oportunidades funcionais; E4 é omissão independente, fora de Rₑ. E5 requer evidência de divergência sem falha técnica; não é produzido pelo executor atômico.
- **A** = ações efetivamente executadas por tentativa, incluindo Concluir/Desistir. Propostas rejeitadas são contadas à parte.
- **H** = pedidos e entregas por tentativas iniciadas, com estratificação por camada, tarefa e variante. Em C4, o primeiro acesso é exigido pela tarefa. Camadas adicionais e pedidos em C2 são opcionais.
- Denominador zero: indefinido. Dados perdidos ou falha técnica que impeça verificar o desfecho: desconhecido. Duplicatas idênticas do mesmo ID são uma unidade de registro.


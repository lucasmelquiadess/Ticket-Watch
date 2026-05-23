# Ticket Watch

MVP em TypeScript para monitorar páginas de eventos da Ticketmaster Brasil e avisar por WhatsApp quando um setor e modalidade de ingresso específica voltar a ficar disponível.

Nós que amamos esse mundo de shows e festivais sabemos como uma venda de ingressos para eventos concorridos pode ser estressante. Muitas vezes, ingressos uma vez esgotados automaticamente voltam a ficar disponíveis para venda após eventuais cancelamentos ou bloqueios de segurança da plataforma.

Importante: este projeto não automatiza a compra, sistema de fila virtual, captcha ou login. Ele apenas observa as páginas públicas em intervalos de tempo razoáveis e configuráveis, em respeito aos termos de uso, privacidade e regras da plataforma.

## Stack

- Backend: Node.js, Express, TypeScript
- Frontend: React, Vite, TypeScript, JavaScript
- Storage MVP: JSON em `data/store.json`
- Notificacao: console por padrao, Twilio WhatsApp opcional
- Monitor: `html` por padrao, `playwright` opcional

## Comecar

```bash
npm install
copy .env.example .env
npm run dev
```

Frontend: `http://127.0.0.1:5173`

API: `http://127.0.0.1:4000/api/health`

## Configurar WhatsApp via Twilio

No `.env`:

```bash
WHATSAPP_PROVIDER=twilio
TWILIO_ACCOUNT_SID=seu_sid
TWILIO_AUTH_TOKEN=seu_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

O telefone do usuario pode ser digitado como `11999999999` ou `+5511999999999`. O backend normaliza para E.164 e envia como `whatsapp:+55...`.

Para testar localmente com o Sandbox da Twilio:

1. Ative o WhatsApp Sandbox na Twilio.
2. No WhatsApp do destinatario, envie `join <codigo-do-sandbox>` para o numero sandbox da Twilio.
3. Deixe `TWILIO_CONTENT_SID` vazio durante o teste de janela de 24 horas.
4. Reinicie o app.
5. Na aba `Admin`, use o bloco `Teste WhatsApp` para enviar uma mensagem manual.

Para alertas proativos em producao, prefira um template aprovado no Twilio Content Template Builder e configure:

```bash
TWILIO_CONTENT_SID=HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

O app envia as variaveis `{{1}}` nome, `{{2}}` modalidade, `{{3}}` setor, `{{4}}` evento e `{{5}}` link do evento.

## Monitor com Playwright

O motor `html` usa `fetch` e funciona quando o texto de disponibilidade ja vem no HTML. Se a pagina depender de JavaScript, use:

```bash
npm run playwright:install
```

Depois ajuste:

```bash
MONITOR_ENGINE=playwright
```

O checker tenta classificar cada setor pelo texto ao redor do nome do setor, procurando sinais como `disponivel`, `comprar`, `esgotado` e `indisponivel`.

Em producao, validar os setores com os eventos reais antes de confiar nos alertas.

© Lucas Melquiades de Santana Martins 
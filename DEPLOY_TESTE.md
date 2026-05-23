# Deploy de teste

Este guia sobe o MVP para validacao com poucos usuarios. Para monitoramento real, use um ambiente que nao durma e intervalos conservadores.

## 1. Configuracao local

```bash
copy .env.example .env
npm install
npm run build
npm start
```

Abra `http://127.0.0.1:4000`.

No `.env`, defina:

```bash
ADMIN_TOKEN=um-token-longo-e-aleatorio
WHATSAPP_PROVIDER=console
MONITOR_ENGINE=html
DEFAULT_CHECK_INTERVAL_SECONDS=60
MIN_CHECK_INTERVAL_SECONDS=60
```

Com `WHATSAPP_PROVIDER=console`, as mensagens aparecem no terminal do backend.

## 2. Teste com Docker

```bash
copy .env.example .env
docker compose up --build
```

Se a sua instalacao usar o binario antigo do Compose:

```bash
docker-compose up --build
```

Abra `http://127.0.0.1:4000`.

O arquivo JSON fica persistido no volume `ticket-watch-data`.

Se precisar usar `MONITOR_ENGINE=playwright` dentro do Docker, ajuste no `.env`:

```bash
MONITOR_ENGINE=playwright
INSTALL_PLAYWRIGHT=true
```

Depois rode o build novamente.

## 3. Publicar em um servico Node

Use qualquer host que rode Node 22 ou Docker. Para um teste simples:

- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Health check: `/api/health`
- Porta: use a variavel `PORT` fornecida pelo provedor

Variaveis obrigatorias para teste publico:

```bash
NODE_ENV=production
ADMIN_TOKEN=um-token-longo-e-aleatorio
MONITOR_ENABLED=true
MONITOR_ENGINE=html
DEFAULT_CHECK_INTERVAL_SECONDS=60
MIN_CHECK_INTERVAL_SECONDS=60
CHECK_TIMEOUT_MS=30000
ALLOW_NON_TICKETMASTER_URLS=false
WHATSAPP_PROVIDER=console
```

Para WhatsApp real via Twilio:

```bash
WHATSAPP_PROVIDER=twilio
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

Para disparos proativos em producao, crie um template aprovado no Twilio Content Template Builder e acrescente:

```bash
TWILIO_CONTENT_SID=HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Modelo sugerido:

```text
Oi {{1}}, a modalidade {{2}} no setor {{3}} voltou a aparecer como disponivel para {{4}}.
Confira agora: {{5}}
```

## 4. Cadastrar o primeiro evento

1. Abra a URL publica do app.
2. Entre na aba `Admin`.
3. Cole o mesmo `ADMIN_TOKEN` usado no ambiente.
4. Informe nome, URL da Ticketmaster Brasil e setores.
5. Clique em salvar.
6. Use o botao de status para confirmar que o monitor esta ativo.

## 5. Cuidados para teste publico

- Nao deixe `ADMIN_TOKEN` vazio.
- Nao use intervalos menores que 60 segundos.
- Servicos gratuitos que dormem nao monitoram enquanto estao dormindo.
- O storage JSON e suficiente para piloto pequeno, mas deve virar Postgres antes de muitos usuarios.
- Publique uma politica simples de privacidade antes de coletar telefones de terceiros.

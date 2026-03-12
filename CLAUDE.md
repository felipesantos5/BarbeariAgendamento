# BarbeariAgendamento - Regras de Desenvolvimento

## Sistema em Produção
Este sistema está em produção com barbearias ativas que dependem dele no dia a dia. **ZERO tolerância a erros.** Qualquer mudança deve ser validada antes do deploy.

## Arquitetura
- **backend/** — API Node.js (Express 5, ES Modules, MongoDB, Redis)
- **admin/** — Painel administrativo (React 19, Vite, TypeScript, shadcn/ui)
- **front/** — Site do cliente para agendamentos (React 19, Vite, TypeScript)
- Deploy via Docker (backend + Evolution API + Redis + PostgreSQL)
- Admin e Front servidos via nginx em containers separados

## Checklist Obrigatório Antes de Qualquer Deploy

### 1. Build do Admin (TypeScript + Vite)
```bash
cd admin && npx tsc --noEmit && npm run build
```
- Se o `tsc` falhar, NÃO faça deploy. Corrija todos os erros de tipo primeiro.
- O `vite build` deve completar sem warnings de bundling.

### 2. Build do Front
```bash
cd front && npx tsc --noEmit && npm run build
```
- Mesma regra: zero erros TypeScript.

### 3. Backend — Verificação de Imports
O backend é JavaScript puro (sem TypeScript). Sempre verifique:
- Imports novos estão corretos (caminhos e extensões `.js`)
- Models usados em novas rotas estão importados
- Novas rotas estão registradas no `app.js`

## Funcionalidades Críticas (NUNCA podem quebrar)

### Agendamento (front + backend)
- Cliente acessar a página de agendamento da barbearia
- Selecionar barbeiro, serviço, data e horário
- Criar agendamento (com ou sem pagamento)
- Receber confirmação via WhatsApp

### Painel Admin (admin + backend)
- Login do admin (email + senha)
- Primeiro acesso sem senha (status "pending" → modal de criar senha)
- Visualização e gestão de agendamentos (calendário)
- CRUD de barbeiros, serviços, planos, produtos
- Métricas e dashboard

### WhatsApp (backend)
- Envio de lembretes automáticos (cron jobs)
- Lembretes de retorno para clientes inativos (terças 11h)
- Conexão/desconexão da instância WhatsApp da barbearia
- Fallback para instância padrão quando instância da barbearia falha

### Pagamentos (backend)
- Webhooks do Mercado Pago para pagamentos de agendamentos
- Webhooks do Mercado Pago para assinaturas de clientes
- Webhook SaaS para criação automática de barbearias (`/api/saas/webhook`)
- NUNCA altere a lógica de webhooks sem testar extensivamente

### Autenticação
- Login admin com JWT (365 dias)
- Login super admin com senha root (8h)
- Middleware `protectAdmin` + `checkAccountStatus`
- Status de conta: active, trial, inactive
- Contas inactive = somente leitura (GET permitido, escrita bloqueada)

## Regras de Código

### Geral
- Não crie arquivos com nome "null" ou "nul"
- Não commite chaves de API, tokens ou credenciais em código
- Não altere arquivos `.env` no repositório
- Mantenha os campos `mergeParams: true` nos routers que precisam de `barbershopId`
- Toda rota nova no backend deve ser registrada no `app.js` com os middlewares corretos

### Backend
- Models Mongoose: sempre use `.select()` quando não precisar de todos os campos
- Webhooks: sempre retorne 200 imediatamente, processe em background
- Cron jobs: registrados em `schedulerService.js`, timezone `America/Sao_Paulo`
- WhatsApp: sempre use `sendWhatsAppMessage()` para mensagens de barbearia (faz fallback automático). Use `sendWhatsAppConfirmation()` apenas para mensagens do número fixo do sistema.
- Delays humanizados entre mensagens em massa (20-45s base + jitter)

### Frontend
- Sempre use os componentes shadcn/ui existentes
- Path alias: `@/` aponta para `./src/`
- Idioma da interface: Português (pt-BR)
- Não adicione emojis em código/interface a menos que solicitado
- Toast notifications via `sonner` (importar `toast` de `sonner`)

### Banco de Dados
- Nunca faça alterações destrutivas em schemas MongoDB em produção
- Novos campos devem ter `default` values para não quebrar documentos existentes
- Indices: adicione em campos frequentemente buscados

## Deploy Seguro

### Ordem de deploy
1. Primeiro o **backend** (ele é retrocompatível com o front antigo)
2. Depois o **admin**
3. Por último o **front**

### Se algo quebrar em produção
- Logs do backend: `docker logs backend_container`
- Verificar Redis: se o Redis cair, WhatsApp para de enviar (circuit breaker)
- Verificar Evolution API: se cair, mensagens vão falhar mas o sistema continua
- MongoDB: se cair, todo o sistema para — prioridade máxima

### Nunca faça isso
- `git push --force` em main
- Deploy direto sem build local primeiro
- Alterar schemas de webhook do Mercado Pago sem testes
- Remover campos do Barbershop model que já existem em produção
- Alterar a lógica de agendamento sem testar o fluxo completo
- Desabilitar rate limiting ou middlewares de segurança

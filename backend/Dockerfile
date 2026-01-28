FROM node:20-slim

# Defina o diretório de trabalho no container
WORKDIR /app

# Instale o PM2 globalmente
RUN npm install -g pm2

# Copie os arquivos package.json e package-lock.json (se disponível)
COPY package*.json ./

# Instale as dependências do projeto
RUN npm ci --only=production

# Copie os arquivos do projeto para o diretório de trabalho
COPY . .

# Exponha a porta que sua aplicação usa
EXPOSE 3001

# Comando para iniciar a aplicação com PM2
# pm2-runtime mantém o processo no foreground (necessário para Docker)
# --node-args são passados via ecosystem.config.cjs
CMD ["pm2-runtime", "start", "ecosystem.config.cjs"]
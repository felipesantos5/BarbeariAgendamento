FROM node:20-slim

# Defina o diretório de trabalho no container
WORKDIR /app

# Copie os arquivos package.json e package-lock.json (se disponível)
COPY package*.json ./

# Instale as dependências do projeto
RUN npm ci

# Copie os arquivos do projeto para o diretório de trabalho
COPY . .

# Exponha a porta que sua aplicação usa
EXPOSE 3001

# Comando para iniciar a aplicação
CMD ["node", "src/app.js"]
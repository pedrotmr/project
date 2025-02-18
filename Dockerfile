FROM node:18-slim

# Instalar dependências para o Chrome
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    xdg-utils \
    --no-install-recommends

# Limpar cache
RUN apt-get clean && rm -rf /var/lib/apt/lists/*

# Criar diretório de trabalho e definir permissões
WORKDIR /app
RUN mkdir -p /app/.wwebjs_auth && chmod -R 777 /app

# Copiar arquivos do projeto
COPY package*.json ./
COPY . .

# Instalar dependências
RUN npm install

# Definir variáveis de ambiente
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Definir usuário não-root
USER node

# Iniciar a aplicação
CMD ["node", "src/index.js"] 
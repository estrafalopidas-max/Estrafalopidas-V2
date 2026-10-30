FROM node:22-alpine

WORKDIR /app

# Instalar dependencias
COPY package*.json ./
RUN npm install

# Copiar el código fuente y compilar el frontend (Vite)
COPY . .
RUN npm run build

# Crear carpeta de datos persistentes para TrueNAS
RUN mkdir -p /app/data

ENV TZ=America/Bogota
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]

FROM node:18.17.0-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY . .

EXPOSE 4040

CMD ["node", "server.js"]

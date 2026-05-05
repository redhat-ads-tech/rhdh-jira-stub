FROM registry.access.redhat.com/ubi9/nodejs-20-minimal:latest

COPY package.json ./
RUN npm ci --omit=dev

COPY *.js ./

EXPOSE 8080
CMD ["node", "index.js"]

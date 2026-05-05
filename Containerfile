FROM registry.access.redhat.com/ubi9/nodejs-22-minimal:latest

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY *.js ./

EXPOSE 8080
CMD ["node", "index.js"]

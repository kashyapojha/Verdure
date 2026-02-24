FROM node:20
WORKDIR /app

# Copy backend and install
COPY Backend/package*.json ./Backend/
RUN cd ./Backend && npm install
COPY Backend ./Backend

# Copy frontend
COPY Frontend ./Frontend

EXPOSE 3030

CMD ["node", "Backend/server.js"]
import { createEngineWebSocketServer } from './wsServer';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
console.log(`Starting engine server on port ${PORT}...`);
createEngineWebSocketServer(PORT);

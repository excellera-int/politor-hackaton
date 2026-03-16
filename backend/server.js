require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const { typeDefs } = require('./graphql/typeDefs');
const { resolvers } = require('./graphql/resolvers');
const { testConnection: testPostgres } = require('./config/db');
const { testConnection: testNeo4j } = require('./config/graph');

async function start() {
  try {
    // Verify database connections on startup — fail fast if unavailable
    await testPostgres();
    await testNeo4j();

    const app = express();

    app.use(cors({ origin: process.env.CORS_ORIGIN }));
    app.use(express.json());

    // Health check REST endpoint (Docker / load balancer probes)
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    const server = new ApolloServer({ typeDefs, resolvers });
    await server.start();

    app.use('/graphql', expressMiddleware(server));

    const port = process.env.PORT || 4040;
    app.listen(port, () => {
      console.log(`[POLITOR BACKEND] Server ready at http://localhost:${port}/graphql`);
    });
  } catch (err) {
    console.error('[FATAL STARTUP ERROR]:', err);
    process.exit(1);
  }
}

start();

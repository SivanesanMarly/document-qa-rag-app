import { buildApp } from './app.js';
import { env } from './config.js';

const app = buildApp();

const start = async () => {
  try {
    await app.listen({
      port: env.PORT,
      host: env.HOST
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

await start();

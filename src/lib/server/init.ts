
class ServerInitializer {
  private static instance: ServerInitializer;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): ServerInitializer {
    if (!ServerInitializer.instance) {
      ServerInitializer.instance = new ServerInitializer();
    }
    return ServerInitializer.instance;
  }

  public async initialize() {
    if (this.isInitialized) {
      console.log('Server already initialized, skipping...');
      return;
    }

    this.isInitialized = true;
    console.log('Initializing server...');

    try {
      // In production, we run migrations during build, so we skip them here
      if (process.env.NODE_ENV !== 'production') {
        const { runDatabaseMigrations } = await import('./migrate');
        await runDatabaseMigrations();
        console.log('Development migrations completed successfully');
      } else {
        console.log('Skipping migrations in production (already handled during build)');
      }
      
      console.log('Server initialization complete');
    } catch (error) {
      console.error('Failed to initialize server:', error);
      process.exit(1);
    }
  }

}

export const serverInitializer = ServerInitializer.getInstance();

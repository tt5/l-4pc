import { createHandler, StartServer } from "@solidjs/start/server";
import { MetaProvider } from '@solidjs/meta';
import { serverInitializer } from '~/lib/server/init';

// Initialize server when the module loads in Node.js environment
if (typeof window === 'undefined') {
  serverInitializer.initialize();
}

export default createHandler(() => {
  return (
    <StartServer
      document={({ assets, children, scripts }) => (
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
            <MetaProvider>
              <title>4pc</title>
            </MetaProvider>
            {assets}
          </head>
          <body>
            <div id="app">{children}</div>
            {scripts}
          </body>
        </html>
      )}
    />
  );
});

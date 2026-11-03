import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [{
    name: 'paw-haven-world-editor-endpoint',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const requestUrl = req.url || '/';
        const queryIndex = requestUrl.indexOf('?');
        const pathname = queryIndex < 0 ? requestUrl : requestUrl.slice(0, queryIndex);
        if (pathname === '/world-editor' || pathname === '/world-editor/') {
          res.statusCode = 302;
          res.setHeader('Location', '/world-editor.html' + (queryIndex < 0 ? '' : requestUrl.slice(queryIndex)));
          res.end();
          return;
        }
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const requestUrl = req.url || '/';
        const queryIndex = requestUrl.indexOf('?');
        const pathname = queryIndex < 0 ? requestUrl : requestUrl.slice(0, queryIndex);
        if (pathname === '/world-editor' || pathname === '/world-editor/') {
          res.statusCode = 302;
          res.setHeader('Location', '/world-editor.html' + (queryIndex < 0 ? '' : requestUrl.slice(queryIndex)));
          res.end();
          return;
        }
        next();
      });
    }
  }],
  server: { host: '0.0.0.0', port: 5173, strictPort: false },
  preview: { host: '0.0.0.0', port: 4173, strictPort: false },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    rolldownOptions: {
      input: { game: 'index.html', worldEditor: 'world-editor.html' },
      output: {
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/, priority: 20 },
            { name: 'rapier', test: /node_modules[\\/]@dimforge[\\/]rapier3d-compat[\\/]/, priority: 20 }
          ]
        }
      }
    }
  }
});

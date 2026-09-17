/* ==========================================================================
   dev-proxy.js — Proxy CORS de développement pour GestionPatients
   --------------------------------------------------------------------------
   Le backend Java (backend/) ne renvoie aucun en-tête CORS et ne gère pas
   les requêtes OPTIONS (préflight). Comme il est interdit de modifier le
   code backend pour ce projet, un navigateur qui appelle
   http://localhost:8080 depuis une autre origine (le frontend statique,
   servi ailleurs) voit ses requêtes POST/PUT/DELETE/PATCH bloquées par le
   CORS AVANT même qu'elles n'atteignent le serveur Java.

   Ce script est un petit relais autonome, écrit avec les seuls modules
   natifs de Node.js (aucune dépendance à installer) :

     Navigateur --CORS OK--> dev-proxy (ce script, :8090) --> backend Java (:8080)

   Le proxy ne fait AUCUNE requête "cross-origin" lui-même (les appels
   serveur-à-serveur ne sont jamais soumis au CORS, qui est une règle
   appliquée par les navigateurs) : il se contente de rejouer la requête
   du navigateur vers le vrai backend, et d'ajouter les en-têtes
   Access-Control-* à la réponse avant de la renvoyer au navigateur.

   Usage :
     node tools/dev-proxy.js
     (options : PROXY_PORT, BACKEND_URL en variables d'environnement)

   Alternative sans proxy : ajouter les mêmes en-têtes CORS directement
   dans index.java (quelques lignes, voir le PDF de documentation,
   annexe "CORS côté backend"). Ce script existe justement pour ne PAS
   avoir à le faire.
   ========================================================================== */

const http = require("http");
const { URL } = require("url");

const PROXY_PORT = parseInt(process.env.PROXY_PORT || "8090", 10);
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";
const backend = new URL(BACKEND_URL);

function applyCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "600");
  res.setHeader("Vary", "Origin");
}

const server = http.createServer((req, res) => {
  applyCorsHeaders(req, res);

  // Requête de préflight CORS : le backend Java ne sait pas y répondre
  // (pas de route OPTIONS), donc le proxy répond directement.
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const upstreamReq = http.request(
    {
      hostname: backend.hostname,
      port: backend.port,
      path: req.url,
      method: req.method,
      headers: Object.assign({}, req.headers, { host: backend.host })
    },
    upstreamRes => {
      applyCorsHeaders(req, res);
      res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );

  upstreamReq.on("error", err => {
    applyCorsHeaders(req, res);
    res.writeHead(502, { "Content-Type": "application/json; charset=UTF-8" });
    res.end(JSON.stringify({ error: "Backend injoignable via le proxy (" + BACKEND_URL + ") : " + err.message }));
  });

  req.pipe(upstreamReq);
});

server.listen(PROXY_PORT, () => {
  console.log("====================================");
  console.log("Proxy CORS demarre sur http://localhost:" + PROXY_PORT);
  console.log("  -> relaie vers " + BACKEND_URL);
  console.log("Pointez window.PEC_API_BASE_URL (frontend/index.html) sur");
  console.log("http://localhost:" + PROXY_PORT + " pour l'utiliser.");
  console.log("====================================");
});

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

   Sert aussi les fichiers de backend/media/ sous /media/* : le serveur
   Java (com.sun.net.httpserver.HttpServer) n'expose que des routes JSON
   (/api/*), aucun contexte de fichiers statiques — donc les photos
   référencées par Patient.photo_url (ex: "\backend\media\patients\xxx.jpg")
   ne sont pas chargeables par le navigateur telles quelles. Comme pour le
   CORS, plutôt que de modifier le backend Java, ce proxy comble le trou :
   frontend/api.js transforme le chemin Windows stocké en base en URL
   /media/... (voir toPhotoUrl()), servie ici directement depuis le disque.

   Usage :
     node tools/dev-proxy.js
     (options : PROXY_PORT, BACKEND_URL, MEDIA_DIR en variables d'environnement)

   Alternative sans proxy : ajouter les mêmes en-têtes CORS + un contexte
   de fichiers statiques directement dans index.java (voir le PDF de
   documentation, annexe "CORS côté backend"). Ce script existe justement
   pour ne PAS avoir à le faire.
   ========================================================================== */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PROXY_PORT = parseInt(process.env.PROXY_PORT || "8090", 10);
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";
const backend = new URL(BACKEND_URL);
const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || path.join(__dirname, "..", "backend", "media"));

const MIME_TYPES = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml"
};

function applyCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "600");
  res.setHeader("Vary", "Origin");
}

// Sert un fichier sous backend/media/ pour une requête GET /media/<chemin>.
// Protégé contre la traversée de répertoire (le chemin résolu doit rester
// sous MEDIA_DIR). Répond 404 si le fichier n'existe pas — c'est le cas
// normal pour beaucoup de photos de test référencées en base mais jamais
// réellement déposées sur le disque ; le frontend affiche alors les
// initiales de l'assuré en repli (voir setAvatar() dans app.js).
function serveMedia(req, res, urlPath) {
  const relPath = decodeURIComponent(urlPath.replace(/^\/media\//, ""));
  const filePath = path.resolve(MEDIA_DIR, relPath);
  if (!filePath.startsWith(MEDIA_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
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

  if (req.method === "GET" && req.url.startsWith("/media/")) {
    serveMedia(req, res, req.url.split("?")[0]);
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
  console.log("  -> relaie /api/* vers " + BACKEND_URL);
  console.log("  -> sert /media/* depuis " + MEDIA_DIR);
  console.log("Pointez window.PEC_API_BASE_URL (frontend/index.html) sur");
  console.log("http://localhost:" + PROXY_PORT + " pour l'utiliser.");
  console.log("====================================");
});

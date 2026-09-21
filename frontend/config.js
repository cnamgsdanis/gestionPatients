/* ==========================================================================
   PEC — configuration de l'adresse de l'API (chargé avant api.js)
   --------------------------------------------------------------------------
   En LOCAL (page ouverte sur localhost / 127.0.0.1) : l'API est cherchée sur le port 8081, celui de
   backend/db/local.properties (PEC_PORT ; sur ce poste Apache occupe déjà 8080 et 8090). Changez le port
   ici et dans local.properties si vous lancez l'API autrement.

   En PRODUCTION : ne rien faire si le site et l'API partagent la même adresse (reverse proxy qui
   relaie /api et /media) ; sinon définir ici l'adresse complète, par exemple :
       window.PEC_API_BASE_URL = "https://api.exemple.ga";
   (le back-end gère CORS : variable PEC_CORS_ORIGINS pour restreindre les origines autorisées).
   Une valeur déjà définie avant ce fichier n'est jamais écrasée.
   ========================================================================== */
if (window.PEC_API_BASE_URL == null && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
  window.PEC_API_BASE_URL = "http://localhost:8081";
}

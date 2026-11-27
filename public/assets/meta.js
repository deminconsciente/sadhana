/* Meta Pixel + origen del contacto (UTM) de sadhanaholistics.com.
   - PIXEL_ID vacío = no carga nada de Meta (apagado). Se llena al crear el Pixel en Meta Business.
   - Guarda utm_* y fbclid de la primera visita (30 días) para mandarlos con la reserva al CRM.
   - Eventos: ReservaIniciada, ReservaPendiente, ClasePrueba (con el folio como eventID para deduplicar). */
(function(){
  var PIXEL_ID = "";
  var KEY = "sad_utm", DIAS = 30;
  var CAMPOS = ["utm_source","utm_medium","utm_campaign","utm_content","utm_term","fbclid"];

  function leer(){ try { var v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && v.t && Date.now() - v.t < DIAS*864e5) return v; } catch(e){} return null; }
  function guardar(v){ try { localStorage.setItem(KEY, JSON.stringify(v)); } catch(e){} }

  // Primer toque manda: si ya hay un origen vigente, no se pisa.
  function capturar(){
    var q; try { q = new URLSearchParams(location.search); } catch(e){ return; }
    var nuevo = {t: Date.now()}, hay = false;
    CAMPOS.forEach(function(k){ var x = q.get(k); if (x){ nuevo[k] = x.slice(0,100); hay = true; } });
    // Alias cortos para los enlaces de anuncios: ?fuente=meta&campana=enero
    [["fuente","utm_source"],["campana","utm_campaign"]].forEach(function(a){ var x = q.get(a[0]); if (x && !nuevo[a[1]]){ nuevo[a[1]] = x.slice(0,100); hay = true; } });
    if (hay && !leer()) guardar(nuevo);
    else if (!hay && !leer() && document.referrer){
      try { var h = new URL(document.referrer).hostname; if (h && h !== location.hostname) guardar({t: Date.now(), ref: h.slice(0,100)}); } catch(e){}
    }
  }
  capturar();

  // Objeto simple para el CRM: {utm_source, utm_medium, ..., ref}. null si no hay nada.
  function utm(){
    var v = leer(); if (!v) return null;
    var o = {}; CAMPOS.concat(["ref"]).forEach(function(k){ if (v[k]) o[k] = v[k]; });
    return Object.keys(o).length ? o : null;
  }

  if (PIXEL_ID){
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    fbq("init", PIXEL_ID);
    fbq("track", "PageView");
  }

  // track("ReservaPendiente", {titulo, valor}, folio). Sin Pixel no hace nada.
  function track(evento, datos, folio){
    if (!PIXEL_ID || !window.fbq) return;
    datos = datos || {};
    var p = {content_name: datos.titulo || undefined, currency: "MXN"};
    if (datos.valor) p.value = datos.valor;
    try { fbq("trackCustom", evento, p, folio ? {eventID: folio + ":" + evento} : undefined); } catch(e){}
  }

  window.SadhanaMeta = {utm: utm, track: track};
})();

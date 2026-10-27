// ============================================================
//  CONFIGURACIÓN
// ============================================================
// Mientras `firebase` sea null, la web funciona en MODO LOCAL:
// los datos solo se guardan en el navegador donde la abras (útil para probar).
//
// Para jugar todos juntos, crea un proyecto en Firebase (ver README.md)
// y pega aquí el objeto de configuración que te da, por ejemplo:
//
//   firebase: {
//     apiKey: "AIza...",
//     authDomain: "mercado-negro.firebaseapp.com",
//     projectId: "mercado-negro",
//     storageBucket: "mercado-negro.appspot.com",
//     messagingSenderId: "1234567890",
//     appId: "1:1234567890:web:abcdef"
//   },
//
window.MN_CONFIG = {
  firebase: {
    apiKey: 'AIzaSyDODoJFlJZ0jP8lpwZAKQgArtPj_1ZLj9Y',
    authDomain: 'nocheviejalgr.firebaseapp.com',
    projectId: 'nocheviejalgr',
    storageBucket: 'nocheviejalgr.firebasestorage.app',
    messagingSenderId: '286238050587',
    appId: '1:286238050587:web:bd16c3ad61715f7972ebbe',
  },

  // Clave pública para las notificaciones push (Firebase → ⚙️ Configuración
  // del proyecto → Cloud Messaging → Certificados push web → Generar par de
  // claves). Sin ella solo hay avisos con la app abierta o en segundo plano.
  vapidKey: 'BFOL2rr8Oziyce6I3zpysCH-kxdcZB11EkNjHQIg5akplyoN5jtORPoBf1N7AeVbN1m59qnV66c3PzNp00h_LPA',

  // Identificador de la partida. Cámbialo para empezar una partida nueva
  // sin borrar la anterior (p. ej. 'nochevieja-2027').
  gameId: 'nochevieja-2026',

  // Nombre del jugador que será la Banca. El primero que se registre con
  // este nombre recibe los poderes de la Banca (regístrate tú antes de
  // pasar el enlace). Déjalo vacío para usar solo el PIN.
  bankName: 'Xema',
};

// Con "?local" en la dirección se juega en modo local (sin tocar la partida
// real de Firebase): útil para hacer pruebas.
if (/[?&]local\b/.test(location.search)) { window.MN_CONFIG.firebase = null; window.MN_CONFIG.localTest = true; }

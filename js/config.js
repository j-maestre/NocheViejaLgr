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
  firebase: null,

  // Identificador de la partida. Cámbialo para empezar una partida nueva
  // sin borrar la anterior (p. ej. 'nochevieja-2027').
  gameId: 'nochevieja-2026',

  // Nombre del jugador que será la Banca. El primero que se registre con
  // este nombre recibe los poderes de la Banca (regístrate tú antes de
  // pasar el enlace). Déjalo vacío para usar solo el PIN.
  bankName: 'Xema',
};

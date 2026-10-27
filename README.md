# 🎰 Mercado Negro

Contador de fichas para el casino clandestino de Nochevieja.
Web estática (HTML + CSS + JS, sin compilar nada) pensada para GitHub Pages,
con Firebase Firestore como base de datos compartida en tiempo real.

## Qué hace

- **🏆 Ranking** en directo: fichas, variación del día, apuesta máxima de cada uno, etiqueta de MOROSO.
- **⚔️ Retos**: envías un reto (rival, minijuego, apuesta). El rival lo acepta o rechaza desde su móvil.
  Tras jugar, uno registra quién ha ganado y el otro lo confirma; si no está de acuerdo, se vuelve a registrar
  y la Banca puede resolverlo. El límite de apuesta se comprueba al enviar y al aceptar.
  Avisos con contador en la pestaña Duelo. La Banca tiene además un registro directo (sin aceptación).
- **📜 Historial** de todos los movimientos (filtrable por jugador). La Banca puede anular errores.
- **🏦 Banca**: es el jugador cuyo nombre está en `bankName` de `js/config.js` (Xema). Tiene los poderes en cualquier
  móvil vinculado a ese jugador; el PIN solo sirve mientras no hay Banca asignada. Préstamos a quien está en la ruina a cambio de un castigo (con ruleta 🎲),
  sentar jugadores, ajustes manuales, reglas de la casa y copias de seguridad.
- **👤 Registro y perfil**: la primera vez que alguien entra elige nombre y avatar, y su dispositivo queda
  vinculado. En el perfil ve sus estadísticas (racha, némesis, víctima favorita…), puede cambiar nombre/avatar
  y tiene un **código de recuperación** de 4 letras para entrar desde otro móvil. La Banca ve todos los códigos.
- **⏱️ Cuenta atrás**: hasta el inicio de la partida (29 dic) y, una vez empezada, hasta el cierre (31 dic, 23:00).
  Al cerrar, se congela todo y se corona al ganador.
- **📖 Normas**: sección generada con las cifras de las reglas de la Banca (siempre al día).
- **🃏 Mesas multijugador**: póker, Dixit, Fallera calavera o por equipos (A vs B). Cada uno pone la entrada y el
  ganador (o el equipo) se lleva el bote. Un jugador registra el resultado y otro lo confirma.
- **📅 Eventos** (calendario + portada con ilustración y cuenta atrás): ☭ evento comunista, 🍻 happy hour,
  🎟️ lotería y ⏱️ cronómetro global. La Banca los reprograma, cancela o lanza por sorpresa.
  Los ejecuta el primer móvil que tenga la web abierta, de forma determinista (sin duplicados).
- **🔁 Revancha / 💥 doble o nada**, **🎯 cazarrecompensas** (cortar una racha de 5+ da premio),
  **🎲 ruleta de minijuegos**, **🎮 especialistas por minijuego** y **💬 dedicatorias** al ganar.
- **🎰 Apuestas de espectadores** sobre duelos ajenos (reparto proporcional; si nadie acierta, la Banca).
- **🛒 Mercado negro**: 🛡️ inmunidad, 🎯 reto obligatorio y 🪂 seguro.
- **🎰 Tragaperras** al terminar cada duelo: modificador aleatorio (doble, consuelo, ronda para el público,
  comisión de la Banca, jackpot o nada), igual en todos los móviles porque sale del id del duelo.
- **🎬 Animaciones de los eventos**: sorteo de la lotería, expropiación comunista y revelación del cronómetro
  (se pueden repetir desde el calendario). Antes del comunista, el **ranking se censura** (☭ Camarada).
- **🎉 Confeti y sonido** al ganar (se puede silenciar en el perfil).
- **📺 Modo TV** (`#tv` al final de la dirección), **🏆 ceremonia final** con podio y **🎁 resumen** de la partida.
- **📲 App instalable** (PWA) con notificaciones del sistema cuando la web está en segundo plano.
  Las push con el móvil bloqueado necesitan Firebase Cloud Messaging (pendiente).

### Reglas que aplica

- **Apuesta máxima** = `% del capital` del jugador más pobre del duelo (nunca menos que la apuesta mínima
  ni más de lo que tiene). El % sube según las fechas que pongas en *Reglas de la casa*
  (por defecto: 10 % el 29 dic → 20 % el 30 → 30 % el 31 → 50 % desde las 20:00 del 31).
- **Préstamos**: solo para quien tiene menos fichas que la apuesta mínima. No se devuelven:
  se pagan cumpliendo el castigo. Hasta entonces el jugador sale en el *Muro de la vergüenza*.
- **Empates**: no se registran.

### Identificación de dispositivos

Los navegadores no permiten leer la MAC ni otros identificadores del hardware. La primera vez que se abre
la web se genera un identificador aleatorio que se guarda en el navegador (`localStorage`) y se asocia al
jugador. Si se borran los datos del navegador o se usa otro, se recupera el jugador con el código.

Los saldos no se guardan: se calculan a partir del historial, así que anular un movimiento
lo deshace por completo.

## Probar en local

Abre `index.html` en el navegador (o `python3 -m http.server` y entra en http://localhost:8000).
Sin Firebase configurado funciona en **modo local**: los datos solo existen en ese navegador.
PIN de la Banca por defecto: **1234** (cámbialo en *Reglas de la casa*).
La primera vez, en modo local, se sientan automáticamente 6 jugadores de prueba con duelos simulados.
En *Banca → 🧪 Pruebas* puedes añadir más, "ser otro jugador" para probar los dos lados de un reto,
abrir el modo TV, probar la ceremonia y el resumen, o borrarlo todo antes de la partida de verdad.

### Ensayo de eventos

En *📅 Eventos → 🧪 Ensayo* (solo la Banca): reprograma todos los eventos pendientes cada 4 minutos, acorta la
happy hour y el cronómetro, y abre la partida ya. Al terminar, *↺ Restaurar fechas reales* devuelve fechas y
reglas y anula lo que hicieron los eventos. Los duelos jugados en el ensayo se quedan: usa *Borrar todo* antes
de la partida real.

### Instalar en el móvil

- **Android (Chrome)**: menú ⋮ → *Instalar app* (o el botón del perfil).
- **iPhone (Safari)**: Compartir → *Añadir a pantalla de inicio*. Apple solo permite notificaciones a webs
  instaladas así. Después, en el perfil, *Activar notificaciones*.

## Configurar Firebase (para que todos vean lo mismo)

1. Entra en https://console.firebase.google.com y crea un proyecto (Analytics no hace falta).
2. **Compilación → Firestore Database → Crear base de datos** (región `eur3` o la que quieras, modo producción).
3. En la pestaña **Reglas** de Firestore pega esto y publica:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /games/{gameId}/{document=**} {
         allow read, write: if true;
       }
     }
   }
   ```

4. **Configuración del proyecto (⚙️) → Tus apps → Web (`</>`)**, regístrala y copia el objeto `firebaseConfig`.
5. Pégalo en `js/config.js` en lugar de `firebase: null`.

> Es normal que la `apiKey` de Firebase esté en el código: no es secreta.
> Con esas reglas cualquiera que tenga el enlace podría modificar los datos; para una partida entre amigos
> es suficiente, y para eso está el historial y las copias de seguridad.
> El PIN de la Banca es una barrera "de amigos", no seguridad real.

## Publicar en GitHub Pages

1. Crea un repositorio y sube estos archivos (`index.html` en la raíz).
2. **Settings → Pages → Build and deployment → Deploy from a branch**, rama `main`, carpeta `/ (root)`.
3. En un minuto estará en `https://<tu-usuario>.github.io/<repositorio>/`. Pasa ese enlace al grupo.

## Estructura

```
index.html          Estructura de las pantallas
manifest.json, sw.js, icons/   App instalable y notificaciones
css/style.css       Estilos
js/config.js        Configuración de Firebase, partida y nombre de la Banca
js/store.js         Almacenamiento (local / Firebase) y valores por defecto
js/chart.js         Gráfica de evolución (SVG)
js/app.js           Núcleo: ranking, retos, historial, perfil, Banca, normas y API de módulos
js/mod-app.js       Instalación (PWA) y notificaciones
js/mod-tables.js    Mesas multijugador
js/mod-events.js    Eventos, calendario y ensayo
js/mod-extras.js    Revancha, cazarrecompensas, ruleta y estadísticas por minijuego
js/mod-bets.js      Apuestas de espectadores
js/mod-market.js    Mercado negro
js/mod-fx.js        Confeti y sonido
js/mod-tv.js        Modo TV, ceremonia y resumen
js/mod-shows.js     Tragaperras y animaciones de los eventos
```

Los módulos se registran en `window.MNModules` y usan la API `MN` que expone `app.js`
(estado, saldos, avisos, diálogos…). Los movimientos automáticos (eventos, recompensas, seguros,
apuestas) se generan en un "barrido" con ids deterministas, así que repetirlo no duplica nada.

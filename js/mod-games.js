// ============================================================
//  MÓDULO: JUEGOS DENTRO DE LA APP (para los retos)
//  🎨 Caza del color · ⚫ ¿Quién es ese Pokémon? · 🏷️ Logo misterioso
//  🧠 Quiz · 🎵 Adivina la canción · 🐦 Flappy con tu cara
//  (el ⏱️ cronómetro vive en el módulo de eventos)
//
//  Cada juego recibe una semilla (el id del reto): los dos rivales juegan
//  exactamente la misma prueba. Devuelve { score, label, data } y gana la
//  puntuación más alta. Un solo intento: al empezar ya cuenta como jugado.
// ============================================================
(window.MNModules = window.MNModules || []).push((function () {
  'use strict';
  let MN;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const secs = (ms) => (ms / 1000).toFixed(1).replace('.', ',');

  // Azar con semilla (mismo resultado en todos los móviles)
  function rng(seed) {
    let a = MN.hash(String(seed)) >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const shuffle = (arr, r) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pickN = (arr, n, r, not = []) => shuffle(arr.filter((x) => !not.includes(x)), r).slice(0, n);
  // Mazo: la lista se baraja una vez para toda la partida y la partida número k de ese juego
  // coge los n siguientes. Así no se repite nada hasta agotar el mazo (y los rivales ven lo mismo).
  let deckIndex = null;
  function fromDeck(list, n, name, r) {
    if (deckIndex == null) return pickN(list, n, r);
    const deck = shuffle(list, rng(`${(window.MN_CONFIG || {}).gameId}|mazo|${name}`));
    const start = (deckIndex * n) % deck.length;
    return Array.from({ length: Math.min(n, deck.length) }, (_, i) => deck[(start + i) % deck.length]);
  }

  // ---------------------------------------------------------- escenario
  const box = () => MN.$('#app-game');
  function open() { const b = box(); b.hidden = false; document.body.classList.add('no-scroll'); return b; }
  function close() { const b = box(); b.hidden = true; b.innerHTML = ''; document.body.classList.remove('no-scroll'); }
  function frame(title, body) { box().innerHTML = `<div class="ag-inner"><div class="ag-title">${title}</div><div class="ag-body">${body}</div></div>`; return box().querySelector('.ag-body'); }
  const waitClick = (el, sel) => new Promise((res) => { el.addEventListener('click', (e) => { const b = e.target.closest(sel); if (b) res(b); }); });

  // Pantalla inicial: Empezar / Ahora no
  let startHook = null; let resume = null; let progress = null;
  async function intro(G, desc) {
    if (resume) return true; // continuando un turno a medias: sin pantalla inicial
    const body = frame(`${G.icon} ${G.name}`, `<p class="ag-desc">${desc}</p>
      <p class="hint center">⚠️ Solo tienes un intento: si sales a medias, cuenta lo que lleves.</p>
      <button type="button" class="btn primary ag-go" data-ag="go">¡Empezar!</button><button type="button" class="link" data-ag="no">Ahora no</button>`);
    const b = await waitClick(body, '[data-ag]');
    if (b.dataset.ag !== 'go') return false;
    if (startHook) await startHook();
    return true;
  }
  async function outro(G, html) {
    const body = frame(`${G.icon} ${G.name}`, `${html}<button type="button" class="btn primary" data-ag="ok">Cerrar</button>`);
    if (MN.fx) MN.fx.play('event');
    await waitClick(body, '[data-ag]');
  }

  // ---------------------------------------------------------- motor de preguntas
  // rounds: [{ show(el) → promesa, options: [..], ok: índice, reveal(el) }]
  async function quizRun(G, rounds, perRound) {
    // Si se recarga a mitad, se sigue desde la ronda siguiente (la que se estaba jugando cuenta como fallada)
    let correct = (resume && resume.correct) || 0; let total = (resume && resume.total) || 0;
    for (let i = (resume && resume.round) || 0; i < rounds.length; i++) {
      if (progress) await progress({ round: i + 1, correct, total: total + perRound });
      const R = rounds[i];
      const body = frame(`${G.icon} ${G.name}`, `<div class="ag-round">Ronda ${i + 1} de ${rounds.length} · ✅ ${correct}</div>
        <div class="ag-stage" id="ag-stage"></div><div class="ag-timer"><i id="ag-bar"></i></div>
        <div class="ag-opts">${R.options.map((o, k) => `<button type="button" class="btn ghost ag-opt" data-k="${k}">${o}</button>`).join('')}</div>`);
      const stage = body.querySelector('#ag-stage');
      await R.show(stage, body);
      const t0 = performance.now(); const bar = body.querySelector('#ag-bar');
      let timer;
      const picked = await new Promise((res) => {
        const tick = () => { const k = (performance.now() - t0) / perRound; bar.style.width = `${Math.max(0, 100 - k * 100)}%`; if (R.onTick) R.onTick(Math.min(1, k)); if (k >= 1) res(-1); else timer = requestAnimationFrame(tick); };
        timer = requestAnimationFrame(tick);
        body.querySelector('.ag-opts').addEventListener('click', (e) => { const b = e.target.closest('.ag-opt'); if (b) res(Number(b.dataset.k)); });
      });
      cancelAnimationFrame(timer);
      const ms = Math.min(perRound, performance.now() - t0); total += ms;
      const opts = body.querySelectorAll('.ag-opt');
      opts.forEach((b) => { b.disabled = true; });
      opts[R.ok].classList.add('right');
      if (picked === R.ok) { correct++; if (MN.fx) MN.fx.play('tick'); } else { if (picked >= 0) opts[picked].classList.add('wrong'); if (MN.fx) MN.fx.play('stop'); }
      if (R.reveal) R.reveal(stage);
      if (R.stop) R.stop();
      if (progress) progress({ round: i + 1, correct, total });
      await sleep(1300);
    }
    return { score: correct * 100000 - Math.round(total), label: `${correct}/${rounds.length} · ${secs(total)} s`, correct, total };
  }

  // ---------------------------------------------------------- ⚫ Pokémon (1.ª generación)
  const POKEMON = 'Bulbasaur Ivysaur Venusaur Charmander Charmeleon Charizard Squirtle Wartortle Blastoise Caterpie Metapod Butterfree Weedle Kakuna Beedrill Pidgey Pidgeotto Pidgeot Rattata Raticate Spearow Fearow Ekans Arbok Pikachu Raichu Sandshrew Sandslash Nidoran♀ Nidorina Nidoqueen Nidoran♂ Nidorino Nidoking Clefairy Clefable Vulpix Ninetales Jigglypuff Wigglytuff Zubat Golbat Oddish Gloom Vileplume Paras Parasect Venonat Venomoth Diglett Dugtrio Meowth Persian Psyduck Golduck Mankey Primeape Growlithe Arcanine Poliwag Poliwhirl Poliwrath Abra Kadabra Alakazam Machop Machoke Machamp Bellsprout Weepinbell Victreebel Tentacool Tentacruel Geodude Graveler Golem Ponyta Rapidash Slowpoke Slowbro Magnemite Magneton Farfetch\'d Doduo Dodrio Seel Dewgong Grimer Muk Shellder Cloyster Gastly Haunter Gengar Onix Drowzee Hypno Krabby Kingler Voltorb Electrode Exeggcute Exeggutor Cubone Marowak Hitmonlee Hitmonchan Lickitung Koffing Weezing Rhyhorn Rhydon Chansey Tangela Kangaskhan Horsea Seadra Goldeen Seaking Staryu Starmie Mr. Mime Scyther Jynx Electabuzz Magmar Pinsir Tauros Magikarp Gyarados Lapras Ditto Eevee Vaporeon Jolteon Flareon Porygon Omanyte Omastar Kabuto Kabutops Aerodactyl Snorlax Articuno Zapdos Moltres Dratini Dragonair Dragonite Mewtwo Mew'.split(' ');
  const pokeImg = (n) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${n}.png`;
  const preload = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

  async function playPokemon(G, seed) {
    if (!await intro(G, 'Sale la <b>silueta</b> de un Pokémon de la primera generación. Elige cuál es lo más rápido que puedas. <b>5 rondas</b>, 10 segundos cada una.')) return null;
    frame(`${G.icon} ${G.name}`, '<p class="center">Cargando Pokémon…</p>');
    const r = rng(seed + 'poke'); const nums = fromDeck([...Array(151).keys()].map((i) => i + 1), 5, 'poke', r);
    await Promise.all(nums.map((n) => preload(pokeImg(n))));
    const rounds = nums.map((n) => {
      const others = pickN(POKEMON, 3, r, [POKEMON[n - 1]]);
      const options = shuffle([POKEMON[n - 1], ...others], r);
      return {
        options: options.map(MN.esc), ok: options.indexOf(POKEMON[n - 1]),
        show: (el) => { el.innerHTML = `<img class="poke sil" src="${pokeImg(n)}" alt="">`; },
        reveal: (el) => el.querySelector('img').classList.remove('sil'),
      };
    });
    return quizRun(G, rounds, 10000);
  }

  // ---------------------------------------------------------- 🏷️ Logo misterioso
  const LOGOS = { cocacola: 'Coca-Cola', mcdonalds: "McDonald's", nike: 'Nike', adidas: 'Adidas', apple: 'Apple', spotify: 'Spotify', netflix: 'Netflix', instagram: 'Instagram', whatsapp: 'WhatsApp', youtube: 'YouTube', burgerking: 'Burger King', starbucks: 'Starbucks', google: 'Google', ikea: 'IKEA', zara: 'Zara', bmw: 'BMW', audi: 'Audi', volkswagen: 'Volkswagen', toyota: 'Toyota', renault: 'Renault', seat: 'SEAT', ferrari: 'Ferrari', playstation: 'PlayStation', tiktok: 'TikTok', facebook: 'Facebook', x: 'X (Twitter)', telegram: 'Telegram', paypal: 'PayPal', visa: 'Visa', mastercard: 'Mastercard', airbnb: 'Airbnb', uber: 'Uber', twitch: 'Twitch', redbull: 'Red Bull', kfc: 'KFC', puma: 'Puma', shell: 'Shell', movistar: 'Movistar', vodafone: 'Vodafone', orange: 'Orange', samsung: 'Samsung', huawei: 'Huawei', xiaomi: 'Xiaomi', lamborghini: 'Lamborghini', porsche: 'Porsche', tesla: 'Tesla', ryanair: 'Ryanair', iberia: 'Iberia', lidl: 'Lidl', carrefour: 'Carrefour', hbo: 'HBO', steam: 'Steam', epicgames: 'Epic Games', android: 'Android', firefox: 'Firefox', googlechrome: 'Google Chrome', pinterest: 'Pinterest', snapchat: 'Snapchat', reddit: 'Reddit', discord: 'Discord', dropbox: 'Dropbox', wikipedia: 'Wikipedia', duolingo: 'Duolingo', shazam: 'Shazam', tinder: 'Tinder', glovo: 'Glovo' };
  const logoUrl = (s) => `https://cdn.jsdelivr.net/npm/simple-icons@16.31.0/icons/${s}.svg`;

  async function playLogo(G, seed) {
    if (!await intro(G, 'Sale un trocito <b>ampliado</b> del logo de una marca, que se va alejando poco a poco. ¿Qué marca es? <b>5 rondas</b>, 12 segundos cada una.')) return null;
    frame(`${G.icon} ${G.name}`, '<p class="center">Cargando logos…</p>');
    const r = rng(seed + 'logo'); const slugs = fromDeck(Object.keys(LOGOS), 5, 'logo', r);
    const svgs = await Promise.all(slugs.map((s) => fetch(logoUrl(s)).then((x) => x.text()).catch(() => '')));
    const rounds = slugs.map((s, i) => {
      const name = LOGOS[s]; const others = pickN(Object.values(LOGOS), 3, r, [name]);
      const options = shuffle([name, ...others], r);
      const ox = 30 + r() * 40; const oy = 30 + r() * 40; // zona del logo que se ve al principio
      let svgEl = null;
      return {
        options: options.map(MN.esc), ok: options.indexOf(name),
        show: (el) => { el.innerHTML = `<div class="logo-win"><div class="logo-zoom" style="transform-origin:${ox}% ${oy}%">${svgs[i].replace('<svg', '<svg fill="#fff"')}</div></div>`; svgEl = el.querySelector('.logo-zoom'); svgEl.style.transform = 'scale(7)'; },
        onTick: (k) => { if (svgEl) svgEl.style.transform = `scale(${7 - k * 5})`; },
        reveal: () => { if (svgEl) { svgEl.style.transition = 'transform .4s'; svgEl.style.transform = 'scale(1)'; } },
      };
    });
    return quizRun(G, rounds, 12000);
  }

  // ---------------------------------------------------------- 🧠 Quiz
  // [pregunta, correcta, incorrecta, incorrecta, incorrecta]
  const QUIZ = [
    ['¿Cuál es el río más largo de España?', 'Tajo', 'Ebro', 'Duero', 'Guadalquivir'],
    ['¿Capital de Australia?', 'Canberra', 'Sídney', 'Melbourne', 'Perth'],
    ['¿Cuántos jugadores tiene un equipo de fútbol en el campo?', '11', '10', '12', '9'],
    ['¿En qué año llegó Colón a América?', '1492', '1498', '1512', '1475'],
    ['¿Qué planeta es el más grande del sistema solar?', 'Júpiter', 'Saturno', 'Neptuno', 'Tierra'],
    ['¿Quién pintó «Las Meninas»?', 'Velázquez', 'Goya', 'El Greco', 'Murillo'],
    ['¿Cuál es el símbolo químico del oro?', 'Au', 'Ag', 'Or', 'Go'],
    ['¿Cuántos lados tiene un hexágono?', '6', '5', '7', '8'],
    ['¿Qué país ganó el Mundial de fútbol de 2010?', 'España', 'Países Bajos', 'Alemania', 'Brasil'],
    ['¿En qué ciudad está la Sagrada Familia?', 'Barcelona', 'Madrid', 'Valencia', 'Sevilla'],
    ['¿Cuál es el océano más grande?', 'Pacífico', 'Atlántico', 'Índico', 'Ártico'],
    ['¿Quién escribió «Don Quijote de la Mancha»?', 'Cervantes', 'Lope de Vega', 'Quevedo', 'Calderón'],
    ['¿Cuántos huesos tiene un adulto aproximadamente?', '206', '180', '250', '300'],
    ['¿Qué gas respiran las plantas para la fotosíntesis?', 'CO₂', 'Oxígeno', 'Nitrógeno', 'Helio'],
    ['¿Capital de Canadá?', 'Ottawa', 'Toronto', 'Montreal', 'Vancouver'],
    ['¿Qué instrumento tocaba Paco de Lucía?', 'Guitarra', 'Piano', 'Cajón', 'Violín'],
    ['¿Cuántos minutos dura un partido de baloncesto FIBA (sin prórrogas)?', '40', '48', '60', '36'],
    ['¿Cuál es el animal terrestre más rápido?', 'Guepardo', 'León', 'Antílope', 'Caballo'],
    ['¿En qué continente está Egipto?', 'África', 'Asia', 'Europa', 'Oceanía'],
    ['¿Qué número romano es la «L»?', '50', '100', '500', '10'],
    ['¿Quién fue el primer hombre en pisar la Luna?', 'Neil Armstrong', 'Buzz Aldrin', 'Yuri Gagarin', 'Michael Collins'],
    ['¿Cuál es la montaña más alta de España?', 'Teide', 'Mulhacén', 'Aneto', 'Veleta'],
    ['¿De qué color es el caballo blanco de Santiago?', 'Blanco', 'Negro', 'Marrón', 'Gris'],
    ['¿Cuántas Champions tiene el Real Madrid hasta 2024?', '15', '13', '14', '12'],
    ['¿Qué idioma tiene más hablantes nativos?', 'Chino mandarín', 'Inglés', 'Español', 'Hindi'],
    ['¿Qué significa «www» en una web?', 'World Wide Web', 'Web World Wide', 'Wide World Web', 'World Web Wide'],
    ['¿Quién compuso «Las cuatro estaciones»?', 'Vivaldi', 'Mozart', 'Bach', 'Beethoven'],
    ['¿Qué país tiene forma de bota?', 'Italia', 'Grecia', 'Portugal', 'Chile'],
    ['¿Cuántos corazones tiene un pulpo?', '3', '1', '2', '8'],
    ['¿Cuál es la capital de Japón?', 'Tokio', 'Kioto', 'Osaka', 'Pekín'],
    ['¿Qué selección ganó la Eurocopa 2024?', 'España', 'Inglaterra', 'Francia', 'Italia'],
    ['¿En qué año cayó el Muro de Berlín?', '1989', '1991', '1985', '1979'],
    ['¿Qué vitamina nos da el sol?', 'D', 'C', 'A', 'B12'],
    ['¿Cuántas patas tiene una araña?', '8', '6', '10', '12'],
    ['¿Cuál es el metal más abundante en la corteza terrestre?', 'Aluminio', 'Hierro', 'Cobre', 'Oro'],
    ['¿Quién dirigió «Pulp Fiction»?', 'Tarantino', 'Spielberg', 'Scorsese', 'Nolan'],
    ['¿Cuántos jugadores hay en un equipo de voleibol en pista?', '6', '5', '7', '9'],
    ['¿Qué ciudad es conocida como la Gran Manzana?', 'Nueva York', 'Los Ángeles', 'Chicago', 'Boston'],
    ['¿Cuál es el país más grande del mundo?', 'Rusia', 'Canadá', 'China', 'EE. UU.'],
    ['¿Cuántos colores tiene el arcoíris?', '7', '6', '5', '8'],
    ['¿Qué tenista tiene más Roland Garros?', 'Nadal', 'Federer', 'Djokovic', 'Borg'],
    ['¿Qué es la «paella» originalmente?', 'Un recipiente', 'Un tipo de arroz', 'Una especia', 'Una fiesta'],
    ['¿Cuántas cuerdas tiene una guitarra española?', '6', '4', '5', '7'],
    ['¿Capital de Brasil?', 'Brasilia', 'Río de Janeiro', 'São Paulo', 'Salvador'],
    ['¿Quién descubrió la penicilina?', 'Fleming', 'Pasteur', 'Curie', 'Koch'],
    ['¿Qué día se celebra San Fermín?', '7 de julio', '24 de junio', '15 de agosto', '12 de octubre'],
    ['¿Cuál es el hueso más largo del cuerpo?', 'Fémur', 'Tibia', 'Húmero', 'Radio'],
    ['¿Qué empresa creó el iPhone?', 'Apple', 'Samsung', 'Nokia', 'Google'],
    ['¿Cuántos segundos tiene una hora?', '3600', '6000', '360', '1440'],
    ['¿Qué país inventó la pizza?', 'Italia', 'Francia', 'Grecia', 'EE. UU.'],
    ['¿Cuál es el desierto más grande (no polar)?', 'Sáhara', 'Gobi', 'Kalahari', 'Atacama'],
    ['¿Qué superhéroe es Bruce Wayne?', 'Batman', 'Superman', 'Iron Man', 'Spider-Man'],
    ['¿Cuántas provincias tiene España?', '50', '52', '17', '47'],
    ['¿Qué cantante es «La Motomami»?', 'Rosalía', 'Aitana', 'Shakira', 'Bad Gyal'],
    ['¿Qué planeta se conoce como el planeta rojo?', 'Marte', 'Venus', 'Mercurio', 'Júpiter'],
    ['¿Cuál es la moneda de Reino Unido?', 'Libra', 'Euro', 'Dólar', 'Corona'],
    ['¿Cuántos años tiene un siglo?', '100', '1000', '10', '50'],
    ['¿Quién pintó «La noche estrellada»?', 'Van Gogh', 'Monet', 'Picasso', 'Dalí'],
    ['¿Qué deporte practica Carlos Alcaraz?', 'Tenis', 'Pádel', 'Golf', 'Fútbol'],
    ['¿De qué país es la torre Eiffel?', 'Francia', 'Bélgica', 'Italia', 'Suiza'],
    ['¿Qué órgano bombea la sangre?', 'Corazón', 'Hígado', 'Pulmón', 'Riñón'],
    ['¿Cuántos días tiene un año bisiesto?', '366', '365', '364', '367'],
    ['¿Qué ciudad española es famosa por la Alhambra?', 'Granada', 'Córdoba', 'Toledo', 'Málaga'],
    ['¿Cuál es el ingrediente principal del guacamole?', 'Aguacate', 'Tomate', 'Pimiento', 'Lima'],
    ['¿Quién es el máximo goleador de la historia del Barça?', 'Messi', 'Kubala', 'César', 'Suárez'],
    ['¿Qué serie tiene a Walter White como protagonista?', 'Breaking Bad', 'Narcos', 'Ozark', 'Los Soprano'],
    ['¿Cuántos continentes hay (modelo más usado en España)?', '5', '6', '7', '4'],
    ['¿En qué año se celebraron los Juegos Olímpicos de Barcelona?', '1992', '1988', '1996', '1982'],
    ['¿Qué animal es Dumbo?', 'Elefante', 'Ratón', 'Jirafa', 'Hipopótamo'],
    ['¿Cuál es el país con más habitantes (2024)?', 'India', 'China', 'EE. UU.', 'Indonesia'],
    ['¿Qué se celebra el 6 de enero en España?', 'Reyes', 'Navidad', 'Año Nuevo', 'San Juan'],
    ['¿Cuántas uvas se comen en Nochevieja?', '12', '10', '7', '13'],
    ['¿A qué hora se comen las uvas?', '00:00', '23:00', '23:59', '00:12'],
    ['¿Desde qué reloj se retransmiten las campanadas más famosas?', 'Puerta del Sol', 'Plaza Mayor', 'Cibeles', 'Ayuntamiento de Barcelona'],
    ['¿Qué elemento químico tiene el símbolo «O»?', 'Oxígeno', 'Oro', 'Osmio', 'Oganesón'],
    ['¿Qué jugador es «La Pulga»?', 'Messi', 'Iniesta', 'Neymar', 'Pedri'],
    ['¿En qué país están las pirámides de Giza?', 'Egipto', 'México', 'Sudán', 'Perú'],
    ['¿Qué videojuego tiene a un fontanero llamado Mario?', 'Super Mario', 'Zelda', 'Sonic', 'Pac-Man'],
    ['¿Cuántas estrellas tiene la bandera de la Unión Europea?', '12', '15', '27', '10'],
    ['¿Qué mar baña Valencia?', 'Mediterráneo', 'Cantábrico', 'Atlántico', 'Mar Negro'],
    ['¿Cuál es el país más pequeño del mundo?', 'Vaticano', 'Mónaco', 'San Marino', 'Andorra'],
    ['¿Qué fruta es la protagonista de «Isaac Newton y la gravedad»?', 'Manzana', 'Pera', 'Naranja', 'Plátano'],
    ['¿Cuántos jugadores tiene un equipo de waterpolo en el agua?', '7', '6', '8', '11'],
    ['¿Qué película de Disney tiene a Simba?', 'El Rey León', 'Tarzán', 'Bambi', 'Aladdín'],
    ['¿Cuál es la lengua cooficial de Galicia?', 'Gallego', 'Asturiano', 'Euskera', 'Catalán'],
    ['¿Qué bebida lleva el «calimocho»?', 'Vino y cola', 'Cerveza y limón', 'Ron y cola', 'Vino y gaseosa'],
    ['¿Cuántos kilómetros tiene un maratón (aprox.)?', '42', '21', '50', '35'],
    ['¿Quién canta «Bulería»?', 'David Bisbal', 'David Bustamante', 'Chenoa', 'Álex Ubago'],
    ['¿Qué cumple años en España cada 12 de octubre?', 'Fiesta Nacional', 'Día del Trabajo', 'Constitución', 'Todos los Santos'],
    ['¿Cuántos ceros tiene un millón?', '6', '5', '7', '9'],
  ];
  async function playQuiz(G, seed) {
    if (!await intro(G, '<b>5 preguntas</b> de cultura general (y de la vida). 15 segundos cada una. Cuenta acertar y ser rápido.')) return null;
    const r = rng(seed + 'quiz'); const qs = fromDeck(QUIZ, 5, 'quiz', r);
    const rounds = qs.map(([q, ok, ...bad]) => {
      const options = shuffle([ok, ...bad], r);
      return { options: options.map(MN.esc), ok: options.indexOf(ok), show: (el) => { el.innerHTML = `<div class="quiz-q">${MN.esc(q)}</div>`; } };
    });
    return quizRun(G, rounds, 15000);
  }

  // ---------------------------------------------------------- 💻 Quiz de C++ de bajo nivel (x86-64 y ARM64)
  // [pregunta, código o null, correcta, incorrecta, incorrecta, incorrecta]
  const CPP = [
    // --- Memoria y disposición de los objetos
    ['¿Qué imprime?', `struct S { char c; double d; char e; };
int main() { printf("%zu", sizeof(S)); }`, '24', '10', '16', '12'],
    ['¿Qué imprime?', `struct S { double d; char c; char e; };
int main() { printf("%zu", sizeof(S)); }`, '16', '10', '24', '12'],
    ['¿Qué imprime?', `struct S {
  virtual void f();
  int x;
};
int main() { printf("%zu", sizeof(S)); }`, '16', '12', '8', '24'],
    ['¿Qué imprime?', `struct E {};
struct D : E { int x; };
int main() { printf("%zu", sizeof(D)); }`, '4', '5', '8', '1'],
    ['¿Qué imprime?', `struct E {};
struct D : E { E e; };
int main() { printf("%zu", sizeof(D)); }`, '2', '1', '0', '4'],
    ['¿Qué imprime?', `struct V { int v; };
struct A : virtual V { int a; };
struct B : virtual V { int b; };
struct C : A, B { int c; };
int main() { printf("%zu", sizeof(C)); }`, '40', '16', '24', '48'],
    ['¿Qué imprime?', `struct S { int a : 3; int b : 5; int c : 25; };
int main() { printf("%zu", sizeof(S)); }`, '8', '4', '12', '5'],
    ['¿Qué imprime?', `union U { int i; char c[7]; };
int main() { printf("%zu", sizeof(U)); }`, '8', '7', '11', '4'],
    ['¿Qué imprime?', `struct alignas(64) S { char c; };
int main() { printf("%zu", sizeof(S)); }`, '64', '1', '8', '65'],
    ['¿Qué imprime?', `#pragma pack(1)
struct S { char c; int i; };
int main() { printf("%zu", sizeof(S)); }`, '5', '8', '4', '1'],
    ['¿Qué imprime?', `struct S { char c; double d; };
int main() {
  printf("%zu", offsetof(S, d));
}`, '8', '1', '4', '16'],
    ['¿Qué imprime?', `struct A { int a; };
struct B { int b; };
struct C : A, B {};
int main() {
  C c;
  B* p = &c;
  printf("%td", (char*)p - (char*)&c);
}`, '4', '0', '8', '-4'],
    ['¿Qué imprime?', `void f(int a[10]) { printf("%zu", sizeof(a)); }
int main() { int a[10]; f(a); }`, '8', '40', '10', '4'],
    ['¿Qué imprime?', `int main() {
  int a[4];
  printf("%td", (char*)(&a + 1) - (char*)a);
}`, '16', '4', '1', '8'],
    ['¿Qué imprime?', `int main() {
  int m[2][3] = {1, 2, 3, 4, 5, 6};
  printf("%d", *(*(m + 1) + 1));
}`, '5', '2', '4', '3'],
    ['¿Qué imprime?', `int main() {
  char a[] = "abc";
  printf("%zu", sizeof(a));
}`, '4', '3', '8', '1'],
    ['¿Qué imprime?', `int main() { printf("%c", 1["abc"]); }`, 'b', 'a', '1', 'c'],
    ['¿Qué imprime?', `int main() {
  int i = 0;
  (void)sizeof(i++);
  printf("%d", i);
}`, '0', '1', '4', '8'],
    ['¿Qué imprime?', `struct S {};
int main() {
  printf("%zu", sizeof(void (S::*)()));
}`, '16', '8', '4', '24'],
    ['¿Qué imprime?', `struct S { int a; int b; };
int main() {
  int S::* p = &S::b;
  long d;
  memcpy(&d, &p, 8);
  printf("%ld", d);
}`, '4', '0', '8', '1'],
    ['Un puntero a miembro de datos nulo, en el ABI Itanium, vale…', null, '-1', '0', 'Una dirección de la vtable', '1'],
    ['¿Dónde está el vptr en una clase polimórfica sin bases (ABI Itanium)?', null, 'Desplazamiento 0', 'Al final del objeto', 'Tras los miembros', 'Fuera del objeto'],
    ['malloc en glibc x86-64 devuelve punteros alineados a…', null, '16 bytes', '8 bytes', '4 bytes', '64 bytes'],
    ['¿Qué hay justo antes del array devuelto por new T[n], si ~T() no es trivial?', null, 'Una cookie con n', 'La vtable', 'Nada', 'Un canario'],

    // --- Enteros, bits y coma flotante
    ['¿Qué imprime en x86-64?', `int main() {
  unsigned x = 0x01020304;
  printf("%d", *(unsigned char*)&x);
}`, '4', '1', '2', '3'],
    ['¿Qué imprime?', `int main() {
  unsigned char a = 200, b = 100;
  printf("%d", (a + b) >> 1);
}`, '150', '22', '44', '278'],
    ['¿Qué imprime en x86-64?', `int main() {
  char c = 200;
  printf("%d", c);
}`, '-56', '200', '56', '-200'],
    ['¿Qué imprime?', `int main() { printf("%d", (short)70000); }`, '4464', '70000', '-4464', '32767'],
    ['¿Qué imprime?', `int main() { printf("%d", -1 < 1u); }`, '0', '1', '-1', '2'],
    ['¿Qué imprime? (C++20)', `int main() { printf("%d", -1 >> 1); }`, '-1', '0', '2147483647', '1'],
    ['¿Qué imprime?', `int main() { printf("%d", -7 % 2); }`, '-1', '1', '-3', '0'],
    ['¿Qué imprime?', `int main() {
  int x = 12;
  printf("%d", x & (x - 1));
}`, '8', '4', '12', '11'],
    ['¿Qué imprime?', `int main() {
  int x = 12;
  printf("%d", x & -x);
}`, '4', '8', '12', '0'],
    ['¿Qué imprime?', `int main() { printf("%u", ~0u >> 28); }`, '15', '16', '0', '28'],
    ['¿Qué imprime?', `int main() { printf("%d", 0.1f == 0.1); }`, '0', '1', 'Depende de -O', '0.1'],
    ['¿Qué imprime?', `int main() {
  volatile double z = 0;
  double n = z / z;
  printf("%d", n == n);
}`, '0', '1', '-1', 'nan'],
    ['¿Qué imprime?', `int main() {
  float f = 1.0f;
  unsigned u;
  memcpy(&u, &f, 4);
  printf("%X", u);
}`, '3F800000', '1', '40000000', '00000001'],
    ['¿Qué imprime?', `int main() { printf("%d", (int)-1.9); }`, '-1', '-2', '-1.9', '0'],
    ['uint16_t a = 65535; ¿qué es a * a?', null, 'UB: se promueve a int y desborda', '1', '0', '4294836225'],

    // --- Vtables, this y objetos por dentro
    ['¿Qué imprime?', `struct B {
  B() { f(); }
  virtual void f() { printf("B"); }
};
struct D : B {
  void f() override { printf("D"); }
};
int main() { D d; }`, 'B', 'D', 'BD', 'Nada'],
    ['¿Qué imprime?', `struct B {
  virtual void f(int x = 1) { printf("%d", x); }
};
struct D : B {
  void f(int x = 2) override { printf("%d", x); }
};
int main() { B* p = new D; p->f(); }`, '1', '2', '0', '12'],
    ['¿Qué imprime?', `struct B {
  virtual void f() { printf("B"); }
};
struct D : B {
  void f() override { printf("D"); }
};
int main() { B b = D{}; b.f(); }`, 'B', 'D', 'BD', 'Nada'],
    ['¿Qué imprime?', `struct M { ~M() { printf("M"); } };
struct S {
  M m;
  S() { throw 1; }
  ~S() { printf("S"); }
};
int main() {
  try { S s; } catch (int) {}
}`, 'M', 'S', 'SM', 'Nada'],
    ['¿Qué imprime?', `struct V {
  V() { printf("b"); }
};
struct A : virtual V {};
struct B : virtual V {};
struct C : A, B {};
int main() { C c; }`, 'b', 'bb', 'bbb', 'Nada'],
    ['¿Por qué una virtual llamada en el constructor de B no llega a D?', null, 'Durante ~B y B(), el vptr apunta a la vtable de B', 'La vtable aún no existe en memoria', 'El compilador prohíbe virtuales ahí', 'D aún no tiene dirección'],
    ['En una vtable Itanium, ¿qué hay en vptr[-1]?', null, 'El typeinfo (RTTI)', 'El offset-to-top', 'El destructor', 'Nada'],
    ['Un destructor virtual ocupa en la vtable Itanium…', null, 'Dos entradas: completo y deleting', 'Una entrada', 'Tres entradas', 'Ninguna'],
    ['¿Qué es un thunk en la vtable con herencia múltiple?', null, 'Código que ajusta this y salta', 'Una copia de la función', 'Una entrada nula', 'El RTTI de la base'],
    ['En la vtable de una clase abstracta, ¿qué hay en la entrada de una virtual pura?', null, '__cxa_pure_virtual', 'Un puntero nulo', 'La versión de la base', '__cxa_throw'],
    ['«undefined reference to vtable for X» suele significar que…', null, 'Falta definir la key function', 'Falta un #include', 'X no tiene virtuales', 'Falta -lstdc++ siempre'],
    ['¿Qué permite marcar una clase como final, a nivel de código generado?', null, 'Desvirtualizar llamadas', 'Quitar el vptr', 'Reducir sizeof', 'Nada en absoluto'],
    ['Accesos a memoria para resolver una llamada virtual típica', null, 'Dos: vptr y entrada de la vtable', 'Ninguno', 'Uno: la función', 'Uno por cada base'],
    ['Un puntero a función miembro Itanium marca una virtual con…', null, 'El bit bajo de ptr a 1', 'ptr a nulo', 'adj negativo', 'Un flag aparte'],

    // --- Ensamblador x86-64 (sintaxis Intel)
    ['¿Cuánto vale rax? (x86-64)', `mov rax, 0x12345678
mov ax, 0`, '0x12340000', '0', '0x5678', '0x12345678'],
    ['¿Cuánto vale rax? (x86-64)', `mov rax, -1
mov eax, 0`, '0', '-1', '0xFFFFFFFF', '-4294967296'],
    ['¿Cuánto vale rax? (x86-64)', `mov rax, 0x1FF
add al, 1`, '0x100', '0x200', '0', '0x1FF'],
    ['¿Cuánto vale rax? (x86-64)', `mov eax, -1`, '4294967295', '-1', '65535', '255'],
    ['¿Cuánto vale rdx? (x86-64)', `mov rax, 100
mov rdx, 0
mov rcx, 7
div rcx`, '2', '14', '0', '7'],
    ['¿Cuánto vale rax? (x86-64)', `mov rax, 100
mov rdx, 0
mov rcx, 7
div rcx`, '14', '2', '100', '7'],
    ['¿Qué pasa? (x86-64)', `mov rax, 10
mov rdx, 2
mov rcx, 2
div rcx`, 'SIGFPE', 'rax = 5', 'rax = 6', 'rdx = 0'],
    ['¿Cuánto vale edx? (x86-64)', `mov eax, -7
cdq
mov ecx, 2
idiv ecx`, '-1', '1', '-3', '-4'],
    ['¿Cuánto vale eax? (x86-64)', `mov eax, -7
cdq
mov ecx, 2
idiv ecx`, '-3', '-4', '3', '-1'],
    ['¿Cuánto vale rdx? (x86-64)', `mov rax, -1
mov rcx, 2
mul rcx`, '1', '0', '-1', '2'],
    ['¿Cuánto vale rax? (x86-64)', `mov rcx, 5
lea rax, [rcx + rcx*4]`, '25', '5', '20', '9'],
    ['¿Cuánto vale rax? (x86-64)', `mov rax, 1
mov cl, 64
shl rax, cl`, '1', '0', '64', '-1'],
    ['¿Cuánto vale rax? (x86-64)', `mov rax, -8
sar rax, 1`, '-4', '4', '-16', '-8'],
    ['¿Cuánto vale rax? (x86-64)', `mov rax, -8
shr rax, 60`, '15', '-1', '0', '1'],
    ['¿Cuánto vale rax? (x86-64)', `mov rax, 5
cmp rax, 5`, '5', '0', '1', '-1'],
    ['¿Cuánto vale rax? (x86-64)', `xor eax, eax
mov rcx, 3
cmp rcx, 3
sete al`, '1', '0', '3', '-1'],
    ['¿Cuánto vale rax? (x86-64)', `mov rax, 1
mov rcx, 2
cmp rax, rcx
cmovl rax, rcx`, '2', '1', '-1', '0'],
    ['¿Cuánto vale rax? (x86-64)', `mov rax, 1
mov rcx, 2
push rax
push rcx
pop rax
pop rcx`, '2', '1', '3', '0'],
    ['¿Cuánto vale eax? (x86-64)', `mov ecx, 0xFF
movsx eax, cl`, '-1', '255', '0', '127'],
    ['¿Cuánto vale eax? (x86-64)', `mov ecx, 0xFF
movzx eax, cl`, '255', '-1', '0', '127'],
    ['¿Cuánto vale rcx? (x86-64)', `mov rax, -1
add rax, 1
mov rcx, 0
adc rcx, 0`, '1', '0', '-1', '2'],
    ['¿Cuánto vale eax? (x86-64)', `mov eax, 0x80000000
rol eax, 1`, '1', '0', '2', '-1'],
    ['¿Cuánto vale rax? (x86-64)', `mov dword ptr [rsp-8], 0x01020304
movzx eax, byte ptr [rsp-8]`, '4', '1', '2', '3'],
    ['¿Qué hace cdq?', null, 'Extiende el signo de eax a edx', 'Divide eax entre edx', 'Pone edx a 0', 'Copia edx en eax'],
    ['Tras «div cl» en x86, ¿dónde queda el resto?', null, 'ah', 'al', 'dl', 'cl'],
    ['¿Qué hace lea con la memoria?', null, 'No la toca: solo calcula', 'La lee', 'La escribe', 'La bloquea'],
    ['¿Qué flag NO modifica inc?', null, 'CF', 'ZF', 'SF', 'OF'],
    ['¿Cuál NO existe en x86?', null, 'mov [rax], [rcx]', 'mov rax, [rcx]', 'add rax, [rcx]', 'add [rax], rcx'],
    ['¿Qué hace la instrucción call en x86?', null, 'Apila el retorno y salta', 'Guarda rbp y salta', 'Guarda el retorno en un registro', 'Reserva el frame'],

    // --- Ensamblador ARM64 (AArch64)
    ['¿Cuánto vale x2? (ARM64)', `mov x0, #17
mov x1, #5
udiv x2, x0, x1`, '3', '2', '85', '5'],
    ['¿Cuánto vale x3? (ARM64)', `mov x0, #17
mov x1, #5
udiv x2, x0, x1
msub x3, x2, x1, x0`, '2', '3', '15', '-13'],
    ['¿Cuánto vale x2? (ARM64)', `mov x0, #10
mov x1, #0
udiv x2, x0, x1`, '0', 'SIGFPE', '10', '-1'],
    ['¿Cuánto vale x0? (ARM64)', `mov x1, #1
mov x2, #2
add x0, x1, x2, lsl #3`, '17', '24', '3', '10'],
    ['¿Cuánto vale x0? (ARM64)', `mov x0, #-1
mov w0, #0`, '0', '-1', '0xFFFFFFFF', '-4294967296'],
    ['¿Cuánto vale x0? (ARM64)', `mov x1, #5
add x0, x1, xzr`, '5', '0', '6', 'SIGILL'],
    ['¿Cuánto vale x0? (ARM64)', `mov x1, #3
cmp x1, #3
cset x0, eq`, '1', '0', '3', '-1'],
    ['¿Cuánto vale x0? (ARM64)', `mov x1, #7
mov x2, #9
cmp x1, x2
csel x0, x1, x2, lt`, '7', '9', '1', '0'],
    ['¿Qué significa «sub x0, x1, x2» en ARM64?', null, 'x0 = x1 − x2', 'x0 = x2 − x1', 'x2 = x0 − x1', 'x0 = x0 − x1 − x2'],
    ['ARM64 divide un entero entre 0 con udiv', null, 'Devuelve 0, sin excepción', 'SIGFPE, como x86', 'Devuelve -1', 'Instrucción ilegal'],
    ['¿Qué instrucción de resto tiene ARM64?', null, 'Ninguna: se usa msub', 'rem', 'mod', 'udiv deja el resto en x1'],
    ['Diferencia clave entre add x0, x1, x2 y adds x0, x1, x2', null, 'adds actualiza los flags', 'adds es con signo', 'adds lee memoria', 'Ninguna'],
    ['¿Qué registro guarda la dirección de retorno tras bl?', null, 'x30', 'x0', 'sp', 'x29'],
    ['¿Dónde deja el retorno «call» en x86 y «bl» en ARM64?', null, 'Pila / registro x30', 'Registro / pila', 'Pila en los dos', 'Registro en los dos'],
    ['¿Qué lee «ldr x0, [x1, #8]»?', null, 'De x1 + 8, sin cambiar x1', 'De x1, y suma 8 a x1', 'De x1 + 8, y actualiza x1', 'De x1 + 8 × 8'],
    ['¿Qué hace «ldr x0, [x1], #8»?', null, 'Lee de x1 y suma 8 a x1', 'Lee de x1 + 8', 'Lee de x1 + 8 y actualiza x1', 'Escribe en x1'],
    ['¿Qué hace «stp x29, x30, [sp, #-16]!»?', null, 'Baja sp 16 y guarda los dos', 'Guarda y luego baja sp', 'Sube sp 16 y guarda', 'Carga x29 y x30'],
    ['¿Cómo se carga una constante de 64 bits en ARM64 con instrucciones de inmediato?', null, 'movz y varios movk', 'Un solo mov', 'lea', 'add repetido'],
    ['Tamaño de cada instrucción en ARM64', null, '4 bytes siempre', 'De 1 a 15 bytes', '2 u 8 bytes', '8 bytes siempre'],
    ['Tamaño de una instrucción en x86-64', null, 'De 1 a 15 bytes', '4 bytes siempre', '8 bytes siempre', '2 o 4 bytes'],
    ['¿Cuál existe en x86 pero no en ARM64?', null, 'add rax, [rcx]: opera sobre memoria', 'Sumar dos registros', 'Dividir enteros', 'Mover entre registros'],
    ['ARM64 accede a memoria con…', null, 'Solo ldr/str y similares', 'Cualquier instrucción', 'Solo mov', 'add y sub'],
    ['Registros de propósito general en ARM64 frente a x86-64', null, '31 y 16', '16 y 16', '32 y 8', '16 y 31'],
    ['Para el producto completo de 64×64 bits en ARM64', null, 'mul y umulh', 'Solo mul', 'mul deja lo alto en x1', 'madd'],
    ['¿Qué modelo de memoria es más débil?', null, 'ARM64', 'x86-64', 'Son iguales', 'Depende del compilador'],
    ['¿Qué hace dmb ish en ARM64?', null, 'Barrera de memoria', 'Divide', 'Vacía la caché a disco', 'Un salto'],
    ['Equivalente a «lock cmpxchg» clásico en ARM64 (sin LSE)', null, 'Bucle ldxr y stxr', 'lock mov', 'dmb', 'cmp y csel'],
    ['Lectura con semántica acquire en ARM64', null, 'ldar', 'ldr', 'ldp', 'mov'],
    ['En ARM64, ¿qué tiene de especial xzr?', null, 'Siempre lee 0', 'Guarda el retorno', 'Es el puntero de pila', 'Guarda los flags'],
    ['Argumentos enteros de una función en ARM64', null, 'x0 a x7', 'x1 a x8', 'En la pila siempre', 'x19 a x28'],

    // --- Compilador, UB y optimización
    ['¿Qué es esto?', `float f = 1.0f;
int i = *(int*)&f;`, 'UB por strict aliasing', 'Legal desde C++11', 'Solo no portable', 'Convierte 1.0 en 1'],
    ['¿Qué tipo puede acceder legalmente a los bytes de cualquier objeto?', null, 'unsigned char', 'void', 'uint32_t', 'long'],
    ['A -O2, ¿qué puede devolver? a y b apuntan a lo mismo', `int f(int* a, float* b) {
  *a = 1;
  *b = 2;
  return *a;
}`, '1, por strict aliasing', 'Siempre los bits de 2.0f', 'No compila', 'Siempre 0'],
    ['A -O2, con x entero con signo, ¿qué hace gcc?', `bool f(int x) { return x + 1 > x; }`, 'Devuelve siempre true', 'Compara de verdad', 'Falla en INT_MAX siempre', 'No compila'],
    ['¿Qué puede hacer gcc a -O2?', `int f(int* p) {
  int v = *p;
  if (!p) return 0;
  return v;
}`, 'Quitar el if', 'Quitar *p', 'Mover el if antes', 'Nada: es correcto'],
    ['¿Qué puede pasar a -O2?', `void f() {
  char k[32];
  leer(k);
  usar(k);
  memset(k, 0, 32);
}`, 'Quitar el memset', 'Nada, memset es sagrado', 'Mover k al heap', 'No compila'],
    ['Una escritura en este puntero…', `char* p = (char*)"abc";
p[0] = 'x';`, 'Suele dar SIGSEGV: .rodata', 'Cambia la cadena', 'No compila', 'Copia al heap'],
    ['Leer *(int*)p con p desalineado', null, 'UB, aunque x86 suele tragar', 'Siempre correcto en x86', 'Siempre SIGBUS en x86', 'No compila'],
    ['¿Qué instrucción falla con un operando no alineado a 16?', null, 'movaps', 'movups', 'mov', 'lea'],
    ['¿Qué garantiza volatile en C++?', null, 'Que el compilador haga los accesos', 'Una barrera de CPU', 'Atomicidad', 'Evitar data races'],
    ['asm volatile("" : : : "memory") es…', null, 'Barrera de compilador', 'Barrera de CPU', 'Una instrucción nop', 'Un flush de caché'],
    ['¿Para qué sirve __restrict__?', null, 'Prometer que no hay aliasing', 'Hacer el puntero constante', 'Alinear', 'Proteger la memoria'],
    ['¿Cómo se destruye lo creado con placement new?', `T* p = new (buf) T;`, 'p->~T()', 'delete p', 'delete[] buf', 'free(p)'],

    // --- Enlazador y binario
    ['¿Qué significa _Z3fooi?', null, 'foo(int)', 'int foo()', 'foo con 3 ints', 'Un int global foo'],
    ['¿Qué desactiva extern "C"?', null, 'El name mangling', 'Las excepciones', 'El enlazado estático', 'Las plantillas'],
    ['Una función inline definida en un .h, usada en 10 .cpp', null, 'Símbolo débil: queda uno', '10 copias enlazadas', 'Error de símbolo duplicado', 'Nunca se emite'],
    ['«static int x = 0;» global, ¿en qué sección?', null, '.bss', '.data', '.rodata', '.text'],
    ['«int x = 5;» global, ¿en qué sección?', null, '.data', '.bss', '.rodata', '.init'],
    ['¿Qué sección no ocupa espacio en el ejecutable en disco?', null, '.bss', '.data', '.rodata', '.text'],
    ['¿Quién corre los constructores de globales antes de main?', null, 'Las entradas de .init_array', 'El kernel', 'El enlazador al compilar', 'main, al principio'],
    ['Un static local se protege en gcc con…', null, '__cxa_guard_acquire', 'pthread_once siempre', 'Nada', 'Un spinlock en .bss sin más'],
    ['¿Cómo se llama a una función de una .so por primera vez?', null, 'Por PLT, que resuelve y anota en GOT', 'Directamente al fijar la dirección', 'Por la vtable', 'Con dlopen cada vez'],
    ['¿Coste de un try sin excepción con el ABI de gcc x86-64?', null, 'Casi cero: usa tablas', 'Un registro por bloque', 'Un setjmp', 'Guardar todos los registros'],
    ['El desenrollado de una excepción tiene dos fases…', null, 'Buscar handler y luego limpiar', 'Limpiar y luego buscar', 'Copiar y lanzar', 'Parar hilos y limpiar'],

    // --- CPU, caché y sistema
    ['¿Qué reordenación permite x86 (TSO)?', null, 'Store seguido de load', 'Load seguido de load', 'Store seguido de store', 'Ninguna'],
    ['Un load acquire en x86-64 se compila a…', null, 'Un mov normal', 'lock mov', 'mfence y mov', 'xchg'],
    ['Un store seq_cst en x86-64 se compila a…', null, 'xchg o mov y mfence', 'Un mov normal', 'lfence y mov', 'cmov'],
    ['¿Qué hace el prefijo lock?', null, 'Operación atómica y barrera total', 'Bloquea todas las CPU para siempre', 'Pide un mutex al kernel', 'Vacía la caché'],
    ['Dos hilos escriben contadores distintos en la misma línea de caché', null, 'False sharing', 'Data race', 'ABA', 'Deadlock'],
    ['Tamaño típico de línea de caché en x86-64', null, '64 bytes', '16 bytes', '128 KB', '4 KB'],
    ['Latencia típica de L1 en ciclos', null, 'Unos 4', 'Unos 40', 'Unos 200', 'Menos de 1'],
    ['Coste típico de un fallo de predicción de salto en ciclos', null, '15-20', '1-2', '200-300', '2000'],
    ['¿Para qué sirve la TLB?', null, 'Cachear traducciones de direcciones', 'Cachear instrucciones', 'Predecir saltos', 'Reordenar escrituras'],
    ['malloc de 1 GB en Linux sin tocarlo aún', null, 'Casi no consume RAM física', 'Reserva 1 GB de RAM', 'Falla seguro', 'Escribe ceros en 1 GB'],
    ['¿Qué pasa la primera vez que tocas una página recién obtenida con mmap?', null, 'Fallo de página menor', 'SIGSEGV', 'Nada, ya está mapeada', 'Un fallo de TLB fatal'],
    ['fork() y la memoria del padre', null, 'Copy-on-write', 'Se copia entera', 'Se comparte siempre', 'Se pierde en el hijo'],
    ['¿Qué ocurre al desbordar la pila?', null, 'SIGSEGV en la página de guarda', 'Lanza una excepción C++', 'Crece sin límite', 'Devuelve nullptr'],
    ['¿Hacia dónde crece la pila en x86-64 y ARM64?', null, 'Hacia direcciones bajas', 'Hacia direcciones altas', 'Depende del compilador', 'Depende de la función'],
    ['¿Dónde pone gcc el canario de pila respecto al frame?', null, 'Entre locales y retorno', 'Tras la dirección de retorno', 'En un registro', 'En el heap'],
    ['Ancho de un registro ymm', null, '256 bits', '128 bits', '512 bits', '64 bits'],
    ['Con cmpxchg, un puntero que pasa de A a B y vuelve a A causa…', null, 'Problema ABA', 'False sharing', 'Una data race', 'Un fallo de TLB'],
  ];
  async function playCpp(G, seed) {
    if (!await intro(G, '<b>5 preguntas</b> de C++ de bajo nivel: memoria, vtables, ensamblador, enlazador y CPU. C++ en <b>x86-64, Linux y g++</b>; ensamblador <b>x86-64</b> (sintaxis Intel) y <b>ARM64</b>. <b>30 segundos</b> cada una. Cuenta acertar y ser rápido.')) return null;
    const r = rng(seed + 'cpp'); const qs = fromDeck(CPP, 5, 'cpp', r);
    const rounds = qs.map(([q, code, ok, ...bad]) => {
      const options = shuffle([ok, ...bad], r);
      return { options: options.map(MN.esc), ok: options.indexOf(ok), show: (el) => { el.innerHTML = `<div class="quiz-q cpp-q">${MN.esc(q)}</div>${code ? `<pre class="cpp-code">${MN.esc(code)}</pre>` : ''}`; } };
    });
    return quizRun(G, rounds, 30000);
  }

  // ---------------------------------------------------------- 🎵 Adivina la canción
  const SONGS = [
    ['Despacito', 'Luis Fonsi'], ['Macarena', 'Los del Río'], ['Aserejé', 'Las Ketchup'], ['Bohemian Rhapsody', 'Queen'], ['Billie Jean', 'Michael Jackson'],
    ["Livin' on a Prayer", 'Bon Jovi'], ['Smells Like Teen Spirit', 'Nirvana'], ['Wonderwall', 'Oasis'], ['Mr. Brightside', 'The Killers'], ['Seven Nation Army', 'The White Stripes'],
    ['Bad Romance', 'Lady Gaga'], ['Rolling in the Deep', 'Adele'], ['Shape of You', 'Ed Sheeran'], ['Uptown Funk', 'Mark Ronson'], ['Blinding Lights', 'The Weeknd'],
    ['Dancing Queen', 'ABBA'], ["Sweet Child O' Mine", "Guns N' Roses"], ['Hotel California', 'Eagles'], ['Africa', 'Toto'], ['Take On Me', 'a-ha'],
    ['I Will Survive', 'Gloria Gaynor'], ['Waka Waka', 'Shakira'], ["Hips Don't Lie", 'Shakira'], ['La Flaca', 'Jarabe de Palo'], ['Corazón Partío', 'Alejandro Sanz'],
    ['Bulería', 'David Bisbal'], ['Insurrección', 'El Último de la Fila'], ['La Chica de Ayer', 'Nacha Pop'], ['Devuélveme a mi chica', 'Hombres G'], ['Lobo hombre en París', 'La Unión'],
    ['Tusa', 'Karol G'], ['Gasolina', 'Daddy Yankee'], ['Bailando', 'Enrique Iglesias'], ['Malamente', 'Rosalía'], ['Danza Kuduro', 'Don Omar'],
    ['Wannabe', 'Spice Girls'], ['...Baby One More Time', 'Britney Spears'], ['Crazy in Love', 'Beyoncé'], ['Gangnam Style', 'PSY'], ['Rasputin', 'Boney M.'],
    ['Y.M.C.A.', 'Village People'], ['Highway to Hell', 'AC/DC'], ["Don't Stop Me Now", 'Queen'], ['Viva La Vida', 'Coldplay'], ['Somebody That I Used to Know', 'Gotye'],
    ['Happy', 'Pharrell Williams'], ['Toxic', 'Britney Spears'], ['Get Lucky', 'Daft Punk'], ['Losing My Religion', 'R.E.M.'], ['Zombie', 'The Cranberries'],
    ['Every Breath You Take', 'The Police'], ['Girls Just Want to Have Fun', 'Cyndi Lauper'], ['Eye of the Tiger', 'Survivor'], ['The Final Countdown', 'Europe'], ['Vivir Mi Vida', 'Marc Anthony'],
    ['Tití Me Preguntó', 'Bad Bunny'], ['Ella Baila Sola', 'Eslabon Armado'], ['Todo de Ti', 'Rauw Alejandro'], ['Mediterráneo', 'Joan Manuel Serrat'], ['Cuando Zarpa el Amor', 'Camela'],
  ];
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
  async function findPreview([title, artist]) {
    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(title + ' ' + artist)}&media=music&entity=song&limit=10&country=ES`;
      const list = (await (await fetch(url)).json()).results.filter((x) => x.previewUrl);
      const bad = /(live|remix|karaoke|instrumental|version|cover|acoustic|en vivo|directo|remaster)/i;
      const a = norm(artist).split(' ')[0];
      // Solo la canción exacta (sin versiones en directo, remixes…). Si no está, se salta.
      const ok = (x) => norm(x.trackName).startsWith(norm(title)) && norm(x.artistName).includes(a);
      const best = list.find((x) => ok(x) && !bad.test(norm(x.trackName))) || list.find(ok) || null;
      return best ? best.previewUrl : null;
    } catch (e) { return null; }
  }
  async function playSong(G, seed) {
    if (!await intro(G, 'Suenan <b>3 canciones</b>. Adivina el título lo antes posible: tienes 20 segundos por canción. <b>Sube el volumen</b> 🔊')) return null;
    frame(`${G.icon} ${G.name}`, '<p class="center">Buscando canciones…</p>');
    // Canciones: se buscan en el orden del mazo (empezando por las de esta partida) hasta tener 3
    const r = rng(seed + 'song'); let order = shuffle(SONGS, r);
    if (deckIndex != null) { const d = shuffle(SONGS, rng(`${(window.MN_CONFIG || {}).gameId}|mazo|song`)); const st = (deckIndex * 3) % d.length; order = d.slice(st).concat(d.slice(0, st)); }
    const chosen = [];
    for (const s of order) { if (chosen.length >= 3) break; const p = await findPreview(s); if (p) chosen.push({ s, p }); }
    if (!chosen.length) { await outro(G, '<p>😢 No se han podido cargar las canciones (¿sin conexión?). Inténtalo luego.</p>'); return null; }
    let audio = null;
    const rounds = chosen.map(({ s, p }) => {
      const options = shuffle([s, ...pickN(SONGS, 3, r, [s])], r);
      return {
        options: options.map(([t, a]) => `${MN.esc(t)}<span class="muted small"> · ${MN.esc(a)}</span>`), ok: options.indexOf(s),
        show: async (el, body) => {
          // En iPhone el audio debe empezar con un toque
          el.innerHTML = '<button type="button" class="btn primary song-play">▶ Escuchar</button>';
          body.querySelector('.ag-opts').style.visibility = 'hidden';
          await waitClick(el, '.song-play');
          audio = new Audio(p); audio.play().catch(() => {});
          el.innerHTML = '<div class="song-eq"><i></i><i></i><i></i><i></i><i></i></div>';
          body.querySelector('.ag-opts').style.visibility = '';
        },
        stop: () => { if (audio) { audio.pause(); audio = null; } },
      };
    });
    return quizRun(G, rounds, 20000);
  }

  // ---------------------------------------------------------- 🎨 Caza del color (más abajo) y 🐦 Flappy (más abajo)
  // ---------------------------------------------------------- 🎨 Caza del color
  const COLORS = [['Rojo', '#d62828'], ['Azul', '#1f5fbf'], ['Verde', '#2a9d3c'], ['Amarillo', '#f2c80f'], ['Naranja', '#f07c1b'], ['Morado', '#7b3fa0'],
    ['Rosa', '#ef6fa8'], ['Turquesa', '#1ab3a6'], ['Marrón', '#7a4b2a'], ['Negro', '#151515'], ['Blanco', '#f2f2f2'], ['Gris', '#8a8a8a'],
    ['Granate', '#7a1424'], ['Azul cielo', '#69b8e8'], ['Verde lima', '#9acd32'], ['Beis', '#d8c3a0']];
  const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const rgb2hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  function rgb2lab([r, g, b]) {
    const f = (v) => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92; };
    const [R, G2, B] = [f(r), f(g), f(b)];
    const X = (R * 0.4124 + G2 * 0.3576 + B * 0.1805) / 0.95047; const Y = R * 0.2126 + G2 * 0.7152 + B * 0.0722; const Z = (R * 0.0193 + G2 * 0.1192 + B * 0.9505) / 1.08883;
    const g3 = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * g3(Y) - 16, 500 * (g3(X) - g3(Y)), 200 * (g3(Y) - g3(Z))];
  }
  // Media de color del centro de la foto (la mitad central: el objeto, no el fondo)
  async function averageColor(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await preload(url); if (!img) throw new Error('No se pudo leer la foto');
      const c = document.createElement('canvas'); c.width = 80; c.height = 80;
      const s = Math.min(img.naturalWidth, img.naturalHeight) / 2;
      c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 80, 80);
      const d = c.getContext('2d').getImageData(0, 0, 80, 80).data; const sum = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) { sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; }
      // Copia pequeña de la foto entera (cuadrada) para enseñársela a los demás al acabar
      const sh = document.createElement('canvas'); sh.width = 240; sh.height = 240; const s2 = Math.min(img.naturalWidth, img.naturalHeight);
      sh.getContext('2d').drawImage(img, (img.naturalWidth - s2) / 2, (img.naturalHeight - s2) / 2, s2, s2, 0, 0, 240, 240);
      return { rgb: sum.map((v) => v / (d.length / 4)), thumb: c.toDataURL('image/jpeg', 0.7), share: sh.toDataURL('image/jpeg', 0.6) };
    } finally { URL.revokeObjectURL(url); }
  }
  async function playColor(G, seed) {
    const [name, hex] = COLORS[Math.floor(rng(seed + 'color')() * COLORS.length)];
    if (!await intro(G, 'Te diremos un <b>color</b>. Tienes <b>60 segundos</b> para encontrar algo de ese color y hacerle una foto (que el objeto ocupe el <b>centro</b>). Cuanto más se parezca, más puntos.')) return null;
    const LIMIT = 60000;
    const deadline = (resume && resume.deadline) || Date.now() + LIMIT;
    if (progress && !resume) await progress({ deadline });
    if (Date.now() > deadline) return { score: 0, label: '⏰ Se acabó el tiempo: 0 %', data: null };
    const body = frame(`${G.icon} ${G.name}`, `<div class="color-target" style="background:${hex}"><span>${name}</span></div>
      <div class="ag-timer"><i id="ag-bar"></i></div><div class="center ag-left" id="ag-left">60 s</div>
      <label class="btn primary ag-go">📸 Hacer la foto<input type="file" accept="image/*" capture="environment" hidden id="color-file"></label>
      <button type="button" class="link" id="color-give">Me rindo</button>`);
    const t0 = performance.now() - (LIMIT - (deadline - Date.now())); const bar = body.querySelector('#ag-bar'); let raf;
    const tick = () => { const k = (performance.now() - t0) / LIMIT; bar.style.width = `${Math.max(0, 100 - k * 100)}%`; body.querySelector('#ag-left').textContent = `${Math.max(0, Math.ceil((LIMIT - (performance.now() - t0)) / 1000))} s`; raf = requestAnimationFrame(tick); };
    tick();
    const file = await new Promise((res) => {
      body.querySelector('#color-file').addEventListener('change', (e) => res(e.target.files[0] || null));
      body.querySelector('#color-give').addEventListener('click', () => res(null));
    });
    cancelAnimationFrame(raf);
    const ms = performance.now() - t0;
    if (!file) return { score: 0, label: '🏳️ Te rendiste: 0 %', data: null };
    if (ms > LIMIT) return { score: 0, label: `⏰ Fuera de tiempo (${secs(ms)} s): 0 %`, data: null };
    frame(`${G.icon} ${G.name}`, '<p class="center">Analizando colores…</p>');
    const { rgb, thumb, share } = await averageColor(file);
    const [L1, a1, b1] = rgb2lab(hex2rgb(hex)); const [L2, a2, b2] = rgb2lab(rgb);
    const dE = Math.sqrt((L1 - L2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
    const sim = Math.max(0, 100 - dE * 1.1);
    const body2 = frame(`${G.icon} ${G.name}`, `<div class="color-cmp"><div><div class="color-sw" style="background:${hex}"></div>${name}</div>
      <div><img src="${thumb}" class="color-thumb" alt=""><div class="color-sw small-sw" style="background:${rgb2hex(rgb)}"></div>Tu foto</div></div>
      <div class="ag-score">${sim.toFixed(1).replace('.', ',')} %</div><button type="button" class="btn primary" data-ag="ok">Continuar</button>`);
    await waitClick(body2, '[data-ag]');
    return { score: Math.round(sim * 10), label: `${sim.toFixed(1).replace('.', ',')} % de parecido al ${name.toLowerCase()} (${secs(ms)} s)`, data: { ph: share, color: name, hex } };
  }

  // ---------------------------------------------------------- 🐦 Flappy con tu cara
  // Física con paso fijo (60 por segundo) y tubos con semilla: la partida se puede
  // reproducir exacta a partir de los toques. Así el rival aparece como fantasma.
  const FL = { W: 320, H: 480, BX: 90, R: 16, G: 0.32, FLAP: -5.6, PW: 54, SPACING: 175, GAP0: 150, GAPMIN: 112 };
  function flappyWorld(seed) {
    const r = rng(seed + 'flappy'); const pipes = [];
    const pipe = (i) => { while (pipes.length <= i) { const gap = Math.max(FL.GAPMIN, FL.GAP0 - pipes.length * 2.5); pipes.push({ x: 380 + pipes.length * FL.SPACING, gap, top: 70 + r() * (FL.H - 140 - gap) }); } return pipes[i]; };
    return { pipe, speed: (step) => 2 + Math.min(1.4, step / 2500) };
  }
  function bird(flaps) { return { y: FL.H / 2, vy: 0, alive: true, score: 0, flaps: new Set(flaps || []), deadAt: null }; }
  function stepBird(b, world, step, offset, flapNow) {
    if (!b.alive) return;
    if (flapNow || b.flaps.has(step)) b.vy = FL.FLAP;
    b.vy += FL.G; b.y += b.vy;
    if (b.y < FL.R || b.y > FL.H - 30 - FL.R) { b.alive = false; b.deadAt = step; return; }
    for (let i = Math.max(0, b.score - 1); i < b.score + 2; i++) {
      const p = world.pipe(i); const x = p.x - offset;
      if (x + FL.PW < FL.BX - FL.R) { if (i >= b.score) b.score = i + 1; continue; }
      if (x > FL.BX + FL.R) break;
      if (b.y - FL.R < p.top || b.y + FL.R > p.top + p.gap) { b.alive = false; b.deadAt = step; return; }
    }
  }
  function faceDrawer(p) {
    const photo = p && typeof p.photo === 'string' && /^data:image\//.test(p.photo) ? p.photo : null;
    let img = null; if (photo) { img = new Image(); img.src = photo; }
    return (ctx, x, y, alpha) => {
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.beginPath(); ctx.arc(x, y, FL.R + 2, 0, Math.PI * 2); ctx.fillStyle = '#f5c542'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, FL.R, 0, Math.PI * 2); ctx.clip();
      if (img && img.complete && img.naturalWidth) ctx.drawImage(img, x - FL.R, y - FL.R, FL.R * 2, FL.R * 2);
      else { ctx.fillStyle = '#222'; ctx.fill(); ctx.font = `${FL.R * 1.5}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText((p && p.emoji) || '🐦', x, y + 1); }
      ctx.restore();
    };
  }
  async function playFlappy(G, seed, opts) {
    const ghost = opts.ghost;
    if (resume && resume.restarts >= 1) return { score: 0, label: '💥 Se cortó la partida dos veces: 0 tubos', data: { f: [] } };
    if (progress) await progress({ restarts: resume ? (resume.restarts || 0) + 1 : 0 });
    if (resume) MN.toast('🐦 La partida se cortó: vuelves a empezar (solo una vez)', 'ok');
    if (!await intro(G, `Toca la pantalla para que <b>tu cara</b> aletee y pase entre los tubos. Cada tubo, un punto. ${ghost ? `👻 Verás el fantasma de <b>${MN.esc(ghost.player.name)}</b> jugando la misma partida.` : 'Si tu rival juega después, te verá como fantasma 👻.'}`)) return null;
    const body = frame(`${G.icon} ${G.name}`, `<div class="fl-wrap"><canvas id="fl" width="${FL.W}" height="${FL.H}"></canvas>
      <div class="fl-hud" id="fl-hud">0</div><div class="fl-tip" id="fl-tip">Toca para empezar</div></div>`);
    const cv = body.querySelector('#fl'); const ctx = cv.getContext('2d');
    const world = flappyWorld(seed); const me = bird(); const gh = ghost ? bird(ghost.flaps) : null;
    const drawMe = faceDrawer(MN.me()); const drawGhost = ghost ? faceDrawer(ghost.player) : null;
    const flaps = []; let step = 0; let offset = 0; let started = false; let queued = false;
    const draw = () => {
      const g = ctx.createLinearGradient(0, 0, 0, FL.H); g.addColorStop(0, '#0f3b2a'); g.addColorStop(1, '#06140e');
      ctx.fillStyle = g; ctx.fillRect(0, 0, FL.W, FL.H);
      for (let i = Math.max(0, me.score - 2); i < me.score + 4; i++) {
        const p = world.pipe(i); const x = p.x - offset; if (x > FL.W) break;
        ctx.fillStyle = '#c8961c'; ctx.fillRect(x, 0, FL.PW, p.top); ctx.fillRect(x, p.top + p.gap, FL.PW, FL.H - p.top - p.gap);
        ctx.fillStyle = '#f5c542'; ctx.fillRect(x - 3, p.top - 14, FL.PW + 6, 14); ctx.fillRect(x - 3, p.top + p.gap, FL.PW + 6, 14);
      }
      ctx.fillStyle = '#3a2a10'; ctx.fillRect(0, FL.H - 30, FL.W, 30);
      if (gh) { drawGhost(ctx, FL.BX, gh.y, gh.alive ? 0.45 : 0.15); if (!gh.alive) { ctx.font = '20px serif'; ctx.fillText('💀', FL.BX + 22, gh.y - 14); } }
      drawMe(ctx, FL.BX, me.y, 1);
    };
    const flap = (e) => { if (e) e.preventDefault(); if (!me.alive) return; if (!started) { started = true; body.querySelector('#fl-tip').hidden = true; } queued = true; };
    cv.addEventListener('pointerdown', flap);
    const onKey = (e) => { if (e.code === 'Space') flap(e); };
    document.addEventListener('keydown', onKey);
    draw();
    await new Promise((res) => {
      let last = performance.now(); let acc = 0;
      const loop = (t) => {
        if (started && me.alive) {
          acc += Math.min(100, t - last);
          while (acc >= 1000 / 60 && me.alive) {
            acc -= 1000 / 60;
            if (queued) flaps.push(step);
            stepBird(me, world, step, offset, queued); queued = false;
            if (gh) stepBird(gh, world, step, offset, false);
            offset += world.speed(step); step++;
          }
          body.querySelector('#fl-hud').textContent = me.score;
        }
        last = t; draw();
        if (me.alive) requestAnimationFrame(loop); else res();
      };
      requestAnimationFrame(loop);
    });
    document.removeEventListener('keydown', onKey);
    if (MN.fx) MN.fx.play('stop');
    await sleep(900);
    const vs = gh ? ` · fantasma: ${gh.alive ? 'seguía vivo 😱' : `${gh.score} tubos`}` : '';
    return { score: me.score * 100000 + step, label: `${me.score} ${me.score === 1 ? 'tubo' : 'tubos'}${vs}`, data: { f: flaps } };
  }

  // ---------------------------------------------------------- 🔍 ¿Qué es esto? (objeto muy ampliado)
  const OBJECTS = { '🍌': 'Plátano', '🔑': 'Llave', '✂️': 'Tijeras', '📎': 'Clip', '🍫': 'Chocolate', '🎸': 'Guitarra', '🧲': 'Imán', '💡': 'Bombilla', '🧽': 'Esponja',
    '🍍': 'Piña', '🍓': 'Fresa', '🍋': 'Limón', '🥝': 'Kiwi', '🥑': 'Aguacate', '🥦': 'Brócoli', '🧄': 'Ajo', '🍄': 'Seta', '🥚': 'Huevo', '🥐': 'Cruasán',
    '🌽': 'Mazorca', '🥕': 'Zanahoria', '🍅': 'Tomate', '🍇': 'Uvas', '🍒': 'Cerezas', '🍉': 'Sandía', '🍕': 'Pizza', '🍔': 'Hamburguesa', '🍣': 'Sushi',
    '🍩': 'Dónut', '🧀': 'Queso', '🥨': 'Pretzel', '⚽': 'Balón de fútbol', '🏀': 'Balón de baloncesto', '🎲': 'Dado', '🧩': 'Pieza de puzle', '🎮': 'Mando',
    '🖱️': 'Ratón', '⌨️': 'Teclado', '🎧': 'Auriculares', '📷': 'Cámara', '⏰': 'Despertador', '⌚': 'Reloj', '👓': 'Gafas', '☂️': 'Paraguas', '🔨': 'Martillo',
    '🪛': 'Destornillador', '🔩': 'Tornillo', '⚓': 'Ancla', '🧭': 'Brújula', '🔭': 'Telescopio', '🔬': 'Microscopio', '🚲': 'Bicicleta', '🎈': 'Globo',
    '🕯️': 'Vela', '🪑': 'Silla', '🚽': 'Váter', '🛁': 'Bañera', '🧸': 'Osito de peluche', '🎁': 'Regalo', '🎄': 'Árbol de Navidad', '🍾': 'Botella de cava',
    '🍷': 'Copa de vino', '🍺': 'Jarra de cerveza', '🪩': 'Bola de discoteca', '🌵': 'Cactus', '🌻': 'Girasol', '🐌': 'Caracol', '🦔': 'Erizo', '🐙': 'Pulpo',
    '🦀': 'Cangrejo', '🧦': 'Calcetines', '👟': 'Zapatilla', '🎩': 'Chistera', '💍': 'Anillo', '🔔': 'Campana', '📱': 'Móvil', '💾': 'Disquete', '📼': 'Cinta de vídeo' };
  const emojiUrl = (e) => `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${[...e].map((c) => c.codePointAt(0).toString(16)).filter((x) => x !== 'fe0f').join('-')}.svg`;
  async function playObject(G, seed) {
    if (!await intro(G, 'Sale un trocito <b>muy ampliado</b> de un objeto, que se va alejando poco a poco. ¿Qué es? <b>5 rondas</b>, 12 segundos cada una.')) return null;
    frame(`${G.icon} ${G.name}`, '<p class="center">Cargando objetos…</p>');
    const r = rng(seed + 'obj'); const picks = fromDeck(Object.keys(OBJECTS), 5, 'obj', r);
    await Promise.all(picks.map((e) => preload(emojiUrl(e))));
    const rounds = picks.map((e) => {
      const name = OBJECTS[e]; const options = shuffle([name, ...pickN(Object.values(OBJECTS), 3, r, [name])], r);
      const ox = 25 + r() * 50; const oy = 25 + r() * 50; let el = null;
      return {
        options: options.map(MN.esc), ok: options.indexOf(name),
        show: (st) => { st.innerHTML = `<div class="logo-win obj-win"><img class="logo-zoom" src="${emojiUrl(e)}" alt="" style="transform-origin:${ox}% ${oy}%;transform:scale(9)"></div>`; el = st.querySelector('img'); },
        onTick: (k) => { if (el) el.style.transform = `scale(${9 - k * 7.5})`; },
        reveal: () => { if (el) { el.style.transition = 'transform .4s'; el.style.transform = 'scale(1)'; } },
      };
    });
    return quizRun(G, rounds, 12000);
  }

  // ---------------------------------------------------------- 🌍 GeoGuessr (vista de satélite)
  const PLACES = [
    ['Sagrada Familia (Barcelona)', 41.40363, 2.17436, 17], ['Camp Nou (Barcelona)', 41.38087, 2.12282, 16], ['Santiago Bernabéu (Madrid)', 40.45306, -3.68835, 17],
    ['Puerta del Sol (Madrid)', 40.41692, -3.70348, 18], ['Alhambra (Granada)', 37.17605, -3.58808, 16], ['Ciudad de las Artes (Valencia)', 39.45488, -0.35018, 16],
    ['Guggenheim (Bilbao)', 43.26869, -2.93403, 17], ['Mezquita de Córdoba', 37.87897, -4.77937, 17], ['Plaza de España (Sevilla)', 37.37720, -5.98689, 17],
    ['Peñón de Gibraltar', 36.13552, -5.34504, 13], ['Teide (Tenerife)', 28.27235, -16.64253, 13], ['Concha de San Sebastián', 43.31758, -1.98617, 15],
    ['Torre Eiffel (París)', 48.85837, 2.29448, 17], ['Coliseo (Roma)', 41.89021, 12.49223, 17], ['Vaticano', 41.90224, 12.45330, 16], ['Torre de Pisa', 43.72297, 10.39659, 17],
    ['Venecia', 45.43408, 12.33895, 15], ['Big Ben (Londres)', 51.50073, -0.12463, 17], ['Stonehenge', 51.17887, -1.82618, 17], ['Mont Saint-Michel', 48.63605, -1.51146, 16],
    ['Acrópolis (Atenas)', 37.97153, 23.72575, 17], ['Kremlin (Moscú)', 55.75204, 37.61748, 16], ['Ámsterdam (canales)', 52.37218, 4.88328, 16],
    ['Pirámides de Guiza', 29.97923, 31.13420, 16], ['Estatua de la Libertad', 40.68925, -74.04450, 17], ['Central Park (Nueva York)', 40.78253, -73.96557, 14],
    ['Golden Gate (San Francisco)', 37.81993, -122.47826, 15], ['Las Vegas Strip', 36.11469, -115.17284, 15], ['Gran Cañón', 36.10697, -112.11299, 13],
    ['Cataratas del Niágara', 43.07700, -79.07454, 16], ['Cristo Redentor (Río)', -22.95192, -43.21049, 17], ['Machu Picchu', -13.16314, -72.54496, 16],
    ['Ópera de Sídney', -33.85678, 151.21530, 17], ['Uluru', -25.34443, 131.03688, 13], ['Palm Jumeirah (Dubái)', 25.11234, 55.13896, 13],
    ['Taj Mahal', 27.17501, 78.04215, 17], ['Gran Muralla (Badaling)', 40.35982, 116.01953, 16], ['Monte Fuji', 35.36063, 138.72736, 12],
    ['Ciudad Prohibida (Pekín)', 39.91629, 116.39715, 15], ['Santorini (Oia)', 36.46186, 25.37557, 16],
  ];
  let leafletP = null;
  function leaflet() {
    if (!leafletP) leafletP = new Promise((res, rej) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css'; document.head.appendChild(css);
      const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js'; sc.onload = () => res(window.L); sc.onerror = rej; document.head.appendChild(sc);
    });
    return leafletP;
  }
  const km = (a, b) => { const R = 6371; const r = (d) => d * Math.PI / 180; const dl = r(b[0] - a[0]); const dg = r(b[1] - a[1]); const x = Math.sin(dl / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dg / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
  async function playGeo(G, seed) {
    if (!await intro(G, 'Verás un sitio famoso <b>desde el satélite</b> (sin nombres). Márcalo en el mapa del mundo: cuanto más cerca, más puntos (hasta 5.000). <b>3 rondas</b>, 45 segundos cada una.')) return null;
    frame(`${G.icon} ${G.name}`, '<p class="center">Cargando mapas…</p>');
    const L = await leaflet();
    const r = rng(seed + 'geo'); const picks = fromDeck(PLACES, 3, 'geo', r);
    let total = 0; const lines = [];
    for (let i = 0; i < picks.length; i++) {
      const [name, lat, lng, z] = picks[i];
      const body = frame(`${G.icon} ${G.name}`, `<div class="ag-round">Ronda ${i + 1} de ${picks.length}</div>
        <div class="geo-sat" id="geo-sat"></div><div class="ag-timer"><i id="ag-bar"></i></div>
        <div class="geo-map" id="geo-map"></div><button type="button" class="btn primary" id="geo-ok" disabled>📍 Marca en el mapa dónde crees que es</button>`);
      const sat = L.map(body.querySelector('#geo-sat'), { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false }).setView([lat, lng], z);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(sat);
      const map = L.map(body.querySelector('#geo-map'), { worldCopyJump: true, attributionControl: false }).setView([30, 0], 1);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 12 }).addTo(map);
      let guess = null; let marker = null;
      map.on('click', (e) => { guess = [e.latlng.lat, ((e.latlng.lng + 540) % 360) - 180]; if (marker) marker.setLatLng(e.latlng); else marker = L.marker(e.latlng).addTo(map); const b = body.querySelector('#geo-ok'); b.disabled = false; b.textContent = '✅ ¡Aquí!'; });
      const t0 = performance.now(); const bar = body.querySelector('#ag-bar'); let raf;
      await new Promise((res) => {
        const tick = () => { const k = (performance.now() - t0) / 45000; bar.style.width = `${Math.max(0, 100 - k * 100)}%`; if (k >= 1) res(); else raf = requestAnimationFrame(tick); };
        tick(); body.querySelector('#geo-ok').addEventListener('click', res);
      });
      cancelAnimationFrame(raf);
      const d = guess ? km(guess, [lat, lng]) : 20000; const pts = guess ? Math.round(5000 * Math.exp(-d / 1500)) : 0;
      total += pts; lines.push(`${name}: ${guess ? `${Math.round(d).toLocaleString('es-ES')} km` : 'sin marcar'} → ${pts}`);
      L.marker([lat, lng]).addTo(map); if (guess) L.polyline([guess, [lat, lng]], { color: '#f5c542', dashArray: '6 6' }).addTo(map);
      map.fitBounds(guess ? L.latLngBounds([guess, [lat, lng]]).pad(0.3) : L.latLngBounds([[lat - 5, lng - 5], [lat + 5, lng + 5]]));
      const b = body.querySelector('#geo-ok'); b.disabled = false; b.innerHTML = `📍 ${MN.esc(name)} · ${guess ? `${Math.round(d).toLocaleString('es-ES')} km` : 'sin marcar'} · <b>+${pts}</b> — Seguir`;
      if (MN.fx) MN.fx.play(pts > 3000 ? 'win' : pts > 1000 ? 'event' : 'stop');
      await new Promise((res) => b.addEventListener('click', res, { once: true }));
      sat.remove(); map.remove();
    }
    return { score: total, label: `${total.toLocaleString('es-ES')} puntos`, data: null, lines };
  }

  // ---------------------------------------------------------- 📸 fotos de la caza del color al acabar
  // items: [{ pid, ph, label }] ordenados del mejor al peor
  function colorGallery(items, title) {
    const withPh = items.filter((x) => x.ph);
    if (!withPh.length) return;
    const esc = MN.esc; const c = (items.find((x) => x.color) || {});
    MN.modal(`<div class="cg"><div class="cg-title">📸 ${esc(title || 'Las fotos')}</div>
      ${c.color ? `<div class="cg-target"><span style="background:${c.hex}"></span>Había que buscar: <b>${esc(c.color)}</b></div>` : ''}
      <div class="cg-list ${items.length === 2 ? 'duo' : ''}">${items.map((x, i) => `<div class="cg-item ${i === 0 ? 'win' : ''}">
        ${x.ph ? `<img src="${x.ph}" alt="">` : '<div class="cg-none">🙈 Sin foto</div>'}
        <div class="cg-who">${i === 0 ? '🏆 ' : ''}<span class="cg-av">${MN.face(MN.player(x.pid), 'mini')}</span> ${esc(MN.player(x.pid).name)}</div>
        <div class="cg-label">${esc(x.label || '')}</div></div>`).join('')}</div></div>`, 'Cerrar', '');
  }

  // ---------------------------------------------------------- catálogo
  const GAMES = {
    stopwatch: { icon: '⏱️', name: 'Cronómetro (segundo exacto)' },
    color: { icon: '🎨', name: 'Caza del color', play: (G, s, o) => playColor(G, s, o) },
    pokemon: { icon: '⚫', name: '¿Quién es ese Pokémon?', play: playPokemon },
    logo: { icon: '🏷️', name: 'Logo misterioso', play: playLogo },
    quiz: { icon: '🧠', name: 'Quiz', play: playQuiz },
    cpp: { icon: '💻', name: 'Quiz de C++ (expertos)', play: playCpp },
    song: { icon: '🎵', name: 'Adivina la canción', play: playSong },
    flappy: { icon: '🐦', name: 'Flappy con tu cara', play: (G, s, o) => playFlappy(G, s, o) },
    object: { icon: '🔍', name: '¿Qué es esto?', play: playObject },
    geo: { icon: '🌍', name: 'GeoGuessr de satélite', play: playGeo },
  };

  // Juega y devuelve { score, label, data } (o null si no llegó a empezar)
  async function play(id, seed, opts = {}) {
    const G = GAMES[id]; if (!G || !G.play) return null;
    open();
    try {
      startHook = opts.onStart || null; resume = opts.resume || null; progress = opts.onProgress || null;
      deckIndex = Number.isInteger(opts.deck) ? opts.deck : null;
      const res = await G.play(G, seed, opts);
      if (res) await outro(G, `<div class="ag-score">${res.label}</div><p class="center">${opts.after || ''}</p>`);
      return res;
    } catch (e) {
      console.error(e); MN.toast('❌ El juego ha fallado: ' + MN.esc(e.message || e), 'bad'); return null;
    } finally { close(); resume = null; progress = null; }
  }

  return {
    init(api) {
      MN = api;
      MN.appGames = { GAMES, play, colorGallery, list: () => Object.entries(GAMES).map(([id, G]) => ({ id, ...G })) };
      MN.flappy = { FL, flappyWorld, bird, stepBird, faceDrawer, open, close, frame, waitClick };
    },
  };
})());

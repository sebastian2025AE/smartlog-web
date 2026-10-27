# Smartlog web: cómo publicarla (Firebase + Vercel)

La web es estática (HTML/CSS/JS). Los datos en tiempo real viven en **Firebase Realtime Database**. Todo es gratis para un Demo Day.

## 0. Probarla sin configurar nada
Abre `index.html` con un servidor local (por ejemplo `python3 -m http.server` dentro de esta carpeta y entra a `http://localhost:8000`). Verás el aviso **Modo local**: los datos solo se comparten entre pestañas del mismo navegador. Sirve para ensayar.

## 1. Crear la base de datos en tiempo real (5 minutos)
1. Entra a https://console.firebase.google.com con tu cuenta de Google → **Agregar proyecto** (nombre: `smartlog-utec`; puedes desactivar Analytics).
2. Menú **Compilación → Realtime Database → Crear base de datos**. Elige una ubicación y empieza en **modo de prueba**.
3. En la pestaña **Reglas** pega el contenido de `database.rules.json` y pulsa **Publicar**.
4. En **Configuración del proyecto (engranaje) → Tus apps → Web (</>)** registra una app. Firebase te muestra un bloque `firebaseConfig`.
5. Abre `js/config.js` y reemplaza los valores `PEGA_AQUI` por los de ese bloque (`apiKey`, `authDomain`, `databaseURL`, `projectId`, `appId`).
6. Cambia los PIN (`pinOperador`, `pinAdmin`) si la web será pública.

Cuando está bien configurado, el indicador de arriba dice **En vivo (Firebase)** en vez de *Modo local*.

## 2. Publicar en Vercel
Opción A (la más fácil): en https://vercel.com → **Add New → Project → Import** y sube esta carpeta desde un repositorio de GitHub (o arrastra la carpeta con la CLI `npx vercel`). No necesita build: framework **Other**, carpeta raíz = esta carpeta.
Opción B: `npm i -g vercel` y, dentro de la carpeta, `vercel --prod`.

`vercel.json` ya activa las URL limpias (`/stand`, `/admin`, `/jurado`…).

## 3. Cómo se usa el día de la exposición
| Quién | Dónde entra | Qué hace |
|---|---|---|
| Operador | `/operador` (PIN) en la computadora con el Arduino, Chrome o Edge | Conecta el Arduino, controla la faja, paro de emergencia |
| Stand | `/stand` en el proyector | Faja en vivo, contadores, QR para el jurado |
| Jurado / visitantes | `/` desde el celular (QR) | Genera un lote de prueba y ve cuántos limones se aprovechan |
| Admin | `/admin` (PIN) | Registro del día, por hora, visitantes, Excel, paro remoto |

## 4. Si algo no funciona
- **Sigue en «Modo local»:** `js/config.js` aún tiene `PEGA_AQUI`, o el navegador bloqueó los scripts de Firebase.
- **No guarda datos:** revisa que las reglas estén publicadas y que `databaseURL` sea exactamente el que muestra Firebase.
- **El Arduino no conecta:** solo funciona en Chrome o Edge de computadora, y con el Monitor Serie cerrado.
- **Seguridad:** los PIN se validan en el navegador y las reglas están abiertas para el demo. Para un uso real, agrega Firebase Authentication y reglas por usuario.

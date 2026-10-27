# Guía de sustentación — Smartlog: clasificador de limones por color

Proyecto: PI II · Smartlog. Una faja con **sensor de color (TCS34725)** y **un servomotor** clasifica limones en **3 categorías: verde (fresco), amarillo (maduro) y descarte (podrido o dañado)**. Cada limón se registra en una **base de datos en tiempo real** y se muestra en una web con roles: operador, jurado/visitante, administrador y pantalla de stand.

Referencia del montaje: https://www.youtube.com/watch?v=g3i51hdfLaw (HowToMechatronics, un sensor + servos). Nuestra versión usa **un servo** con 3 posiciones (20°, 90°, 160°).

---

## 1. Explicación en 30 segundos (para abrir)

> "Un sensor de color lee el limón que pasa. El Arduino compara rojo, verde y azul, decide si es verde, amarillo o descarte y mueve un servo para desviarlo a su compartimento. Cada limón se guarda como entrada y como salida clasificada en una base de datos en tiempo real, y la web muestra el registro del día, por hora y por categoría. Tiene paro de emergencia, apagado para ahorrar energía y un lote de prueba para visitantes."

Flujo: **Sensor → Arduino → Servo** y **Arduino → USB (Serial) → Navegador del operador → Firebase → celulares, admin y stand**.

---

## 2. Preguntas probables y respuestas

### Sobre el sensor

**¿Cómo detecta el color el sensor?**
Tiene una matriz de fotodiodos con filtros rojo, verde y azul (más uno sin filtro, "clear"). Un LED blanco ilumina el objeto, y cada fotodiodo mide cuánta luz de su color se refleja. Un objeto rojo refleja mucho rojo y poco verde/azul.

**¿Qué sensor usan y por qué no el TCS3200 del video?**
Usamos el **TCS34725** (el de nuestra lista de componentes). Convierte la luz con un ADC de 16 bits y entrega los valores por **I2C**, sin tener que medir frecuencias. Además trae filtro infrarrojo, lo que lo hace más estable. El TCS3200 entrega una **onda cuadrada cuya frecuencia depende de la luz** y requiere `pulseIn()` y 4 pines de control; el principio de clasificación es el mismo.

**¿Cómo deciden si un limón es verde, amarillo o descarte?**
Comparamos canales con reglas simples (ver `clasificar()` en el sketch). Para limones usamos reglas por proporción: **verde** si domina G; **amarillo** si R y G son parecidos y B es bajo; **descarte** si no cumple (marrón, oscuro o manchado). Los umbrales se calibran con limones reales.

**¿Cómo saben que hay un objeto y no solo el fondo?**
Al iniciar medimos la luz total ("clear") del fondo vacío. Si cambia más de 35% respecto a ese valor, hay un objeto. Se puede recalibrar con el botón **Calibrar fondo**.

**¿Qué pasa con la luz ambiente?**
Es el mayor enemigo. Por eso el sensor debe ir en una zona protegida de luz externa (cámara oscura simple de cartón) y a distancia fija, usando el LED del módulo. También se calibra el fondo cada vez que cambia el entorno.

**¿Por qué el sensor falla con objetos blancos, negros o grises?**
Blanco refleja todo igual, negro casi nada, gris igual que blanco pero más débil: no hay un canal dominante, entonces no pasa el criterio de margen. Solo clasificamos colores con un canal claramente dominante.

**¿Qué es la ganancia y el tiempo de integración?**
Integración (50 ms): cuánto tiempo "acumula luz" el sensor. Más tiempo = más sensibilidad, pero más lento. Ganancia (4x): amplifica la señal. Los ajustamos para no saturar ni quedar muy oscuros.

### Sobre el servomotor

**¿Cómo funciona un servo?**
Tiene un motor, engranajes y un potenciómetro que mide su posición. Recibe una señal **PWM** cada 20 ms; el ancho del pulso (≈0.5 ms a 2.4 ms) decide el ángulo (0° a 180°). Un circuito interno compara y corrige hasta llegar al ángulo pedido.

**¿Qué librería usan y qué hace?**
`Servo.h`. `servo.write(ángulo)` genera el pulso correspondiente. Usamos 20° (verde), 90° (amarillo) y 160° (descarte), con 90° como posición de reposo.

**¿Por qué el servo no se alimenta del Arduino si es más grande?**
El SG90 consume poco, pero con carga o bloqueado puede pedir picos que reinician el Arduino. Para un servo más grande se usa una **fuente externa** con **GND común**.

**¿Por qué usan `detach()` al apagar?**
Un servo "enganchado" recibe pulsos constantes y consume corriente aunque no se mueva. Al desconectarlo (`detach`) se dejan de enviar pulsos: baja el consumo y se evita vibración.

### Sobre Arduino y el código

**¿Por qué no usan `delay()` para esperar al servo?**
Porque bloquea el programa: mientras espera, no leería el botón de paro ni los comandos de la web. Usamos `millis()` para medir tiempos y el `loop()` sigue corriendo siempre. Así la emergencia responde de inmediato.

**¿Cómo se comunican Arduino y web?**
Por **Serial USB a 9600 baudios**, con mensajes de texto, uno por línea. Ejemplos: `COLOR:ROJO`, `RGB:200,40,35`, `STATE:STOP`. La web manda `STOP`, `RESUME`, `OFF`, `ON`, `MODE:AUTO`, `SERVO:90`, `CAL`. Es un protocolo simple, legible y fácil de depurar en el Monitor Serie.

**¿Qué es I2C?**
Bus de 2 cables (SDA datos, SCL reloj) donde varios dispositivos comparten líneas y se distinguen por dirección. El TCS34725 usa la 0x29. En el UNO: SDA = A4, SCL = A5.

**¿Qué pasa si se desconecta el sensor?**
`tcs.begin()` falla y el Arduino envía `ERROR:No se encontro el TCS34725...`. El dashboard lo muestra en el log en rojo y no intenta clasificar.

### Sobre la interfaz web

**¿Cómo se conecta la página al Arduino sin instalar nada?**
Con la **Web Serial API** del navegador (`navigator.serial`). El usuario elige el puerto en una ventana del navegador, y la página lee y escribe bytes. Por seguridad **siempre requiere un clic del usuario** y solo funciona en Chrome o Edge de escritorio, con HTTPS o `file://`/localhost.

**¿La página guarda los datos?**
No en un servidor. Todo vive en la memoria del navegador durante la sesión y se puede **exportar a CSV**. Es un prototipo académico; una versión real usaría base de datos.

**¿Qué librerías usa?**
Tailwind CSS (estilos), Chart.js (gráfico de dona), Font Awesome (íconos), todo por CDN. Por eso hace falta internet la primera vez que se abre.

**¿Qué hace el botón "Simular detección"?**
Genera un color aleatorio y ejecuta el mismo flujo que una detección real (contador, gráfico, log, animación). Sirve para demostrar sin hardware o si falla el montaje.

**¿Por qué las categorías tienen formas (círculo, triángulo, cuadrado)?**
Accesibilidad: una persona con daltonismo puede distinguir verde de amarillo por la forma (círculo, triángulo, cuadrado) y no solo por el tono.

### Seguridad y consumo (nuestro diferenciador)

**¿Qué hace el paro de emergencia?**
Detiene la faja y deja el servo quieto. Se activa con el botón rojo grande, la tecla **Esc**, o el botón físico en D7. El Arduino confirma con `STATE:STOP`; si no confirma en 1.5 s, la web avisa que se debe cortar la alimentación.

**¿Por qué solo se detiene con Esc pero no se reanuda con Esc?**
Para evitar un arranque accidental. Reanudar exige un clic deliberado.

**¿Qué diferencia hay entre Paro y Apagar?**
- **Paro**: pausa inmediata, sensor sigue activo, reanudación rápida.
- **Apagar**: modo de bajo consumo: servo desconectado, sensor en reposo (`tcs.disable()`), faja parada. Se vuelve con **Encender**.

**¿Es la web una protección de seguridad real?**
No debe ser la única. Depende del USB y del navegador. Por eso incluimos el botón físico, y en un equipo real se pondría un paro de hardware que corte la alimentación del motor sin pasar por software.

**¿Por qué no hay un "heartbeat" que pare si se cae la web?**
Lo evaluamos. Los navegadores reducen la frecuencia de los temporizadores en pestañas en segundo plano, y causaría paros falsos. Es una mejora futura con otro enfoque.

### Sobre la web, la base de datos y los roles (lo nuevo)

**¿Cómo se comparte la información entre celulares?**
Con **Firebase Realtime Database**. El operador (la computadora conectada al Arduino) escribe cada evento; los demás dispositivos están suscritos y ven los cambios al instante. La web es estática y se publica en **Vercel**; no hay servidor propio.

**¿Qué guardan exactamente?**
Eventos con hora: `{ts, tipo: entrada|salida, categoría, origen: operador|jurado, quién, lote}`. Además: visitantes del día, lotes de prueba terminados y el estado de la máquina.

**¿Qué significa "entra" y "sale"?**
**Entra**: el limón llega a la faja y el sensor detecta su presencia (mensaje `ENTRA`). **Sale**: ya fue clasificado y desviado a su compartimento (`COLOR:...`). La diferencia es **en proceso**. El admin ve el total por día y por hora y lo exporta a Excel.

**¿Qué hace cada rol?**
- **Operador** (PIN): conecta el Arduino, controla la faja, paro de emergencia.
- **Visitante / jurado**: genera un lote de prueba automático; al final ve cuántos limones son aprovechables (verde + amarillo) y cuántos están podridos (descarte).
- **Administrador** (PIN): registro del día, visitantes, lotes, Excel, paro remoto.
- **Stand**: pantalla pública con la faja en vivo, contadores y un QR para entrar.

**¿El lote de prueba es real?**
No: es una simulación para que cualquiera pueda probar sin la maqueta. Cada lote genera su propia mezcla de categorías al azar. Aparece en los registros con origen *jurado* para no confundirlo con lo que mide el sensor.

**¿Los PIN son seguros?**
No. Se validan en el navegador y sirven para ordenar el Demo Day. Una versión real usaría autenticación (Firebase Auth) y reglas de la base de datos por usuario.

**¿Qué pasa si se cae el internet?**
El Arduino y el panel del operador siguen funcionando (el control es por USB). Firebase reintenta al volver la conexión; sin configurar Firebase la web funciona en **modo local** (solo entre pestañas del mismo navegador).

**¿Puede el admin reanudar la máquina a distancia?**
No, a propósito: solo puede **parar** o **apagar**. Reanudar siempre lo hace una persona junto a la máquina.

**¿Qué mejorarían?**
Autenticación real, calibración automática con limones de referencia, visión artificial para detectar manchas y tamaño, y un paro de emergencia por hardware que corte la alimentación del motor.

### Sobre el proyecto (conexión con la industria)

**¿Qué problema resuelve?**
Clasificar por color de forma automática, rápida y repetible, en lugar de hacerlo a ojo. En el proyecto Smartlog el mismo principio se aplica a la **madurez de limones** en una faja transportadora, alineado con **ODS 9 (Industria, innovación e infraestructura)**.

**¿Qué limitaciones tiene?**
- Sensible a luz ambiente.
- Solo 3 colores definidos.
- Un objeto a la vez, a velocidad baja.
- Umbrales fijos que requieren calibración.

**¿Qué mejorarían?**
- Cámara con visión por computador para más colores y tamaños.
- Faja con velocidad regulada y sensor de presencia dedicado.
- Calibración automática y almacenamiento histórico en base de datos.
- Paro de emergencia por hardware.

---

## 3. Glosario rápido

| Término | Significado corto |
|---|---|
| Web Serial API | Permite a una página web hablar con un puerto serie USB desde Chrome/Edge |
| PWM | Señal de pulsos; el ancho del pulso define el ángulo del servo |
| I2C | Bus de 2 cables (SDA/SCL) para sensores |
| TCS34725 | Sensor de color I2C con ADC de 16 bits y filtro IR |
| TCS3200 | Sensor de color con salida en frecuencia (usado en el video) |
| Baudios | Velocidad de la comunicación serie (9600 bits/s) |
| `millis()` | Tiempo desde que arrancó el Arduino; permite esperar sin bloquear |
| Debounce | Filtro de rebote del botón físico (40 ms) |

---

## 4. Demo sugerida (2 minutos)

1. Proyectar la **pantalla del stand**. Entrar como **operador**, pulsar **Conectar Arduino** y elegir el puerto.
2. Pasar un limón verde, uno amarillo y uno marrón: ver contador, servo y registro; el stand reacciona.
2b. Con el celular, escanear el QR, entrar como visitante y generar un lote de prueba; mostrar el resultado y el registro del admin.
3. Cambiar a **Manual** y mover el slider del servo.
4. Pulsar **Esc**: mostrar que todo se detiene y que el log lo confirma.
5. **Reanudar**, luego **Apagar** para explicar el ahorro de energía y **Encender**.
6. Si algo falla: **Simular detección** para completar la demostración.

## 5. Antes de exponer (checklist)

- [ ] Sketch cargado y Monitor Serie **cerrado** (si está abierto, la web no puede conectar).
- [ ] Librería *Adafruit TCS34725* instalada.
- [ ] Cámara oscura puesta y **Calibrar fondo** con la faja vacía.
- [ ] Ajustar `MARGEN`, `FACTOR_PRESENCIA` y los ángulos a tu maqueta.
- [ ] Firebase configurado en `js/config.js` y reglas publicadas; web abierta desde la URL de Vercel.
- [ ] Internet disponible (CDN y Firebase) y Chrome/Edge de escritorio en la computadora del operador.
- [ ] Cambiar los PIN de `js/config.js` si la URL es pública.
- [ ] Servo con GND común; fuente externa si es más grande que un SG90.

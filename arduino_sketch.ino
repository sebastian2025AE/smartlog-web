/*
  Smartlog · clasificador de limones por color (Verde / Amarillo / Descarte)
  Arduino UNO + sensor TCS34725 + servomotor SG90
  Se comunica con el dashboard web (index.html) por Serial a 9600 baudios.

  LIBRERIA NECESARIA (Sketch > Incluir libreria > Administrar bibliotecas):
    - "Adafruit TCS34725"  (instala tambien Adafruit BusIO si lo pide)

  CONEXIONES
    TCS34725 : VIN->5V  GND->GND  SDA->A4  SCL->A5  (LED del modulo encendido)
    Servo    : naranja/amarillo->D5   rojo->5V (o fuente externa)   marron->GND
    Boton de paro fisico (opcional): un pin a D7, el otro a GND (usa INPUT_PULLUP)
    Faja (opcional, USAR_MOTOR=true): L293D  EN->D9  IN1->D3  IN2->D2

  PROTOCOLO (una linea por mensaje, terminada en \n)
    Arduino -> Web : READY | STATE:RUN|STOP|OFF | ENTRA | COLOR:VERDE|AMARILLO|DESCARTE
                     RGB:r,g,b | SERVO:n | MODE:AUTO|MANUAL | INFO:texto | ERROR:texto
    Web -> Arduino : MODE:AUTO | MODE:MANUAL | SERVO:0-180 | STOP | RESUME | OFF | ON | CAL
*/

#include <Wire.h>
#include <Servo.h>
#include <Adafruit_TCS34725.h>

// ---------- Pines y opciones ----------
const uint8_t PIN_SERVO      = 5;
const uint8_t PIN_BOTON_PARO = 7;
const bool    USAR_MOTOR     = false;   // pon true si tambien mueves una faja
const uint8_t PIN_EN  = 9;
const uint8_t PIN_IN1 = 3;
const uint8_t PIN_IN2 = 2;
const uint8_t VEL_FAJA = 150;           // 0-255

// ---------- Angulos del servo (deben coincidir con index.html) ----------
const uint8_t ANG_VERDE    = 20;    // fresco
const uint8_t ANG_AMARILLO = 90;    // maduro
const uint8_t ANG_DESCARTE = 160;   // podrido o dañado
const uint8_t ANG_REPOSO   = 90;

// ---------- Deteccion ----------
// Reglas de clasificacion (CALIBRA con limones reales mirando las barras RGB del panel):
const float VERDE_G_SOBRE_R   = 1.10;  // verde si G > R * 1.10
const float AMARILLO_G_MIN    = 0.70;  // amarillo si G/R esta entre 0.70 ...
const float AMARILLO_G_MAX    = 1.10;  //                           ... y 1.10
const float AMARILLO_B_MAX    = 0.60;  // y B < G * 0.60 (poco azul)
// Hay objeto si la luz total (clear) cambia mas de este factor respecto al fondo.
const float FACTOR_PRESENCIA = 0.35;
const unsigned long T_MOVER_SERVO  = 600;   // ms que se mantiene el servo desviado
const unsigned long T_ENFRIAR      = 800;   // ms minimos entre objetos
const unsigned long T_RGB_STREAM   = 250;   // ms entre mensajes RGB

Adafruit_TCS34725 tcs(TCS34725_INTEGRATIONTIME_50MS, TCS34725_GAIN_4X);
Servo servo;

enum Estado { RUN, STOP, APAGADO };
Estado estado = RUN;
bool modoAuto = true;
bool sensorOk = false;

uint16_t fondoClear = 0;
unsigned long tServoDesviado = 0;
unsigned long tUltimoObjeto  = 0;
unsigned long tUltimoRGB     = 0;
bool servoDesviado = false;
uint8_t servoActual = ANG_REPOSO;

char bufferRx[24];
uint8_t lenRx = 0;

// ---------- Utilidades ----------
void moverServo(uint8_t ang) {
  ang = constrain(ang, 0, 180);
  if (!servo.attached()) servo.attach(PIN_SERVO);
  servo.write(ang);
  servoActual = ang;
  Serial.print(F("SERVO:")); Serial.println(ang);
}

void faja(bool encendida) {
  if (!USAR_MOTOR) return;
  digitalWrite(PIN_IN1, HIGH);
  digitalWrite(PIN_IN2, LOW);
  analogWrite(PIN_EN, encendida ? VEL_FAJA : 0);
}

void enviarEstado() {
  Serial.print(F("STATE:"));
  Serial.println(estado == RUN ? F("RUN") : (estado == STOP ? F("STOP") : F("OFF")));
}

void enviarModo() {
  Serial.println(modoAuto ? F("MODE:AUTO") : F("MODE:MANUAL"));
}

// PARO: detiene faja y deja el servo quieto. El sensor sigue alimentado.
void pasarAStop() {
  estado = STOP;
  faja(false);
  servoDesviado = false;
  enviarEstado();
}

// APAGADO: para todo y baja el consumo (servo desconectado, sensor en reposo).
void pasarAApagado() {
  estado = APAGADO;
  faja(false);
  servoDesviado = false;
  if (servo.attached()) servo.detach();   // sin pulsos = sin consumo ni vibracion
  if (sensorOk) tcs.disable();            // sensor en modo sleep
  enviarEstado();
}

void reanudar(bool desdeApagado) {
  if (desdeApagado && sensorOk) tcs.enable();
  estado = RUN;
  moverServo(ANG_REPOSO);
  faja(true);
  enviarEstado();
  calibrarFondo();
}

void leerRGB(uint16_t &r, uint16_t &g, uint16_t &b, uint16_t &c) {
  tcs.getRawData(&r, &g, &b, &c);
}

void calibrarFondo() {
  if (!sensorOk) return;
  uint32_t suma = 0;
  for (uint8_t i = 0; i < 5; i++) {
    uint16_t r, g, b, c;
    leerRGB(r, g, b, c);
    suma += c;
    delay(60);
  }
  fondoClear = suma / 5;
  Serial.print(F("INFO:Fondo calibrado (clear="));
  Serial.print(fondoClear);
  Serial.println(F(")"));
}

// ---------- Comandos desde la web ----------
void procesarComando(const char *cmd) {
  if (strcmp(cmd, "STOP") == 0) {
    pasarAStop();
  } else if (strcmp(cmd, "OFF") == 0) {
    pasarAApagado();
  } else if (strcmp(cmd, "RESUME") == 0) {
    if (estado != RUN) reanudar(estado == APAGADO);
  } else if (strcmp(cmd, "ON") == 0) {
    if (estado != RUN) reanudar(true);
  } else if (strcmp(cmd, "MODE:AUTO") == 0) {
    modoAuto = true;  enviarModo();
  } else if (strcmp(cmd, "MODE:MANUAL") == 0) {
    modoAuto = false; servoDesviado = false; enviarModo();
  } else if (strcmp(cmd, "CAL") == 0) {
    if (estado == RUN) calibrarFondo();
  } else if (strncmp(cmd, "SERVO:", 6) == 0) {
    // Solo se acepta con la maquina en marcha y en modo manual.
    if (estado == RUN && !modoAuto) moverServo((uint8_t)atoi(cmd + 6));
  } else {
    Serial.print(F("ERROR:Comando desconocido "));
    Serial.println(cmd);
  }
}

void leerSerial() {
  while (Serial.available()) {
    char ch = Serial.read();
    if (ch == '\r') continue;
    if (ch == '\n') {
      bufferRx[lenRx] = '\0';
      if (lenRx > 0) procesarComando(bufferRx);
      lenRx = 0;
    } else if (lenRx < sizeof(bufferRx) - 1) {
      bufferRx[lenRx++] = ch;
    } else {
      lenRx = 0;   // linea demasiado larga: se descarta
    }
  }
}

// ---------- Boton fisico de paro ----------
// Pulsarlo SIEMPRE detiene. Reanudar se hace desde la web (a proposito).
void leerBotonParo() {
  static bool anterior = HIGH;
  static unsigned long tCambio = 0;
  bool actual = digitalRead(PIN_BOTON_PARO);
  if (actual != anterior && millis() - tCambio > 40) {
    tCambio = millis();
    anterior = actual;
    if (actual == LOW && estado == RUN) {
      Serial.println(F("INFO:Boton de paro fisico pulsado"));
      pasarAStop();
    }
  }
}

// ---------- Clasificacion ----------
// Devuelve 1 = verde, 2 = amarillo, 3 = descarte
uint8_t clasificar(uint16_t r, uint16_t g, uint16_t b) {
  if (r == 0) return 3;                                   // sin luz de rojo: tratalo como dañado
  float gr = (float)g / r;
  if (g > r * VERDE_G_SOBRE_R && g > b) return 1;          // verde: domina el canal G
  if (gr >= AMARILLO_G_MIN && gr <= AMARILLO_G_MAX && b < g * AMARILLO_B_MAX) return 2;   // amarillo: R y G altos, B bajo
  return 3;                                                // marron / oscuro / manchado: descarte
}

void cicloAutomatico() {
  uint16_t r, g, b, c;
  leerRGB(r, g, b, c);

  // Datos en vivo para las barras RGB del dashboard (0-255 aprox.)
  if (millis() - tUltimoRGB >= T_RGB_STREAM && c > 0) {
    tUltimoRGB = millis();
    Serial.print(F("RGB:"));
    Serial.print((uint32_t)r * 255 / c); Serial.print(',');
    Serial.print((uint32_t)g * 255 / c); Serial.print(',');
    Serial.println((uint32_t)b * 255 / c);
  }

  // Regresar el servo a reposo sin bloquear el programa
  if (servoDesviado && millis() - tServoDesviado > T_MOVER_SERVO) {
    moverServo(ANG_REPOSO);
    servoDesviado = false;
  }

  if (!modoAuto || servoDesviado) return;
  if (millis() - tUltimoObjeto < T_ENFRIAR) return;

  // Presencia: la luz total cambia respecto al fondo vacio
  float cambio = fondoClear > 0 ? fabs((float)c - fondoClear) / fondoClear : 0;
  if (cambio < FACTOR_PRESENCIA) return;

  uint8_t col = clasificar(r, g, b);

  tUltimoObjeto = millis();
  Serial.println(F("ENTRA"));                              // llego un limon a la faja
  switch (col) {
    case 1: Serial.println(F("COLOR:VERDE"));    moverServo(ANG_VERDE);    break;
    case 2: Serial.println(F("COLOR:AMARILLO")); moverServo(ANG_AMARILLO); break;
    default: Serial.println(F("COLOR:DESCARTE")); moverServo(ANG_DESCARTE); break;
  }
  servoDesviado = true;
  tServoDesviado = millis();
}

// ---------- Setup / loop ----------
void setup() {
  Serial.begin(9600);
  pinMode(PIN_BOTON_PARO, INPUT_PULLUP);
  if (USAR_MOTOR) {
    pinMode(PIN_EN, OUTPUT); pinMode(PIN_IN1, OUTPUT); pinMode(PIN_IN2, OUTPUT);
  }

  servo.attach(PIN_SERVO);
  servo.write(ANG_REPOSO);

  sensorOk = tcs.begin();
  Serial.println(F("READY"));
  if (!sensorOk) {
    Serial.println(F("ERROR:No se encontro el TCS34725. Revisa SDA(A4), SCL(A5) y 5V."));
  } else {
    calibrarFondo();
  }

  faja(true);
  enviarEstado();
  enviarModo();
}

void loop() {
  leerSerial();
  leerBotonParo();

  if (estado != RUN) return;       // en STOP o APAGADO no se hace nada mas
  if (sensorOk) cicloAutomatico();
}

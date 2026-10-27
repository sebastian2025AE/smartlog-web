// Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBffrkfafrLiJaec6oFFxxYiG4vQ7it3tE",
  authDomain: "pi2-clasificador.firebaseapp.com",
  databaseURL: "https://pi2-clasificador-default-rtdb.firebaseio.com",
  projectId: "pi2-clasificador",
  storageBucket: "pi2-clasificador.firebasestorage.app",
  messagingSenderId: "1036713418547",
  appId: "1:1036713418547:web:45f3f164b3238729d0a846",
  measurementId: "G-XJZEB38CDV"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Referencia a la base de datos en tiempo real
const database = firebase.database();
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  getRedirectResult,
  setPersistence,
  signInWithRedirect,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDR0zkPrbqQRot8KLajCPSF9nQ3qavPlrc",
  authDomain: "ttck-a7176.firebaseapp.com",
  projectId: "ttck-a7176",
  databaseURL: "https://ttck-a7176-default-rtdb.asia-southeast1.firebasedatabase.app",
  storageBucket: "ttck-a7176.firebasestorage.app",
  messagingSenderId: "882092560518",
  appId: "1:882092560518:web:c6ff98db205ab578cb4107",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

const isMobile = () => window.matchMedia("(max-width: 760px), (pointer: coarse)").matches;
const loginButton = () => document.getElementById("loginBtn");
const loginMessage = () => document.getElementById("loginMessage");

setPersistence(auth, browserLocalPersistence)
  .then(() => getRedirectResult(auth))
  .catch((error) => {
    const message = loginMessage();
    if (message && isMobile()) message.textContent = error && error.message ? error.message : String(error);
  });

document.addEventListener(
  "click",
  async (event) => {
    const button = event.target && event.target.closest ? event.target.closest("#loginBtn") : null;
    if (!button || !isMobile()) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const message = loginMessage();
    if (message) message.textContent = "Đang mở đăng nhập Google...";
    button.disabled = true;

    try {
      localStorage.setItem("ttckLoginAt", String(Date.now()));
      await signInWithRedirect(auth, provider);
    } catch (error) {
      button.disabled = false;
      if (message) message.textContent = error && error.message ? error.message : String(error);
    }
  },
  true,
);

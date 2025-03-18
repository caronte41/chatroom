// This script will load Socket.IO from CDN
(function () {
  console.log("YouTube Anonymous Chat: Loading Socket.IO from CDN");
  const script = document.createElement("script");
  script.src = "https://cdn.socket.io/4.7.2/socket.io.min.js";
  script.integrity =
    "sha384-mZLF4UVrpi/QTWPA7BjNPEnkIfRFn4ZEO3Qt/HFklTJBj/gBOV8G3HcKn4NfQblz";
  script.crossOrigin = "anonymous";
  script.onload = function () {
    console.log("YouTube Anonymous Chat: Socket.IO loaded successfully");
    // Dispatch an event that content.js can listen for
    document.dispatchEvent(new CustomEvent("socketIOLoaded"));
  };
  script.onerror = function () {
    console.error("YouTube Anonymous Chat: Failed to load Socket.IO");
  };
  document.head.appendChild(script);
})();

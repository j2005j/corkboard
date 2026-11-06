// Small UI helpers: toast + confirm dialog.

const toastEl = document.getElementById("toast");
let toastTimer = null;

export function toast(msg, ms = 2800) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.hidden = false;
  toastEl.style.animation = "none";
  void toastEl.offsetWidth;
  toastEl.style.animation = "";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, ms);
}

const modal = document.getElementById("modal");
const modalText = document.getElementById("modal-text");
const modalOk = document.getElementById("modal-ok");
const modalCancel = document.getElementById("modal-cancel");

export function confirmDialog(text, okLabel = "Replace") {
  return new Promise((resolve) => {
    if (!modal) return resolve(false);
    const prevOk = modalOk.textContent;
    modalText.textContent = text;
    modalOk.textContent = okLabel;
    modal.hidden = false;
    modalOk.focus();

    function done(value) {
      modal.hidden = true;
      modalOk.textContent = prevOk;
      modalOk.removeEventListener("click", onOk);
      modalCancel.removeEventListener("click", onCancel);
      modal.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKey, true);
      resolve(value);
    }
    function onOk() {
      done(true);
    }
    function onCancel() {
      done(false);
    }
    function onBackdrop(e) {
      if (e.target === modal) done(false);
    }
    function onKey(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        done(false);
      }
    }

    modalOk.addEventListener("click", onOk);
    modalCancel.addEventListener("click", onCancel);
    modal.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKey, true);
  });
}

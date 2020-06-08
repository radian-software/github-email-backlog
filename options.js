"use strict";

const tokenInput = document.getElementById("tokenInput");
const webhookInput = document.getElementById("webhookInput");
const saveButton = document.getElementById("saveButton");

async function main() {
  const { token } = await new Promise((resolve) =>
    chrome.storage.sync.get(["token"], resolve)
  );
  if (token) {
    tokenInput.value = token;
  }
  tokenInput.addEventListener("input", () => {
    saveButton.disabled = false;
  });
  const { webhook } = await new Promise((resolve) =>
    chrome.storage.sync.get(["webhook"], resolve)
  );
  if (webhook) {
    webhookInput.value = webhook;
  }
  webhookInput.addEventListener("input", () => {
    saveButton.disabled = false;
  });
  saveButton.addEventListener("click", async () => {
    await new Promise((resolve) =>
      chrome.storage.sync.set({ token: tokenInput.value }, resolve)
    );
    await new Promise((resolve) =>
      chrome.storage.sync.set({ webhook: webhookInput.value }, resolve)
    );
    saveButton.disabled = true;
  });
}

main().catch(console.error);

import { PRM_STORAGE_KEYS } from "./constants.js";

export async function getPrmState() {
  return chrome.storage.local.get(Object.values(PRM_STORAGE_KEYS));
}

export async function setPrmState(values) {
  return chrome.storage.local.set(values);
}

export async function removePrmState(keys) {
  return chrome.storage.local.remove(keys);
}

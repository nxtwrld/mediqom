import { writable, get, derived } from "svelte/store";
import type { Writable } from "svelte/store";
import type { ShareRecord } from "./types.d";
//import { get as vaultGet, set as vaultSet } from '$lib/vault/index';
import ui from "$lib/ui";

console.log("🗺", "Share store created");

const store: Writable<ShareRecord[]> = writable([]);

loadStore();

async function loadStore() {
  try {
    //const record = await vaultGet(STORE_NAME)
    const record = null;
    // @ts-expect-error - Dead code, hardcoded null
    if (record && record.data) {
      console.log("🗺", "Share records loaded from vault");
      // @ts-expect-error - Dead code, hardcoded null
      store.set(record.data);
    }
  } catch (e) {
    console.log(e);
  }
}

async function save() {
  const current = get(store);
  console.log("🗺", "Saving share to vault");
  //return await vaultSet(STORE_NAME, 'shares', {}, current);
}

export function getByContact(uid: string) {
  return derived(store, ($store) => {
    return $store.filter((e) => e.contact === uid);
  });
}

export default {
  subscribe: store.subscribe,
  set: function (data: ShareRecord[]) {
    store.set(data);
    save();
  },
  get: function (uid: string) {
    return get(store).find((e) => e.uid === uid);
  },
  remove: function (uid: string) {
    const current = get(store);
    const index = current.findIndex((e) => e.uid === uid);
    if (index !== -1) {
      current.splice(index, 1);
      store.set(current);
      save();
    }
  },
  update: function (data: ShareRecord) {
    const current = get(store);
    const index = current.findIndex((e) => e.uid === data.uid);
    if (index !== -1) {
      current[index] = data;
      store.set(current);
      save();
    }
  },
  add: function (data: ShareRecord) {
    data.uid = data.uid || crypto.randomUUID();
    const current = get(store);
    current.push(data);
    store.set(current);
    save();
    return data;
  },
};

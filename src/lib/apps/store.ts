import { writable, get, derived } from "svelte/store";
import type { Writable } from "svelte/store";
import type { AppRecord } from "./types.d";
//import { get as vaultGet, set as vaultSet } from '$lib/vault/index';
import ui from "$lib/ui";
import sampleData from "./samplefile.apps.json";
console.log(sampleData);
const STORE_NAME = "apps";

console.log("🌍", "Apps store created");

const store: Writable<AppRecord[]> = writable(sampleData.slice(0, 2));
/*
ui.on('vault-ready', async () => {
    loadStore();
});
*/
//loadStore();

const sharedItemsStore = writable<any[]>([]);

export const sharedItems = {
  subscribe: sharedItemsStore.subscribe,
  set: sharedItemsStore.set,
  get: function () {
    return get(sharedItemsStore);
  },
};
/*
async function loadStore() {
    try {
  //      const record = await vaultGet(STORE_NAME)
        const record = null;
        if (record && record.data) {
            console.log('🌍','Apps records loaded from vault');
            store.set(record.data);
        }
    } catch (e) {
        console.log(e);
    }
}
*/
async function save() {
  const current = get(store);
  console.log("🌍", "Saving apps to vault");
  //    return await vaultSet(STORE_NAME, 'apps', {}, current);
}

export default {
  subscribe: store.subscribe,
  set: function (data: AppRecord[]) {
    store.set(data);
    save();
  },
  get: function (uid: string) {
    return get(store).find((e) => e.uid === uid);
  } /*,
    remove: function(uid: string) {
        const current = get(store);
        const index = current.findIndex(e => e.uid === uid);
        if (index !== -1) {
            current.splice(index, 1);
            store.set(current);
            save();
        }
    },
    update: function(data: AppRecord) {
        const current = get(store);
        const index = current.findIndex(e => e.uid === data.uid);
        if (index !== -1) {
            current[index] = data;
            store.set(current);
            save();
        }
    },
    add: function(data: AppRecord) {
        data.uid = data.uid || crypto.randomUUID();
        const current = get(store);
        current.push(data);
        store.set(current);
        save();
        return data;
    }*/,
};
